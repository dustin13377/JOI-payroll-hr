# JOI Security Audit Report

**Date:** 2026-05-18
**Scope:** app.justoutsource.it / Supabase project `jpaihltkrohdqkqlbqkf`
**Method:** Read-only inspection of code, RLS policies, RPCs, edge functions, storage policies, and live database state.

---

## Summary

- **Total findings: 10** (Critical: 2, High: 3, Medium: 3, Low/Informational: 2)
- **Top 3 things to fix this week:**
  1. **Disable open sign-up in Supabase Auth + lock down `user_profiles` INSERT policy** — anyone on the internet can currently sign up, then PostgREST themselves an admin-shaped profile. There is already an unowned auth user (`jaxong@hfbtech.com`) on the system who could do this right now.
  2. **Remove the public Sign-Up toggle from `src/pages/Auth.tsx`** — it advertises the above hole. A login-only screen.
  3. **Lock down `check_rehire` RPC and `shift_settings_audit` SELECT policy** — both are readable by anyone with the anon key (i.e., anyone who loads the site or pulls the key from `.env.example`-style leaks). The first leaks CURP/DOB of terminated employees, the second leaks audit history org-wide.
- **Overall posture:** RLS is mostly well-designed (org-scoped, role-checked through `is_leadership()`/`my_org_id()` helpers, storage buckets are private). But there is one structural hole — open signup + a permissive `user_profiles` INSERT policy + a few policies that bypass the helpers — that together let an outsider become a tenant-scoped admin and read every campaign/department/shift table. **This is not yet safe to be the system of record for real employee PII until the Critical items below are fixed.** They are all one-line changes.

---

## Critical Findings

### 1. Open signup + permissive `user_profiles` INSERT lets a stranger join your org as "owner"

