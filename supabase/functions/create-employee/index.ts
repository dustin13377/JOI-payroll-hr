import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS — env-driven allowlist. Closes audit finding H-1 (2026-05-27).
//
// ALLOWED_ORIGIN secret is a comma-separated list of origins (no spaces
// required, leading/trailing whitespace stripped). The function echoes back
// the request's Origin header IF and ONLY IF it matches one of those entries.
// Falls back to the first entry on mismatch — which fails closed because the
// browser will refuse to send the actual POST when the echoed origin doesn't
// match the request origin.
//
// Default in prod: "https://app.justoutsource.it". For local dev, update the
// Supabase secret to "https://app.justoutsource.it,http://localhost:8080".
// ---------------------------------------------------------------------------
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Find an existing auth user by email. Returns null if not found.
// Paginates listUsers because there's no direct lookup-by-email admin endpoint.
async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return { id: match.id, email: match.email ?? email };
    if (data.users.length < perPage) break; // last page
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await anonClient
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", caller.id)
      .single();
    const role = profile?.role;
    const organizationId = profile?.organization_id;
    if (!role || !["owner", "admin", "manager"].includes(role)) {
      return json({ error: "Forbidden: leadership only" }, 403);
    }
    if (!organizationId) {
      return json(
        { error: "Could not determine your organization. Your user profile is missing organization_id." },
        400,
      );
    }

    // Parse body
    const body = await req.json();
    const {
      email,
      personal_email,
      full_name,
      campaign_id,
      title,
      monthly_base_salary,
      daily_discount_rate,
      kpi_bonus_amount,
      // Optional candidate-derived fields (hire-from-candidate flow)
      curp,
      phone,
      cv_url,
      intro_recording_url,
      recruited_from_candidate_id,
      hire_date,
    } = body;

    if (!email || !full_name) {
      return json({ error: "work email and full_name are required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ---- Idempotency guards ----
    // If an employees row already exists for this email, stop. Don't silently dupe.
    const { data: existingEmployee } = await adminClient
      .from("employees")
      .select("id, employee_id, full_name, is_active")
      .eq("email", email)
      .maybeSingle();
    if (existingEmployee) {
      return json(
        {
          error:
            `An employee with email ${email} already exists ` +
            `(${existingEmployee.employee_id} - ${existingEmployee.full_name}). ` +
            `Edit that record instead of creating a new one.`,
        },
        409,
      );
    }

    // ---- Step 1: get or create auth user ----
    let authUserId: string;
    let createdAuthUserHere = false;

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      const msg = (inviteError.message || "").toLowerCase();
      const alreadyExists =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        // PostgREST/GoTrue can also surface this as 422 with code user_already_exists
        (inviteError as { code?: string }).code === "email_exists" ||
        (inviteError as { code?: string }).code === "user_already_exists";

      if (!alreadyExists) {
        return json({ error: `Failed to invite: ${inviteError.message}` }, 400);
      }

      // Auth user already exists — recover by looking them up.
      const existing = await findAuthUserByEmail(adminClient, email);
      if (!existing) {
        return json(
          {
            error:
              `Auth says ${email} is already registered but we couldn't find them. ` +
              `Contact an admin to clean up auth.users.`,
          },
          500,
        );
      }
      authUserId = existing.id;

      // If a user_profiles row already exists for this auth user, we'd duplicate-link.
      const { data: existingProfile } = await adminClient
        .from("user_profiles")
        .select("id, employee_id")
        .eq("id", authUserId)
        .maybeSingle();
      if (existingProfile?.employee_id) {
        return json(
          {
            error:
              `Auth user for ${email} is already linked to a different employee. ` +
              `Resolve the conflict before retrying.`,
          },
          409,
        );
      }
    } else {
      authUserId = invited.user.id;
      createdAuthUserHere = true;
    }

    // ---- Step 2: insert employees row ----
    const { data: employee, error: empError } = await adminClient
      .from("employees")
      .insert({
        full_name,
        email, // work email — used for login and password resets
        personal_email: personal_email || null,
        campaign_id: campaign_id || null,
        title: title || "agent",
        monthly_base_salary: monthly_base_salary || 0,
        daily_discount_rate: daily_discount_rate || 0,
        kpi_bonus_amount: kpi_bonus_amount || 0,
        organization_id: organizationId,
        // Optional candidate-derived fields (NULL when not hiring from a candidate)
        curp: curp || null,
        phone: phone || null,
        cv_url: cv_url || null,
        intro_recording_url: intro_recording_url || null,
        recruited_from_candidate_id: recruited_from_candidate_id || null,
        hire_date: hire_date || null,
      })
      .select("id, employee_id")
      .single();

    if (empError) {
      // Only roll back the auth user if we created it on this call.
      if (createdAuthUserHere) {
        await adminClient.auth.admin.deleteUser(authUserId);
      }
      return json({ error: `Failed to create employee: ${empError.message}` }, 400);
    }

    // ---- Step 3: link user_profiles ----
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .insert({
        id: authUserId,
        employee_id: employee.id,
        organization_id: organizationId,
      });

    if (profileError) {
      await adminClient.from("employees").delete().eq("id", employee.id);
      if (createdAuthUserHere) {
        await adminClient.auth.admin.deleteUser(authUserId);
      }
      return json({ error: `Failed to link profile: ${profileError.message}` }, 400);
    }

    return json(
      {
        employee_id: employee.employee_id,
        auth_user_id: authUserId,
        email,
        reused_existing_auth_user: !createdAuthUserHere,
      },
      201,
    );
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
