import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SPIFF_IMPORT_TOKEN = Deno.env.get("SPIFF_IMPORT_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface IncomingRow {
  row_id: number | string;
  date: string;
  agent_name: string;
  amount: number;
  client_hint: string | null;
}

interface MatchedResult {
  row_id: number | string;
  invoice_number: string;
  invoice_line_id: string;
  agent_name: string;
  amount: number;
  score: number;
  status: "applied" | "already_processed";
}

interface UnmatchedResult {
  row_id: number | string;
  reason:
    | "no_invoice_for_week"
    | "no_agent_match"
    | "score_too_low"
    | "invalid_row";
  hint?: string;
}

interface CandidateLine {
  line_id: string;
  invoice_id: string;
  invoice_number: string;
  client_name: string;
  client_aliases: string[];
  agent_name: string;
  current_spiffs: number;
  days_worked: number;
  holiday_days: number;
  unit_price: number;
  is_flat_total: boolean;
  total_price: number;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

function scoreMatch(pastedName: string, lineName: string): number {
  const a = tokenize(pastedName);
  const b = tokenize(lineName);
  if (a.length === 0 || b.length === 0) return 0;
  if (normalize(pastedName) === normalize(lineName)) return 100;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let shared = 0;
  for (const t of aSet) if (bSet.has(t)) shared += 1;
  if (shared === 0) {
    if (normalize(lineName).includes(normalize(pastedName))) return 30;
    if (normalize(pastedName).includes(normalize(lineName))) return 25;
    return 0;
  }
  const firstMatches = a[0] === b[0];
  const lastMatches = a[a.length - 1] === b[b.length - 1];
  let score = shared * 20;
  if (firstMatches) score += 15;
  if (lastMatches) score += 25;
  for (const t of a) {
    if (t.length < 3) continue;
    if (b.some((x) => x.startsWith(t) || t.startsWith(x))) score += 5;
  }
  return Math.min(score, 95);
}

function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

function sundayOf(mondayStr: string): string {
  const [y, m, d] = mondayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 6));
  return dt.toISOString().slice(0, 10);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function rowSignature(r: IncomingRow): Promise<string> {
  const parts = [
    r.date,
    normalize(r.agent_name),
    Number(r.amount).toFixed(2),
    normalize(r.client_hint ?? ""),
  ];
  return await sha256Hex(parts.join("|"));
}

