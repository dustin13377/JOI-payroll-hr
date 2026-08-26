/**
 * notify-client-feedback
 *
 * Sends an email to all active leadership (owner/admin/manager, excluding
 * system users) when a client submits feedback about an agent via the client
 * portal Team drilldown ("Leave a note" / "Ask a question" / "Request a
 * write-up"). Event-driven — called from the frontend right after a successful
 * INSERT into public.client_agent_feedback.
 *
 * Modeled on notify-hr-request-filed (same Gmail SMTP + auth + branding).
 *
 * POST body: { feedbackId: string }
 *
 * Required headers:
 *   Authorization: Bearer <jwt>  — caller must be a signed-in client user
 *                                  (user_profiles.role = 'client'). The row
 *                                  itself was already gated by client-portal
 *                                  RLS; the JWT check here just closes the
 *                                  loop so a random authed user can't fire
 *                                  spurious HR notifications.
 *
 * Required secrets:
 *   GMAIL_USER, GMAIL_APP_PASSWORD
 *   DRY_RUN_HR_NOTIFICATIONS  — defaults true; set "false" to send
 *   APP_URL                   — for the deep link into the HR inbox
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const DRY_RUN = Deno.env.get("DRY_RUN_HR_NOTIFICATIONS") !== "false";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Prefer explicit APP_SUPABASE_KEY (sb_publishable_...) over the auto-injected
// SUPABASE_ANON_KEY so we survive the legacy/publishable-key transition.
// See docs/developer-handoff.md → "Edge function anon key pattern".
const SUPABASE_ANON_KEY =
  Deno.env.get("APP_SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? (() => { throw new Error("APP_URL not set"); })();

// CORS — one origin only, echo-matched from a comma-separated allow-list.
// (Browsers reject a comma-separated Access-Control-Allow-Origin value.)
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function buildCorsHeaders(req: Request): Record<string, string> {
  const reqOrigin = req.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(reqOrigin)
    ? reqOrigin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Only client-portal users may fire this notification. RLS on the row itself
// enforces the actual insert; this is a belt-and-suspenders check so an
// authed non-client can't post an arbitrary feedbackId.
const ALLOWED_ROLES = ["client"];

const NAVY = "#1B2A4A";
const ORANGE = "#FFA700";
const LIGHT = "#F8F9FA";
const BORDER = "#E5E7EB";

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  question: "Question",
  write_up_request: "Write-up Request",
};

const TYPE_SUBJECT_VERB: Record<string, string> = {
  note: "note",
  question: "question",
  write_up_request: "write-up request",
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailShell(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${heading}</title></head><body style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:${NAVY};padding:24px 32px;"><p style="margin:0;color:${ORANGE};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">JOI Payroll &amp; HR</p><h1 style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;line-height:1.3;">${heading}</h1></div><div style="padding:24px 32px;">${bodyHtml}</div><div style="padding:14px 32px;border-top:1px solid ${BORDER};background:${LIGHT};"><p style="margin:0;font-size:11px;color:#9CA3AF;">Sent automatically by JOI Payroll &amp; HR &middot; ${GMAIL_USER}</p></div></div></body></html>`;
}

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  const CORS_HEADERS = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // -----------------------------------------------------------------------
    // 0. Caller auth — verify JWT + role. Belt-and-suspenders on top of RLS.
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, CORS_HEADERS, 401);
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: authError,
    } = await anonClient.auth.getUser();
    if (authError || !caller) {
      return jsonResponse({ error: "Unauthorized" }, CORS_HEADERS, 401);
    }

    const { data: profile } = await anonClient
      .from("user_profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    const role = profile?.role;
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return jsonResponse({ error: "Forbidden: client users only" }, CORS_HEADERS, 403);
    }

    // -----------------------------------------------------------------------
    // 1. Parse body
    // -----------------------------------------------------------------------
    const { feedbackId } = await req.json();
    if (!feedbackId) {
      return jsonResponse({ error: "Missing feedbackId" }, CORS_HEADERS, 400);
    }

    // -----------------------------------------------------------------------
    // 2. Privileged work — use service role only AFTER caller is verified
    // -----------------------------------------------------------------------
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2a. Fetch the feedback row
    const { data: feedback, error: fbErr } = await supa
      .from("client_agent_feedback")
      .select("id, client_id, employee_id, type, body, created_at")
      .eq("id", feedbackId)
      .single();
    if (fbErr || !feedback) {
      return jsonResponse({ error: "Feedback not found" }, CORS_HEADERS, 404);
    }

    // 2b. Fetch the client
    const { data: client } = await supa
      .from("clients")
      .select("name")
      .eq("id", feedback.client_id)
      .single();
    const clientName = client?.name ?? "Unknown client";

    // 2c. Fetch the agent
    const { data: agent } = await supa
      .from("employees")
      .select("full_name, work_name, campaign_id, campaigns!campaign_id(name)")
      .eq("id", feedback.employee_id)
      .single();
    const agentName = agent?.work_name?.trim() || agent?.full_name || "Unknown";
    const campaignName = (agent?.campaigns as { name?: string } | null)?.name ?? "Unknown";

    // 2d. Fetch all leadership emails (excludes system users per HR-notif convention)
    const { data: leaders } = await supa
      .from("employees")
      .select("email")
      .in("title", ["owner", "admin", "manager"])
      .eq("is_active", true)
      .eq("is_system_user", false);
    const emails = (leaders ?? [])
      .map((l) => l.email)
      .filter((e): e is string => !!e && e.includes("@"));

    if (emails.length === 0) {
      return jsonResponse({ status: "no_recipients", recipientCount: 0 }, CORS_HEADERS);
    }

    // -----------------------------------------------------------------------
    // 3. Build email
    // -----------------------------------------------------------------------
    const typeLabel = TYPE_LABELS[feedback.type] ?? feedback.type;
    const typeVerb = TYPE_SUBJECT_VERB[feedback.type] ?? feedback.type;
    const subject = `New ${typeVerb} from ${clientName} about ${agentName}`;

    const bodyHtml = `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
        <strong>${escapeHtml(clientName)}</strong> submitted a <strong>${escapeHtml(typeLabel)}</strong> about <strong>${escapeHtml(agentName)}</strong> (${escapeHtml(campaignName)}).
      </p>
      <div style="background:${LIGHT};border:1px solid ${BORDER};border-radius:6px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 4px;font-weight:600;color:${NAVY};font-size:13px;">Message</p>
        <p style="margin:0;color:#374151;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(feedback.body)}</p>
      </div>
      <a href="${APP_URL}/admin/client-messages?open=${encodeURIComponent(feedback.id)}" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open in Client Messages</a>
    `;

    const html = emailShell(subject, bodyHtml);

    // -----------------------------------------------------------------------
    // 4. Send or dry-run
    // -----------------------------------------------------------------------
    if (DRY_RUN) {
      console.log(`[DRY_RUN] Would send "${subject}" to ${emails.length} recipients: ${emails.join(", ")}`);
      return jsonResponse({ status: "dry_run", recipientCount: emails.length }, CORS_HEADERS);
    }

    const client_ = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });
    try {
      await client_.send({
        from: `"JOI HR Notifications" <${GMAIL_USER}>`,
        to: emails,
        subject,
        html,
      });
    } finally {
      await client_.close();
    }

    return jsonResponse({ status: "sent", recipientCount: emails.length }, CORS_HEADERS);
  } catch (err) {
    console.error("notify-client-feedback error:", err);
    return jsonResponse({ error: String(err) }, CORS_HEADERS, 500);
  }
});
