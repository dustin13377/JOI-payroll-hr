/**
 * notify-hr-request-filed
 *
 * Sends an email to all active leadership (owner/admin/manager) when a
 * TL files a new carta, acta, or renuncia request. Event-driven — called
 * from the client after successful INSERT into hr_document_requests.
 *
 * POST body: { requestId: string }
 *
 * Required headers:
 *   Authorization: Bearer <jwt>  — caller must be authenticated. The user's
 *                                  user_profiles.role must be one of
 *                                  ["team_lead","manager","admin","owner"].
 *                                  Closes audit finding C-2 (2026-05-27).
 *
 * Required secrets:
 *   GMAIL_USER, GMAIL_APP_PASSWORD
 *   DRY_RUN_HR_NOTIFICATIONS  — defaults true; set "false" to send
 *   APP_URL                   — for the deep link to the HR queue
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

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Roles permitted to trigger HR notifications. TLs file requests; leadership
// is included so admin tooling can re-fire a notification if needed.
const ALLOWED_ROLES = ["team_lead", "manager", "admin", "owner"];

const NAVY = "#1B2A4A";
const ORANGE = "#FFA700";
const LIGHT = "#F8F9FA";
const BORDER = "#E5E7EB";

const TYPE_LABELS: Record<string, string> = {
  carta: "Carta de Compromiso",
  acta: "Acta Administrativa",
  renuncia: "Renuncia Voluntaria",
  rescision_prueba: "Rescisión Periodo de Prueba",
  rescision_desempeno: "Rescisión por Bajo Desempeño",
};

function emailShell(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${heading}</title></head><body style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:${NAVY};padding:24px 32px;"><p style="margin:0;color:${ORANGE};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">JOI Payroll &amp; HR</p><h1 style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;line-height:1.3;">${heading}</h1></div><div style="padding:24px 32px;">${bodyHtml}</div><div style="padding:14px 32px;border-top:1px solid ${BORDER};background:${LIGHT};"><p style="margin:0;font-size:11px;color:#9CA3AF;">Sent automatically by JOI Payroll &amp; HR &middot; ${GMAIL_USER}</p></div></div></body></html>`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // -----------------------------------------------------------------------
    // 0. Caller auth — verify JWT + role. Closes audit finding C-2.
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: authError,
    } = await anonClient.auth.getUser();
    if (authError || !caller) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await anonClient
      .from("user_profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    const role = profile?.role;
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return jsonResponse({ error: "Forbidden: TL or leadership only" }, 403);
    }

    // -----------------------------------------------------------------------
    // 1. Parse body
    // -----------------------------------------------------------------------
    const { requestId } = await req.json();
    if (!requestId) {
      return jsonResponse({ error: "Missing requestId" }, 400);
    }

    // -----------------------------------------------------------------------
    // 2. Privileged work — use service role only AFTER caller is verified
    // -----------------------------------------------------------------------
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2a. Fetch the request
    const { data: request, error: reqErr } = await supa
      .from("hr_document_requests")
      .select("id, request_type, incident_date, tl_narrative, reason, employee_id, filed_by")
      .eq("id", requestId)
      .single();
    if (reqErr || !request) {
      return jsonResponse({ error: "Request not found" }, 404);
    }

    // 2b. Fetch the agent
    const { data: agent } = await supa
      .from("employees")
      .select("full_name, work_name, campaign_id, campaigns!campaign_id(name)")
      .eq("id", request.employee_id)
      .single();
    const agentName = agent?.work_name?.trim() || agent?.full_name || "Unknown";
    const campaignName = (agent?.campaigns as { name?: string } | null)?.name ?? "Unknown";

    // 2c. Fetch the filer (TL)
    const { data: filer } = await supa
      .from("employees")
      .select("full_name, work_name")
      .eq("id", request.filed_by)
      .single();
    const filerName = filer?.work_name?.trim() || filer?.full_name || "Unknown";

    // 2d. Fetch all leadership emails
    const { data: leaders } = await supa
      .from("employees")
      .select("email")
      .in("title", ["owner", "admin", "manager"])
      .eq("is_active", true);
    const emails = (leaders ?? [])
      .map((l) => l.email)
      .filter((e): e is string => !!e && e.includes("@"));

    if (emails.length === 0) {
      return jsonResponse({ status: "no_recipients", recipientCount: 0 });
    }

    // -----------------------------------------------------------------------
    // 3. Build email
    // -----------------------------------------------------------------------
    const typeLabel = TYPE_LABELS[request.request_type] ?? request.request_type;
    const subject = `New ${typeLabel} Request — ${agentName}`;

    const bodyHtml = `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
        <strong>${filerName}</strong> filed a new <strong>${typeLabel}</strong> request for <strong>${agentName}</strong> (${campaignName}).
      </p>
      ${request.reason ? `<p style="margin:0 0 12px;color:#6B7280;font-size:13px;"><em>Reason: ${request.reason}</em></p>` : ""}
      <div style="background:${LIGHT};border:1px solid ${BORDER};border-radius:6px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 4px;font-weight:600;color:${NAVY};font-size:13px;">TL Narrative</p>
        <p style="margin:0;color:#374151;font-size:13px;line-height:1.5;white-space:pre-wrap;">${request.tl_narrative}</p>
      </div>
      <a href="${APP_URL}/hr/document-queue" style="display:inline-block;background:${ORANGE};color:${NAVY};font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;">Open HR Queue</a>
    `;

    const html = emailShell(subject, bodyHtml);

    // -----------------------------------------------------------------------
    // 4. Send or dry-run
    // -----------------------------------------------------------------------
    if (DRY_RUN) {
      console.log(`[DRY_RUN] Would send "${subject}" to ${emails.length} recipients: ${emails.join(", ")}`);
      return jsonResponse({ status: "dry_run", recipientCount: emails.length });
    }

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
        from: `"JOI HR Notifications" <${GMAIL_USER}>`,
        to: emails,
        subject,
        html,
      });
    } finally {
      await client.close();
    }

    return jsonResponse({ status: "sent", recipientCount: emails.length });
  } catch (err) {
    console.error("notify-hr-request-filed error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
