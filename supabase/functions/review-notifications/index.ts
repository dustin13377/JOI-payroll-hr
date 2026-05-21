/**
 * review-notifications
 *
 * Sends 30-day-review notification emails. Two cron-triggered modes:
 *
 *   POST { "mode": "tl_daily" }
 *     → Runs at 9 AM CDMX. Finds all pending reviews (any week) where the
 *       due_date has hit, groups by TL, sends one digest email per TL with
 *       all of their pending reviews. Re-pings daily until completed.
 *
 *   POST { "mode": "escalation" }
 *     → Runs at 6 PM CDMX. Finds week-4 reviews still pending past their
 *       due_date and emails each leadership recipient (owner / admin /
 *       manager) ONCE per review. Subsequent runs skip already-escalated.
 *
 * Both modes use x-cron-secret header auth.
 *
 * Required secrets:
 *   GMAIL_USER          e.g. EOD@justoutsource.it
 *   GMAIL_APP_PASSWORD  Google Workspace App Password
 *   CRON_SECRET         Must match app.cron_secret in Postgres
 *   DRY_RUN_REVIEW      Leave unset (dry run) until ready; set to "false" to send.
 *   APP_URL             e.g. https://app.justoutsource.it (for email links)
 *   APP_DOMAIN          e.g. justoutsource.it
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
const DRY_RUN = Deno.env.get("DRY_RUN_REVIEW") !== "false"; // safe default: true
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? (() => { throw new Error("APP_URL not set"); })();
const APP_DOMAIN = Deno.env.get("APP_DOMAIN") ?? (() => { throw new Error("APP_DOMAIN not set"); })();

// ---------------------------------------------------------------------------
// CORS — cron-only, lock to no browser origins
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Brand colors (match compliance + EOD digest emails)
// ---------------------------------------------------------------------------
const NAVY = "#1B2A4A";
const ORANGE = "#FFA700";
const LIGHT = "#F8F9FA";
const BORDER = "#E5E7EB";

// ---------------------------------------------------------------------------
// Types matching the helper RPC return shapes
// ---------------------------------------------------------------------------
interface PendingTlEmailRow {
  review_id: string;
  employee_id: string;
  employee_name: string;
  employee_work_name: string | null;
  week_number: number;
  due_date: string;
  days_overdue: number;
  campaign_id: string;
  campaign_name: string;
  tl_id: string;
  tl_name: string;
  tl_email: string;
}

interface PendingEscalationRow {
  review_id: string;
  employee_id: string;
  employee_name: string;
  due_date: string;
  campaign_id: string;
  campaign_name: string;
  tl_id: string | null;
  tl_name: string | null;
  recipient_id: string;
  recipient_name: string;
  recipient_title: string;
  recipient_email: string;
  prior_attendance_avg: number | null;
  prior_kpi_avg: number | null;
  prior_attitude_avg: number | null;
  completed_weeks: number;
}

interface SendResult {
  type: "tl_due" | "escalation_day29";
  recipientEmail: string;
  recipientName: string;
  reviewIds: string[];
  status: "sent" | "dry_run" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// Date helper: today in CDMX (matches send-eod-digest pattern)
// ---------------------------------------------------------------------------
function todayCdmx(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Gmail SMTP sender
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
      from: `"JOI HR" <${GMAIL_USER}>`,
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
// Email shell (matches existing branding)
// ---------------------------------------------------------------------------
function emailShell(opts: { title: string; heading: string; bodyHtml: string }): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${opts.title}</title></head><body style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="max-width:640px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:${NAVY};padding:24px 32px;"><p style="margin:0;color:${ORANGE};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">JOI Payroll &amp; HR</p><h1 style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;line-height:1.3;">${opts.heading}</h1></div><div style="padding:24px 32px;">${opts.bodyHtml}</div><div style="padding:14px 32px;border-top:1px solid ${BORDER};background:${LIGHT};"><p style="margin:0;font-size:11px;color:#9CA3AF;">Sent automatically by JOI Payroll &amp; HR &middot; ${GMAIL_USER} &middot; System-generated message.</p></div></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Email builders
// ---------------------------------------------------------------------------

function dayOfProbation(weekNumber: number): string {
  if (weekNumber === 1) return "Day 7";
  if (weekNumber === 2) return "Day 14";
  if (weekNumber === 3) return "Day 21";
  if (weekNumber === 4) return "Day 29 (Final)";
  return `Extension #${weekNumber - 4}`;
}

function buildTlDigestEmail(
  tlName: string,
  rows: PendingTlEmailRow[],
): string {
  const items = rows
    .map((r) => {
      const overdue =
        r.days_overdue > 0
          ? `<span style="color:#DC2626;font-weight:600;">Overdue by ${r.days_overdue} day${r.days_overdue !== 1 ? "s" : ""}</span>`
          : `<span style="color:#D97706;font-weight:600;">Due today</span>`;
      const displayName = r.employee_work_name?.trim() || r.employee_name;
      const finalTag =
        r.week_number === 4
          ? `<span style="display:inline-block;background:${ORANGE};color:${NAVY};font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;letter-spacing:0.05em;">FINAL</span>`
          : "";
      return `<tr><td style="padding:10px 14px;border-bottom:1px solid ${BORDER};">
        <div style="font-weight:600;color:#111827;font-size:14px;">${displayName}${finalTag}</div>
        <div style="font-size:12px;color:#6B7280;margin-top:2px;">${r.campaign_name} &middot; ${dayOfProbation(r.week_number)} &middot; due ${r.due_date}</div>
      </td><td style="padding:10px 14px;border-bottom:1px solid ${BORDER};text-align:right;font-size:12px;">${overdue}</td></tr>`;
    })
    .join("");

  const finalCount = rows.filter((r) => r.week_number === 4).length;
  const finalLine =
    finalCount > 0
      ? `<p style="margin:0 0 12px;color:#DC2626;font-size:13px;line-height:1.5;"><strong>${finalCount}</strong> of these ${finalCount === 1 ? "is a final-week review" : "are final-week reviews"}. If not completed by day 29, leadership is notified.</p>`
      : "";

  return emailShell({
    title: "30-Day Reviews Pending",
    heading: `You have ${rows.length} probation review${rows.length === 1 ? "" : "s"} to complete`,
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Hi ${tlName},</p>
      <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">These weekly probation check-ins are waiting on you. Please complete them today so the agent's record stays current.</p>
      ${finalLine}
      <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;margin:0 0 20px;">
        <thead><tr style="background:${LIGHT};"><th style="text-align:left;padding:10px 14px;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Agent</th><th style="text-align:right;padding:10px 14px;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Status</th></tr></thead>
        <tbody>${items}</tbody>
      </table>
      <a href="${APP_URL}/reviews" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open 30-Day Reviews</a>
    `,
  });
}

function buildEscalationEmail(row: PendingEscalationRow): string {
  const tlBlurb = row.tl_name
    ? `Their team lead, <strong>${row.tl_name}</strong>, has not completed the final week-4 review.`
    : "No team lead is currently assigned to this campaign.";
  const scoreLine =
    row.completed_weeks > 0
      ? `<p style="margin:0 0 8px;font-size:13px;color:#374151;line-height:1.5;"><strong>Prior weekly averages</strong> (${row.completed_weeks} of 3 done): attendance ${row.prior_attendance_avg ?? "—"}/5, KPI ${row.prior_kpi_avg ?? "—"}/5, attitude ${row.prior_attitude_avg ?? "—"}/5.</p>`
      : `<p style="margin:0 0 8px;font-size:13px;color:#DC2626;line-height:1.5;"><strong>No prior weekly reviews were completed.</strong> The TL skipped weeks 1–3 entirely.</p>`;

  return emailShell({
    title: "30-Day Review Escalation",
    heading: `Action needed: ${row.employee_name}'s probation review is overdue`,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">Hi ${row.recipient_name},</p>
      <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;"><strong>${row.employee_name}</strong> on the <strong>${row.campaign_name}</strong> campaign has reached day 29 of probation without a final review filed. ${tlBlurb}</p>
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:14px;margin:0 0 16px;">
        <p style="margin:0 0 6px;font-weight:700;color:#DC2626;font-size:13px;">Why you're seeing this</p>
        <p style="margin:0;color:#7F1D1D;font-size:13px;line-height:1.5;">If no decision is filed, the agent stays in payroll past their probation window by default. Either chase the TL to complete the review, or file the keep/let-go/extend decision yourself in the app.</p>
      </div>
      ${scoreLine}
      <p style="margin:0 0 20px;color:#374151;font-size:13px;line-height:1.5;">Final review was due <strong>${row.due_date}</strong>.</p>
      <a href="${APP_URL}/reviews" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open 30-Day Reviews</a>
    `,
  });
}

// ---------------------------------------------------------------------------
// Mode handlers
// ---------------------------------------------------------------------------

async function runTlDaily(supabase: SupabaseClient): Promise<SendResult[]> {
  const sendDate = todayCdmx();
  const { data, error } = await supabase.rpc("find_pending_tl_review_emails", {
    p_send_date: sendDate,
  });
  if (error) throw new Error(`find_pending_tl_review_emails failed: ${error.message}`);

  const rows = (data ?? []) as PendingTlEmailRow[];
  if (rows.length === 0) return [];

  // Group by TL
  const byTl = new Map<string, { tl: { id: string; name: string; email: string }; reviews: PendingTlEmailRow[] }>();
  for (const r of rows) {
    const existing = byTl.get(r.tl_id);
    if (existing) {
      existing.reviews.push(r);
    } else {
      byTl.set(r.tl_id, {
        tl: { id: r.tl_id, name: r.tl_name, email: r.tl_email },
        reviews: [r],
      });
    }
  }

  const results: SendResult[] = [];
  for (const { tl, reviews } of byTl.values()) {
    const subject =
      reviews.length === 1
        ? `1 probation review pending — ${reviews[0].employee_work_name?.trim() || reviews[0].employee_name}`
        : `${reviews.length} probation reviews pending`;
    const html = buildTlDigestEmail(tl.name, reviews);

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would send to ${tl.email} (${tl.name}) — ${reviews.length} reviews`);
    } else {
      try {
        const msgId = await sendViaGmail({ to: [tl.email], subject, html });
        console.log(`Sent TL digest to ${tl.email}. MsgID: ${msgId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Send failed for ${tl.email}: ${msg}`);
        results.push({
          type: "tl_due",
          recipientEmail: tl.email,
          recipientName: tl.name,
          reviewIds: reviews.map((r) => r.review_id),
          status: "error",
          error: msg,
        });
        continue;
      }
    }

    // Stamp dedupe rows for every review in this digest (even in DRY_RUN, so
    // we don't repeatedly "would-send" the same review every cron tick).
    for (const r of reviews) {
      await supabase.rpc("mark_review_notification_sent", {
        p_review_id: r.review_id,
        p_notification_type: "tl_due",
        p_recipient_employee_id: tl.id,
        p_recipient_email: tl.email,
        p_send_date: sendDate,
      });
    }

    results.push({
      type: "tl_due",
      recipientEmail: tl.email,
      recipientName: tl.name,
      reviewIds: reviews.map((r) => r.review_id),
      status: DRY_RUN ? "dry_run" : "sent",
    });
  }

  return results;
}

async function runEscalation(supabase: SupabaseClient): Promise<SendResult[]> {
  const sendDate = todayCdmx();
  const { data, error } = await supabase.rpc("find_pending_escalation_emails", {
    p_send_date: sendDate,
  });
  if (error) throw new Error(`find_pending_escalation_emails failed: ${error.message}`);

  const rows = (data ?? []) as PendingEscalationRow[];
  if (rows.length === 0) return [];

  // Each row = one (review × recipient) pair. Send one email per pair.
  const results: SendResult[] = [];
  for (const r of rows) {
    const subject = `[Action Needed] ${r.employee_name}'s 30-day review is overdue`;
    const html = buildEscalationEmail(r);

    if (DRY_RUN) {
      console.log(
        `[DRY RUN] Would escalate review ${r.review_id} (${r.employee_name}) to ${r.recipient_email} (${r.recipient_title})`,
      );
    } else {
      try {
        const msgId = await sendViaGmail({ to: [r.recipient_email], subject, html });
        console.log(`Sent escalation to ${r.recipient_email}. MsgID: ${msgId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Escalation send failed for ${r.recipient_email}: ${msg}`);
        results.push({
          type: "escalation_day29",
          recipientEmail: r.recipient_email,
          recipientName: r.recipient_name,
          reviewIds: [r.review_id],
          status: "error",
          error: msg,
        });
        continue;
      }
    }

    await supabase.rpc("mark_review_notification_sent", {
      p_review_id: r.review_id,
      p_notification_type: "escalation_day29",
      p_recipient_employee_id: r.recipient_id,
      p_recipient_email: r.recipient_email,
      p_send_date: sendDate,
    });

    results.push({
      type: "escalation_day29",
      recipientEmail: r.recipient_email,
      recipientName: r.recipient_name,
      reviewIds: [r.review_id],
      status: DRY_RUN ? "dry_run" : "sent",
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  // Cron-only auth — fail closed.
  if (!CRON_SECRET) {
    return new Response("CRON_SECRET not configured", { status: 500, headers: CORS_HEADERS });
  }
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  }

  let body: { mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    let results: SendResult[] = [];
    if (body.mode === "tl_daily") {
      results = await runTlDaily(supabase);
    } else if (body.mode === "escalation") {
      results = await runEscalation(supabase);
    } else {
      return new Response(
        JSON.stringify({ error: "mode must be 'tl_daily' or 'escalation'" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        mode: body.mode,
        dry_run: DRY_RUN,
        send_date_cdmx: todayCdmx(),
        sent_count: results.filter((r) => r.status === "sent" || r.status === "dry_run").length,
        error_count: results.filter((r) => r.status === "error").length,
        results,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`review-notifications failed: ${msg}`);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
