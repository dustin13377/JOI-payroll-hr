/**
 * clock-in-alerts
 *
 * Emails team leads + managers when agents have not clocked in after their
 * shift has started. Two stages per campaign per day:
 *
 *   INITIAL (shift start + grace + initial_delay, default +15 min):
 *     One consolidated email to the campaign's team lead(s) AND the managers
 *     listing everyone who has not clocked in. Sent once. If nobody is missing,
 *     a zero-count log row is written and no email goes out.
 *
 *   ESCALATION (shift start + grace + escalation_delay, default +60 min):
 *     Re-checks who is STILL not clocked in. If anyone remains, escalates to
 *     the managers (TL kept on the thread) — the accountability step: the TL
 *     was already notified and the team still isn't in.
 *
 * Runs every 5 min via pg_cron (clock-in-alerts-check). The function decides
 * which campaigns are due using campaigns_clock_in_alert_times(), and uses
 * clock_in_alert_log as the double-send guard.
 *
 * "Not clocked in" deliberately means: an active, non-system agent who HAS an
 * app login, is NOT on approved PTO, and has no clock_in row today. Agents
 * without a login (TL clocks for them) and agents on PTO are excluded, so the
 * list is real forgot-to-clock-in / no-show cases — same bucketing the EOD
 * digest uses.
 *
 * Required secrets (same Gmail creds as send-eod-digest):
 *   GMAIL_USER, GMAIL_APP_PASSWORD
 *   CRON_SECRET          Must match app_config.cron_secret in Postgres.
 *   APP_URL              For the "Open JOI" button.
 *   APP_DOMAIN           Message-ID domain.
 *   DRY_RUN_CLOCK_IN     Safe default: true. Set to "false" to send real email.
 *                        Independent of the other functions' DRY_RUN flags.
 *
 * Auto-provided by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const DRY_RUN = Deno.env.get("DRY_RUN_CLOCK_IN") !== "false"; // safe default: true
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? (() => { throw new Error("APP_URL not set"); })();
const APP_DOMAIN = Deno.env.get("APP_DOMAIN") ?? (() => { throw new Error("APP_DOMAIN not set"); })();

// ---------------------------------------------------------------------------
// CORS (for the JWT-authenticated "send test" button)
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function buildCorsHeaders(req: Request): Record<string, string> {
  const reqOrigin = req.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ---------------------------------------------------------------------------
// Brand tokens (shared with the EOD digest / compliance emails)
// ---------------------------------------------------------------------------
const NAVY = "#1B2A4A";
const ORANGE = "#FFA700";
const LIGHT = "#F8F9FA";
const BORDER = "#E5E7EB";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Stage = "initial" | "escalation";

interface FireTimeRow {
  campaign_id: string;
  campaign_name: string;
  tz: string;
  earliest_shift_start: string; // "HH:MM:SS"
  grace_minutes: number;
  initial_fire_time: string;    // "HH:MM:SS"
  escalation_fire_time: string; // "HH:MM:SS"
}

interface MissingAgent {
  id: string;
  name: string;
}

type AlertResult = {
  campaign: string;
  stage: Stage;
  status: "sent" | "dry_run" | "skipped" | "no_recipients" | "nothing_to_report" | "error";
  missing?: number;
  error?: string;
};

// ---------------------------------------------------------------------------
// Timezone helpers (identical behavior to send-eod-digest)
// ---------------------------------------------------------------------------
function getTodayInTz(tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** True if current local time in `tz` >= timeStr ("HH:MM:SS"). */
function hasTimePassed(timeStr: string, tz: string): boolean {
  const current = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date());
  return current >= timeStr;
}

