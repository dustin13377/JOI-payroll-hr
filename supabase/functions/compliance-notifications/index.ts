/**
 * compliance-notifications
 *
 * Sends compliance-related emails to agents about missing/rejected documents.
 *
 * Two invocation modes:
 *
 *   POST { "mode": "rejection", "employeeId": "...", "documentId": "..." }
 *     → Sends a single rejection notification email. Called from client after
 *       HR rejects a document.
 *
 *   POST { "mode": "daily" }  (or empty body)
 *     → Cron sweep. For each employee with compliance_grace_until set and
 *       non-compliant, determines which reminder/lock email is due, checks
 *       dedupe table, sends if not already sent.
 *
 * Required secrets (same as send-eod-digest):
 *   GMAIL_USER          e.g. EOD@justoutsource.it
 *   GMAIL_APP_PASSWORD  Google Workspace App Password
 *   CRON_SECRET         Must match app.cron_secret in Postgres
 *   DRY_RUN_COMPLIANCE  Leave unset (dry run) until ready; set to "false" to send.
 *                        Per-function flag — independent of send-eod-digest's DRY_RUN_EOD.
 *   APP_URL             e.g. https://joi-payroll-hr.vercel.app (for email links)
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
const DRY_RUN = Deno.env.get("DRY_RUN_COMPLIANCE") !== "false"; // safe default: true
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? (() => { throw new Error("APP_URL not set"); })();
const APP_DOMAIN = Deno.env.get("APP_DOMAIN") ?? (() => { throw new Error("APP_DOMAIN not set"); })();

// ---------------------------------------------------------------------------
// CORS (for browser-originated calls from the reject button)
// ---------------------------------------------------------------------------
// Env-driven allowlist. Default "*" keeps dev unblocked; set ALLOWED_ORIGIN
// in Supabase dashboard to lock down when going public
// (e.g. "https://joi-payroll-hr.vercel.app").
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Brand tokens (reused from EOD digest)
// ---------------------------------------------------------------------------
const NAVY = "#1B2A4A";
const ORANGE = "#FFA700";
const LIGHT = "#F8F9FA";
const BORDER = "#E5E7EB";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type NotificationType =
  | "rejection"
  | "reminder_7d"
  | "reminder_3d"
  | "reminder_1d"
  | "lock";

interface SendResult {
  employeeId: string;
  employeeName: string;
  type: NotificationType;
  status: "sent" | "dry_run" | "skipped" | "no_email" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// Gmail SMTP sender (same pattern as send-eod-digest)
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
      from: `"JOI Compliance" <${GMAIL_USER}>`,
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
// Email shell (matches EOD digest branding)
// ---------------------------------------------------------------------------
function emailShell(opts: {
  title: string;
  heading: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${opts.title}</title></head><body style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:${NAVY};padding:24px 32px;"><p style="margin:0;color:${ORANGE};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">JOI Payroll &amp; HR</p><h1 style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;line-height:1.3;">${opts.heading}</h1></div><div style="padding:24px 32px;">${opts.bodyHtml}</div><div style="padding:14px 32px;border-top:1px solid ${BORDER};background:${LIGHT};"><p style="margin:0;font-size:11px;color:#9CA3AF;">Sent automatically by JOI Payroll &amp; HR &middot; ${GMAIL_USER} &middot; System-generated message.</p></div></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Email builders
// ---------------------------------------------------------------------------

function buildRejectionEmail(
  employeeName: string,
  documentTypeName: string,
  rejectionReason: string
): string {
  return emailShell({
    title: "Document Rejected",
    heading: "A document you submitted was not approved",
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Hi ${employeeName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Your uploaded document <strong>${documentTypeName}</strong> has been reviewed and was not approved.</p>
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 4px;font-weight:600;color:#DC2626;font-size:13px;">Reason</p>
        <p style="margin:0;color:#7F1D1D;font-size:13px;line-height:1.5;">${rejectionReason}</p>
      </div>
      <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Please re-upload a corrected version as soon as possible.</p>
      <a href="${APP_URL}" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open JOI Payroll</a>
    `,
  });
}

function buildReminderEmail(
  employeeName: string,
  missingDocNames: string[],
  deadlineDate: string,
  daysLeft: number
): string {
  const urgency =
    daysLeft === 7
      ? { label: "Friendly Reminder", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" }
      : daysLeft === 3
      ? { label: "Urgent Reminder", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" }
      : { label: "Final Warning", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" };

  const docList = missingDocNames
    .map((n) => `<li style="margin:0 0 4px;color:#374151;font-size:13px;">${n}</li>`)
    .join("");

  return emailShell({
    title: `${urgency.label} — Missing Documents`,
    heading: `${urgency.label}: ${daysLeft} day${daysLeft !== 1 ? "s" : ""} until compliance deadline`,
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Hi ${employeeName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Your compliance deadline is <strong>${deadlineDate}</strong>. The following documents are still missing or not yet approved:</p>
      <div style="background:${urgency.bg};border:1px solid ${urgency.border};border-radius:6px;padding:16px;margin:0 0 16px;">
        <ul style="margin:0;padding:0 0 0 20px;">${docList}</ul>
      </div>
      ${daysLeft === 1 ? `<p style="margin:0 0 16px;color:#DC2626;font-size:14px;font-weight:600;line-height:1.6;">If your documents are not approved by tomorrow, your clock-in access will be disabled.</p>` : ""}
      <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Please contact HR or upload your documents as soon as possible.</p>
      <a href="${APP_URL}" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open JOI Payroll</a>
    `,
  });
}

function buildLockEmail(
  employeeName: string,
  missingDocNames: string[]
): string {
  const docList = missingDocNames
    .map((n) => `<li style="margin:0 0 4px;color:#374151;font-size:13px;">${n}</li>`)
    .join("");

  return emailShell({
    title: "Clock-In Access Disabled",
    heading: "Your clock-in access has been disabled",
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Hi ${employeeName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Your compliance grace period has expired and the following documents are still missing or not approved:</p>
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:16px;margin:0 0 16px;">
        <ul style="margin:0;padding:0 0 0 20px;">${docList}</ul>
      </div>
      <p style="margin:0 0 16px;color:#DC2626;font-size:14px;font-weight:600;line-height:1.6;">Your clock-in button is now disabled until these documents are resolved.</p>
      <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Please contact HR immediately to get this resolved.</p>
      <a href="${APP_URL}" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open JOI Payroll</a>
    `,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up an employee's email via user_profiles → auth.users. */
