/**
 * provision-org
 *
 * Owner-only endpoint that provisions a new tenant org:
 *   1. Validates caller is an owner (via JWT → user_profiles).
 *   2. Validates + checks uniqueness of orgSlug.
 *   3. Inserts into organizations.
 *   4. Inserts an employee row (title='owner') for the new org.
 *   5. Invites the owner email via Supabase Auth.
 *   6. Inserts into user_profiles for the invited user.
 *
 * POST body:
 *   { "orgName": "Acme Corp", "orgSlug": "acme", "ownerEmail": "admin@acme.com", "ownerFullName": "John Smith", "employeeIdPrefix": "ACME" }
 *   employeeIdPrefix is optional — defaults to first 3 uppercase alphanumeric chars of orgName.
 *
 * Returns 200: { orgId, orgSlug, inviteEmail }
 *
 * Required env vars (project secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto-provided
 *   ALLOWED_ORIGIN  — CORS origin allowlist (default "*")
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Slug must be 3–50 chars, lowercase alphanumeric + hyphens only. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$|^[a-z0-9]{3,50}$/;

/** Employee ID prefix: 2–10 uppercase alphanumeric chars. */
const PREFIX_RE = /^[A-Z0-9]{2,10}$/;

/** Derive a default prefix from an org name: uppercase, strip non-alphanum, take first 3 chars. */
function derivePrefix(orgName: string): string {
  const stripped = orgName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return stripped.length >= 2 ? stripped : "ORG";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Authenticate caller — must be an owner
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user: caller }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !caller) {
      return json({ error: "Invalid or expired token" }, 401);
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("user_profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (profileErr || !profile) {
      return json({ error: "User profile not found" }, 401);
    }

    if (profile.role !== "owner") {
      return json({ error: "Forbidden — owner role required" }, 403);
    }

    // -----------------------------------------------------------------------
    // 2. Parse + validate body
    // -----------------------------------------------------------------------
    const { orgName, orgSlug, ownerEmail, ownerFullName, employeeIdPrefix: rawPrefix } = await req.json();

    if (!orgName || !orgSlug || !ownerEmail || !ownerFullName) {
      return json({ error: "Missing required fields: orgName, orgSlug, ownerEmail, ownerFullName" }, 400);
    }

    if (!SLUG_RE.test(orgSlug)) {
      return json({
        error: "Invalid slug — must be 3–50 chars, lowercase letters, numbers, and hyphens only",
      }, 400);
    }

    // Derive prefix if not provided; validate if provided
    const employeeIdPrefix: string = rawPrefix ? String(rawPrefix).trim().toUpperCase() : derivePrefix(orgName);
    if (!PREFIX_RE.test(employeeIdPrefix)) {
      return json({
        error: "Invalid employeeIdPrefix — must be 2–10 uppercase letters and numbers only",
      }, 400);
    }

    // -----------------------------------------------------------------------
    // 3. Check slug uniqueness
    // -----------------------------------------------------------------------
    const { data: existing } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .maybeSingle();

    if (existing) {
      return json({ error: "slug_taken" }, 409);
    }

    // -----------------------------------------------------------------------
    // 4. Insert organization
    // -----------------------------------------------------------------------
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .insert({ name: orgName, slug: orgSlug, employee_id_prefix: employeeIdPrefix })
      .select("id")
      .single();

    if (orgErr || !org) {
      console.error("org insert error:", orgErr);
      return json({ error: "Failed to create organization" }, 500);
    }

    const orgId = org.id as string;

    // -----------------------------------------------------------------------
    // 5. Insert employee row for the owner
    //    employee_id (JOI-XXXX style) is auto-assigned by trg_assign_employee_id
    // -----------------------------------------------------------------------
    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .insert({
        full_name: ownerFullName,
        title: "owner",
        is_active: true,
        organization_id: orgId,
      })
      .select("id")
      .single();

    if (empErr || !emp) {
      console.error("employee insert error:", empErr);
      // Roll back org
      await supabaseAdmin.from("organizations").delete().eq("id", orgId);
      return json({ error: "Failed to create owner employee record" }, 500);
    }

    const employeeId = emp.id as string;

    // -----------------------------------------------------------------------
    // 6. Invite the auth user via Supabase Auth
    // -----------------------------------------------------------------------
    const { data: invite, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      ownerEmail,
      { data: { organization_id: orgId } },
    );

    if (inviteErr) {
      console.error("invite error:", inviteErr);
      // Roll back employee + org
      await supabaseAdmin.from("employees").delete().eq("id", employeeId);
      await supabaseAdmin.from("organizations").delete().eq("id", orgId);

      const msg = inviteErr.message?.toLowerCase() ?? "";
      if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("email address already")) {
        return json({ error: "email_taken" }, 409);
      }
      return json({ error: "Failed to invite user" }, 500);
    }

    const invitedUserId = invite.user.id;

    // -----------------------------------------------------------------------
    // 7. Insert user_profile for the invited user
    // -----------------------------------------------------------------------
    const { error: profileInsertErr } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        id: invitedUserId,
        role: "owner",
        employee_id: employeeId,
        organization_id: orgId,
      });

    if (profileInsertErr) {
      console.error("user_profile insert error:", profileInsertErr);
      // Don't roll back the invite (email may already be sent); log and return error
      return json({ error: "Failed to create user profile" }, 500);
    }

    return json({ orgId, orgSlug, inviteEmail: ownerEmail });
  } catch (err) {
    console.error("provision-org unhandled error:", err);
    return json({ error: String(err) }, 500);
  }
});