/** "h:mm AM" style label for a "HH:MM:SS" clock string. */
function timeLabel(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function dateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Gmail SMTP sender (same pattern as the other functions)
// ---------------------------------------------------------------------------
async function sendViaGmail(opts: { to: string[]; subject: string; html: string }): Promise<string | null> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD not set");
  const messageId = `<${crypto.randomUUID()}@${GMAIL_USER.split("@")[1] || APP_DOMAIN}>`;
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com", port: 465, tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });
  try {
    await client.send({
      from: `"JOI Clock-In Alerts" <${GMAIL_USER}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      headers: { "Message-ID": messageId },
    });
    return messageId;
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Email shell + builders
// ---------------------------------------------------------------------------
function emailShell(opts: { title: string; label: string; campaignName: string; subLabel: string; bodyHtml: string }): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${opts.title}</title></head><body style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:${NAVY};padding:24px 32px;"><p style="margin:0;color:${ORANGE};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">JOI &mdash; ${opts.label}</p><h1 style="margin:6px 0 0;color:white;font-size:21px;font-weight:700;line-height:1.25;">${opts.campaignName}</h1><p style="margin:4px 0 0;color:#94A3B8;font-size:13px;">${opts.subLabel}</p></div><div style="padding:24px 32px;">${opts.bodyHtml}</div><div style="padding:14px 32px;border-top:1px solid ${BORDER};background:${LIGHT};"><p style="margin:0;font-size:11px;color:#9CA3AF;">Sent automatically by JOI Payroll &amp; HR &middot; ${GMAIL_USER} &middot; System-generated message.</p></div></div></body></html>`;
}

function nameList(agents: MissingAgent[], fg: string, bg: string, border: string): string {
  const items = agents
    .map((a) => `<li style="margin:0 0 6px;color:${fg};font-size:14px;">${a.name}</li>`)
    .join("");
  return `<div style="background:${bg};border:1px solid ${border};border-radius:6px;padding:16px 16px 16px 8px;margin:0 0 20px;"><ul style="margin:0;padding:0 0 0 24px;">${items}</ul></div>`;
}

function buildInitialEmail(opts: {
  campaignName: string; date: string; shiftStart: string; asOf: string; agents: MissingAgent[];
}): string {
  return emailShell({
    title: `Clock-In Alert — ${opts.campaignName}`,
    label: "Clock-In Alert",
    campaignName: opts.campaignName,
    subLabel: `${dateLabel(opts.date)} &middot; shift started ${timeLabel(opts.shiftStart)}`,
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">As of <strong>${opts.asOf}</strong>, the following <strong>${opts.agents.length}</strong> ${opts.agents.length === 1 ? "person has" : "people have"} not clocked in for <strong>${opts.campaignName}</strong>:</p>
      ${nameList(opts.agents, "#7F1D1D", "#FEF2F2", "#FECACA")}
      <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Team leads, please check in with your people and get them clocked in. Anyone still not clocked in shortly will be escalated to management.</p>
      <a href="${APP_URL}" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open JOI Payroll</a>
    `,
  });
}

function buildEscalationEmail(opts: {
  campaignName: string; date: string; shiftStart: string; asOf: string;
  agents: MissingAgent[]; tlNames: string[]; tlNotifiedAt: string | null;
}): string {
  const tlLine = opts.tlNames.length > 0
    ? `The team lead${opts.tlNames.length > 1 ? "s" : ""} (${opts.tlNames.join(", ")}) ${opts.tlNotifiedAt ? `${opts.tlNames.length > 1 ? "were" : "was"} notified at ${opts.tlNotifiedAt}` : "have been notified"} and ${opts.agents.length === 1 ? "this person is" : "these people are"} still not clocked in.`
    : `${opts.agents.length === 1 ? "This person is" : "These people are"} still not clocked in well after shift start.`;
  return emailShell({
    title: `Escalation: still not clocked in — ${opts.campaignName}`,
    label: "Escalation — Not Clocked In",
    campaignName: opts.campaignName,
    subLabel: `${dateLabel(opts.date)} &middot; shift started ${timeLabel(opts.shiftStart)}`,
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">As of <strong>${opts.asOf}</strong>, <strong>${opts.agents.length}</strong> ${opts.agents.length === 1 ? "person on" : "people on"} <strong>${opts.campaignName}</strong> still ${opts.agents.length === 1 ? "has" : "have"} not clocked in:</p>
      ${nameList(opts.agents, "#7F1D1D", "#FEF2F2", "#FECACA")}
      <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">${tlLine} This needs management follow-up.</p>
      <a href="${APP_URL}" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open JOI Payroll</a>
    `,
  });
}

// ---------------------------------------------------------------------------
// Recipient + roster resolution
// ---------------------------------------------------------------------------

/** Team-lead employee rows for a campaign (campaigns.team_lead_id + team_lead_campaigns). */
async function getTeamLeads(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ name: string; email: string | null }[]> {
  const [campRes, joinRes] = await Promise.all([
    supabase.from("campaigns").select("team_lead_id").eq("id", campaignId).maybeSingle(),
    supabase.from("team_lead_campaigns").select("team_lead_id").eq("campaign_id", campaignId),
  ]);
  const ids = new Set<string>();
  const primary = (campRes.data as { team_lead_id: string | null } | null)?.team_lead_id;
  if (primary) ids.add(primary);
  for (const r of (joinRes.data ?? []) as { team_lead_id: string }[]) {
    if (r.team_lead_id) ids.add(r.team_lead_id);
  }
  if (ids.size === 0) return [];
  const { data } = await supabase
    .from("employees")
    .select("full_name, work_name, email")
    .in("id", [...ids]);
  return ((data ?? []) as { full_name: string; work_name: string | null; email: string | null }[])
    .map((e) => ({ name: e.work_name?.trim() || e.full_name, email: e.email?.trim() || null }));
}

/** Manager (and owner) emails — global leadership who oversee the teams. */
async function getManagerEmails(supabase: SupabaseClient, includeOwner: boolean): Promise<string[]> {
  const roles = includeOwner ? ["manager", "owner"] : ["manager"];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("employee_id")
    .in("role", roles)
    .not("employee_id", "is", null);
  const empIds = (profiles ?? []).map((p: { employee_id: string }) => p.employee_id);
  if (empIds.length === 0) return [];
  const { data: emps } = await supabase
    .from("employees")
    .select("email")
    .in("id", empIds);
  return ((emps ?? []) as { email: string | null }[])
    .map((e) => e.email?.trim())
    .filter((e): e is string => !!e);
}

/** Extra per-campaign recipients configured in campaign_eod_recipients (tl/manager). */
async function getConfiguredRecipients(supabase: SupabaseClient, campaignId: string): Promise<string[]> {
  const { data } = await supabase
    .from("campaign_eod_recipients")
    .select("email, role_label, active")
    .eq("campaign_id", campaignId)
    .eq("active", true)
    .in("role_label", ["tl", "manager"]);
  return ((data ?? []) as { email: string | null }[])
    .map((r) => r.email?.trim())
    .filter((e): e is string => !!e);
}

function dedupeEmails(emails: (string | null | undefined)[]): string[] {
  const map = new Map<string, string>();
  for (const e of emails) {
    const t = e?.trim();
    if (t) map.set(t.toLowerCase(), t);
  }
  return [...map.values()];
}

/**
 * Agents who have NOT clocked in today for a campaign, excluding PTO and
 * no-login (TL-managed) agents — mirrors send-eod-digest's "did_not_work".
 */
async function getMissingAgents(
  supabase: SupabaseClient,
  campaignId: string,
  date: string,
): Promise<MissingAgent[]> {
  const { data: roster } = await supabase
    .from("employees")
    .select("id, full_name, work_name, is_system_user")
    .eq("campaign_id", campaignId)
    .eq("is_active", true)
    .order("full_name");
  const agents = ((roster ?? []) as { id: string; full_name: string; work_name: string | null; is_system_user: boolean | null }[])
    .filter((e) => e.is_system_user !== true);
  const ids = agents.map((a) => a.id);
  if (ids.length === 0) return [];

  const [profileRes, clockRes, ptoRes] = await Promise.all([
    supabase.from("user_profiles").select("employee_id").in("employee_id", ids),
    supabase.from("time_clock").select("employee_id, clock_in").eq("date", date).in("employee_id", ids),
    supabase.from("vacation_requests").select("employee_id")
      .eq("status", "approved").in("employee_id", ids)
      .lte("start_date", date).gte("end_date", date),
  ]);

  const hasLogin = new Set<string>((profileRes.data ?? []).map((r: { employee_id: string }) => r.employee_id));
  const clockedIn = new Set<string>(
    ((clockRes.data ?? []) as { employee_id: string; clock_in: string | null }[])
      .filter((r) => !!r.clock_in)
      .map((r) => r.employee_id),
  );
  const onPto = new Set<string>((ptoRes.data ?? []).map((r: { employee_id: string }) => r.employee_id));

  return agents
    .filter((a) => hasLogin.has(a.id) && !clockedIn.has(a.id) && !onPto.has(a.id))
    .map((a) => ({ id: a.id, name: a.work_name?.trim() || a.full_name }));
}

// ---------------------------------------------------------------------------
// Log helpers (double-send guard, mirrors eod_digest_log usage)
// ---------------------------------------------------------------------------
async function alreadyLogged(
  supabase: SupabaseClient, campaignId: string, date: string, stage: Stage,
): Promise<boolean> {
  const { data } = await supabase.from("clock_in_alert_log")
    .select("id").eq("campaign_id", campaignId).eq("alert_date", date).eq("stage", stage)
    .is("error", null).maybeSingle();
  return !!data;
}

async function writeLog(
  supabase: SupabaseClient,
  row: {
    campaign_id: string; alert_date: string; stage: Stage; recipient_count: number;
    missing_count: number; missing_agents: MissingAgent[]; dry_run: boolean;
    smtp_message_id?: string | null; error?: string | null;
  },
): Promise<void> {
  await supabase.from("clock_in_alert_log").upsert(
    { smtp_message_id: null, error: null, ...row },
    { onConflict: "campaign_id,alert_date,stage" },
  );
}

// ---------------------------------------------------------------------------
// Stage handlers
// ---------------------------------------------------------------------------
async function handleInitial(supabase: SupabaseClient, row: FireTimeRow, date: string): Promise<AlertResult> {
  if (await alreadyLogged(supabase, row.campaign_id, date, "initial")) {
    return { campaign: row.campaign_name, stage: "initial", status: "skipped" };
  }
  const missing = await getMissingAgents(supabase, row.campaign_id, date);

  // Nobody missing — record the stage as done (so we don't recheck all day) and stop.
  if (missing.length === 0) {
    await writeLog(supabase, {
      campaign_id: row.campaign_id, alert_date: date, stage: "initial",
      recipient_count: 0, missing_count: 0, missing_agents: [], dry_run: DRY_RUN,
    });
    return { campaign: row.campaign_name, stage: "initial", status: "nothing_to_report", missing: 0 };
  }

  const [tls, managers, configured] = await Promise.all([
    getTeamLeads(supabase, row.campaign_id),
    getManagerEmails(supabase, false),
    getConfiguredRecipients(supabase, row.campaign_id),
  ]);
  const recipients = dedupeEmails([...tls.map((t) => t.email), ...managers, ...configured]);

  if (recipients.length === 0) {
    await writeLog(supabase, {
      campaign_id: row.campaign_id, alert_date: date, stage: "initial",
      recipient_count: 0, missing_count: missing.length, missing_agents: missing,
      dry_run: DRY_RUN, error: "no_recipients",
    });
    return { campaign: row.campaign_name, stage: "initial", status: "no_recipients", missing: missing.length };
  }

  const asOf = timeLabel(row.initial_fire_time);
  const html = buildInitialEmail({
    campaignName: row.campaign_name, date, shiftStart: row.earliest_shift_start, asOf, agents: missing,
  });
  const subject = `[Clock-In Alert] ${row.campaign_name} — ${missing.length} not clocked in`;
  return await sendStage(supabase, row, date, "initial", recipients, missing, subject, html);
}

async function handleEscalation(supabase: SupabaseClient, row: FireTimeRow, date: string): Promise<AlertResult> {
  if (await alreadyLogged(supabase, row.campaign_id, date, "escalation")) {
    return { campaign: row.campaign_name, stage: "escalation", status: "skipped" };
  }
  const missing = await getMissingAgents(supabase, row.campaign_id, date);

  // Nothing outstanding — don't log (lets a natural recheck happen if needed).
  if (missing.length === 0) {
    return { campaign: row.campaign_name, stage: "escalation", status: "nothing_to_report", missing: 0 };
  }

  const [tls, managers, configured, initialLog] = await Promise.all([
    getTeamLeads(supabase, row.campaign_id),
    getManagerEmails(supabase, true), // include owner on escalation
    getConfiguredRecipients(supabase, row.campaign_id),
    supabase.from("clock_in_alert_log").select("sent_at")
      .eq("campaign_id", row.campaign_id).eq("alert_date", date).eq("stage", "initial")
      .is("error", null).maybeSingle(),
  ]);
  // Managers + owner lead; TLs kept on the thread so they see it escalated.
  const recipients = dedupeEmails([...managers, ...configured, ...tls.map((t) => t.email)]);
  if (recipients.length === 0) {
    await writeLog(supabase, {
      campaign_id: row.campaign_id, alert_date: date, stage: "escalation",
      recipient_count: 0, missing_count: missing.length, missing_agents: missing,
      dry_run: DRY_RUN, error: "no_recipients",
    });
    return { campaign: row.campaign_name, stage: "escalation", status: "no_recipients", missing: missing.length };
  }

  const sentAt = (initialLog.data as { sent_at: string } | null)?.sent_at ?? null;
  const tlNotifiedAt = sentAt
    ? new Date(sentAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: row.tz })
    : null;
  const asOf = timeLabel(row.escalation_fire_time);
  const html = buildEscalationEmail({
    campaignName: row.campaign_name, date, shiftStart: row.earliest_shift_start, asOf,
    agents: missing, tlNames: tls.map((t) => t.name), tlNotifiedAt,
  });
  const subject = `[Escalation] ${row.campaign_name} — ${missing.length} STILL not clocked in`;
  return await sendStage(supabase, row, date, "escalation", recipients, missing, subject, html);
}

async function sendStage(
  supabase: SupabaseClient, row: FireTimeRow, date: string, stage: Stage,
  recipients: string[], missing: MissingAgent[], subject: string, html: string,
): Promise<AlertResult> {
  const logBase = {
    campaign_id: row.campaign_id, alert_date: date, stage,
    recipient_count: recipients.length, missing_count: missing.length, missing_agents: missing,
  };
  if (DRY_RUN) {
    console.log(`[DRY RUN] ${stage} for ${row.campaign_name}: would email ${recipients.length} recipient(s) about ${missing.length} missing (${missing.map((m) => m.name).join(", ")})`);
    await writeLog(supabase, { ...logBase, dry_run: true });
    return { campaign: row.campaign_name, stage, status: "dry_run", missing: missing.length };
  }
  try {
    const messageId = await sendViaGmail({ to: recipients, subject, html });
    await writeLog(supabase, { ...logBase, dry_run: false, smtp_message_id: messageId });
    console.log(`Sent ${stage} for ${row.campaign_name} to ${recipients.length} recipient(s). MsgID: ${messageId}`);
    return { campaign: row.campaign_name, stage, status: "sent", missing: missing.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Send failed (${stage}, ${row.campaign_name}): ${msg}`);
    try { await writeLog(supabase, { ...logBase, dry_run: false, error: msg }); } catch { /* conflict = row exists */ }
    return { campaign: row.campaign_name, stage, status: "error", missing: missing.length, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Cron sweep
// ---------------------------------------------------------------------------
async function handleSweep(supabase: SupabaseClient): Promise<AlertResult[]> {
  const { data: rows, error } = await supabase.rpc("campaigns_clock_in_alert_times");
  if (error) throw error;
  const results: AlertResult[] = [];
  for (const row of (rows ?? []) as FireTimeRow[]) {
    const tz = row.tz || "America/Denver";
    const date = getTodayInTz(tz);
    try {
      if (hasTimePassed(row.initial_fire_time, tz)) {
        results.push(await handleInitial(supabase, row, date));
      }
      if (hasTimePassed(row.escalation_fire_time, tz)) {
        results.push(await handleEscalation(supabase, row, date));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error processing ${row.campaign_name}: ${msg}`);
      results.push({ campaign: row.campaign_name, stage: "initial", status: "error", error: msg });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Cron mode: authenticated via x-cron-secret header. Fail closed.
  if (!CRON_SECRET) {
    return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), { status: 500, headers: jsonHeaders });
  }
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  try {
    const results = await handleSweep(supabase);
    return new Response(JSON.stringify({ mode: "sweep", dryRun: DRY_RUN, results }), { status: 200, headers: jsonHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Sweep error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
