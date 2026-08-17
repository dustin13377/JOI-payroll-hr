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
  // Postmark's per-delivery id. Stable across Postmark's retries of the SAME
  // inbound email, different for a genuine second application. This is the
  // idempotency key that lets us be append-only without creating phantom rows.
  MessageID?: string;
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
    // Distinguish "not an application" from "an application we couldn't read".
    // The parser only understands the Gravity Forms HTML table layout; a
    // TextBody-only delivery parses to all-null and would otherwise be
    // silently classified as contact-form noise. That is an application LOST,
    // not noise, so it gets its own action and an error-level log to alert on.
    // Still 200 in both cases: retrying an unparseable email cannot succeed.
    const textOnly = !payload.HtmlBody && !!payload.TextBody;
    if (textOnly) {
      console.error(
        "UNPARSED text-only email - possible lost application, review manually",
        JSON.stringify({
          subject: payload.Subject,
          from: payload.From,
          messageId: payload.MessageID,
        }),
      );
    } else {
      console.log(
        "ignored non-application email",
        JSON.stringify({ subject: payload.Subject, from: payload.From }),
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        action: textOnly ? "unparsed_text_only" : "ignored_non_application",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  // Parse the Date header defensively. An unparseable value used to throw
  // BEFORE the replay short-circuit, which meant every Postmark retry of that
  // email failed identically with a 500 until retries were exhausted and the
  // application was lost. Invalid or missing dates fall back to now().
  //
  // Note the fallback interacts with dedupe: received_at participates in the
  // (body_md5, received_at) unique index, and now() differs per retry. So for
  // an email with no usable Date AND no MessageID, retries are not deduped.
  // Postmark sends both in practice; this is the least-bad degradation.
  let receivedAt = new Date().toISOString();
  if (payload.Date) {
    const d = new Date(payload.Date);
    if (!Number.isNaN(d.getTime())) {
      receivedAt = d.toISOString();
    } else {
      console.warn("unparseable Date header, using now()", payload.Date);
    }
  }

  const messageId = payload.MessageID ?? null;

  // 4. Replay short-circuit.
  //
  // Postmark re-delivers the identical inbound email on its retry schedule
  // whenever it doesn't get a fast 2xx from us. Previously that was absorbed by
  // deduping onto the candidate row, which also (wrongly) absorbed genuine
  // re-applications. Now the retry is caught here on the message id, and a
  // genuine re-application falls through and becomes its own application row.
  if (messageId) {
    const { data: seen, error: seenErr } = await supabase
      .from("recruiting_applications")
      .select("id, candidate_id")
      .eq("provider_message_id", messageId)
      .limit(1);

    if (seenErr) {
      console.error("replay lookup failed", seenErr);
      return new Response("lookup failed", { status: 500 });
    }
    if (seen && seen.length > 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          action: "duplicate_ignored",
          application_id: seen[0].id,
          candidate_id: seen[0].candidate_id,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
  }

  // 5. Resolve the candidate. Unchanged behaviour: match by CURP when we have
  //    one, otherwise by email, oldest row wins so we converge on the first
  //    record we ever created for this person. What changed is the MEANING of
  //    this step: it now only maintains the candidate/pipeline record. The
  //    submission itself is recorded separately in step 7 and is never
  //    overwritten.
  let existing: { id: string; stage: string } | null = null;

  if (parsed.curp) {
    const { data, error: lookupErr } = await supabase
      .from("recruiting_candidates")
      .select("id, stage")
      .eq("curp", parsed.curp)
      .order("created_at", { ascending: true })
      .limit(1);
    if (lookupErr) {
      console.error("curp lookup failed", lookupErr);
      return new Response("lookup failed", { status: 500 });
    }
    existing = data?.[0] ?? null;
  }

  if (!existing && parsed.email) {
    const { data, error: lookupErr } = await supabase
      .from("recruiting_candidates")
      .select("id, stage")
      .ilike("email", parsed.email)
      .order("created_at", { ascending: true })
      .limit(1);
    if (lookupErr) {
      console.error("email lookup failed", lookupErr);
      return new Response("lookup failed", { status: 500 });
    }
    existing = data?.[0] ?? null;
  }

  let candidateId: string;
  let candidateAction: "updated_existing" | "inserted";

  if (existing) {
    const { error: updateErr } = await supabase
      .from("recruiting_candidates")
      .update({
        // Never wipe known identity/contact data with null: a sparse second
        // submission (say, re-applying without re-attaching a CV) must not
        // degrade the candidate record. The old code only protected email.
        ...(parsed.full_name ? { full_name: parsed.full_name } : {}),
        ...(parsed.email ? { email: parsed.email } : {}),
        ...(parsed.phone ? { phone: parsed.phone } : {}),
        ...(parsed.cv_url ? { cv_url: parsed.cv_url } : {}),
        ...(parsed.presentation_url
          ? { presentation_url: parsed.presentation_url }
          : {}),
        // CURP was never backfilled onto an email-matched candidate, which
        // kept future submissions matching only by email forever.
        ...(parsed.curp ? { curp: parsed.curp } : {}),
        role_interest: parsed.role_interest,
        applied_position: parsed.applied_position,
        english_level_self: parsed.english_level_self,
        applicant_notes: parsed.applicant_notes,
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

    candidateId = existing.id;
    candidateAction = "updated_existing";
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("recruiting_candidates")
      .insert({
        source: "form",
        full_name: parsed.full_name,
        curp: parsed.curp,
        email: parsed.email,
        phone: parsed.phone,
        role_interest: parsed.role_interest,
        applied_position: parsed.applied_position,
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

    candidateId = inserted.id;
    candidateAction = "inserted";
  }

  // 6. Record the submission itself. This is the append-only part and it is
  //    what every count should be based on.
  //
  //    body_md5 is a GENERATED column in Postgres — do not send it. That is
  //    deliberate: the backfill and this path must hash identically, so only
  //    the database ever computes it.
  const a = parsed.attribution;

  const { data: appRow, error: appErr } = await supabase
    .from("recruiting_applications")
    .insert({
      candidate_id: candidateId,
      received_at: receivedAt,
      provider_message_id: messageId,

      full_name: parsed.full_name,
      email: parsed.email,
      phone: parsed.phone,
      curp: parsed.curp,
      applied_position: parsed.applied_position,
      role_interest: parsed.role_interest,
      english_level_self: parsed.english_level_self,
      applicant_notes: parsed.applicant_notes,
      cv_url: parsed.cv_url,
      presentation_url: parsed.presentation_url,

      ad_position: a.ad_position,

      ft_source: a.ft_source,
      ft_medium: a.ft_medium,
      ft_campaign: a.ft_campaign,
      ft_content: a.ft_content,
      ft_term: a.ft_term,
      ft_channel: a.ft_channel,
      ft_placement: a.ft_placement,
      ft_landing: a.ft_landing,
      ft_query: a.ft_query,

      lt_source: a.lt_source,
      lt_medium: a.lt_medium,
      lt_campaign: a.lt_campaign,
      lt_content: a.lt_content,
      lt_term: a.lt_term,
      lt_channel: a.lt_channel,
      lt_placement: a.lt_placement,
      lt_landing: a.lt_landing,
      lt_query: a.lt_query,

      pageview_count: a.pageview_count,
      session_count: a.session_count,
      touch_path: a.touch_path,
      time_to_conversion: a.time_to_conversion,
      extra_fields: a.extra_fields,

      raw_email_body: rawBody,
      needs_manual_review: parsed.needs_manual_review,
      parse_warnings: parsed.parse_warnings,
      backfilled: false,
    })
    .select("id")
    .single();

  if (appErr) {
    // 23505 = unique violation. Either the message id raced with a concurrent
    // retry, or the provider sent no message id and (body, received_at) already
    // exists. Both mean "we already have this submission", which is success.
    // Returning 200 also stops Postmark retrying into the same wall forever.
    if ((appErr as { code?: string }).code === "23505") {
      // If WE created a brand-new candidate in this request and then lost the
      // application-insert race to a concurrent retry, our candidate row is a
      // duplicate: the winning request created (or matched) its own. Clean it
      // up. The FK is ON DELETE RESTRICT, so if any application does point at
      // this row the delete simply fails and we keep it — the delete can never
      // destroy history.
      if (candidateAction === "inserted") {
        const { error: cleanupErr } = await supabase
          .from("recruiting_candidates")
          .delete()
          .eq("id", candidateId);
        if (cleanupErr) {
          console.warn(
            "duplicate candidate cleanup skipped (row in use)",
            JSON.stringify({ candidateId, code: (cleanupErr as { code?: string }).code }),
          );
        } else {
          console.log(
            "removed duplicate candidate created by lost race",
            JSON.stringify({ candidateId }),
          );
        }
      }
      console.log(
        "application already recorded",
        JSON.stringify({ candidateId, messageId }),
      );
      return new Response(
        JSON.stringify({
          ok: true,
          action: "duplicate_ignored",
          candidate_id: candidateId,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    // Anything else is a real failure. The candidate row is already updated at
    // this point, so log loudly: this is the case where a submission could go
    // uncounted.
    console.error("application insert failed", appErr, { candidateId });
    return new Response("application insert failed", { status: 500 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      action: "recorded",
      candidate_action: candidateAction,
      candidate_id: candidateId,
      application_id: appRow.id,
      ad_position: a.ad_position,
      applied_position: parsed.applied_position,
      position_mismatch:
        !!a.ad_position &&
        !!parsed.applied_position &&
        a.ad_position.toLowerCase().replace(/\s+/g, " ").trim() !==
          parsed.applied_position.toLowerCase().replace(/\s+/g, " ").trim(),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