- **What:** The login page at `/auth` ships with a working "Don't have an account? Sign up" toggle that calls `supabase.auth.signUp()`. The `handle_new_auth_user` trigger silently bails for signups without invite metadata, leaving an authenticated user with no `user_profiles` row. RLS on `user_profiles` then lets that user INSERT a row for themselves with **any** role and **any** `organization_id` — the policy only checks `(id = auth.uid())` and has no `WITH CHECK` constraint on the other columns.
  Once that row exists, the user's JWT resolves `my_org_id()` to D's real org, and a bunch of policies (see Finding #2) grant them tenant-scoped read access.
- **Where:**
  - `src/pages/Auth.tsx:38` — `supabase.auth.signUp({ email, password })`
  - RLS policy `users_insert_own_profile` on `public.user_profiles`: `WITH CHECK (id = auth.uid())` — no constraint on `role`/`employee_id`/`organization_id`
  - `public.handle_new_auth_user()` returns `NEW` without inserting when metadata is missing
  - `public.guard_user_profile_role` trigger only fires on **UPDATE**, not INSERT
- **Impact:** An attacker who knows your URL (anyone — it's `app.justoutsource.it`) can:
  1. Open `/auth`, click "Sign up", confirm email.
  2. POST `/rest/v1/user_profiles` with `{id: <their auth uid>, role: 'owner', organization_id: '1d15e900-ccc8-4616-ae0a-179fb27cbf27'}`.
  3. Read all of: `campaigns`, `clients`, `departments`, `payroll_periods`, `shift_settings`, `shift_settings_audit`, `mexican_holidays`, `required_document_types`, `company_holidays`, `time_clock_audit` (yes — see Finding #2), `eod_digest_log` summaries.
  4. Probe `check_rehire` (Finding #3) to enumerate former employees by CURP/DOB.
  PII tables like `employees`, `payroll_records`, `agent_reviews`, etc., are protected by `is_leadership()` which joins through `employees.title`, so they hold (for now) — but only because of that one extra layer.
- **Evidence:** Live `auth.users` query shows an already-orphan account:
  ```
  jaxong@hfbtech.com  created 2026-05-13  last_sign_in_at 2026-05-13 21:59:20  has_profile=0
  ```
  This account is one PostgREST POST away from being an "owner" in D's org. They appear to have just signed up via the public form.
- **Proposed fix (3 layers — do all of them):**
  1. **Disable signups in Supabase Dashboard** → Authentication → Providers → Email → toggle off "Enable Sign Ups". (Non-destructive, instant.)
  2. **Remove the signup UI** in `src/pages/Auth.tsx` (delete the `isLogin` toggle and the `signUp()` branch — keep only sign-in + password reset).
  3. **Tighten the `user_profiles` INSERT policy.** Replace `users_insert_own_profile` so non-service callers cannot insert at all (the `handle_new_auth_user` trigger runs as definer and bypasses RLS anyway):
     ```sql
     -- (DESTRUCTIVE — drops then recreates a policy)
     DROP POLICY IF EXISTS users_insert_own_profile ON public.user_profiles;
     -- No replacement: only handle_new_auth_user (SECURITY DEFINER) and service_role create rows.
     ```
     Or, if you want to keep a self-INSERT path, gate it on a valid invite token check (e.g., `WITH CHECK (id = auth.uid() AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.raw_user_meta_data ? 'employee_id'))`).
  4. **Clean up the orphan auth user** (DESTRUCTIVE — needs your explicit OK):
     ```sql
     DELETE FROM auth.users WHERE id = 'b51718e8-87ac-417f-8b2a-5272161b0779';
     ```

---

### 2. `time_clock_audit` and other RLS policies trust `user_profiles.role` directly instead of going through `is_leadership()`

- **What:** Most policies call the helper `is_leadership()`, which joins `user_profiles → employees` and only returns true when the user has a real employee record whose `title` is owner/admin/manager. That join is what saves you from Finding #1 escalating fully.
  But `time_clock_audit`'s SELECT policy hand-rolls the check against `user_profiles.role` directly, without joining `employees`. An attacker who self-inserts a `user_profiles` row with `role='owner'` (Finding #1) passes this check and can read every time-clock edit in the org.
- **Where:** Policy `tca_select_leadership` on `public.time_clock_audit`. The first branch of the OR is:
  ```sql
  EXISTS (SELECT 1 FROM user_profiles up
          WHERE up.id = auth.uid()
            AND up.organization_id = time_clock_audit.organization_id
            AND up.role = ANY (ARRAY['owner','admin','manager']))
  ```
  No `employees` join. Same pattern appears in `sync_user_profile_role` for trigger behavior, but the role-check there is benign.
- **Impact:** Combined with Finding #1, exposes the full TL/HR audit trail (before/after time-clock states, edit reasons, edited_by). Standalone, it's safe because legitimate `user_profiles.role` is kept in sync with `employees.title`.
- **Proposed fix:**
  ```sql
  -- (DESTRUCTIVE — replaces a policy)
  DROP POLICY IF EXISTS tca_select_leadership ON public.time_clock_audit;
  CREATE POLICY tca_select_leadership ON public.time_clock_audit
    FOR SELECT TO authenticated
    USING (
      (is_leadership() AND organization_id = my_org_id())
      OR (is_team_lead() AND employee_id IN (SELECT my_team_member_ids()))
    );
  ```
- **Evidence:** see SQL output of `pg_policies` query — policy text included verbatim above.

---

## High Findings

### 3. `check_rehire` RPC exposes terminated employees' CURP, DOB, names, and termination reasons to anyone with the anon key

- **What:** The `check_rehire(p_curp, p_full_name, p_date_of_birth)` function is `SECURITY DEFINER` and is granted `EXECUTE` to `anon` and `authenticated`. It performs no caller check. Anyone who can POST to `/rest/v1/rpc/check_rehire` (i.e., anyone who can read the publishable anon key — which is shipped in the static bundle at app.justoutsource.it) can query for former-employee records.
- **Where:** `public.check_rehire(...)` — see definition in audit transcript.
- **Impact:** An attacker can:
  1. Brute-force CURPs (18-char structured Mexican ID) or name+DOB combos.
  2. For each hit, receive `full_name`, `curp`, `date_of_birth`, `employment_status`, `termination_reason`, `termination_notes`, `rehire_eligible`, `terminated_at`.
  3. Use the data for impersonation, doxxing, or social engineering of legit hires.
  CURP is a SSN-equivalent Mexican identifier — leaking it is a serious privacy hit.
- **Proposed fix:** Either gate the function on `auth.uid() IS NOT NULL` + `is_leadership()`, or revoke anon execute:
  ```sql
  -- Revoke anon execute (non-destructive)
  REVOKE EXECUTE ON FUNCTION public.check_rehire(text, text, date) FROM anon;
  ```
  And add a guard inside (DESTRUCTIVE — replaces function):
  ```sql
  -- inside check_rehire, before the SELECTs:
  -- IF NOT public.is_leadership() THEN
  --   RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  -- END IF;
  ```
  Note: function is currently `LANGUAGE sql`; adding a guard requires converting to `plpgsql` or wrapping it.
- **Evidence:** Function ACL `{...anon=X/postgres,authenticated=X/postgres...}`; function body has zero auth checks.

---

### 4. `shift_settings_audit` SELECT policy is `qual = true` — readable by every authenticated user across orgs

- **What:** RLS is enabled on `shift_settings_audit` but the only SELECT policy says `USING (true)` for any authenticated user. There is no org filter and no role filter. Currently only one org exists, so cross-org leakage isn't realized, but as soon as a second tenant is provisioned (which `provision-org` supports), tenant A reads tenant B's shift change history.
- **Where:** Policy `Allow read for authenticated` on `public.shift_settings_audit`.
- **Impact:** Same-org info disclosure is minor (audit log of break/lunch time changes). Once multi-tenant, full cross-tenant leak of operational schedules.
- **Proposed fix:**
  ```sql
  -- (DESTRUCTIVE — replaces a policy)
  DROP POLICY IF EXISTS "Allow read for authenticated" ON public.shift_settings_audit;
  CREATE POLICY shift_settings_audit_select ON public.shift_settings_audit
    FOR SELECT TO authenticated
    USING (
      campaign_id IN (SELECT id FROM public.campaigns WHERE organization_id = my_org_id())
    );
  ```
- **Evidence:** `pg_policies` row above.

---

### 5. Edge functions and edge-function CORS default to `*` when `ALLOWED_ORIGIN` isn't set

- **What:** `get-hr-document-signed-url`, `compliance-notifications`, `holiday-notifications`, `review-notifications`, `provision-org`, and `send-eod-digest` all do `ALLOWED_ORIGIN ?? "*"`. If you forget to set the secret in the Supabase Edge Functions config, any website on the internet can hit these endpoints from a browser. The functions still verify the JWT, so they're not unauthenticated — but a logged-in user visiting an attacker-controlled page could be tricked into firing privileged actions via their cookie/JWT.
- **Where:** `supabase/functions/*/index.ts` — all functions noted above.
- **Impact:** CSRF-like attack: a malicious site can call `provision-org` or `compliance-notifications` with the victim's bearer token. Risk depends on whether `ALLOWED_ORIGIN` is actually set in the Supabase Dashboard.
- **Proposed fix:**
  - Confirm `ALLOWED_ORIGIN=https://app.justoutsource.it` is set in **Edge Function Secrets** for every function.
  - In code, make the fallback fail-closed: `const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";` instead of `"*"`. Eliminates the foot-gun.
- **Evidence:** Pattern repeats across edge function code returned by `get_edge_function`. Could not verify the deployed env vars from this audit — D should check the Supabase Dashboard.

---

## Medium Findings

### 6. `provision-org` lets any owner of any tenant provision new tenants, with no rollback if `user_profiles` insert fails after the invite is already sent

- **What:** The function correctly checks `profile.role === 'owner'`, but it does NOT scope to the caller's organization — any owner can provision a brand-new tenant on this Supabase project (currently moot, only D is an owner). More immediately concerning: if step 7 (`user_profiles` insert) fails after step 6 (invite email sent), the function returns a 500 and the user has an active invite they can confirm, ending up with an auth user but no profile row (i.e., another exploit vector for Finding #1).
- **Where:** `supabase/functions/provision-org/index.ts`.
- **Impact:** Could not verify orphan auth users have been created this way (didn't happen in the current data). Risk: leftover invite tokens that confirm into an unprofiled state.
- **Proposed fix:** On `profileInsertErr`, delete the invited auth user with `supabaseAdmin.auth.admin.deleteUser(invitedUserId)` before returning. Also consider scoping owner-only to "platform owner" (a different concept than tenant owner) if you ever onboard another tenant.

---

### 7. `policy_document_versions` SELECT policy leaks version metadata cross-org if `policy_documents` RLS is ever bypassed

- **What:** The policy is `is_leadership() OR (policy_document_id IN (SELECT id FROM policy_documents))`. The subquery does not filter by `organization_id` directly — it relies on `policy_documents` SELECT RLS to do that. That's fine **today**, but it's a thin guarantee. If anyone ever adds a second policy on `policy_documents` that broadens it, versions across orgs leak silently.
- **Where:** Policy `authenticated_select_versions_inherit` on `public.policy_document_versions`.
- **Impact:** Defense-in-depth gap, not an active hole.
- **Proposed fix:**
  ```sql
  -- (DESTRUCTIVE — replaces a policy)
  DROP POLICY IF EXISTS authenticated_select_versions_inherit ON public.policy_document_versions;
  CREATE POLICY authenticated_select_versions_inherit ON public.policy_document_versions
    FOR SELECT TO authenticated
    USING (
      is_leadership()
      OR policy_document_id IN (
        SELECT id FROM public.policy_documents
        WHERE organization_id = my_org_id() AND is_active = true
      )
    );
  ```

---

### 8. `npm audit`: 3 moderate, 3 low — none reachable in production builds, but worth a maintenance pass

- **What:** Vite ≤6.4.1 has a dev-server path-traversal + dev-server response-leak (`GHSA-4w7w-66w2-5vf9`, `GHSA-67mh-4wv8-2f99`), `jsdom`/`http-proxy-agent`/`@tootallnate/once` chain (dev/test only), and `brace-expansion` regex DoS (`GHSA-jxxr-4gwj-5jf2`). All in dev or transitive dev dependencies — **the production bundle on Vercel is not affected**.
- **Where:** `package.json`.
- **Impact:** Real only if you run `npm run dev` and expose the dev server to a hostile network (you don't).
- **Proposed fix:** When convenient, `npm i -D vite@latest jsdom@latest` (semver-major upgrades — test the build before deploying).

---

## Low / Informational

- **Service-role key is NOT in the frontend bundle.** Grep of `src/` for `service_role`, hardcoded JWTs (`eyJhbGciOi...`), `SUPABASE_SERVICE_ROLE_KEY` returned only a single doc comment — good. `.env` contains only the anon key (which is intentionally public). `.env` is in `.gitignore`.
- **No PII in `console.log`.** Grepped for `console.log`/`console.error` referencing salary/CURP/DOB/token — only structural error logs found, no sensitive payloads dumped.
- **`organizations` SELECT policy targets `{public}` role instead of `{authenticated}`.** Functionally fine (the qual is `id = my_org_id()` which returns NULL for unauthenticated callers) but inconsistent with the rest. Cosmetic.
- **Several "global reference" tables (`mexican_holidays`, `required_document_types`) are readable by every authenticated user with no org filter.** Intentional — they're shared data. Calling out so you don't get surprised later.
- **`get-hr-document-signed-url` pattern is solid.** Uses the caller's JWT to enforce row-level RLS on the document table, then uses the service-role only to issue the storage signed URL. This is the right pattern; keep it.
- **No `auth.users` + `auth.identities` two-step ghost-account problem in current code.** Every code path that creates a user goes through `supabaseAdmin.auth.admin.inviteUserByEmail()`, which writes both rows. Live SQL confirms: `users_without_identities = 0`.
- **All HR storage buckets (`hr-documents`, `employee-documents`, `attendance-docs`, `policy-documents`) are `public=false`.** URLs cannot be guessed; access is via signed URLs minted by edge functions or via `storage.objects` RLS that filters by `employee_id` folder name.

---

## What's actually OK (verified, not just assumed)

- RLS is enabled on all 41 tables in `public`.
- Storage buckets are all private, with bucket-aware policies that filter by `(storage.foldername(name))[1] = my_employee_id()` for agent self-serve.
- `is_leadership()`, `is_team_lead()`, `my_team_member_ids()`, `tl_employee_on_my_team()` helpers all correctly require an `employees` row + org match.
- `change_employee_role` SECURITY DEFINER RPC enforces caller role/org and blocks cross-org changes — good.
- `confirm_review_termination`, `hr_create_finalization_draft`, `hr_mark_finalization_signed`, `insert_policy_version` all check `is_leadership()` before privileged work.
- `complete_agent_review`, `extend_agent_review` check `is_leadership() OR tl_employee_on_my_team()` — good.
- `request_vacation_off` enforces `p_employee_id = my_employee_id()` — good.
- `edit-time-clock` edge function: verifies caller, validates fields against a whitelist, enforces TL-can-only-edit-own-campaign, writes a real audit row before returning. Solid.
- `create-employee` + `resend-invite` edge functions: verify leadership + org match, use proper invite flow that creates both `auth.users` and `auth.identities`, roll back on partial failure.
- `review-notifications` and `compliance-notifications` cron paths require `x-cron-secret` and fail closed if not set. Both default to `DRY_RUN=true`.
- No service-role keys, JWTs, or hardcoded secrets in `src/`.
- No git-tracked `.env` file.
- npm audit shows 0 critical, 0 high.
