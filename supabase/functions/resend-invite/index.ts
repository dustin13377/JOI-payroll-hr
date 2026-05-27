/**
 * resend-invite edge function
 *
 * Sends the "Welcome to JOI" invite email to one or more existing employees
 * and wires up their user_profiles row so role guards work after they sign in.
 *
 * Handles three cases per employee:
 *   1. No auth user yet                     → invite + insert user_profiles
 *   2. Stale auth user, never signed in     → delete + re-invite + insert user_profiles
 *   3. Already onboarded (has signed in)    → skip with status "already_active"
 *
 * Auth: caller must be owner/admin/manager in the same organization.
 *
 * Request body:
 *   { employee_ids: string[] }     // 1+ employee UUIDs
 *
 * Response:
 *   {
 *     results: [
 *       { employee_id, email, full_name, status: "sent"|"skipped"|"error", message?, auth_user_id? },
 *       ...
 *     ]
 *   }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS — env-driven allowlist. Closes audit finding H-1 (2026-05-27).
// See create-employee/index.ts for the full pattern explanation.
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

// Find an auth user by email. Paginates listUsers (no direct lookup API).
async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email: string; last_sign_in_at: string | null } | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) {
      return {
        id: match.id,
        email: match.email ?? email,
        last_sign_in_at: match.last_sign_in_at ?? null,
      };
    }
    if (data.users.length < perPage) break;
  }
  return null;
}

type Result = {
  employee_id: string;
  email: string | null;
  full_name: string | null;
  status: "sent" | "skipped" | "error";
  message?: string;
  auth_user_id?: string;
};

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ---- Verify caller is leadership in some org ----
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: callerProfile } = await anonClient
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", caller.id)
      .single();
    const callerRole = callerProfile?.role;
    const callerOrgId = callerProfile?.organization_id;
    if (!callerRole || !["owner", "admin", "manager"].includes(callerRole)) {
      return json({ error: "Forbidden: leadership only" }, 403);
    }
    if (!callerOrgId) {
      return json({ error: "Your profile is missing organization_id" }, 400);
    }

    // ---- Parse body ----
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.employee_ids) ? body.employee_ids : [];
    if (ids.length === 0) {
      return json({ error: "employee_ids array required (1+ UUIDs)" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ---- Fetch all target employees in one query ----
    const { data: employees, error: empErr } = await adminClient
      .from("employees")
      .select("id, full_name, email, title, organization_id, is_system_user")
      .in("id", ids);
    if (empErr) return json({ error: `Failed to load employees: ${empErr.message}` }, 500);

    const results: Result[] = [];
    const redirectTo = (() => {
      // Try to honor an Origin header; fall back to a sensible default for prod.
      const origin = req.headers.get("Origin") || req.headers.get("Referer");
      if (origin) {
        try {
          const u = new URL(origin);
          return `${u.protocol}//${u.host}/reset-password`;
        } catch {
          // fall through
        }
      }
      return "https://app.justoutsource.it/reset-password";
    })();

    for (const empId of ids) {
      const emp = employees?.find((e) => e.id === empId);
      if (!emp) {
        results.push({
          employee_id: empId,
          email: null,
          full_name: null,
          status: "error",
          message: "Employee not found",
        });
        continue;
      }

      // Must be in caller's org
      if (emp.organization_id !== callerOrgId) {
        results.push({
          employee_id: emp.id,
          email: emp.email,
          full_name: emp.full_name,
          status: "error",
          message: "Cross-org invite blocked",
        });
        continue;
      }

      if (!emp.email) {
        results.push({
          employee_id: emp.id,
          email: null,
          full_name: emp.full_name,
          status: "error",
          message: "Employee has no work email",
        });
        continue;
      }

      try {
        // 1. Check for existing auth user
        const existing = await findAuthUserByEmail(adminClient, emp.email);

        if (existing && existing.last_sign_in_at) {
          // Already onboarded — don't blow away their account.
          results.push({
            employee_id: emp.id,
            email: emp.email,
            full_name: emp.full_name,
            status: "skipped",
            message: "Already signed in at least once; use the forgot-password flow instead.",
            auth_user_id: existing.id,
          });
          continue;
        }

        if (existing) {
          // Stale auth user (never signed in). Clear it + their profile so we can re-invite.
          await adminClient.from("user_profiles").delete().eq("id", existing.id);
          const { error: delErr } = await adminClient.auth.admin.deleteUser(existing.id);
          if (delErr) throw new Error(`Failed to clear stale auth user: ${delErr.message}`);
        }

        // 2. Send invite
        const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
          emp.email,
          { redirectTo },
        );
        if (inviteErr || !invited?.user?.id) {
          throw new Error(`Invite failed: ${inviteErr?.message ?? "no user returned"}`);
        }
        const newAuthUserId = invited.user.id;

        // 3. Link user_profiles. Role = employee.title (agent / team_lead / manager / admin / owner).
        const role = emp.title || "agent";
        const { error: profErr } = await adminClient.from("user_profiles").insert({
          id: newAuthUserId,
          employee_id: emp.id,
          role,
          organization_id: emp.organization_id,
        });
        if (profErr) {
          // Best-effort rollback of the new auth user so we don't strand it.
          await adminClient.auth.admin.deleteUser(newAuthUserId);
          throw new Error(`Failed to link profile: ${profErr.message}`);
        }

        results.push({
          employee_id: emp.id,
          email: emp.email,
          full_name: emp.full_name,
          status: "sent",
          auth_user_id: newAuthUserId,
        });
      } catch (err) {
        results.push({
          employee_id: emp.id,
          email: emp.email,
          full_name: emp.full_name,
          status: "error",
          message: (err as Error).message,
        });
      }
    }

    return json({ results });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
