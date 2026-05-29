/**
 * update-work-email
 *
 * Manager/admin/owner-only endpoint that changes an employee's work (login) email.
 * Updates both:
 *   1. employees.email          — the display / payroll record
 *   2. auth.users.email         — so the employee can log in with the new address
 *
 * POST body:
 *   { "employeeId": "<uuid>", "newEmail": "new@example.com" }
 *
 * Returns 200: { ok: true }
 *
 * Required env vars (auto-provided by Supabase):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS_RAW =
  Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
const ALLOWED_ORIGINS = ALLOWED_ORIGINS_RAW
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const CORS_HEADERS = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Auth caller ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller) return json({ error: "Invalid or expired token" }, 401);

    const { data: callerProfile, error: callerProfileErr } = await admin
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", caller.id)
      .single();

    if (callerProfileErr || !callerProfile) return json({ error: "Caller profile not found" }, 401);

    const allowed = ["owner", "admin", "manager"];
    if (!allowed.includes(callerProfile.role)) {
      return json({ error: "Forbidden — manager or above required" }, 403);
    }

    // ── 2. Validate body ────────────────────────────────────────────────────
    const { employeeId, newEmail } = await req.json();
    if (!employeeId || !newEmail) {
      return json({ error: "employeeId and newEmail are required" }, 400);
    }
    const cleanEmail = String(newEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return json({ error: "Invalid email format" }, 400);
    }

    // ── 3. Verify target employee is in the same org ────────────────────────
    const { data: emp, error: empErr } = await admin
      .from("employees")
      .select("id, email, organization_id")
      .eq("id", employeeId)
      .single();

    if (empErr || !emp) return json({ error: "Employee not found" }, 404);
    if (emp.organization_id !== callerProfile.organization_id) {
      return json({ error: "Forbidden — cross-org operation" }, 403);
    }

    // ── 4. Look up auth user via user_profiles ──────────────────────────────
    const { data: targetProfile } = await admin
      .from("user_profiles")
      .select("id")
      .eq("employee_id", employeeId)
      .maybeSingle();

    // ── 5. Update auth user email if they have a login ──────────────────────
    if (targetProfile?.id) {
      const { error: authUpdateErr } = await admin.auth.admin.updateUserById(
        targetProfile.id,
        { email: cleanEmail },
      );
      if (authUpdateErr) {
        console.error("auth update error:", authUpdateErr);
        const msg = (authUpdateErr.message ?? "").toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists")) {
          return json({ error: "email_taken" }, 409);
        }
        return json({ error: "Failed to update login email" }, 500);
      }
    }

    // ── 6. Update employees.email ───────────────────────────────────────────
    const { error: empUpdateErr } = await admin
      .from("employees")
      .update({ email: cleanEmail })
      .eq("id", employeeId);

    if (empUpdateErr) {
      console.error("employee email update error:", empUpdateErr);
      // Auth already changed — log this mismatch but still surface the error
      return json({ error: "Auth updated but employee record update failed — contact dev" }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("update-work-email unhandled error:", err);
    return json({ error: String(err) }, 500);
  }
});
