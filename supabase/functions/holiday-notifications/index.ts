/**
 * holiday-notifications
 *
 * Sends holiday awareness emails to clients.
 *
 * Two invocation modes:
 *
 *   POST { "mode": "cron" }
 *     → Cron sweep. Finds all upcoming company_holidays exactly 14 or 7 days
 *       from today, sends client emails for campaigns with requires_holiday_coverage=true.
 *       Authenticated via x-cron-secret header.
 *
 *   POST { "mode": "manual", "campaignId": "...", "daysBefore": 14 | 7 }
 *     → Manual trigger from HR dashboard. Sends email for the next upcoming holiday
 *       on the specified campaign. Authenticated via Authorization JWT; caller must
 *       be leadership (owner / admin / manager). No dedupe check — manual = intentional resend.
 *
 * Required secrets:
 *   GMAIL_USER            e.g. EOD@justoutsource.it
 *   GMAIL_APP_PASSWORD    Google Workspace App Password
 *   CRON_SECRET           Must match app.cron_secret in Postgres
 *   DRY_RUN_HOLIDAY       Leave unset (dry run) until ready; set to "false" to send.
 *   APP_URL               e.g. https://joi-payroll-hr.vercel.app
 *   ALLOWED_ORIGIN        CORS allowlist (default "*")
 *
 * Auto-provided by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const DRY_RUN = Deno.env.get("DRY_RUN_HOLIDAY") !== "false"; // safe default: true
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Prefer the custom APP_SUPABASE_KEY secret (publishable key) so this function
// is decoupled from Supabase's auto-injected legacy anon key. Falls back to the
// auto-injected SUPABASE_ANON_KEY until legacy keys are retired.
const SUPABASE_ANON_KEY =
  Deno.env.get("APP_SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const APP_DOMAIN = Deno.env.get("APP_DOMAIN") ?? (() => { throw new Error("APP_DOMAIN not set"); })();
const REPLY_TO_EMAIL = Deno.env.get("REPLY_TO_EMAIL") ?? (() => { throw new Error("REPLY_TO_EMAIL not set"); })();

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Brand tokens (matches compliance-notifications)
// ---------------------------------------------------------------------------
const NAVY = "#1B2A4A";
const ORANGE = "#FFA700";
const LIGHT = "#F8F9FA";
const BORDER = "#E5E7EB";
const REPLY_TO = REPLY_TO_EMAIL;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SendResult {
  campaignId: string;
  campaignName: string;
  holidayDate: string;
  holidayName: string;
  daysBefore: number;
  status: "sent" | "dry_run" | "skipped" | "no_email" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a date string as "Monday, May 1, 2026" */
function formatDateLong(dateStr: string): string {
  // Use noon UTC to avoid off-by-one from TZ shifts
  const date = new Date(dateStr + "T12:00:00Z");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Add days to a YYYY-MM-DD date string, return YYYY-MM-DD */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD in UTC */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fetch the client's email via user_profiles → auth.admin.getUserById */
async function getClientEmail(
  supabase: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("role", "client")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!profile) return null;

  const {
    data: { user },
  } = await supabase.auth.admin.getUserById(profile.id);
  return user?.email ?? null;
}

/** Check if a notification was already sent (cron dedupe). */
async function alreadySent(
  supabase: SupabaseClient,
  campaignId: string,
  holidayDate: string,
  daysBefore: number
): Promise<boolean> {
  const { data } = await supabase
    .from("holiday_notification_sent")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("holiday_date", holidayDate)
    .eq("days_before", daysBefore)
    .maybeSingle();
  return !!data;
}

/** Insert dedupe row. Ignores unique violation (already sent). */
async function insertDedupeRow(
  supabase: SupabaseClient,
  campaignId: string,
  holidayDate: string,
  daysBefore: number
): Promise<void> {
  const { error } = await supabase
    .from("holiday_notification_sent")
    .insert({ campaign_id: campaignId, holiday_date: holidayDate, days_before: daysBefore });
  if (error && error.code !== "23505") throw error; // ignore unique violation
}

