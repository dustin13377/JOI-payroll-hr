import { createClient } from "jsr:@supabase/supabase-js@2";

// Public (verify_jwt=false) endpoint that backs the applicant skills test.
// Applicants are NOT logged-in users, so this runs with the service role and
// authenticates by the unguessable per-candidate token instead. It only ever
// returns the applicant's first name (for a friendly greeting) — never other
// candidate data.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const token = payload?.token;
  const action = payload?.action;
  if (!token || typeof token !== "string") return json({ error: "missing token" }, 400);

  const { data: a, error } = await admin
    .from("recruiting_skill_assessments")
    .select("id, status, candidate_id")
    .eq("token", token)
    .maybeSingle();
  if (error) return json({ error: "lookup failed" }, 500);
  if (!a) return json({ error: "not_found" }, 404);

  if (action === "load") {
    let firstName: string | null = null;
    const { data: c } = await admin
      .from("recruiting_candidates")
      .select("full_name")
      .eq("id", a.candidate_id)
      .maybeSingle();
    if (c?.full_name) firstName = String(c.full_name).trim().split(/\s+/)[0] ?? null;
    return json({ status: a.status, firstName, done: a.status === "completed" || a.status === "expired" });
  }

  if (action === "start") {
    if (a.status === "pending") {
      await admin
        .from("recruiting_skill_assessments")
        .update({ status: "in_progress", started_at: new Date().toISOString() })
        .eq("id", a.id)
        .eq("status", "pending");
    }
    return json({ ok: true });
  }

  if (action === "submit") {
    if (a.status === "completed") return json({ ok: true, already: true });
    const results = payload.results ?? null;
    const totalSeconds = Number.isFinite(payload.totalSeconds) ? Math.round(payload.totalSeconds) : null;
    const { error: upErr } = await admin
      .from("recruiting_skill_assessments")
      .update({ status: "completed", completed_at: new Date().toISOString(), results, total_seconds: totalSeconds })
      .eq("id", a.id);
    if (upErr) return json({ error: "save failed" }, 500);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