async function fetchCandidatesForWeek(
  weekStart: string,
  weekEnd: string,
): Promise<CandidateLine[]> {
  const { data: invs, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, week_start, week_end, clients(name, aliases)")
    .in("status", ["draft", "sent"])
    .eq("week_start", weekStart)
    .eq("week_end", weekEnd);
  if (invErr) throw invErr;
  if (!invs || invs.length === 0) return [];

  const invIds = invs.map((i: any) => i.id);
  const { data: lines, error: linesErr } = await supabase
    .from("invoice_lines")
    .select(
      "id, invoice_id, agent_name, days_worked, holiday_days, unit_price, spiffs, is_flat_total, total_price",
    )
    .in("invoice_id", invIds);
  if (linesErr) throw linesErr;

  const invById = new Map<string, any>();
  for (const inv of invs) invById.set(inv.id, inv);

  return (lines ?? []).map((l: any) => {
    const inv = invById.get(l.invoice_id);
    return {
      line_id: l.id,
      invoice_id: l.invoice_id,
      invoice_number: inv?.invoice_number ?? "?",
      client_name: inv?.clients?.name ?? "?",
      client_aliases: (inv?.clients?.aliases ?? []) as string[],
      agent_name: l.agent_name,
      current_spiffs: Number(l.spiffs ?? 0),
      days_worked: Number(l.days_worked ?? 0),
      holiday_days: Number(l.holiday_days ?? 0),
      unit_price: Number(l.unit_price ?? 0),
      is_flat_total: !!l.is_flat_total,
      total_price: Number(l.total_price ?? 0),
    };
  });
}

function findBestLine(
  row: IncomingRow,
  candidates: CandidateLine[],
  minScore: number,
): { line: CandidateLine; score: number } | null {
  const hint = row.client_hint ? normalize(row.client_hint) : "";
  const eligible = hint
    ? candidates.filter((c) => {
        if (normalize(c.client_name) === hint) return true;
        return c.client_aliases.some((a) => normalize(a) === hint);
      })
    : candidates;
  let best: { line: CandidateLine; score: number } | null = null;
  for (const c of eligible) {
    const s = scoreMatch(row.agent_name, c.agent_name);
    if (s > 0 && (!best || s > best.score)) {
      best = { line: c, score: s };
    }
  }
  if (best && best.score >= minScore) return best;
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const provided = req.headers.get("x-spiff-import-token") ?? "";
  if (!SPIFF_IMPORT_TOKEN || provided !== SPIFF_IMPORT_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { rows?: IncomingRow[]; min_score?: number };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const rows = body.rows ?? [];
  const minScore = Number.isFinite(body.min_score) ? Number(body.min_score) : 70;

  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(
      JSON.stringify({ matched: [], unmatched: [], applied_total: 0, already_processed_count: 0 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  const matched: MatchedResult[] = [];
  const unmatched: UnmatchedResult[] = [];

  const byWeek = new Map<string, IncomingRow[]>();
  for (const r of rows) {
    if (
      !r ||
      typeof r.date !== "string" ||
      typeof r.agent_name !== "string" ||
      typeof r.amount !== "number" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      r.amount === 0
    ) {
      unmatched.push({
        row_id: r?.row_id ?? "?",
        reason: "invalid_row",
        hint: "Missing/invalid date, name, or amount.",
      });
      continue;
    }
    const monday = mondayOf(r.date);
    if (!byWeek.has(monday)) byWeek.set(monday, []);
    byWeek.get(monday)!.push(r);
  }

  let appliedTotal = 0;
  let alreadyProcessedCount = 0;

  for (const [monday, weekRows] of byWeek) {
    const sunday = sundayOf(monday);
    const candidates = await fetchCandidatesForWeek(monday, sunday);

    if (candidates.length === 0) {
      for (const r of weekRows) {
        unmatched.push({
          row_id: r.row_id,
          reason: "no_invoice_for_week",
          hint: `No draft/sent invoice for week ${monday}..${sunday}.`,
        });
      }
      continue;
    }

    for (const r of weekRows) {
      const best = findBestLine(r, candidates, minScore);
      if (!best) {
        const anyMatch = findBestLine(r, candidates, 1);
        unmatched.push({
          row_id: r.row_id,
          reason: anyMatch ? "score_too_low" : "no_agent_match",
          hint: anyMatch
            ? `Best guess "${anyMatch.line.agent_name}" only scored ${anyMatch.score}; threshold is ${minScore}.`
            : `No agent on this week's invoices looked like "${r.agent_name}".`,
        });
        continue;
      }

      const signature = await rowSignature(r);
      const { error: logErr } = await supabase
        .from("spiff_import_log")
        .insert({
          signature,
          invoice_line_id: best.line.line_id,
          invoice_id: best.line.invoice_id,
          amount: r.amount,
          source: "sheet_import",
          raw_row: r as unknown as Record<string, unknown>,
        });

      if (logErr) {
        const code = (logErr as { code?: string }).code;
        if (code === "23505") {
          alreadyProcessedCount += 1;
          matched.push({
            row_id: r.row_id,
            invoice_number: best.line.invoice_number,
            invoice_line_id: best.line.line_id,
            agent_name: best.line.agent_name,
            amount: r.amount,
            score: best.score,
            status: "already_processed",
          });
          continue;
        }
        console.error("spiff_import_log insert failed", logErr);
        return new Response(
          JSON.stringify({ error: "log_insert_failed", detail: logErr }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }

      const newSpiffs = best.line.current_spiffs + r.amount;
      const days = best.line.days_worked;
      const holiday = best.line.holiday_days;
      const unit = best.line.unit_price;
      const recomputedTotal = days * unit + holiday * unit * 2;
      const newTotalPrice = best.line.is_flat_total
        ? best.line.total_price
        : recomputedTotal + newSpiffs;

      const { error: updErr } = await supabase
        .from("invoice_lines")
        .update({
          spiffs: newSpiffs,
          total: recomputedTotal,
          total_price: newTotalPrice,
        })
        .eq("id", best.line.line_id);

      if (updErr) {
        console.error("invoice_lines update failed", updErr);
        await supabase.from("spiff_import_log").delete().eq("signature", signature);
        return new Response(
          JSON.stringify({ error: "line_update_failed", detail: updErr }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }

      best.line.current_spiffs = newSpiffs;
      best.line.total_price = newTotalPrice;

      appliedTotal += r.amount;
      matched.push({
        row_id: r.row_id,
        invoice_number: best.line.invoice_number,
        invoice_line_id: best.line.line_id,
        agent_name: best.line.agent_name,
        amount: r.amount,
        score: best.score,
        status: "applied",
      });
    }
  }

  return new Response(
    JSON.stringify({
      matched,
      unmatched,
      applied_total: appliedTotal,
      already_processed_count: alreadyProcessedCount,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