// ---------------------------------------------------------------------------
// Gmail SMTP sender (same pattern as compliance-notifications)
// ---------------------------------------------------------------------------
async function sendViaGmail(opts: {
  to: string[];
  subject: string;
  html: string;
}): Promise<string | null> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD)
    throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD not set");
  const messageId = `<${crypto.randomUUID()}@${
    GMAIL_USER.split("@")[1] || APP_DOMAIN
  }>`;
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
      from: `"JOI Payroll & HR" <${GMAIL_USER}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      headers: {
        "Message-ID": messageId,
        "Reply-To": REPLY_TO,
      },
    });
    return messageId;
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Email shell (matches EOD digest / compliance-notifications branding)
// ---------------------------------------------------------------------------
function emailShell(opts: {
  title: string;
  heading: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${opts.title}</title></head><body style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:${NAVY};padding:24px 32px;"><p style="margin:0;color:${ORANGE};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">JOI Payroll &amp; HR</p><h1 style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;line-height:1.3;">${opts.heading}</h1></div><div style="padding:24px 32px;">${opts.bodyHtml}</div><div style="padding:14px 32px;border-top:1px solid ${BORDER};background:${LIGHT};"><p style="margin:0;font-size:11px;color:#9CA3AF;">Sent automatically by JOI Payroll &amp; HR &middot; ${GMAIL_USER} &middot; System-generated message.</p></div></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Email builder
// ---------------------------------------------------------------------------
function buildHolidayEmail(opts: {
  clientName: string;
  holidayName: string;
  holidayDateLong: string;
  requiresCoverage: boolean;
}): string {
  const coverageLine = opts.requiresCoverage
    ? `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Your campaign will maintain operations. We will keep you updated on staffing as the date approaches.</p>`
    : `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Your campaign will be offline on this date.</p>`;

  return emailShell({
    title: `Holiday Notice: ${opts.holidayName}`,
    heading: `Holiday Notice: ${opts.holidayName}`,
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Dear ${opts.clientName} team,</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">This is a reminder that <strong>${opts.holidayName}</strong> falls on <strong>${opts.holidayDateLong}</strong>, a Mexican federal holiday.</p>
      ${coverageLine}
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">If you have questions, please reply to this email.</p>
    `,
  });
}