async function getEmployeeEmail(
  supabase: SupabaseClient,
  employeeId: string
): Promise<string | null> {
  // user_profiles.employee_id → user_profiles.id (= auth.users.id)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!profile) return null;

  const {
    data: { user },
  } = await supabase.auth.admin.getUserById(profile.id);
  return user?.email ?? null;
}

/** Insert dedupe row. Returns false if already exists (unique violation). */
async function insertDedupeRow(
  supabase: SupabaseClient,
  employeeId: string,
  notificationType: NotificationType,
  relatedDocumentId: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from("compliance_notifications_sent")
    .insert({
      employee_id: employeeId,
      notification_type: notificationType,
      related_document_id: relatedDocumentId,
    });
  if (error) {
    // 23505 = unique_violation — already sent
    if (error.code === "23505") return false;
    throw error;
  }
  return true;
}

/** Check if a notification was already sent. */
async function alreadySent(
  supabase: SupabaseClient,
  employeeId: string,
  notificationType: NotificationType,
  relatedDocumentId: string | null
): Promise<boolean> {
  let query = supabase
    .from("compliance_notifications_sent")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("notification_type", notificationType);

  if (relatedDocumentId) {
    query = query.eq("related_document_id", relatedDocumentId);
  } else {
    query = query.is("related_document_id", null);
  }

  const { data } = await query.maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------
// Mode: rejection
// ---------------------------------------------------------------------------
async function handleRejection(
  supabase: SupabaseClient,
  employeeId: string,
  documentId: string
): Promise<SendResult> {
  // Fetch employee name
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, work_name")
    .eq("id", employeeId)
    .single();
  if (!employee) throw new Error(`Employee ${employeeId} not found`);
  const employeeDisplayName = (employee as { work_name?: string | null }).work_name?.trim() || employee.full_name;

  // Fetch document + type name
  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id, document_type_id, rejection_reason, status")
    .eq("id", documentId)
    .single();
  if (!doc) throw new Error(`Document ${documentId} not found`);
  if (doc.status !== "rejected")
    throw new Error(`Document ${documentId} is not rejected (status: ${doc.status})`);

  const { data: docType } = await supabase
    .from("required_document_types")
    .select("name")
    .eq("id", doc.document_type_id)
    .single();

  const result: SendResult = {
    employeeId,
    employeeName: employee.full_name,
    type: "rejection",
    status: "sent",
  };

  // Dedupe check
  if (await alreadySent(supabase, employeeId, "rejection", documentId)) {
    console.log(
      `[SKIP] Rejection email already sent for employee=${employee.full_name} doc=${documentId}`
    );
    return { ...result, status: "skipped" };
  }

  // Get email
  const email = await getEmployeeEmail(supabase, employeeId);
  if (!email) {
    console.log(`[SKIP] No email found for employee=${employee.full_name}`);
    return { ...result, status: "no_email" };
  }

  const html = buildRejectionEmail(
    employeeDisplayName,
    docType?.name ?? "Unknown document",
    doc.rejection_reason ?? "No reason provided"
  );

  if (DRY_RUN) {
    console.log(
      `[DRY RUN] Would send rejection email to ${email} for doc "${docType?.name}"`
    );
  } else {
    try {
      const messageId = await sendViaGmail({
        to: [email],
        subject: `[Action Required] Document rejected — ${docType?.name ?? "Unknown"}`,
        html,
      });
      console.log(
        `Sent rejection email to ${email}. MsgID: ${messageId}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Send failed for ${email}: ${msg}`);
      return { ...result, status: "error", error: msg };
    }
  }

  // Insert dedupe row (even in DRY_RUN so dedupe logic is exercised)
  await insertDedupeRow(supabase, employeeId, "rejection", documentId);
  return { ...result, status: DRY_RUN ? "dry_run" : "sent" };
}

// ---------------------------------------------------------------------------
// Mode: daily cron sweep
// ---------------------------------------------------------------------------
async function handleDailySweep(
  supabase: SupabaseClient
): Promise<SendResult[]> {
  const results: SendResult[] = [];

  // Find all employees with compliance_grace_until set
  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, full_name, work_name, compliance_grace_until")
    .not("compliance_grace_until", "is", null)
    .eq("is_active", true);
  if (error) throw error;
  if (!employees || employees.length === 0) {
    console.log("[DAILY] No employees with compliance_grace_until set.");
    return results;
  }

  // Get all required document types
  const { data: requiredTypes } = await supabase
    .from("required_document_types")
    .select("id, name")
    .eq("is_active", true);
  const requiredTypeIds = new Set((requiredTypes ?? []).map((t) => t.id));
  const typeNameMap = new Map(
    (requiredTypes ?? []).map((t) => [t.id as string, t.name as string])
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const emp of employees) {
    try {
      const graceDate = new Date(emp.compliance_grace_until + "T00:00:00");
      const daysUntilDeadline = Math.ceil(
        (graceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine which notification type (if any) is due
      let notifType: NotificationType | null = null;
      if (daysUntilDeadline <= 0) {
        notifType = "lock";
      } else if (daysUntilDeadline <= 1) {
        notifType = "reminder_1d";
      } else if (daysUntilDeadline <= 3) {
        notifType = "reminder_3d";
      } else if (daysUntilDeadline <= 7) {
        notifType = "reminder_7d";
      }

      if (!notifType) {
        console.log(
          `[DAILY] ${emp.full_name}: ${daysUntilDeadline} days left, no notification due.`
        );
        continue;
      }

      // Check if employee is actually non-compliant
      const { data: docs } = await supabase
        .from("employee_documents")
        .select("document_type_id, status")
        .eq("employee_id", emp.id);

      const approvedTypeIds = new Set(
        (docs ?? [])
          .filter((d) => d.status === "approved")
          .map((d) => d.document_type_id)
      );
      const missingTypeIds = [...requiredTypeIds].filter(
        (id) => !approvedTypeIds.has(id)
      );

      if (missingTypeIds.length === 0) {
        console.log(
          `[DAILY] ${emp.full_name}: all docs approved, skipping.`
        );
        continue;
      }

      const missingDocNames = missingTypeIds.map(
        (id) => typeNameMap.get(id) ?? "Unknown"
      );

      // Dedupe check
      if (await alreadySent(supabase, emp.id, notifType, null)) {
        console.log(
          `[DAILY] ${emp.full_name}: ${notifType} already sent, skipping.`
        );
        results.push({
          employeeId: emp.id,
          employeeName: emp.full_name,
          type: notifType,
          status: "skipped",
        });
        continue;
      }

      // Get email
      const email = await getEmployeeEmail(supabase, emp.id);
      if (!email) {
        console.log(
          `[DAILY] ${emp.full_name}: no email found, skipping.`
        );
        results.push({
          employeeId: emp.id,
          employeeName: emp.full_name,
          type: notifType,
          status: "no_email",
        });
        continue;
      }

      // Build email
      const deadlineFormatted = graceDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      let subject: string;
      let html: string;

      if (notifType === "lock") {
        subject = "[Action Required] Clock-in access disabled — missing documents";
        const empDisplayName = (emp as { work_name?: string | null }).work_name?.trim() || emp.full_name;
        html = buildLockEmail(empDisplayName, missingDocNames);
      } else {
        const empDisplayName = (emp as { work_name?: string | null }).work_name?.trim() || emp.full_name;
        const daysLabel =
          notifType === "reminder_7d" ? 7 : notifType === "reminder_3d" ? 3 : 1;
        subject =
          daysLabel === 7
            ? `Reminder: ${daysLabel} days to complete your compliance documents`
            : daysLabel === 3
            ? `Urgent: ${daysLabel} days left for compliance documents`
            : `Final Warning: 1 day left for compliance documents`;
        html = buildReminderEmail(
          empDisplayName,
          missingDocNames,
          deadlineFormatted,
          daysLabel
        );
      }

      if (DRY_RUN) {
        console.log(
          `[DRY RUN] Would send ${notifType} to ${email} (${emp.full_name}). Missing: ${missingDocNames.join(", ")}`
        );
      } else {
        try {
          const messageId = await sendViaGmail({
            to: [email],
            subject,
            html,
          });
          console.log(
            `Sent ${notifType} to ${email} (${emp.full_name}). MsgID: ${messageId}`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `Send failed for ${email} (${emp.full_name}): ${msg}`
          );
          results.push({
            employeeId: emp.id,
            employeeName: emp.full_name,
            type: notifType,
            status: "error",
            error: msg,
          });
          continue; // continue processing remaining employees
        }
      }

      // Insert dedupe row (even in DRY_RUN)
      await insertDedupeRow(supabase, emp.id, notifType, null);
      results.push({
        employeeId: emp.id,
        employeeName: emp.full_name,
        type: notifType,
        status: DRY_RUN ? "dry_run" : "sent",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error processing ${emp.full_name}: ${msg}`);
      results.push({
        employeeId: emp.id,
        employeeName: emp.full_name,
        type: "lock", // placeholder
        status: "error",
        error: msg,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const jsonHeaders = { "Content-Type": "application/json", ...CORS_HEADERS };
  const body = (await req.json().catch(() => ({}))) as {
    mode?: string;
    employeeId?: string;
    documentId?: string;
  };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Rejection mode: called from client with JWT auth (Authorization header).
  // No cron secret needed — the client is authenticated.
  if (body.mode === "rejection") {
    if (!body.employeeId || !body.documentId) {
      return new Response(
        JSON.stringify({ error: "employeeId and documentId required" }),
        { status: 400, headers: jsonHeaders }
      );
    }
    try {
      const result = await handleRejection(
        supabase,
        body.employeeId,
        body.documentId
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: jsonHeaders,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Rejection handler error:", msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: jsonHeaders,
      });
    }
  }

  // Daily mode: authenticated via x-cron-secret header. Fail closed.
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
    const results = await handleDailySweep(supabase);
    return new Response(
      JSON.stringify({ mode: "daily", dryRun: DRY_RUN, results }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Daily sweep error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
