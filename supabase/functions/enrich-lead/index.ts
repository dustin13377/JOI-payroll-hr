// enrich-lead — the "agent" that reads a lead's website.
//
// Given a sales lead, fetch the website they submitted, read it (Lite: no AI —
// title, meta/OpenGraph description, and the main headings), and write back a
// plain-language "who they are / what they do" summary onto the lead row.
//
// Called from the Sales tab (logged-in D / Joe): automatically the first time a
// lead is viewed, and on demand via the "Refresh profile" button. verify_jwt is
// ON, and we additionally confirm the caller is on the sales access allowlist
// before doing anything.
//
// Env (already present in this project): SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

// --- tiny HTML helpers (regex-based; no DOM dependency) --------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return _m; }
    });
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function firstMatch(re: RegExp, html: string): string | null {
  const m = html.match(re);
  return m ? stripTags(m[1]) : null;
}

// Read a <meta> tag by name/property, tolerant of attribute order.
function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const v = firstMatch(re, html);
    if (v) return v;
  }
  return null;
}

function collectHeadings(html: string, tag: string, limit: number): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const text = stripTags(m[1]);
    if (text && text.length <= 140 && !out.includes(text)) out.push(text);
  }
  return out;
}

// Normalize the messy URLs the form collects: "CTN-USA.com" (no scheme),
// "HTTPS://www.argyleforum.com" (uppercase scheme), stray spaces.
function normalizeUrl(raw: string): string | null {
  let u = (raw || "").trim();
  if (!u) return null;
  u = u.replace(/^\s*(https?):\/\//i, (_m, s) => `${s.toLowerCase()}://`);
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; JOI-LeadProfiler/1.0; +https://app.justoutsource.it)",
        "accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { ok: false, error: `Site returned HTTP ${res.status}` };
    const ct = res.headers.get("content-type") || "";
    if (ct && !ct.includes("html") && !ct.includes("xml")) {
      return { ok: false, error: `Not a web page (content-type: ${ct})` };
    }
    const html = (await res.text()).slice(0, 500_000);
    return { ok: true, html, finalUrl: res.url || url };
  } catch (e) {
    const msg = (e as Error).name === "AbortError"
      ? "Timed out fetching the site (9s)"
      : `Couldn't reach the site: ${(e as Error).message}`;
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

function buildSummary(
  company: string | null,
  title: string | null,
  description: string | null,
  siteName: string | null,
  h1s: string[],
  h2s: string[],
): string {
  const lines: string[] = [];
  const who = company || siteName || title;
  if (who) lines.push(who);
  if (description) lines.push(description);
  else if (title && title !== who) lines.push(title);

  const highlights = [...h1s, ...h2s]
    .filter((h, i, arr) => arr.indexOf(h) === i)
    .slice(0, 6);
  if (highlights.length) {
    lines.push("");
    lines.push("From their site: " + highlights.join(" • "));
  }
  return lines.join("\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Confirm the caller is allowlisted for sales (uses their JWT).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing authorization" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: allowed, error: accessErr } = await asUser.rpc("can_access_sales");
  if (accessErr) return json({ error: "access check failed" }, 500);
  if (allowed !== true) return json({ error: "forbidden" }, 403);

  let payload: { lead_id?: string };
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const leadId = payload?.lead_id;
  if (!leadId || typeof leadId !== "string") return json({ error: "missing lead_id" }, 400);

  const { data: lead, error: leadErr } = await admin
    .from("sales_leads")
    .select("id, company, website")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return json({ error: "lookup failed" }, 500);
  if (!lead) return json({ error: "not_found" }, 404);

  const url = normalizeUrl(lead.website ?? "");
  if (!url) {
    await admin.from("sales_leads").update({
      profile_status: "failed",
      profile_error: lead.website
        ? `Couldn't make sense of the website "${lead.website}"`
        : "No website was submitted with this lead",
      profile_fetched_at: new Date().toISOString(),
    }).eq("id", leadId);
    return json({ ok: false, status: "failed", reason: "no_valid_url" });
  }

  const result = await fetchHtml(url);
  if (!result.ok) {
    await admin.from("sales_leads").update({
      profile_status: "failed",
      profile_source_url: url,
      profile_error: result.error,
      profile_fetched_at: new Date().toISOString(),
    }).eq("id", leadId);
    return json({ ok: false, status: "failed", reason: result.error });
  }

  const html = result.html;
  const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  const description =
    metaContent(html, "description") || metaContent(html, "og:description");
  const ogTitle = metaContent(html, "og:title");
  const siteName = metaContent(html, "og:site_name");
  const h1s = collectHeadings(html, "h1", 4);
  const h2s = collectHeadings(html, "h2", 6);

  const summary = buildSummary(
    lead.company ?? null,
    ogTitle || title,
    description,
    siteName,
    h1s,
    h2s,
  );

  const details = {
    title,
    og_title: ogTitle,
    site_name: siteName,
    description,
    h1: h1s,
    h2: h2s,
    resolved_url: result.finalUrl,
  };

  const hasContent = Boolean(summary && (description || h1s.length || title));

  const { error: upErr } = await admin.from("sales_leads").update({
    profile_status: hasContent ? "ready" : "failed",
    profile_summary: hasContent ? summary : null,
    profile_details: details,
    profile_source_url: url,
    profile_fetched_at: new Date().toISOString(),
    profile_error: hasContent
      ? null
      : "Reached the site but couldn't read anything useful (it may be an app that loads with JavaScript). Try opening it manually.",
  }).eq("id", leadId);
  if (upErr) return json({ error: "save failed" }, 500);

  return json({ ok: true, status: hasContent ? "ready" : "failed", summary });
});