// ---------------------------------------------------------------------------
// Mode: cron sweep
// ---------------------------------------------------------------------------
async function handleCron(supabase: SupabaseClient): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const today = todayUTC();

  // Find holidays exactly 14 or 7 days from today
  const target14 = addDays(today, 14);
  const target7 = addDays(today, 7);

  const { data: holidays, error: holError } = await supabase
    .from("company_holidays")
    .select("id, date, name")
    .in("date", [target14, target7]);
  if (holError) throw holError;
  if (!holidays || holidays.length === 0) {
    console.log("[CRON] No holidays are 14 or 7 days away today.");
    return results;
  }

  // Find all coverage-required campaigns
  const { data: campaigns, error: campError } = await supabase
    .from("campaigns")
    .select("id, name, client_id, requires_holiday_coverage")
    .eq("requires_holiday_coverage", true);
  if (campError) throw campError;
  if (!campaigns || campaigns.length === 0) {
    console.log("[CRON] No campaigns with requires_holiday_coverage=true.");
    return results;
  }

  // Fetch client names in one shot
  const clientIds = [...new Set(campaigns.map((c) => c.client_id).filter(Boolean))];
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .in("id", clientIds);
  const clientNameMap = new Map((clients ?? []).map((cl) => [cl.id as string, cl.name as string]));

  for (const holiday of holidays) {
    const daysBefore = holiday.date === target14 ? 14 : 7;
    const dateFormatted = formatDateLong(holiday.date);

    for (const campaign of campaigns) {
      const resultBase = {
        campaignId: campaign.id,
        campaignName: campaign.name,
        holidayDate: holiday.date,
        holidayName: holiday.name,
        daysBefore,
      };

      try {
        // Dedupe check
        if (await alreadySent(supabase, campaign.id, holiday.date, daysBefore)) {
          console.log(
            `[CRON][SKIP] Already sent ${daysBefore}d notice for campaign="${campaign.name}" holiday="${holiday.name}"`
          );
          results.push({ ...resultBase, status: "skipped" });
          continue;
        }

        // Get client email
        const email = await getClientEmail(supabase, campaign.client_id);
        if (!email) {
          console.log(
            `[CRON][SKIP] No client email for campaign="${campaign.name}" client_id=${campaign.client_id}`
          );
          results.push({ ...resultBase, status: "no_email" });
          // Still insert dedupe so we don't keep trying a missing email
          await insertDedupeRow(supabase, campaign.id, holiday.date, daysBefore);
          continue;
        }

        const clientName = clientNameMap.get(campaign.client_id) ?? "Valued Client";
        const html = buildHolidayEmail({
          clientName,
          holidayName: holiday.name,
          holidayDateLong: dateFormatted,
          requiresCoverage: true, // cron only runs for requires_holiday_coverage=true campaigns
        });
        const subject = `Holiday Notice: ${holiday.name} — ${dateFormatted}`;

        if (DRY_RUN) {
          console.log(
            `[DRY RUN] Would send ${daysBefore}d notice to ${email} for campaign="${campaign.name}" holiday="${holiday.name}"`
          );
        } else {
          const messageId = await sendViaGmail({ to: [email], subject, html });
          console.log(
            `[CRON] Sent ${daysBefore}d notice to ${email} for campaign="${campaign.name}". MsgID: ${messageId}`
          );
        }

        await insertDedupeRow(supabase, campaign.id, holiday.date, daysBefore);
        results.push({ ...resultBase, status: DRY_RUN ? "dry_run" : "sent" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CRON] Error for campaign="${campaign.name}": ${msg}`);
        results.push({ ...resultBase, status: "error", error: msg });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Mode: manual trigger from HR dashboard
// ---------------------------------------------------------------------------
async function handleManual(
  supabase: SupabaseClient,
  campaignId: string,
  daysBefore: 14 | 7,
  callerToken: string
): Promise<SendResult> {
  // Verify caller is leadership using anon client + token
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(callerToken);
  if (authErr || !user) {
    throw new Error("Invalid or expired token");
  }

  // Check caller's role via service role client (bypasses RLS)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const leadershipRoles = ["owner", "admin", "manager"];
  if (!profile || !leadershipRoles.includes(profile.role)) {
    throw new Error("Caller is not authorized (must be owner, admin, or manager)");
  }

  // Fetch campaign + client info
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, name, client_id, requires_holiday_coverage, clients(id, name)")
    .eq("id", campaignId)
    .single();
  if (campErr || !campaign) throw new Error(`Campaign ${campaignId} not found`);

  // Find the next upcoming holiday
  const today = todayUTC();
  const { data: holidays, error: holErr } = await supabase
    .from("company_holidays")
    .select("id, date, name")
    .gt("date", today)
    .order("date", { ascending: true })
    .limit(1);
  if (holErr) throw holErr;
  if (!holidays || holidays.length === 0) {
    throw new Error("No upcoming holidays found");
  }

  const holiday = holidays[0];
  const dateFormatted = formatDateLong(holiday.date);
  const clientRecord = Array.isArray(campaign.clients)
    ? campaign.clients[0]
    : campaign.clients;
  const clientName = (clientRecord as { name: string } | null)?.name ?? "Valued Client";

  const resultBase = {
    campaignId: campaign.id,
    campaignName: campaign.name,
    holidayDate: holiday.date,
    holidayName: holiday.name,
    daysBefore,
  };

  // Get client email
  const email = await getClientEmail(supabase, campaign.client_id);
  if (!email) {
    console.log(`[MANUAL][SKIP] No client email for campaign="${campaign.name}"`);
    return { ...resultBase, status: "no_email" };
  }

  const html = buildHolidayEmail({
    clientName,
    holidayName: holiday.name,
    holidayDateLong: dateFormatted,
    requiresCoverage: campaign.requires_holiday_coverage ?? false,
  });
  const subject = `Holiday Notice: ${holiday.name} — ${dateFormatted}`;

  if (DRY_RUN) {
    console.log(
      `[DRY RUN][MANUAL] Would send ${daysBefore}d notice to ${email} for campaign="${campaign.name}" holiday="${holiday.name}"`
    );
    return { ...resultBase, status: "dry_run" };
  }

  const messageId = await sendViaGmail({ to: [email], subject, html });
  console.log(
    `[MANUAL] Sent ${daysBefore}d notice to ${email} for campaign="${campaign.name}". MsgID: ${messageId}`
  );
  // No dedupe row for manual sends (intentional resend)
  return { ...resultBase, status: "sent" };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const jsonHeaders = { "Content-Type": "application/json", ...CORS_HEADERS };

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body defaults to cron mode
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Manual mode ─────────────────────────────────────────────────────────────
  if (body.mode === "manual") {
    const campaignId = body.campaignId as string | undefined;
    const daysBefore = body.daysBefore as number | undefined;

    if (!campaignId || (daysBefore !== 14 && daysBefore !== 7)) {
      return new Response(
        JSON.stringify({ error: "campaignId and daysBefore (14 or 7) required" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const callerToken =
      req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    if (!callerToken) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: jsonHeaders }
      );
    }

    try {
      const result = await handleManual(
        supabase,
        campaignId,
        daysBefore as 14 | 7,
        callerToken
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: jsonHeaders,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Manual handler error:", msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: jsonHeaders,
      });
    }
  }

  // ── Cron mode ────────────────────────────────────────────────────────────────
  if (!CRON_SECRET) {
    return new Response(
      JSON.stringify({ error: "CRON_SECRET not configured" }),
      { status: 500, headers: jsonHeaders }
    );
  }
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  try {
    const results = await handleCron(supabase);
    return new Response(
      JSON.stringify({ mode: "cron", dryRun: DRY_RUN, results }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Cron handler error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
