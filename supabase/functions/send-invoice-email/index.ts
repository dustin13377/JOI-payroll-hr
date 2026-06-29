/**
 * send-invoice-email
 *
 * Sends a single invoice (PDF + timesheet, generated in the browser and passed
 * in as base64) to the client's contacts via the Postmark email API.
 *
 * Flow:
 *   1. JWT-authenticated — caller must be owner / admin / manager.
 *   2. Validates recipients + that the invoice exists.
 *   3. Sends via Postmark with the PDF attached. BCCs the from-address by
 *      default so D keeps a copy of every invoice that goes out.
 *   4. On success: flips a draft invoice to "sent" (+ submitted_on) and writes
 *      a row to invoice_email_log (paper trail + Postmark message id for bounce
 *      tracing). A failed send is logged too, with the error.
 *
 * Required secrets (Supabase Dashboard → Edge Functions → send-invoice-email → Secrets):
 *   POSTMARK_SERVER_ACCOUNTING_TOKEN   Server API token from the Postmark accounting/invoices server.
 *                           (Falls back to POSTMARK_SERVER_TOKEN if that's what's set.)
 *   ALLOWED_ORIGIN          Comma-separated origin allow-list (defaults to app domain).
 *   INVOICE_FROM_EMAIL      Verified sender, e.g. "JOI Accounting <accounting@justoutsource.it>".
 *                           Defaults to accounting@justoutsource.it.
 *   INVOICE_BCC             Address to BCC on every send. Defaults to the from-address.
 *   INVOICE_MESSAGE_STREAM  Postmark message stream. Defaults to "outbound".
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
const POSTMARK_SERVER_TOKEN =
  Deno.env.get("POSTMARK_SERVER_ACCOUNTING_TOKEN") ??
  Deno.env.get("POSTMARK_SERVER_TOKEN") ??
  "";
const FROM_EMAIL = Deno.env.get("INVOICE_FROM_EMAIL") ?? "JOI Accounting <accounting@justoutsource.it>";
const BCC_EMAIL = Deno.env.get("INVOICE_BCC") ?? "accounting@justoutsource.it";
const MESSAGE_STREAM = Deno.env.get("INVOICE_MESSAGE_STREAM") ?? "outbound";

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

async function sendViaPostmark(opts: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  attachmentName: string;
  attachmentBase64: string;
}): Promise<string> {
  if (!POSTMARK_SERVER_TOKEN) throw new Error("POSTMARK_SERVER_TOKEN not set");
  const payload: Record<string, unknown> = {
    From: FROM_EMAIL,
    To: opts.to.join(", "),
    Subject: opts.subject,
    TextBody: opts.text,
    HtmlBody: textToHtml(opts.text),
    MessageStream: MESSAGE_STREAM,
    Attachments: [
      {
        Name: opts.attachmentName,
        Content: opts.attachmentBase64,
        ContentType: "application/pdf",
      },
    ],
  };
  if (opts.cc && opts.cc.length) payload.Cc = opts.cc.join(", ");
  if (opts.bcc && opts.bcc.length) payload.Bcc = opts.bcc.join(", ");

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Postmark returns { ErrorCode, Message } on failure.
    const msg = (json as { Message?: string }).Message ?? `Postmark HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (json as { MessageID?: string }).MessageID ?? "";
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

  const bccSelf = body.bcc_self !== false; // default true
  const bcc = bccSelf && BCC_EMAIL ? [BCC_EMAIL] : [];

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
    messageId = await sendViaPostmark({
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

  // 5. Flip a draft invoice to sent + log the successful send.
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
    postmark_message_id: messageId,
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
