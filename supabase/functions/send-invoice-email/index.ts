/**
 * send-invoice-email  (RESEND version)
 *
 * Drop-in replacement for the Postmark version. Same request body and same
 * response shape, so the frontend (useSendInvoiceEmail) needs no changes.
 * To go live: verify justoutsource.it in Resend, set the secrets below, then
 * replace index.ts with this file and redeploy.
 *
 * Sends a single invoice (PDF + timesheet, generated in the browser and passed
 * in as base64) to the client's contacts via the Resend email API.
 *
 * Flow:
 *   1. JWT-authenticated — caller must be owner / admin / manager.
 *   2. Validates recipients + that the invoice exists.
 *   3. Sends via Resend with the PDF attached. BCCs the from-address by
 *      default so D keeps a copy of every invoice that goes out.
 *   4. On success: flips a draft invoice to "sent" (+ submitted_on) and writes
 *      a row to invoice_email_log (paper trail + Resend message id). A failed
 *      send is logged too, with the error.
 *
 * IMPORTANT — what "sent" means here:
 *   A 200 from Resend means "accepted for delivery", NOT "landed in the inbox".
 *   Real delivery / bounce / spam-complaint is confirmed asynchronously by
 *   Resend webhooks. See the companion function `resend-webhook`, which updates
 *   invoice_email_log.status to delivered / bounced / complained. Without that
 *   webhook, a bounced invoice would still read "sent" — the exact trap that
 *   hid the Postmark quota failure.
 *
 * Required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
 *   RESEND_API_KEY          Resend API key (starts with "re_").
 *   ALLOWED_ORIGIN          Comma-separated origin allow-list (defaults to app domain).
 *   INVOICE_FROM_EMAIL      Verified sender, e.g. "JOI Accounting <accounting@justoutsource.it>".
 *                           MUST be on a domain verified in Resend.
 *   INVOICE_BCC             Address to BCC on every send. Defaults to the from-address.
 *
 * Auto-provided by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("INVOICE_FROM_EMAIL") ?? "JOI Accounting <accounting@justoutsource.it>";
// No BCC on invoices. The paper trail lives in the Resend dashboard +
// invoice_email_log, so we don't blind-copy anyone. Intentionally does NOT read
// an INVOICE_BCC secret, so no stale copy address can sneak back in.

// ---------------------------------------------------------------------------
// CORS — echo back the matching origin from a comma-separated allow-list.
// (Browser only accepts ONE value in Access-Control-Allow-Origin.)
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SendBody {
  invoice_id?: string;
  recipients?: string[];
  cc?: string[];
  subject?: string;
  body_text?: string;
  pdf_base64?: string;
  pdf_filename?: string;
  bcc_self?: boolean; // default true
}

// Minimal HTML wrapper so the plain-text body keeps its line breaks and looks
// like a normal email. We escape first, then turn newlines into <br>.
function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#111;line-height:1.5;white-space:normal;">${esc.replace(/\n/g, "<br>")}</div>`;
}

/**
 * Send via Resend. Returns the Resend message id on success.
 * Throws with a human-readable message on any non-2xx or malformed response,
 * so the caller logs a real failure instead of a false "sent".
 */
