import { createClient } from "@supabase/supabase-js";
import { parseApplicationEmail } from "./parser.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTMARK_INBOUND_SECRET = Deno.env.get("POSTMARK_INBOUND_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface PostmarkInboundPayload {
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Date?: string;
}

Deno.serve(async (req) => {
  // 1. Verify webhook secret (Postmark calls without Supabase JWT)
  const url = new URL(req.url);
  const providedSecret =
    url.searchParams.get("secret") ?? req.headers.get("x-postmark-secret");
  if (providedSecret !== POSTMARK_INBOUND_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  // 2. Parse JSON payload
  let payload: PostmarkInboundPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // 3. Parse the email body (prefer HtmlBody, fall back to TextBody)
  const rawBody = payload.HtmlBody || payload.TextBody || "";
  const parsed = parseApplicationEmail(rawBody);

  // 3b. Guard: the inbound address also receives other Gravity Forms
  // notifications (e.g. the website Contact form). Those parse to all-null
  // fields and used to create empty candidate rows. If we extracted nothing
  // that identifies an applicant, acknowledge with 200 (so Postmark doesn't
  // retry) but don't insert.
  if (!parsed.full_name && !parsed.curp && !parsed.phone && !parsed.cv_url) {
    console.log(
      "ignored non-application email",
      JSON.stringify({ subject: payload.Subject, from: payload.From }),
    );
    return new Response(
      JSON.stringify({ ok: true, action: "ignored_non_application" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  const receivedAt = payload.Date
    ? new Date(payload.Date).toISOString()
    : new Date().toISOString();

  // 4. Handle dedup by CURP — if curp is set AND a row with this curp exists,
  //    UPDATE the existing row's data fields (refresh raw email + notes + phone)
  //    but PRESERVE pipeline state (stage, assigned_to, follow-up timestamps, outcome).
  if (parsed.curp) {
    const { data: existing, error: lookupErr } = await supabase
      .from("recruiting_candidates")
      .select("id, stage")
      .eq("curp", parsed.curp)
      .maybeSingle();

    if (lookupErr) {
      console.error("curp lookup failed", lookupErr);
      return new Response("lookup failed", { status: 500 });
    }

    if (existing) {
      const { error: updateErr } = await supabase
        .from("recruiting_candidates")
        .update({
          full_name: parsed.full_name,
          // Only overwrite email when the new submission actually has one —
          // never wipe a known email with null.
          ...(parsed.email ? { email: parsed.email } : {}),
          phone: parsed.phone,
          role_interest: parsed.role_interest,
          english_level_self: parsed.english_level_self,
          applicant_notes: parsed.applicant_notes,
          cv_url: parsed.cv_url,
          presentation_url: parsed.presentation_url,
          raw_email_body: rawBody,
          raw_email_received_at: receivedAt,
          needs_manual_review: parsed.needs_manual_review,
          // Deliberately NOT updated: stage, stage_changed_at, assigned_to,
          // last_contacted_at, next_followup_at, final_status, pass_reason,
          // hired_for_role, hired_at, geo_qualified, english_level_assessed,
          // qualified_for_roles. These reflect recruiter decisions on the
          // candidate as a person, not the latest form submission.
        })
        .eq("id", existing.id);

      if (updateErr) {
        console.error("re-application update failed", updateErr);
        return new Response("update failed", { status: 500 });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          candidate_id: existing.id,
          action: "updated_existing",
          existing_stage: existing.stage,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
  }

  // 5. Otherwise insert a new candidate row
  const { data: inserted, error: insertErr } = await supabase
    .from("recruiting_candidates")
    .insert({
      source: "form",
      full_name: parsed.full_name,
      curp: parsed.curp,
      email: parsed.email,
      phone: parsed.phone,
      role_interest: parsed.role_interest,
      english_level_self: parsed.english_level_self,
      applicant_notes: parsed.applicant_notes,
      cv_url: parsed.cv_url,
      presentation_url: parsed.presentation_url,
      raw_email_body: rawBody,
      raw_email_received_at: receivedAt,
      needs_manual_review: parsed.needs_manual_review,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("insert failed", insertErr);
    return new Response("insert failed", { status: 500 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      candidate_id: inserted.id,
      action: "inserted",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
