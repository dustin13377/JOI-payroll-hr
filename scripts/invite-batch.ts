/**
 * One-off script: invite a small batch of employees and link their auth user
 * to their existing employees row via user_profiles.
 *
 * Usage (from project root, with Node + tsx):
 *   SUPABASE_URL="https://jpaihltkrohdqkqlbqkf.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
 *   npx tsx scripts/invite-batch.ts
 *
 * What it does:
 *   1. For Javier Caballero (already has stale auth row): deletes his
 *      user_profiles row, deletes his auth.users row, then re-invites — so
 *      he gets the same "Welcome to JOI" email as everyone else.
 *   2. For Deysi, Sebastian Cordova, Cesar Cardenas (no auth user yet):
 *      invites them fresh.
 *   3. After each invite, inserts a user_profiles row linking the new
 *      auth.users.id to the existing employees.id with the right role.
 *
 * The redirect URL points at /reset-password on app.justoutsource.it, so
 * clicking the invite link lands them on the Welcome-to-JOI screen.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REDIRECT_TO = "https://app.justoutsource.it/reset-password";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Target = {
  employee_id: string; // employees.id (UUID)
  email: string;
  role: "agent" | "team_lead";
  needs_auth_reset: boolean; // true = delete stale auth row first
  stale_auth_user_id?: string;
};

const targets: Target[] = [
  {
    // Javier — has stale auth row, needs delete + re-invite
    employee_id: "59b1a0a9-efe9-4f8c-ba4e-753e9682951b",
    email: "javier.caballero@torro.com",
    role: "team_lead",
    needs_auth_reset: true,
    stale_auth_user_id: "155efd9c-5197-4eae-89a7-894363d8d5bb",
  },
  {
    // Deysi
    employee_id: "855591b2-3a3a-4fff-b88c-9d6d649ab2aa",
    email: "deysi.esperanza@torro.com",
    role: "team_lead",
    needs_auth_reset: false,
  },
  {
    // Sebastian Cordova
    employee_id: "33541137-3a4d-4e5f-9351-0c3dfd36ccfd",
    email: "sebastian@hfbtech.com",
    role: "agent",
    needs_auth_reset: false,
  },
  {
    // Cesar Cardenas
    employee_id: "10597ded-16f6-4921-a759-6d1377b55d89",
    email: "cesar.cardenas@torro.com",
    role: "agent",
    needs_auth_reset: false,
  },
];

async function reset(t: Target): Promise<void> {
  if (!t.needs_auth_reset || !t.stale_auth_user_id) return;
  console.log(`  → deleting stale user_profiles for ${t.email}`);
  const { error: upErr } = await admin
    .from("user_profiles")
    .delete()
    .eq("id", t.stale_auth_user_id);
  if (upErr) throw new Error(`delete user_profiles: ${upErr.message}`);

  console.log(`  → deleting stale auth.users row for ${t.email}`);
  const { error: authErr } = await admin.auth.admin.deleteUser(t.stale_auth_user_id);
  if (authErr) throw new Error(`delete auth user: ${authErr.message}`);
}

async function invite(t: Target): Promise<string> {
  console.log(`  → inviting ${t.email}`);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(t.email, {
    redirectTo: REDIRECT_TO,
  });
  if (error) throw new Error(`invite: ${error.message}`);
  if (!data.user?.id) throw new Error("invite returned no user id");
  return data.user.id;
}

async function linkProfile(t: Target, newAuthUserId: string): Promise<void> {
  console.log(`  → linking user_profiles → employees`);
  const { error } = await admin.from("user_profiles").insert({
    id: newAuthUserId,
    employee_id: t.employee_id,
    role: t.role,
  });
  if (error) throw new Error(`insert user_profiles: ${error.message}`);
}

async function main() {
  console.log(`\nInviting ${targets.length} employees via ${SUPABASE_URL}\n`);
  for (const t of targets) {
    console.log(`[${t.email}] role=${t.role}`);
    try {
      await reset(t);
      const newId = await invite(t);
      await linkProfile(t, newId);
      console.log(`  ✓ done. new auth user_id = ${newId}\n`);
    } catch (err) {
      console.error(`  ✗ FAILED: ${(err as Error).message}\n`);
    }
  }
  console.log("All done. Check inboxes (and spam folders).");
}

main();