async function sendViaResend(opts: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  attachmentName: string;
  attachmentBase64: string;
}): Promise<string> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");

  const payload: Record<string, unknown> = {
    from: FROM_EMAIL,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: textToHtml(opts.text),
    attachments: [
      {
        filename: opts.attachmentName,
        content: opts.attachmentBase64, // base64 string
      },
    ],
  };
  if (opts.cc && opts.cc.length) payload.cc = opts.cc;
  if (opts.bcc && opts.bcc.length) payload.bcc = opts.bcc;

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    // Network-level failure reaching Resend — treat as a hard failure.
    throw new Error(`Could not reach Resend: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Resend returns { name, message } on failure.
    const msg = (json as { message?: string }).message ?? `Resend HTTP ${res.status}`;
    throw new Error(msg);
  }

  const id = (json as { id?: string }).id ?? "";
  // A 200 with no id would be an unexpected shape — refuse to report success.
  if (!id) throw new Error("Resend accepted the request but returned no message id");
  return id;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "POST only");

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Auth — verify JWT and authorize role.
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return fail(401, "Authorization: Bearer <jwt> required");
  const { data: userData, error: authErr } = await supabase.auth.getUser(match[1]);
  if (authErr || !userData?.user) return fail(401, "Invalid or expired session");
  const userId = userData.user.id;

  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profileErr || !profile) return fail(403, "No user profile found");
  if (!["owner", "admin", "manager"].includes(profile.role as string)) {
    return fail(403, `Role '${profile.role}' is not allowed to send invoices`);
  }

  // 2. Parse + validate body.
  const body = (await req.json().catch(() => ({}))) as SendBody;
  const invoiceId = body.invoice_id?.trim();
  const subject = body.subject?.trim();
  const text = body.body_text ?? "";
  const pdfBase64 = body.pdf_base64;
  const pdfName = body.pdf_filename?.trim() || "invoice.pdf";

  if (!invoiceId) return fail(400, "invoice_id is required");
  if (!subject) return fail(400, "subject is required");
  if (!pdfBase64) return fail(400, "pdf_base64 (the invoice attachment) is required");

  const recipients = (body.recipients ?? [])
    .map((e) => e.trim())
    .filter(Boolean);
  if (recipients.length === 0) return fail(400, "At least one recipient is required");
  const badEmail = recipients.find((e) => !EMAIL_RE.test(e));
  if (badEmail) return fail(400, `'${badEmail}' is not a valid email address`);

  const cc = (body.cc ?? []).map((e) => e.trim()).filter(Boolean);
  const badCc = cc.find((e) => !EMAIL_RE.test(e));
  if (badCc) return fail(400, `CC '${badCc}' is not a valid email address`);

  const bcc: string[] = []; // no BCC — invoices go only to the client recipients

  // 3. Confirm the invoice exists. organization_id lives on the client, not the
  //    invoice, so pull it through the FK for the log rows.
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, status, clients(organization_id)")
    .eq("id", invoiceId)
    .single();
  if (invErr || !invoice) return fail(404, "Invoice not found");
  const orgId = (invoice as { clients?: { organization_id?: string } }).clients?.organization_id ?? null;

  // 4. Send.
  let messageId = "";
  try {
    messageId = await sendViaResend({
      to: recipients,
      cc,
      bcc,
      subject,
      text,
      attachmentName: pdfName,
      attachmentBase64: pdfBase64,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Log the failure too — D should be able to see a send that didn't land.
    await supabase.from("invoice_email_log").insert({
      organization_id: orgId,
      invoice_id: invoiceId,
      recipients,
      cc: cc.length ? cc : null,
      bcc: bcc.length ? bcc : null,
      subject,
      status: "error",
      error: errMsg,
      sent_by: userId,
    });
    return fail(502, `Send failed: ${errMsg}`);
  }

  // 5. Flip a draft invoice to sent + log the submission.
  //    NOTE: status "sent" here means "accepted by Resend". The resend-webhook
  //    function upgrades/downgrades this row to delivered / bounced later.
  if (invoice.status === "draft") {
    await supabase
      .from("invoices")
      .update({ status: "sent", submitted_on: new Date().toISOString() })
      .eq("id", invoiceId);
  }

  await supabase.from("invoice_email_log").insert({
    organization_id: orgId,
    invoice_id: invoiceId,
    recipients,
    cc: cc.length ? cc : null,
    bcc: bcc.length ? bcc : null,
    subject,
    status: "sent",
    postmark_message_id: messageId, // reused column: now holds the Resend id
    sent_by: userId,
  });

  return new Response(
    JSON.stringify({
      status: "sent",
      message_id: messageId,
      recipients,
      marked_sent: invoice.status === "draft",
    }),
    { status: 200, headers: jsonHeaders },
  );
});
