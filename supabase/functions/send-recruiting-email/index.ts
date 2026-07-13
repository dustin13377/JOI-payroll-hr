/**
 * send-recruiting-email
 *
 * Sends a recruiting follow-up email to a candidate via Resend, as a second
 * channel when the WhatsApp invite went quiet. Manual only — a recruiter clicks
 * "Send email follow-up" in the candidate drawer; there is no automated cron.
 *
 * Modeled on send-invoice-email (same Resend + CORS + auth patterns), minus the
 * attachment. The client passes the exact subject + body it rendered from the
 * template, so the logged copy matches what the candidate received.
 *
 * Flow:
 *   1. JWT-authenticated — caller must be leadership (owner / admin / manager),
 *      matching the /recruiting page guard (RequireLeadership).
 *   2. Loads the candidate, validates they have a usable email.
 *   3. Sends via Resend (no attachment).
 *   4. On success: logs a recruiting_messages row (channel 'email',
 *      status 'sent') and re-stamps last_contacted_at so the candidate drops
 *      off the "needs follow-up" worklist. Does NOT change the stage — a second
 *      touch must not move the funnel. A failed send is logged too (status
 *      'failed') and returns an error.
 *
 * IMPORTANT — what "sent" means:
 *   A 200 from Resend is "accepted for delivery", NOT "landed in the inbox".
 *   Don't read a sent row as proof the candidate saw it.
 *
 * Required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
 *   RESEND_API_KEY           Resend API key (starts with "re_"). Already set.
 *   ALLOWED_ORIGIN           Comma-separated origin allow-list (defaults to app).
 *   RECRUITING_FROM_EMAIL    Verified sender. Defaults to
 *                            "JOI Recursos Humanos <humanresources@justoutsource.it>".
 *                            MUST be on a domain verified in Resend (justoutsource.it is).
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
const FROM_EMAIL =
  Deno.env.get("RECRUITING_FROM_EMAIL") ??
  "JOI Recursos Humanos <humanresources@justoutsource.it>";

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
  candidate_id?: string;
  subject?: string;
  body_text?: string;
  template_key?: string;
}

// Minimal HTML wrapper so the plain-text body keeps its line breaks and looks
// like a normal email. We escape first, then turn newlines into <br>.
function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#111;line-height:1.5;">${esc.replace(/\n/g, "<br>")}</div>`;
}

/**
 * Send via Resend. Returns the Resend message id on success.
 * Throws with a human-readable message on any non-2xx or malformed response.
 */
async function sendViaResend(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<string> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");

  const payload: Record<string, unknown> = {
    from: FROM_EMAIL,
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
    html: textToHtml(opts.text),
  };

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
    throw new Error(`Could not reach Resend: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { message?: string }).message ?? `Resend HTTP ${res.status}`;
    throw new Error(msg);
  }

  const id = (json as { id?: string }).id ?? "";
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

  // 1. Auth — verify JWT and authorize leadership.
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
    return fail(403, `Role '${profile.role}' is not allowed to send recruiting email`);
  }

  // 2. Parse + validate body.
  const body = (await req.json().catch(() => ({}))) as SendBody;
  const candidateId = body.candidate_id?.trim();
  const subject = body.subject?.trim();
  const text = body.body_text ?? "";
  const templateKey = body.template_key?.trim() || "interview_followup_email";

  if (!candidateId) return fail(400, "candidate_id is required");
  if (!subject) return fail(400, "subject is required");
  if (!text.trim()) return fail(400, "body_text is required");

  // 3. Load candidate + validate email.
  const { data: candidate, error: candErr } = await supabase
    .from("recruiting_candidates")
    .select("id, email")
    .eq("id", candidateId)
    .single();
  if (candErr || !candidate) return fail(404, "Candidate not found");

  const to = (candidate.email ?? "").trim();
  if (!to) return fail(400, "Candidate has no email on file");
  if (!EMAIL_RE.test(to)) return fail(400, `'${to}' is not a valid email address`);

  // 4. Send.
  try {
    await sendViaResend({ to, subject, text });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Log the failure so a send that didn't go out is visible.
    await supabase.from("recruiting_messages").insert({
      candidate_id: candidateId,
      direction: "outbound",
      channel: "email",
      template_key: templateKey,
      subject,
      body: text,
      sent_by: userId,
      status: "failed",
    });
    return fail(502, `Send failed: ${errMsg}`);
  }

  // 5. Log the send + reset the follow-up clock (but NOT the stage).
  await supabase.from("recruiting_messages").insert({
    candidate_id: candidateId,
    direction: "outbound",
    channel: "email",
    template_key: templateKey,
    subject,
    body: text,
    sent_by: userId,
    status: "sent",
  });

  await supabase
    .from("recruiting_candidates")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", candidateId);

  return new Response(
    JSON.stringify({ status: "sent", to }),
    { status: 200, headers: jsonHeaders },
  );
});
