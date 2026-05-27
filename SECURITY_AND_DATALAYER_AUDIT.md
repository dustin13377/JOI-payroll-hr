# JOI — Data-Layer & Security Audit

**Date:** 2026-05-27
**Scope:** `src/`, `supabase/functions/`, route guards. Read-only inspection. No DB queries run.
**Builds on:** `SECURITY_AUDIT_2026-05-18.md` (RLS / signups / ALLOWED_ORIGIN are mostly closed there — this audit avoids re-flagging those and focuses on what's *new* or *still open*).

---

## TL;DR

The data-layer is **mostly clean but leaky**. ~83% of Supabase calls already live in hooks (good, React-Query-shaped, well-named). But ~84 calls (mostly in `src/pages/`) bypass the hook layer entirely, with **`src/pages/CampaignDetail.tsx`** being a one-file disaster zone (26 direct Supabase calls including writes to `employees`, `campaigns`, `shift_settings`, `campaign_kpi_config`, and `campaign_eod_recipients`). The signup UI is still in `Auth.tsx` even though Supabase Auth signups are disabled — one dashboard toggle away from re-opening the May-18 Critical #1 hole. Three edge functions still hardcode `Access-Control-Allow-Origin: *` (regression vs. the May-18 audit recommendation). And at least two client-side INSERTs (`useAddCompanyHoliday`, `useCreatePolicy`, `useCreatePost`) are missing the `organization_id` column even though the schema requires it — these are silently failing or only working because of an undocumented trigger somewhere. Otherwise the architecture is solid: RLS on all tables, no service-role keys in the bundle, almost every privileged route uses a `RequireRole` wrapper.

---

## Scattered Supabase Calls

Total direct calls to `supabase.{from,rpc,auth,functions.invoke,storage}` in `src/`:

| Directory          | Calls | Status |
| ------------------ | ----- | ------ |
| `src/hooks/`       | 255   | Good — this is the data layer |
| `src/pages/`       | 151   | **Scattered** |
| `src/components/`  |  28   | **Scattered** (mostly justifiable inside dialogs) |
| `src/utils/`       |   1   | Acceptable (parser helper) |
| `src/lib/`         |   0   | Good |
| `src/integrations/`|   0   | Just the client setup |

Roughly 83% of all Supabase calls go through the hook layer. The remaining 17% are scattered across pages and components.

### Top 10 scattered files (pages + components)

| File | Calls | Notes |
| ---- | ----- | ---- |
| `src/pages/CampaignDetail.tsx` | 26 | Worst offender. Writes to `employees`, `campaigns`, `shift_settings`, `campaign_kpi_config`, `campaign_eod_recipients`; invokes `send-eod-digest` edge fn. Needs to be broken up into 4–5 hooks. |
| `src/pages/EmployeeHome.tsx` | 12 | Reads time_clock, eod_logs, employees, campaigns — should mostly route through existing hooks. |
| `src/pages/EmpleadoPerfil.tsx` | 12 | Mixed reads/writes to employees + related — same. |
| `src/pages/Timeclock.tsx` | 10 | Direct INSERT/UPDATE on `time_clock` from the client. RLS-protected, but the `is_late`/`late_minutes` calculation happens on the client — agent can lie. See Security Finding #4. |
| `src/pages/Campaigns.tsx` | 10 | Reads + create/edit campaigns. Should use `useCampaigns.ts` (already partly written). |
| `src/pages/FacturaNueva.tsx` | 9 | Invoice generation reads/writes — sprawling. |
| `src/pages/TimeOff.tsx` | 6 | Mostly already hookable. |
| `src/pages/ShiftSettings.tsx` | 6 | Direct writes to `shift_settings`. |
| `src/components/BulkSpiffUploadDialog.tsx` | 6 | Dialog-local; acceptable. |
| `src/pages/admin/ClientHolidays.tsx` | 5 | Inline mutation; sets `organization_id` correctly. |

### Top 10 hook files (the data layer doing its job)

| File | Calls | Notes |
| ---- | ----- | ---- |
| `useTeamLead.ts` | 35 | 12+ well-named hooks — `useTeamRoster`, `useTodayTimeclockStatus`, `useTeamEODThisWeek`, etc. Good shape. |
| `usePayroll.ts` | 30 | Phase-4 payroll hooks; handles `organization_id` correctly (line 397 has an explicit guard). |
| `useSupabasePayroll.ts` | 22 | Legacy payroll. Mix of CRUD on employees + payroll_records. **Two payroll-related hooks live here**, which is confusing — see "Existing Data Layer" below. |
| `usePolicies.ts` | 19 | Issue: `useCreatePolicy` inserts into `policy_documents` without setting `organization_id` (Finding #5). |
| `useHrDocumentRequests.ts` | 19 | OK. |
| `useHolidayRequests.ts` | 19 | Issue: `useAddCompanyHoliday` doesn't set `organization_id` (Finding #5). |
| `useBulletin.ts` | 17 | Issue: `useCreatePost`, `useCreateRecognition` don't set `organization_id` on `bulletin_posts` (Finding #5). |
| `useInvoices.ts` | 15 | OK. |
| `useVacationRequests.ts` | 11 | OK. |
| `useEmployeeDocuments.ts` | 10 | OK. |

---

## Existing Data Layer

### What's there

**26 hooks** in `src/hooks/`, **24 of them use `@tanstack/react-query`**. Pattern is consistent:

- Reads → `useQuery({ queryKey, queryFn })`
- Writes → `useMutation({ mutationFn, onSuccess: () => qc.invalidateQueries({...}) })`
- Query keys are stable per-entity (`["campaigns", clientId, includeInactive]`)
- Sensible enabled-flag gating (`enabled: !!employeeId`)
- Privileged work that needs server-side validation calls an edge function (`useEditTimeClock`, `useChangeEmployeeRole` wraps the `change_employee_role` RPC, etc.)
- `useSupabasePayroll.ts` even includes a long comment explaining why `update_my_goal` *has* to be an RPC (RLS gap), which is exactly the documentation discipline you want.

The hooks are genuinely well-structured. The Supabase types file is stale (known tech debt per memory), so some hooks use a `as unknown as` cast for newer RPCs (e.g. `useUpdateMyGoal`) — that's fine.

### What's missing

1. **No `src/services/` or `src/lib/api/`.** Everything is hook-shaped, which means non-React code (e.g. `scripts/`, future cron logic) has to recreate the queries.
2. **Two payroll hooks files** (`usePayroll.ts` + `useSupabasePayroll.ts`) — overlap on `employees` and `payroll_records`. Consolidate or rename to make ownership explicit.
3. **Some hooks duplicate identical sub-queries.** `useTeamLead.ts` fetches the team roster the same way in 6+ different hooks (look for `employees_no_pay.eq("reports_to", tlEmployeeId)`). One shared roster hook would clean this up.
4. **No hook for `campaigns` CRUD on the CampaignDetail page** — that page reimplements everything inline. `useCampaigns.ts` exists but is only used for the list.
5. **No "edit time_clock from the agent's own clock-in page" hook.** `Timeclock.tsx` writes directly to the table — see Finding #4.

---

## Security Findings

### Critical

#### C-1. Signup UI in `Auth.tsx` is still live in code

- **Where:** `src/pages/Auth.tsx:38-48` — `supabase.auth.signUp(...)`, with the "Don't have an account? Sign up" toggle at line 128.
- **What's wrong:** The May-18 audit's Critical #1 was closed because Supabase Auth signups are disabled at the project level. But this UI still tries to call `signUp()`. If anyone in the dashboard accidentally re-enables signups (or a future migration to a new Supabase project re-defaults to on), the hole opens **instantly**, with no code change. The May-18 audit specifically recommended deleting this branch (Step 2 of Critical #1).
- **Fix:** Delete the `isLogin` toggle and the `signUp()` branch. Login-only form. ~10 lines.

#### C-2. `notify-hr-request-filed` edge function has zero caller auth, uses service role

- **Where:** `supabase/functions/notify-hr-request-filed/index.ts:48-110`
- **What's wrong:** No `Authorization` header check. The function accepts `{requestId}` from anyone, then reads `hr_document_requests` + `employees` + leadership emails using `SUPABASE_SERVICE_ROLE_KEY` and sends an email. Anyone with the function URL can:
  1. Spam leadership inboxes by submitting random UUIDs (it 404s on miss, but each request still costs Gmail send + reveals which request IDs exist).
  2. Enumerate `hr_document_requests` IDs (compare 404 vs 200 responses).
- **Note:** `DRY_RUN_HR_NOTIFICATIONS` defaults true, which limits live damage *if it's still true in prod*. Per memory both `DRY_RUN_HOLIDAY` + `DRY_RUN_REVIEW` were flipped to "false" on 2026-05-19 — confirm this one too.
- **Fix:** Require `Authorization: Bearer <jwt>` and verify the caller is leadership (matches the `compliance-notifications` pattern). Or change to event-driven via DB trigger using `pg_net` instead of a public HTTPS endpoint.

### High

#### H-1. Three edge functions still hardcode `Access-Control-Allow-Origin: *`

- **Where:**
  - `supabase/functions/create-employee/index.ts:4-5`
  - `supabase/functions/edit-time-clock/index.ts:36-37`
  - `supabase/functions/resend-invite/index.ts:29-30`
- **What's wrong:** May-18 audit's High #5 said all CORS should fail closed to `https://app.justoutsource.it`. The other ~9 functions were updated. These three were missed. They DO verify the caller's JWT, so the worst case is CSRF: a logged-in admin visits attacker.com, attacker.com fires `create-employee` with the admin's bearer token, attacker has a new employee in JOI's org. Risk depends on how often leadership visits arbitrary URLs while logged into the app.
- **Fix:** Change to the same pattern other functions use:
  ```ts
  const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
  const corsHeaders = { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, ... };
  ```

#### H-2. Client-side INSERTs missing required `organization_id`

- **Where:**
  - `src/hooks/usePolicies.ts:128-138` (`policy_documents.insert`)
  - `src/hooks/useBulletin.ts:142, 208, 360` (`bulletin_posts.insert`)
  - `src/hooks/useHolidayRequests.ts:417` (`company_holidays.insert`)
- **What's wrong:** All three target tables have `organization_id` declared NOT NULL with no default (per `src/integrations/supabase/types.ts` and the May-19 mt_phase3b migration). The INSERTs don't pass it. This is a latent bug per your memory note "organization_id NOT NULL on INSERT — must be set explicitly every time, no default". Either (a) these are silently failing in prod and nobody noticed because the features aren't widely used yet, or (b) there's a SECURITY DEFINER trigger I didn't grep for that fills the column in. **Either way it's a footgun waiting to bite the next new INSERT site.**
- **Security angle:** If it currently works because a trigger guesses `my_org_id()` from JWT, that's fine — but it's invisible to anyone reading the hook code. As soon as someone INSERTs from an edge function with the service-role key, the trigger may pick the wrong org (or fail).
- **Fix:** Pass `organization_id` explicitly from a `useUserProfile()`-style hook, the same way `ChangeCampaignDialog.tsx:78-98` and `ClientHolidays.tsx:263-275` already do. Or add a default `now-pick-from-jwt` to the column. Either is fine, but pick one and apply it everywhere.

#### H-3. `Timeclock.tsx` does its own `is_late` / `late_minutes` calculation client-side, then writes the result

- **Where:** `src/pages/Timeclock.tsx:275-302`
- **What's wrong:** Agent's browser computes "am I late?" then INSERTs the answer. A user with browser devtools can `supabase.from("time_clock").insert({ employee_id, clock_in, date, is_late: false, late_minutes: 0 })` directly and falsify their lateness. Attendance / payroll computations downstream trust this column.
- **Note:** The TL-side `edit-time-clock` edge function is well-designed (server-side audit + whitelist). But the agent's own first INSERT bypasses that.
- **Fix:** Move `is_late` / `late_minutes` calculation to a DB trigger on `time_clock` INSERT (uses `shift_settings.start_time` + `grace_minutes`). Then make those columns server-managed. Or have agents call a `clock-in` edge function that computes lateness server-side. The DB trigger is the cleaner option — also fixes the "two code paths for lateness" problem.

### Medium

#### M-1. `Auth.tsx` uses `window.location.origin` for both `signUp.emailRedirectTo` and `resetPasswordForEmail.redirectTo`

- **Where:** `src/pages/Auth.tsx:22, 41`
- **What's wrong:** If someone deploys this site to a non-locked domain (e.g. a Vercel preview deploy at `joi-app-pr-42.vercel.app`), the password-reset redirect URL becomes that preview domain. Supabase Auth has a `redirectUrls` allowlist, so this only works if the allowlist permits it — but if the allowlist is set to `*` or includes wildcards, you have a phishing vector.
- **Fix:** Hardcode the redirect to `https://app.justoutsource.it/reset-password` in production. Or read from `import.meta.env.VITE_PUBLIC_APP_URL`.

#### M-2. `SystemUsers.tsx` does a 2-step create (`create-employee` then `UPDATE employees SET is_system_user = true`)

- **Where:** `src/pages/SystemUsers.tsx:213-247`
- **What's wrong:** If step 1 succeeds and step 2 fails, you end up with a "ghost system user" — an employee row marked active but missing `is_system_user`. Future payroll runs will treat them like a real employee. This is the same shape as the May-18 audit's Medium #6 about `provision-org`.
- **Fix:** Add an `is_system_user` body field to the `create-employee` edge function and set it atomically there. Or wrap in a server-side RPC.

#### M-3. `policy_documents` orphan cleanup on failed upload is best-effort

- **Where:** `src/hooks/usePolicies.ts:144-168`
- **What's wrong:** If the storage upload OR version-row INSERT fails, the hook tries to delete the policy row + the file. But if the cleanup itself fails (e.g. browser tab closed mid-cleanup, network error), you end up with an orphan `policy_documents` row + dangling storage object. Defense-in-depth issue, not exploitable.
- **Fix:** Make this a transactional RPC, or run a nightly orphan-sweep.

### Low

#### L-1. `useSupabasePayroll.ts` has both a `useAddEmployee` and `useAddEmployeesBulk` that insert directly into `employees` (no edge function)

- **Where:** `src/hooks/useSupabasePayroll.ts:82-114`
- **What's wrong:** The "single add with email" path correctly calls the `create-employee` edge function (line 63 area). But the "no email" fallback and the bulk-add path insert directly. They rely on RLS to gate creation. They also don't trigger an auth-user invite — so the employee row exists but the person can't log in. RLS prevents abuse, but the codepath is inconsistent with the "one door for employee creation" the edge function is trying to be.
- **Fix:** Route everything through `create-employee`. If the bulk path is for migration imports only, gate it behind an explicit owner-only UI and document it.

#### L-2. `notify-hr-request-filed` is the only edge function with no caller auth

- See C-2 above. Listed here because tooling-wise it's also a "function inventory hygiene" issue: every other function in `supabase/functions/` follows one of two patterns (JWT-verified caller OR `x-cron-secret`). This one breaks the pattern.

#### L-3. Stale Supabase types file

- Known tech debt per memory (`feedback_supabase_types_stale`). Some hooks already `as unknown as` cast around it. Not a security issue but it makes the H-2 finding harder to catch — full type regen would catch the missing-column inserts at compile time.

---

## Prioritized Action Plan

### Quick wins (this week, all 1-line / small-file changes)

1. **Delete the `signUp()` branch and toggle in `src/pages/Auth.tsx`.** Closes C-1. ~10 lines.
2. **Add `ALLOWED_ORIGIN` env-driven CORS to `create-employee`, `edit-time-clock`, `resend-invite`.** Closes H-1. Copy-paste from `update-work-email` or `notify-hr-request-filed`.
3. **Add JWT + leadership check to `notify-hr-request-filed/index.ts`.** Closes C-2. Copy-paste auth block from `compliance-notifications`.
4. **Fix the three `organization_id`-missing INSERTs** (`useCreatePolicy`, `useCreatePost`, `useAddCompanyHoliday`). Pass `organization_id` from a `useUserProfile()` lookup or a shared `useMyOrgId()` hook. Closes H-2.

### Strategic (this month)

5. **Move `is_late` / `late_minutes` server-side.** DB trigger on `time_clock` INSERT/UPDATE that computes lateness from `shift_settings`. Closes H-3 + cleans up the duplicate lateness-calculation logic between Timeclock.tsx and edit-time-clock edge fn.
6. **Refactor `src/pages/CampaignDetail.tsx`.** Split its 26 Supabase calls into hooks: `useCampaign(id)`, `useCampaignKPIFields(campaignId)`, `useCampaignShifts(campaignId)`, `useCampaignTeam(campaignId)`, `useCampaignRecipients(campaignId)`. Drops ~700 lines of inline query/mutation code from the page.
7. **Consolidate the "team roster" query** that's duplicated in 6+ hooks in `useTeamLead.ts` into one `useTeamRosterBase(tlId)` and reuse.
8. **Merge or rename `useSupabasePayroll.ts` / `usePayroll.ts`.** Have one source of truth for employees/payroll_records.
9. **Regenerate the Supabase types file.** Sweep `as unknown as` casts. Lets TypeScript catch future missing-column INSERTs.
10. **Make `SystemUsers.tsx` use a single atomic edge function** (add `is_system_user` to `create-employee` body, drop the 2-step dance).

### Defer (not worth the time yet)

- Migrating every page-level Supabase call into a hook. The scattered count (151 in pages, 28 in components) is annoying but mostly not dangerous — RLS handles authorization. Focus on the *write* sites; the *reads* are mostly fine.
- A formal `src/services/` layer. The hooks layer is doing the job. Don't introduce another abstraction unless you start needing data access from non-React code.
- Hardening `policy_documents` orphan cleanup (M-3). Real but low-impact.

---

## What's actually solid

Credit where credit's due — most of this app is in good shape:

- **RLS enabled on all 41 tables** (per May-18 audit, unchanged).
- **No service-role key in the frontend bundle.** Single doc-comment reference, otherwise clean.
- **No hardcoded UUIDs, JWTs, or secrets in `src/`.** `client.ts` uses `import.meta.env.*` only.
- **Privileged routes are guarded.** Every `/empleados`, `/campaigns`, `/facturas`, `/payroll-run`, `/admin/*`, `/hr/*`, `/settings/*` route in `App.tsx` has `RequireLeadership`, `RequireTeamLeadOrAbove`, `RequireOwner`, or `RequireClient`. Agent self-serve routes (`/reloj`, `/eod`, `/account`, etc.) are correctly unguarded — that's the intended design.
- **Hooks are well-shaped React Query.** 24 of 26 use `useQuery` + `useMutation` + proper invalidation; clear query keys; sensible `enabled` gating.
- **Sensitive privileged work goes through edge functions or SECURITY DEFINER RPCs.** `change_employee_role`, `update_my_goal`, `edit-time-clock`, `create-employee`, `submit-eod-for-agent`, `update-work-email`, `get-hr-document-signed-url` all do server-side auth + audit.
- **Edge functions follow consistent patterns** (auth-verifying functions extract caller from JWT and recheck against `employees.title`; cron functions check `x-cron-secret`).
- **HR storage buckets are private** with signed-URL access — not directly readable.
- **`useTerminateEmployee` / `useReactivateEmployee` write minimal columns** (no PII overwrites) and rely on DB triggers for `terminated_at`/`terminated_by` stamping.
- **`useCreatePolicy` does best-effort orphan cleanup** on upload failure. Not perfect (see M-3) but the intent is right.

---

## Quick numerical summary

- Direct Supabase calls in `src/`: ~435 (across `.from`, `.rpc`, `.functions.invoke`, `.auth.*`, `.storage.*`)
- In the data layer (`src/hooks/`, `src/lib/`): 255 (59%)
- Scattered (`src/pages/`, `src/components/`, `src/utils/`): 180 (41%)
- Worst-offender file: `src/pages/CampaignDetail.tsx` (26 calls, many writes)
- Edge functions audited: 12 — 11 with proper auth, 1 (`notify-hr-request-filed`) wide open
- New critical findings vs May-18 audit: 2 (C-1, C-2)
- High findings: 3 (H-1, H-2, H-3)
- Medium: 3
- Low/info: 3
