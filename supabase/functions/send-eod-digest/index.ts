/**
 * send-eod-digest
 *
 * Handles two digest types. Call with JSON body:
 *   {}                          → type defaults to "daily"
 *   {"type": "morning_bundle"}  → morning late-EOD bundle
 *
 * DAILY (runs every 5 min via pg_cron):
 *   For each campaign whose eod_digest_cutoff_time has passed today (in the
 *   campaign's timezone) and hasn't had a digest sent yet today:
 *   → Sends a full EOD summary: all agent metrics, TL note, missing list.
 *
 * MORNING BUNDLE (separate pg_cron job, runs every 5 min):
 *   For each campaign whose eod_morning_bundle_time has passed today and
 *   hasn't had a bundle sent today:
 *   → Sends only the late filers (submitted after yesterday's cutoff) and
 *     agents still completely missing. Skipped if nothing to report.
 *
 * Required secrets (Supabase Dashboard → Edge Functions → send-eod-digest → Secrets):
 *   GMAIL_USER          e.g. EOD@justoutsource.it
 *   GMAIL_APP_PASSWORD  Google Workspace App Password (myaccount.google.com/apppasswords)
 *   CRON_SECRET         Any random string — must match app.cron_secret in Postgres
 *   DRY_RUN_EOD         Leave unset (dry run) until ready; set to "false" to send real email.
 *                        Per-function flag — independent of compliance-notifications' DRY_RUN_COMPLIANCE.
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
const DRY_RUN = Deno.env.get("DRY_RUN_EOD") !== "false"; // safe default: true
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_DOMAIN = Deno.env.get("APP_DOMAIN") ?? (() => { throw new Error("APP_DOMAIN not set"); })();

// ---------------------------------------------------------------------------
// CORS
//
// Browser-originated calls (the "Send Test Digest" button via
// supabase.functions.invoke) require these headers. pg_cron never does
// a preflight so CORS is a no-op for the cron path.
// ---------------------------------------------------------------------------
// Parse ALLOWED_ORIGIN as a comma-separated allow-list. The browser only
// accepts ONE value in the Access-Control-Allow-Origin response header, so
// we echo back whichever origin in the list matches the request — falling
// back to the first entry if the caller's origin isn't recognized.
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
// Types
// ---------------------------------------------------------------------------
interface Campaign {
  id: string;
  name: string;
  eod_digest_cutoff_time: string | null;
  eod_digest_timezone: string;
  eod_morning_bundle_time: string | null;
}

/** Row from campaigns_digest_fire_times() RPC. */
interface CampaignFireTime {
  campaign_id: string;
  campaign_name: string;
  eod_digest_timezone: string;
  eod_morning_bundle_time: string | null;
  digest_fire_time: string; // "HH:MM:SS"
}

interface KPIField {
  field_name: string;
  field_label: string;
  field_type: string;
  min_target: number | null;
}

interface Agent {
  id: string;
  full_name: string;
  work_name: string | null;
}

function agentDisplayName(a: Agent): string {
  return a.work_name?.trim() || a.full_name;
}

interface EODLog {
  employee_id: string;
  metrics: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  last_edited_at: string | null;
}

// Why an agent is or isn't in the EOD log for the day. Used to color and
// section the digest so TLs/clients can tell process-gap vs real-miss vs
// just-not-on-shift apart.
type AgentStatus =
  | "submitted"        // EOD log present
  | "clocked_no_eod"   // Punched in but never submitted EOD — the real miss
  | "awaiting_tl"      // No login yet (Day 1-30) — TL has to submit-for-agent
  | "on_pto"           // Approved time off covers the date
  | "did_not_work";    // Has login but no clock-in and no PTO — called out / no-show / not scheduled

interface AgentWithStatus extends Agent {
  status: AgentStatus;
}

interface TimeClockRow {
  employee_id: string;
  clock_in: string | null;
  clock_out: string | null;
  shift_end_expected: string | null;
  is_late: boolean | null;
  early_release: boolean | null;
  auto_clocked_out: boolean | null;
}

interface AgentContext {
  enriched: AgentWithStatus[];
  // Roll-ups for the TEAM COVERAGE block in the email header.
  coverage: {
    scheduled: number;
    present: number;
    missed: number;
    late: number;
    leftEarly: number;
  };
}

/**
 * Categorize each agent for the day AND compute team-coverage roll-ups.
 * Fetches user_profiles, time_clock, and approved time_off_requests in
 * parallel and joins them in memory.
 *
 * Coverage definitions:
 *   scheduled = active campaign agents NOT on approved PTO
 *   present   = agents with a clock_in row for the date
 *   missed    = scheduled - present (no-show / called out)
 *   late      = sum of time_clock.is_late = true
 *   leftEarly = clock_out is NOT NULL, clock_out < shift_end_expected,
 *               early_release is false/null, auto_clocked_out is false/null
 */
