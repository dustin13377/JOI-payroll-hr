import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
      .select("role")
      .eq("id", caller.id)
      .single();
    const role = profile?.role;
    if (!role || !["owner", "admin", "manager"].includes(role)) {
      return json({ error: "Forbidden: leadership only" }, 403);
    }

    // Parse body
    const body = await req.json();
    const {
      email,
      full_name,
      campaign_id,
      title,
      monthly_base_salary,
      daily_discount_rate,
      kpi_bonus_amount,
    } = body;

    if (!email || !full_name) {
      return json({ error: "email and full_name are required" }, 400);
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
        email,
        campaign_id: campaign_id || null,
        title: title || "agent",
        monthly_base_salary: monthly_base_salary || 0,
        daily_discount_rate: daily_discount_rate || 0,
        kpi_bonus_amount: kpi_bonus_amount || 0,
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
      .insert({ id: authUserId, employee_id: employee.id });

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