async function enrichAgents(
  supabase: SupabaseClient,
  campaignId: string,
  agents: Agent[],
  eodLogs: EODLog[],
  date: string,
): Promise<AgentContext> {
  const ids = agents.map((a) => a.id);
  if (ids.length === 0) {
    return { enriched: [], coverage: { scheduled: 0, present: 0, missed: 0, late: 0, leftEarly: 0 } };
  }
  const [profileRes, clockRes, ptoRes] = await Promise.all([
    supabase.from("user_profiles").select("employee_id").in("employee_id", ids),
    supabase.from("time_clock")
      .select("employee_id, clock_in, clock_out, shift_end_expected, is_late, early_release, auto_clocked_out")
      .eq("date", date)
      .in("employee_id", ids),
    supabase.from("time_off_requests")
      .select("employee_id, start_date, end_date, status")
      .eq("status", "approved")
      .in("employee_id", ids)
      .lte("start_date", date)
      .gte("end_date", date),
  ]);
  const hasLogin = new Set<string>(
    (profileRes.data ?? []).map((r: { employee_id: string }) => r.employee_id),
  );
  const clockRows = (clockRes.data ?? []) as TimeClockRow[];
  const clockedIn = new Set<string>(clockRows.map((r) => r.employee_id));
  const onPto = new Set<string>(
    (ptoRes.data ?? []).map((r: { employee_id: string }) => r.employee_id),
  );
  const submitted = new Set<string>(eodLogs.map((l) => l.employee_id));

  const enriched = agents.map((a): AgentWithStatus => {
    let status: AgentStatus;
    if (submitted.has(a.id)) status = "submitted";
    else if (onPto.has(a.id)) status = "on_pto";
    else if (!hasLogin.has(a.id)) status = "awaiting_tl";
    else if (clockedIn.has(a.id)) status = "clocked_no_eod";
    else status = "did_not_work";
    return { ...a, status };
  });

  const scheduled = agents.length - [...onPto].length;
  const present = clockedIn.size;
  const missed = Math.max(0, scheduled - present);
  const late = clockRows.filter((r) => r.is_late === true).length;
  const leftEarly = clockRows.filter((r) => {
    if (!r.clock_out || !r.shift_end_expected) return false;
    if (r.early_release === true) return false;
    if (r.auto_clocked_out === true) return false;
    return new Date(r.clock_out).getTime() < new Date(r.shift_end_expected).getTime();
  }).length;

  return { enriched, coverage: { scheduled, present, missed, late, leftEarly } };
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  submitted: "Submitted",
  clocked_no_eod: "Clocked in, no EOD",
  awaiting_tl: "Awaiting TL submission",
  on_pto: "On PTO",
  did_not_work: "Did not work",
};

type DigestResult = {
  campaign: string;
  status: "sent" | "dry_run" | "skipped" | "no_recipients" | "nothing_to_report" | "error";
  dryRun?: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" in the given IANA timezone. */
function getTodayInTz(tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "YYYY-MM-DD" for yesterday in the given timezone. */
function getYesterdayInTz(tz: string): string {
  const today = getTodayInTz(tz);
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** True if current local time in `tz` >= timeStr ("HH:MM:SS"). */
function hasTimePassed(timeStr: string, tz: string): boolean {
  const current = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
  return current >= timeStr;
}

/**
 * Converts a local time on a given date to a UTC Date object.
 * Handles DST and cross-midnight offsets correctly.
 *
 * Example: getCutoffAsUtc("2026-04-16", "17:00:00", "America/Denver")
 *          → 2026-04-17T00:00:00.000Z  (midnight UTC = 5 PM MDT)
 */
function getCutoffAsUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [ch, cm] = timeStr.split(":").map(Number);
  const utcGuess = new Date(`${dateStr}T${timeStr}Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);
  const lh = parseInt(parts.find((p) => p.type === "hour")!.value);
  const lm = parseInt(parts.find((p) => p.type === "minute")!.value);
  let offsetMins = (ch * 60 + cm) - (lh * 60 + lm);
  // Normalise: UTC offsets range -12h to +14h. Without this, times near
  // midnight can produce a wrong-day result.
  while (offsetMins > 840) offsetMins -= 1440;
  while (offsetMins < -720) offsetMins += 1440;
  return new Date(utcGuess.getTime() + offsetMins * 60_000);
}

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------
const NAVY = "#1B2A4A";
const ORANGE = "#FFA700";
const LIGHT = "#F8F9FA";
const BORDER = "#E5E7EB";

// ---------------------------------------------------------------------------
// Daily digest email builder
// ---------------------------------------------------------------------------
// Per-status colors for the Status column and section callouts.
const STATUS_COLORS: Record<AgentStatus, { fg: string; bg: string; rowBg: string }> = {
  submitted:      { fg: "#15803D", bg: "#F0FDF4", rowBg: "white"   },  // green
  clocked_no_eod: { fg: "#DC2626", bg: "#FEF2F2", rowBg: "#FFF5F5" },  // red \u2014 the real miss
  awaiting_tl:    { fg: "#B45309", bg: "#FFFBEB", rowBg: "#FFFBEB" },  // amber \u2014 process
  on_pto:         { fg: "#4B5563", bg: "#F3F4F6", rowBg: "#F9FAFB" },  // gray
  did_not_work:   { fg: "#4B5563", bg: "#F3F4F6", rowBg: "#F9FAFB" },  // gray
};

function buildDailyHtml(
  campaignName: string,
  date: string,
  kpiFields: KPIField[],
  agents: AgentWithStatus[],
  eodLogs: EODLog[],
  tlNote: string | null,
  coverage: { scheduled: number; present: number; missed: number; late: number; leftEarly: number },
): string {
  const submittedMap = new Map(eodLogs.map((l) => [l.employee_id, l]));
  const numericKpis = kpiFields.filter((f) => f.field_type === "number");
  const [y, m, d] = date.split("-").map(Number);
  const dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const kpiHeaders = numericKpis
    .map((k) => `<th style="padding:8px 12px;text-align:left;background:${NAVY};color:white;white-space:nowrap;">${k.field_label}</th>`)
    .join("");

  // Order rows by status priority: real misses first (visible), then awaiting_tl,
  // then submitted, then PTO/no-show last. Within group, alphabetical.
  const statusOrder: Record<AgentStatus, number> = {
    clocked_no_eod: 0, awaiting_tl: 1, submitted: 2, on_pto: 3, did_not_work: 4,
  };
  const sortedAgents = [...agents].sort((a, b) => {
    const so = statusOrder[a.status] - statusOrder[b.status];
    if (so !== 0) return so;
    return agentDisplayName(a).localeCompare(agentDisplayName(b));
  });

  const agentRows = sortedAgents.map((agent) => {
    const log = submittedMap.get(agent.id);
    const metrics = log?.metrics ?? null;
    const colors = STATUS_COLORS[agent.status];
    const kpiCells = numericKpis.map((kpi) => {
      const val = metrics !== null ? (metrics[kpi.field_name] as number | undefined) : undefined;
      const below = kpi.min_target !== null && val !== undefined && val < kpi.min_target;
      const cellStyle = below ? `background:#FFF3CD;color:#856404;` : `color:#374151;`;
      return `<td style="padding:8px 12px;border-bottom:1px solid ${BORDER};${cellStyle}">${val !== undefined ? String(val) : "\u2014"}${below ? `&nbsp;<span style="font-size:11px;">&#9888; below target</span>` : ""}</td>`;
    }).join("");
    const noteCell = log?.notes
      ? `<td style="padding:8px 12px;border-bottom:1px solid ${BORDER};color:#6B7280;font-size:12px;max-width:200px;">${log.notes}</td>`
      : `<td style="padding:8px 12px;border-bottom:1px solid ${BORDER};color:#9CA3AF;">\u2014</td>`;
    const statusIcon = agent.status === "submitted" ? "&#10003;" : agent.status === "clocked_no_eod" ? "&#10005;" : "&#8226;";
    const statusCell = `<td style="padding:8px 12px;border-bottom:1px solid ${BORDER};color:${colors.fg};white-space:nowrap;">${statusIcon} ${STATUS_LABEL[agent.status]}</td>`;
    return `<tr style="background:${colors.rowBg};"><td style="padding:8px 12px;border-bottom:1px solid ${BORDER};font-weight:500;white-space:nowrap;">${agentDisplayName(agent)}</td>${kpiCells}${statusCell}${noteCell}</tr>`;
  }).join("");

  const tlNoteSection = tlNote
    ? `<div style="margin-top:24px;background:${LIGHT};border-left:4px solid ${ORANGE};padding:16px;border-radius:4px;"><p style="margin:0 0 6px;font-weight:600;color:${NAVY};font-size:13px;">TL Note</p><p style="margin:0;color:#374151;font-size:13px;line-height:1.5;">${tlNote.replace(/\n/g, "<br>")}</p></div>`
    : `<div style="margin-top:24px;background:${LIGHT};border-left:4px solid ${BORDER};padding:16px;border-radius:4px;"><p style="margin:0;color:#9CA3AF;font-size:13px;font-style:italic;">No TL note for today.</p></div>`;

  // Bucket the non-submitters by status for clear callouts.
  const byStatus = (s: AgentStatus) => agents.filter((a) => a.status === s);
  const realMisses = byStatus("clocked_no_eod");
  const awaitingTl = byStatus("awaiting_tl");
  const onPto = byStatus("on_pto");
  const didNotWork = byStatus("did_not_work");
  const submittedCount = byStatus("submitted").length;

  const calloutBox = (
    title: string,
    names: string[],
    fg: string,
    bg: string,
    border: string,
  ): string =>
    `<div style="margin-top:12px;background:${bg};border:1px solid ${border};border-radius:4px;padding:12px 16px;"><p style="margin:0 0 6px;font-weight:600;color:${fg};font-size:13px;">${title}</p><p style="margin:0;color:${fg};font-size:13px;">${names.join(", ")}</p></div>`;

  const callouts: string[] = [];
  if (realMisses.length > 0) {
    callouts.push(calloutBox(
      `${realMisses.length} clocked in but did not submit EOD`,
      realMisses.map(agentDisplayName), "#7F1D1D", "#FEF2F2", "#FECACA",
    ));
  }
  if (awaitingTl.length > 0) {
    callouts.push(calloutBox(
      `${awaitingTl.length} awaiting TL submission (no app login yet)`,
      awaitingTl.map(agentDisplayName), "#92400E", "#FFFBEB", "#FDE68A",
    ));
  }
  if (onPto.length > 0) {
    callouts.push(calloutBox(
      `${onPto.length} on approved PTO`,
      onPto.map(agentDisplayName), "#374151", "#F3F4F6", "#E5E7EB",
    ));
  }
  if (didNotWork.length > 0) {
    callouts.push(calloutBox(
      `${didNotWork.length} did not work today`,
      didNotWork.map(agentDisplayName), "#374151", "#F3F4F6", "#E5E7EB",
    ));
  }
  const allInSection = callouts.length === 0
    ? `<div style="margin-top:16px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:4px;padding:12px 16px;"><p style="margin:0;color:#15803D;font-size:13px;font-weight:500;">&#10003; All scheduled agents submitted today</p></div>`
    : callouts.join("");

  // Summary line: highlight the real miss number first.
  const summaryParts: string[] = [
    `<strong>${submittedCount}</strong> of <strong>${agents.length}</strong> agents submitted`,
  ];
  if (realMisses.length > 0) summaryParts.push(`<span style="color:#DC2626;">${realMisses.length} missed</span>`);
  if (awaitingTl.length > 0) summaryParts.push(`<span style="color:#B45309;">${awaitingTl.length} awaiting TL</span>`);
  if (onPto.length + didNotWork.length > 0) summaryParts.push(`<span style="color:#6B7280;">${onPto.length + didNotWork.length} off</span>`);
  if (realMisses.length === 0 && awaitingTl.length === 0) summaryParts.push(`<span style="color:#15803D;">All accounted for</span>`);

  // TEAM COVERAGE block \u2014 mirrors Joe's manual-email template at the top of
  // the digest. Numbers are computed from time_clock + time_off in enrichAgents().
  const coverageCell = (label: string, value: number, accent?: string) =>
    `<td style="padding:10px 14px;border:1px solid ${BORDER};vertical-align:top;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;font-weight:600;">${label}</div><div style="font-size:22px;font-weight:700;color:${accent ?? NAVY};margin-top:2px;">${value}</div></td>`;
  const coverageBlock = `<div style="margin-bottom:20px;"><p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:${NAVY};text-transform:uppercase;">Team Coverage</p><table style="width:100%;border-collapse:collapse;font-size:13px;">${
    `<tr>${coverageCell("Reps Scheduled", coverage.scheduled)}${coverageCell("Reps Present", coverage.present, coverage.present >= coverage.scheduled ? "#15803D" : NAVY)}${coverageCell("Missed Today", coverage.missed, coverage.missed > 0 ? "#DC2626" : NAVY)}${coverageCell("Late Arrivals", coverage.late, coverage.late > 0 ? "#B45309" : NAVY)}${coverageCell("Left Early", coverage.leftEarly, coverage.leftEarly > 0 ? "#B45309" : NAVY)}</tr>`
  }</table></div>`;

  const productionHeader = `<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:${NAVY};text-transform:uppercase;">Production</p>`;

  return emailShell({
    title: `EOD Digest \u2014 ${campaignName}`, label: "EOD Digest", campaignName, dateLabel,
    summaryHtml: summaryParts.join(" &nbsp;&middot;&nbsp; "),
    bodyHtml: `${coverageBlock}${productionHeader}<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:480px;"><thead><tr><th style="padding:8px 12px;text-align:left;background:${NAVY};color:white;">Agent</th>${kpiHeaders}<th style="padding:8px 12px;text-align:left;background:${NAVY};color:white;">Status</th><th style="padding:8px 12px;text-align:left;background:${NAVY};color:white;">Notes</th></tr></thead><tbody>${agentRows}</tbody></table></div>${allInSection}${tlNoteSection}`,
  });
}

// ---------------------------------------------------------------------------
// Morning bundle email builder
// ---------------------------------------------------------------------------
function buildMorningBundleHtml(
  campaignName: string,
  date: string,
  kpiFields: KPIField[],
  bundleLogs: EODLog[],
  bundleAgents: Agent[],
  stillMissing: Agent[],
  amendedEmployeeIds: Set<string> = new Set(),
): string {
  const [y, m, d] = date.split("-").map(Number);
  const dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const numericKpis = kpiFields.filter((f) => f.field_type === "number");
  const logMap = new Map(bundleLogs.map((l) => [l.employee_id, l]));
  const kpiHeaders = numericKpis
    .map((k) => `<th style="padding:8px 12px;text-align:left;background:${NAVY};color:white;white-space:nowrap;">${k.field_label}</th>`)
    .join("");
  const bundleRows = bundleAgents.map((agent) => {
    const log = logMap.get(agent.id)!;
    const metrics = log.metrics ?? null;
    const isAmended = amendedEmployeeIds.has(agent.id);
    const kpiCells = numericKpis.map((kpi) => {
      const val = metrics !== null ? (metrics[kpi.field_name] as number | undefined) : undefined;
      const below = kpi.min_target !== null && val !== undefined && val < kpi.min_target;
      const cellStyle = below ? `background:#FFF3CD;color:#856404;` : `color:#374151;`;
      return `<td style="padding:8px 12px;border-bottom:1px solid ${BORDER};${cellStyle}">${val !== undefined ? String(val) : "\u2014"}${below ? `&nbsp;<span style="font-size:11px;">&#9888;</span>` : ""}</td>`;
    }).join("");
    const submittedAt = new Date(log.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const nameLabel = isAmended
      ? `${agentDisplayName(agent)} <span style="color:${ORANGE};font-size:11px;font-weight:600;">(amended)</span>`
      : agentDisplayName(agent);
    return `<tr style="background:white;"><td style="padding:8px 12px;border-bottom:1px solid ${BORDER};font-weight:500;white-space:nowrap;">${nameLabel}</td>${kpiCells}<td style="padding:8px 12px;border-bottom:1px solid ${BORDER};color:#6B7280;white-space:nowrap;font-size:12px;">Submitted ${submittedAt}</td></tr>`;
  }).join("");
  const bundleSection = bundleLogs.length > 0
    ? `<h3 style="margin:0 0 12px;color:${NAVY};font-size:14px;font-weight:600;">Late / Amended Submissions (${bundleLogs.length})</h3><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:480px;"><thead><tr><th style="padding:8px 12px;text-align:left;background:${NAVY};color:white;">Agent</th>${kpiHeaders}<th style="padding:8px 12px;text-align:left;background:${NAVY};color:white;">Submitted At</th></tr></thead><tbody>${bundleRows}</tbody></table></div>`
    : "";
  const missingSection = stillMissing.length > 0
    ? `<div style="margin-top:${bundleLogs.length > 0 ? "24px" : "0"};"><h3 style="margin:0 0 12px;color:${NAVY};font-size:14px;font-weight:600;">Still Missing (${stillMissing.length})</h3><div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:4px;padding:12px 16px;"><p style="margin:0;color:#7F1D1D;font-size:13px;">${stillMissing.map((a) => agentDisplayName(a)).join(", ")}</p></div></div>`
    : "";
  return emailShell({
    title: `Late EOD Bundle \u2014 ${campaignName}`, label: "Late EOD Bundle", campaignName,
    dateLabel: `${dateLabel} (yesterday)`,
    summaryHtml: `${bundleLogs.length} late/amended submission${bundleLogs.length !== 1 ? "s" : ""} &nbsp;&middot;&nbsp; ${stillMissing.length > 0 ? `<span style="color:#DC2626;">${stillMissing.length} still missing</span>` : `<span style="color:#15803D;">No outstanding missing</span>`}`,
    bodyHtml: `${bundleSection}${missingSection}`,
  });
}

// ---------------------------------------------------------------------------
// Shared email shell
// ---------------------------------------------------------------------------
function emailShell(opts: { title: string; label: string; campaignName: string; dateLabel: string; summaryHtml: string; bodyHtml: string; }): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${opts.title}</title></head><body style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="max-width:760px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:${NAVY};padding:24px 32px;"><p style="margin:0;color:${ORANGE};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">JOI Payroll &amp; HR &mdash; ${opts.label}</p><h1 style="margin:6px 0 0;color:white;font-size:22px;font-weight:700;line-height:1.2;">${opts.campaignName}</h1><p style="margin:4px 0 0;color:#94A3B8;font-size:13px;">${opts.dateLabel}</p></div><div style="background:${LIGHT};padding:12px 32px;border-bottom:1px solid ${BORDER};"><span style="font-size:13px;color:#374151;">${opts.summaryHtml}</span></div><div style="padding:24px 32px;">${opts.bodyHtml}</div><div style="padding:14px 32px;border-top:1px solid ${BORDER};background:${LIGHT};"><p style="margin:0;font-size:11px;color:#9CA3AF;">Sent automatically by JOI Payroll &amp; HR &middot; ${GMAIL_USER} &middot; System-generated message.</p></div></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Gmail SMTP sender
// ---------------------------------------------------------------------------
async function sendViaGmail(opts: { to: string[]; subject: string; html: string; }): Promise<string | null> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD not set");
  const messageId = `<${crypto.randomUUID()}@${GMAIL_USER.split("@")[1] || APP_DOMAIN}>`;
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });
  try {
    await client.send({
      from: `"JOI EOD Digest" <${GMAIL_USER}>`,
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
// Shared send-and-log helper
// ---------------------------------------------------------------------------
async function sendAndLog(supabase: SupabaseClient, logBase: Record<string, unknown>, emailOpts: { to: string[]; subject: string; html: string; }): Promise<{ status: DigestResult["status"]; error?: string }> {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would send "${emailOpts.subject}" to ${emailOpts.to.join(", ")}`);
    await supabase.from("eod_digest_log").upsert({ ...logBase, dry_run: true, smtp_message_id: null, error: null }, { onConflict: "campaign_id,digest_date,digest_type" });
    return { status: "dry_run" };
  }
  try {
    const messageId = await sendViaGmail(emailOpts);
    await supabase.from("eod_digest_log").upsert({ ...logBase, dry_run: false, smtp_message_id: messageId, error: null }, { onConflict: "campaign_id,digest_date,digest_type" });
    console.log(`Sent "${emailOpts.subject}" to ${emailOpts.to.length} recipient(s). MsgID: ${messageId}`);
    return { status: "sent" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Send failed: ${errMsg}`);
    try { await supabase.from("eod_digest_log").insert({ ...logBase, dry_run: false, error: errMsg }); } catch { /* unique conflict = success row exists */ }
    return { status: "error", error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// Shared: build + send daily digest for one campaign on a given date.
// Used by handleDailyDigest (cron) and handleManualFire (button).
// ---------------------------------------------------------------------------
async function sendDailyDigestForCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  campaignName: string,
  todayInTz: string,
): Promise<DigestResult> {
  // Pull the include_agents flag along with everything else.
  const [kpiRes, agentRes, eodRes, tlNoteRes, recipientRes, campaignFlagRes] = await Promise.all([
    supabase.from("campaign_kpi_config").select("field_name, field_label, field_type, min_target").eq("campaign_id", campaignId).eq("is_active", true).order("display_order"),
    supabase.from("employees").select("id, full_name, work_name, email, is_system_user").eq("campaign_id", campaignId).eq("is_active", true).order("full_name"),
    supabase.from("eod_logs").select("employee_id, metrics, notes, created_at").eq("campaign_id", campaignId).eq("date", todayInTz),
    supabase.from("campaign_eod_tl_notes").select("note").eq("campaign_id", campaignId).eq("date", todayInTz).maybeSingle(),
    supabase.from("campaign_eod_recipients").select("email").eq("campaign_id", campaignId).eq("active", true),
    supabase.from("campaigns").select("include_agents_in_eod_digest").eq("id", campaignId).maybeSingle(),
  ]);
  const fetchErr = [kpiRes, agentRes, eodRes, recipientRes].find((r) => r.error)?.error;
  if (fetchErr) return { campaign: campaignName, status: "error", error: fetchErr.message };
  const kpiFields = (kpiRes.data ?? []) as KPIField[];
  const allEmployees = (agentRes.data ?? []) as (Agent & { email: string | null; is_system_user: boolean })[];
  // For the digest table we only render real workforce (not partners/auditors).
  const agents = allEmployees.filter((e) => !e.is_system_user) as Agent[];
  const eodLogs = (eodRes.data ?? []) as EODLog[];
  const tlNote = (tlNoteRes.data as { note: string | null } | null)?.note ?? null;
  const manualRecipients = (recipientRes.data ?? []) as { email: string }[];
  const includeAgents = (campaignFlagRes.data as { include_agents_in_eod_digest?: boolean } | null)?.include_agents_in_eod_digest === true;

  // Build the final recipient list: manual entries (clients) ALWAYS, plus
  // campaign employees when the flag is on. Dedupe case-insensitively.
  const recipientSet = new Map<string, string>();
  for (const r of manualRecipients) {
    const e = r.email?.trim();
    if (e) recipientSet.set(e.toLowerCase(), e);
  }
  if (includeAgents) {
    for (const emp of allEmployees) {
      if (emp.is_system_user) continue; // skip partners/auditors
      const e = emp.email?.trim();
      if (!e) continue;
      recipientSet.set(e.toLowerCase(), e);
    }
  }
  const recipients = Array.from(recipientSet.values()).map((email) => ({ email }));

  // Enrich agents (status buckets) AND compute team coverage roll-ups
  // (scheduled / present / missed / late / left-early) for the email header.
  const { enriched, coverage } = await enrichAgents(supabase, campaignId, agents, eodLogs, todayInTz);
  const realMisses = enriched.filter((a) => a.status === "clocked_no_eod");
  const submittedCount = enriched.filter((a) => a.status === "submitted").length;
  // missing_agents JSON now carries status so the log row can answer "why was
  // this person missing?" without re-querying.
  const missingAgentsForLog = enriched
    .filter((a) => a.status !== "submitted")
    .map((a) => ({ id: a.id, full_name: a.full_name, status: a.status }));

  if (recipients.length === 0) {
    await supabase.from("eod_digest_log").upsert({ campaign_id: campaignId, digest_date: todayInTz, digest_type: "daily", recipient_count: 0, agent_submission_count: submittedCount, agent_missing_count: realMisses.length, missing_agents: missingAgentsForLog, dry_run: DRY_RUN, error: "no_recipients" }, { onConflict: "campaign_id,digest_date,digest_type" });
    return { campaign: campaignName, status: "no_recipients" };
  }
  const logBase = { campaign_id: campaignId, digest_date: todayInTz, digest_type: "daily", recipient_count: recipients.length, agent_submission_count: submittedCount, agent_missing_count: realMisses.length, missing_agents: missingAgentsForLog };
  const result = await sendAndLog(supabase, logBase, { to: recipients.map((r) => r.email), subject: `[EOD Digest] ${campaignName} \u2014 ${todayInTz}`, html: buildDailyHtml(campaignName, todayInTz, kpiFields, enriched, eodLogs, tlNote, coverage) });
  return { campaign: campaignName, ...result, dryRun: DRY_RUN };
}

// ---------------------------------------------------------------------------
// Daily digest handler — auto-trigger from shift_settings via RPC
// ---------------------------------------------------------------------------
async function handleDailyDigest(supabase: SupabaseClient): Promise<DigestResult[]> {
  // Get campaigns with today's auto-derived fire time from shift_settings
  const { data: rows, error } = await supabase.rpc("campaigns_digest_fire_times");
  if (error) throw error;
  const results: DigestResult[] = [];
  for (const row of (rows ?? []) as CampaignFireTime[]) {
    const tz = row.eod_digest_timezone || "America/Denver";
    if (!hasTimePassed(row.digest_fire_time, tz)) continue;
    const todayInTz = getTodayInTz(tz);
    // Double-send guard
    const { data: existing } = await supabase.from("eod_digest_log").select("id").eq("campaign_id", row.campaign_id).eq("digest_date", todayInTz).eq("digest_type", "daily").is("error", null).maybeSingle();
    if (existing) { results.push({ campaign: row.campaign_name, status: "skipped" }); continue; }
    const result = await sendDailyDigestForCampaign(supabase, row.campaign_id, row.campaign_name, todayInTz);
    results.push(result);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Morning bundle handler
// ---------------------------------------------------------------------------
async function handleMorningBundle(supabase: SupabaseClient): Promise<DigestResult[]> {
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id, name, eod_digest_cutoff_time, eod_digest_timezone, eod_morning_bundle_time")
    .not("eod_morning_bundle_time", "is", null)
    .not("eod_digest_cutoff_time", "is", null);
  if (error) throw error;
  const results: DigestResult[] = [];
  for (const c of (campaigns ?? []) as Campaign[]) {
    const tz = c.eod_digest_timezone || "America/Denver";
    if (!hasTimePassed(c.eod_morning_bundle_time!, tz)) continue;
    const todayInTz = getTodayInTz(tz);
    const yesterday = getYesterdayInTz(tz);
    const { data: existing } = await supabase.from("eod_digest_log").select("id").eq("campaign_id", c.id).eq("digest_date", todayInTz).eq("digest_type", "morning_bundle").is("error", null).maybeSingle();
    if (existing) { results.push({ campaign: c.name, status: "skipped" }); continue; }
    const cutoffUtc = getCutoffAsUtc(yesterday, c.eod_digest_cutoff_time!, tz);
    const [kpiRes, agentRes, eodRes, recipientRes, dailyDigestRes] = await Promise.all([
      supabase.from("campaign_kpi_config").select("field_name, field_label, field_type, min_target").eq("campaign_id", c.id).eq("is_active", true).order("display_order"),
      supabase.from("employees").select("id, full_name").eq("campaign_id", c.id).eq("is_active", true).order("full_name"),
      supabase.from("eod_logs").select("employee_id, metrics, notes, created_at, last_edited_at").eq("campaign_id", c.id).eq("date", yesterday),
      supabase.from("campaign_eod_recipients").select("email").eq("campaign_id", c.id).eq("active", true),
      // Fetch the daily digest sent_at to detect post-digest amendments
      supabase.from("eod_digest_log").select("sent_at").eq("campaign_id", c.id).eq("digest_date", yesterday).eq("digest_type", "daily").is("error", null).maybeSingle(),
    ]);
    const fetchErr = [kpiRes, agentRes, eodRes, recipientRes].find((r) => r.error)?.error;
    if (fetchErr) { results.push({ campaign: c.name, status: "error", error: fetchErr.message }); continue; }
    const kpiFields = (kpiRes.data ?? []) as KPIField[];
    const agents = (agentRes.data ?? []) as Agent[];
    const allYesterdayLogs = (eodRes.data ?? []) as EODLog[];
    const recipients = (recipientRes.data ?? []) as { email: string }[];
    const dailySentAt = dailyDigestRes.data?.sent_at ? new Date(dailyDigestRes.data.sent_at as string) : null;

    const lateLogs = allYesterdayLogs.filter((l) => new Date(l.created_at) > cutoffUtc);
    // Detect amended EODs: edited after the daily digest was sent
    const amendedLogs = dailySentAt
      ? allYesterdayLogs.filter((l) => l.last_edited_at && new Date(l.last_edited_at) > dailySentAt)
      : [];
    const amendedEmployeeIds = new Set(amendedLogs.map((l) => l.employee_id));
    // Include amended EODs in the bundle even if they weren't late
    const bundleLogs = [...lateLogs];
    for (const al of amendedLogs) {
      if (!bundleLogs.some((bl) => bl.employee_id === al.employee_id)) {
        bundleLogs.push(al);
      }
    }

    const submittedIds = new Set(allYesterdayLogs.map((l) => l.employee_id));
    const stillMissing = agents.filter((a) => !submittedIds.has(a.id));
    // Nothing to report — don't log (allows natural re-check next run)
    if (bundleLogs.length === 0 && stillMissing.length === 0) {
      results.push({ campaign: c.name, status: "nothing_to_report" }); continue;
    }
    if (recipients.length === 0) { results.push({ campaign: c.name, status: "no_recipients" }); continue; }
    const bundleAgentIds = new Set(bundleLogs.map((l) => l.employee_id));
    const bundleAgents = agents.filter((a) => bundleAgentIds.has(a.id));
    const logBase = { campaign_id: c.id, digest_date: todayInTz, digest_type: "morning_bundle", recipient_count: recipients.length, agent_submission_count: bundleLogs.length, agent_missing_count: stillMissing.length, missing_agents: stillMissing.map((a) => ({ id: a.id, full_name: a.full_name })) };
    const result = await sendAndLog(supabase, logBase, { to: recipients.map((r) => r.email), subject: `[Late EOD Bundle] ${c.name} \u2014 ${yesterday}`, html: buildMorningBundleHtml(c.name, yesterday, kpiFields, bundleLogs, bundleAgents, stillMissing, amendedEmployeeIds) });
    results.push({ campaign: c.name, ...result, dryRun: DRY_RUN });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Test-send handler
//
// JWT-authenticated. Lets a signed-in admin/manager/owner (or the team lead
// of the campaign) preview today's daily digest by emailing it ONLY to
// themselves. Ignores DRY_RUN (the entire point is real delivery). Does NOT
// write to eod_digest_log — test sends are ephemeral.
// ---------------------------------------------------------------------------
async function handleTestSend(
  supabase: SupabaseClient,
  req: Request,
  body: { campaign_id?: string; test_to_email?: string; date?: string },
): Promise<Response> {
  const jsonHeaders = { "Content-Type": "application/json", ...buildCorsHeaders(req) };
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });

  const campaignId = body.campaign_id;
  if (!campaignId) return fail(400, "campaign_id is required for test mode");

  // Optional overrides — let owners/admins/managers/TLs send a test using
  // a past date's EOD data and route it to any email (useful for testing
  // without polluting the auth login inbox or waiting for shift end).
  if (body.test_to_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.test_to_email.trim())) {
    return fail(400, `test_to_email '${body.test_to_email}' is not a valid email address`);
  }
  if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return fail(400, `date '${body.date}' must be YYYY-MM-DD`);
  }

  // 1. Verify JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return fail(401, "Authorization: Bearer <jwt> required");
  const { data: userData, error: authErr } = await supabase.auth.getUser(match[1]);
  if (authErr || !userData?.user) return fail(401, "Invalid or expired JWT");
  const user = userData.user;

  // 2. Authorize caller for this campaign
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("role, employee_id")
    .eq("id", user.id)
    .single();
  if (profileErr || !profile) return fail(403, "No user profile found");
  const role = profile.role as string;

  if (role === "team_lead") {
    if (!profile.employee_id) return fail(403, "Team lead profile has no linked employee");
    const { data: campaignRow, error: campOwnerErr } = await supabase
      .from("campaigns")
      .select("team_lead_id")
      .eq("id", campaignId)
      .single();
    if (campOwnerErr || !campaignRow) return fail(404, "Campaign not found");
    if (campaignRow.team_lead_id !== profile.employee_id) {
      return fail(403, "You are not the team lead for this campaign");
    }
  } else if (!["owner", "admin", "manager"].includes(role)) {
    return fail(403, `Role '${role}' is not allowed to send test digests`);
  }

  const recipient = body.test_to_email?.trim() || user.email;
  if (!recipient) return fail(400, "No recipient email available (your account has no email and no test_to_email was provided)");

  // 3. Fetch campaign + today's data
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, name, eod_digest_cutoff_time, eod_digest_timezone, eod_morning_bundle_time")
    .eq("id", campaignId)
    .single();
  if (campErr || !campaign) return fail(404, "Campaign not found");

  const camp = campaign as Campaign;
  const tz = camp.eod_digest_timezone || "America/Denver";
  const targetDate = body.date || getTodayInTz(tz);

  const [kpiRes, agentRes, eodRes, tlNoteRes] = await Promise.all([
    supabase.from("campaign_kpi_config").select("field_name, field_label, field_type, min_target").eq("campaign_id", campaignId).eq("is_active", true).order("display_order"),
    supabase.from("employees").select("id, full_name, work_name, is_system_user").eq("campaign_id", campaignId).eq("is_active", true).order("full_name"),
    supabase.from("eod_logs").select("employee_id, metrics, notes, created_at, last_edited_at").eq("campaign_id", campaignId).eq("date", targetDate),
    supabase.from("campaign_eod_tl_notes").select("note").eq("campaign_id", campaignId).eq("date", targetDate).maybeSingle(),
  ]);
  const fetchErr = [kpiRes, agentRes, eodRes].find((r) => r.error)?.error;
  if (fetchErr) return fail(500, `Failed to load campaign data: ${fetchErr.message}`);

  const kpiFields = (kpiRes.data ?? []) as KPIField[];
  // Filter out system users (partners/auditors) from the digest table.
  const agents = ((agentRes.data ?? []) as (Agent & { is_system_user: boolean })[])
    .filter((a) => !a.is_system_user) as Agent[];
  const eodLogs = (eodRes.data ?? []) as EODLog[];
  const tlNote = (tlNoteRes.data as { note: string | null } | null)?.note ?? null;

  // Enrich with status + compute team coverage for the test email so it
  // mirrors the real digest exactly.
  const { enriched, coverage } = await enrichAgents(supabase, campaignId, agents, eodLogs, targetDate);

  // 4. Render + send (always real, regardless of DRY_RUN). Do NOT log.
  const html = buildDailyHtml(camp.name, targetDate, kpiFields, enriched, eodLogs, tlNote, coverage);
  const subject = `[TEST \u2014 EOD Digest] ${camp.name} \u2014 ${targetDate}`;
  try {
    const messageId = await sendViaGmail({ to: [recipient], subject, html });
    return new Response(
      JSON.stringify({ mode: "test", sent_to: recipient, date: targetDate, message_id: messageId, eod_count: eodLogs.length, agent_count: agents.length }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(500, `Send failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Manual-fire handler
//
// JWT-authenticated like test-send, but sends to real recipients, logs to
// eod_digest_log, and respects DRY_RUN. Double-send guarded.
// ---------------------------------------------------------------------------
async function handleManualFire(
  supabase: SupabaseClient,
  req: Request,
  body: { campaign_id?: string },
): Promise<Response> {
  const jsonHeaders = { "Content-Type": "application/json", ...buildCorsHeaders(req) };
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });

  const campaignId = body.campaign_id;
  if (!campaignId) return fail(400, "campaign_id is required for manual_fire mode");

  // 1. Verify JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return fail(401, "Authorization: Bearer <jwt> required");
  const { data: userData, error: authErr } = await supabase.auth.getUser(match[1]);
  if (authErr || !userData?.user) return fail(401, "Invalid or expired JWT");

  // 2. Authorize
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles").select("role, employee_id").eq("id", userData.user.id).single();
  if (profileErr || !profile) return fail(403, "No user profile found");
  const role = profile.role as string;
  if (role === "team_lead") {
    if (!profile.employee_id) return fail(403, "Team lead has no linked employee");
    const { data: cr } = await supabase.from("campaigns").select("team_lead_id").eq("id", campaignId).single();
    if (!cr || cr.team_lead_id !== profile.employee_id) return fail(403, "Not your campaign");
  } else if (!["owner", "admin", "manager"].includes(role)) {
    return fail(403, `Role '${role}' cannot fire digests`);
  }

  // 3. Fetch campaign for name + tz
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns").select("id, name, eod_digest_timezone").eq("id", campaignId).single();
  if (campErr || !campaign) return fail(404, "Campaign not found");
  const tz = (campaign as { eod_digest_timezone: string }).eod_digest_timezone || "America/Denver";
  const todayInTz = getTodayInTz(tz);

  // 4. Double-send guard
  const { data: existing } = await supabase.from("eod_digest_log").select("id")
    .eq("campaign_id", campaignId).eq("digest_date", todayInTz).eq("digest_type", "daily").is("error", null).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ status: "already_sent_today" }), { status: 200, headers: jsonHeaders });
  }

  // 5. Send the real digest
  const result = await sendDailyDigestForCampaign(supabase, campaignId, (campaign as { name: string }).name, todayInTz);
  return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  // CORS preflight — browsers send OPTIONS before the real POST.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({})) as { type?: string; mode?: string; campaign_id?: string; test_to_email?: string; date?: string };
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Test-send mode: JWT-authenticated, bypasses cron secret.
  if (body.mode === "test") {
    return await handleTestSend(supabase, req, body);
  }

  // Manual-fire mode: JWT-authenticated, sends to real recipients.
  if (body.mode === "manual_fire") {
    return await handleManualFire(supabase, req, body);
  }

  // Cron mode: authenticated via x-cron-secret header.
  if (CRON_SECRET) {
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
  }
  const digestType = body.type === "morning_bundle" ? "morning_bundle" : "daily";
  try {
    const results = digestType === "morning_bundle"
      ? await handleMorningBundle(supabase)
      : await handleDailyDigest(supabase);
    return new Response(JSON.stringify({ digestType, dryRun: DRY_RUN, results }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
