# JOI Payroll & HR App — Handoff

Last updated: 2026-05-19 (Payroll Phase 1 schema — migrations written, pending db push)

Quick reference for picking the project back up on a new machine.

## ⚠️ BEFORE DEPLOYING TO VERCEL / ANY SERVER — READ THIS

`.env` is no longer tracked by git (untracked and added to `.gitignore`). The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from environment variables via `import.meta.env`. See `.env.example` for the required variable names.

**Remaining required steps before first deploy:**

1. ~~Scrub `.env` from git history.~~ ✅ Done 2026-04-20 via `git filter-repo`. Force-push applied, stale branches cleaned up.
2. ~~Mystery Supabase project in history (`hipxsmawxvlxjzotsgfj`).~~ ✅ Confirmed dead 2026-04-20 — the project doesn't exist on Supabase, so the key is inert. Cleared out of git history during the same scrub.
3. **Put the Supabase + Gmail keys in Vercel's Environment Variables panel** (Project Settings → Environment Variables). Never commit them again.
4. **Agent browser smoke-test.** SQL-level RLS simulation passed 6/6, but a real agent walk-through in the browser is pending. Do this once a dedicated agent test account is ready.
5. **Go-live domain switch (pending Jacque's team deploying to Vercel).** Once `app.justoutsource.it` is live, update in Supabase dashboard:
   - Auth → URL Configuration → Site URL → `https://app.justoutsource.it`
   - Auth → URL Configuration → Redirect URLs → add `https://app.justoutsource.it/**`
   - Edge Function secrets: `APP_URL` → `https://app.justoutsource.it`, `APP_DOMAIN` → `app.justoutsource.it`, `ALLOWED_ORIGIN` → `https://app.justoutsource.it`
   - Env vars already sent to Jacque: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (2026-05-04).
5. ~~**Flip DRY_RUN=false on both email edge functions.**~~ ✅ Done 2026-04-27. `DRY_RUN_EOD=false` set on `send-eod-digest` and `DRY_RUN_COMPLIANCE=false` set on `compliance-notifications` via Supabase dashboard secrets. Both functions are now sending real emails.
5b. **Configure `review-notifications` edge function (deployed 2026-05-14, currently DRY RUN).** New 30-day review email function. Set these in Supabase dashboard → Edge Functions → review-notifications → Secrets:
   - `DRY_RUN_REVIEW=false` — flip when ready to send real emails (defaults to dry run for safety)
   - All other secrets (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CRON_SECRET`, `APP_URL`, `APP_DOMAIN`) are shared across edge functions and are already set.
   Two cron jobs already scheduled: `review-notifications-tl-daily` (9 AM CDMX) for daily TL nudges, and `review-notifications-escalation-eve` (6 PM CDMX) for week-4 manager+HR+owner escalation. Dedupe table `agent_review_notifications_sent` prevents double-sends.
6. **Run `supabase/dev-seed/02_teardown_mock_dashboard.sql`** to clean the 7 mock Torro agents (DEV_MOCK_TORRO_SLOC campaign) before public launch.
7. **Re-run RLS audit after any new migration that touches tables, policies, or views.** Migration file + audit doc pattern: `supabase/migrations/<stamp>_<name>.sql` + `docs/security/rls-audit-<date>.md`.

**Optional hygiene — explicitly deferred. Do NOT treat these as deploy blockers.**

These are items D has reviewed and chosen to defer. Future sessions should not flag them as pending action items.

- **Rotate Supabase anon key** (Supabase dashboard → JWT Keys → Create Standby Key → promote). The current project's anon key was NEVER committed to git history — verified 2026-04-20 before the scrub. No exposure, no incident. Rotation is a signing-key operation that invalidates every active JWT, so save it for a real maintenance window. Not required before deploy.
- **Rotate Gmail App Password** (account security → revoke + regenerate, then update `send-eod-digest` + `compliance-notifications` env vars). Paired with the anon key rotation for the same maintenance window. Not required before deploy.
- **MFA on owner/admin Supabase auth.** Worth adding before granting production access to other humans, but D has deferred for now.

## Supabase Security Advisor warnings — READ BEFORE "FIXING"

As of 2026-05-13, the Supabase advisor flags 3 CRITICAL `security_definer_view` warnings:

- `public.employees_no_pay`
- `public.employees_client_view`
- `public.eod_logs_client_view`

**These are false positives. Do NOT flip `security_invoker = on` to silence them — you will break the client portal and the TL dashboard.**

**Why they're intentional.** All three views are declared `WITH (security_invoker = off)` deliberately. Clients (and in some cases TLs) do not have RLS access to the base `employees` / `eod_logs` tables, so an invoker-rights view would return empty. Instead, the security boundary is the **WHERE clause** inside each view, which calls SECURITY DEFINER helpers (`is_client()`, `my_client_id()`, `my_client_campaign_ids()`, `my_org_id()`, `is_leadership()`, `is_team_lead()`, `my_tl_campaign_ids()`, `my_employee_id()`) to enforce scoping. Migration comments in `20260424300001_e1_client_portal_data_model.sql` and `20260427500001_mt_phase2_root_tables.sql` document this explicitly.

**Why the linter still complains.** The Supabase advisor can't see WHERE-clause scoping and flags any non-invoker view as a generic antipattern. The remediation URL it points to literally allows "or enforce equivalent checks in your view definition" — which is what we did.

**The real risk to mind.** Since the security boundary now lives in those helper functions, **the helpers themselves are load-bearing.** A careless edit to `is_client()`, `my_client_id()`, `my_org_id()`, `is_leadership()`, etc. could silently leak data across clients or orgs. Migration `20260427800001_mt_phase4_harden_helper_functions.sql` did a dedicated hardening pass on these — preserve that work. Treat any future change to a `is_*` or `my_*` SECURITY DEFINER helper as security-critical and pair it with an RLS audit.

**If the advisor noise bothers you,** suppress per-view rather than per-project so a real future regression still surfaces. Don't blanket-disable.

## Getting set up on a new computer

Clone the repo, install, and run the dev server:

```
git clone https://github.com/sandoval-art/JOI-payroll-hr.git
cd JOI-payroll-hr
npm install
npm run dev
```

The app runs at http://localhost:5173 (or the port Vite picks).

**Already cloned and just need to sync?** Tell CT to read `SYNC.md` — it handles fetch, ff-merge, branch cleanup, and `npm install` in one pass.

You'll need a `.env` file at the project root with your Supabase keys. Copy `.env.example` and fill in the values from the Supabase dashboard (Project Settings → API):

```
cp .env.example .env
# Then edit .env:
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Accounts

| Email | Role | Purpose |
|---|---|---|
| diomedes.sandoval@justoutsource.it | Owner | Real login for D (owner-level access) |
| sandoval.028@gmail.com | Agent | Test account to QA the employee experience |
| (Paty's email) | Admin | Paty Rodriguez |
| (Joe's email) | Manager | Joe Renteria — not yet seeded, add via UI |
| (Wendy / Ruben / Javier emails) | Team Lead | Create via UI once they sign up |

## Architecture in 30 seconds

React + TypeScript + Vite + Supabase + TanStack React Query + shadcn/ui + Tailwind.

Route gating is driven by `useAuth()` in `src/hooks/useAuth.tsx`. It reads `user_profiles.role` which is auto-synced from `employees.title` via a Postgres trigger.

Auth state is shared via a React Context (`AuthProvider` wraps the app in `src/App.tsx`). Every component that calls `useAuth()` reads from the same context — no more independent Supabase fetches per component. Profile loading uses a `profileLoadedForId` tracker (not a bare `loading` boolean) to eliminate a race where `loading` was briefly false before the profile fetch started.

**Pattern for any new role-gated page:** wrap the route in a guard from `src/components/RequireRole.tsx`:

```tsx
// In App.tsx
<Route path="/campaigns" element={<RequireLeadership><Campaigns /></RequireLeadership>} />
<Route path="/settings/shifts" element={<RequireTeamLeadOrAbove><ShiftSettings /></RequireTeamLeadOrAbove>} />
<Route path="/owner-only" element={<RequireOwner><OwnerPanel /></RequireOwner>} />
```

Available guards: `RequireLeadership`, `RequireTeamLeadOrAbove`, `RequireOwner`. All three handle the loading-before-redirect dance internally — the page component itself doesn't need to check `loading` for route access. Without the wrapper, the page flashes a redirect on first render before the profile resolves and the user never reaches the destination.

If you still need `loading` inside a page for other reasons (e.g. rendering a skeleton while auth data loads before showing pay info), destructure it from `useAuth()` as normal.

Five-tier title hierarchy (owner → admin → manager → team_lead → agent) is the single source of truth for permissions. Anything `isLeadership` (owner+admin+manager) sees everything including pay. Team leads see team-scoped data without pay. Agents see only their own stuff.

## Permission model

| Permission | Owner | Admin | Manager | Team Lead | Agent |
|---|---|---|---|---|---|
| See payroll / pay info | yes | yes | yes | no | own only |
| Edit shift times | yes | yes | yes | yes (own campaign) | no |
| Approve time off | yes | yes | yes | yes (own team) | request own |
| View team EOD | yes | yes | yes | yes (own team) | own only |
| Clock in / out | yes | yes | yes | yes | yes |

Owner and Admin are functionally identical today. D may spec owner-only powers later.

## Database migrations

Run these in order via the Supabase SQL editor if setting up a fresh database. All files are in `supabase/migrations/`.

1. `20260401165427_*.sql` — initial schema (original Supabase setup)
2. `20260401171237_*.sql` — schema tweaks
3. `20260401230853_*.sql` — more scaffold
4. `20260413000001_full_setup.sql` — consolidated setup (clients, employees, payroll, time_clock, user_profiles, etc.)
5. `20260413120000_timeclock_breaks_and_auto_clockout.sql` — break-aware timeclock columns
6. `20260413120100_auto_clockout_function.sql` — pg_cron auto-clockout every 5 min
7. `20260413130000_shift_seasons.sql` — **no-op** (we decided not to use season toggle)
8. `20260413140000_titles_and_reports_to.sql` — 5-tier title system + reports_to + shift audit log
9. `20260414000001_eod_form_builder.sql` — EOD form builder schema
10. `20260414000002_campaigns_subtitle.sql` — subtitle column on clients (now deprecated)
11. `20260414000003_split_clients_and_campaigns.sql` — **Major refactor**: creates `campaigns` table, migrates `employees.client_id` → `campaign_id`, seeds 4 clients + 12 campaigns, reassigns all employees per roster, redistributes KPIs and shift settings
12. `20260415000001_auto_employee_id_and_holidays.sql` — auto-generated employee IDs (sequence + trigger), mexican_holidays table, payroll_records.overrides_json column
13. `20260417000001_tl_per_campaign.sql` — adds `team_lead_id` to campaigns, cascade triggers for reports_to sync
14. `20260416000001_rls_hardening.sql` — **Security**: replaces all blanket "allow authenticated" RLS policies with role-scoped policies matching the 5-tier permission model. Creates `employees_no_pay` view for team-lead queries. See `docs/security/rls-audit-2026-04-16.md` for the full audit.
15. `20260416000002_rls_hardening_rollback.sql` — **Emergency rollback** for the above. Restores original blanket policies. Only run if something breaks.
16. `20260416000003_eod_digest_foundation.sql` — EOD digest tables (`campaign_eod_recipients`, `campaign_eod_tl_notes`), digest schedule columns on `campaigns`, RLS policies for both new tables.
17. `20260417000001_eod_digest_sending_infra.sql` — EOD digest sending infra: `campaigns.eod_reply_to_email` column + `eod_digest_log` table (tracks each send attempt; unique `(campaign_id, digest_date, digest_type)` guards against pg_cron double-send). RLS now 65 policies across 16 tables.
18. `20260417000005_flag_threshold.sql` — adds `flag_threshold` column to `campaign_kpi_config`. Separates the agent-facing daily goal (`min_target`) from the TL alert floor (`flag_threshold`).
19. `20260417000006_flag_independent.sql` — adds `flag_independent boolean DEFAULT true` to `campaign_kpi_config`. Fields with `flag_independent = false` (e.g. `calls_made`) are tracked but never trigger the TL flag independently.
20. `20260418004436_fix_digest_type_check_morning_bundle.sql` — updates the `eod_digest_log.digest_type` CHECK constraint to accept `'morning_bundle'` alongside `'daily'`.
21. `20260419000001_app_config_and_cron_rewrite.sql` — `app_config` table for secret storage (cron_secret), rewrites all pg_cron jobs to fetch secrets at runtime instead of hardcoding.
22. `20260419000002_eod_logs_amend_tracking.sql` + `eod_amend_rpc_function.sql` — `last_edited_at` and `edit_count` columns on `eod_logs` + RPC for atomic amend with increment.
23. `20260419000003_agent_coaching_notes.sql` — `agent_coaching_notes` table for TL dashboard coaching log (later extended by B1 into notes + verbal warnings).
24. `20260419000004_digest_fire_time_from_shifts.sql` — campaign digest cutoff derived from latest shift end instead of hardcoded.
25. `20260419100001_a1_personal_tax_fields.sql` — **Feature A1**: `curp, rfc, address, phone, bank_clabe` columns on `employees`. Mexican tax info.
26. `20260419200001_a2a_required_document_types.sql` — **Feature A2a**: `required_document_types` catalog + RLS + seed (4 starter types: signed contract, INE, proof of address, RFC certificate).
27. `20260419200002_a2b_employee_documents.sql` — **Feature A2b**: `employee_documents` table + `employee-documents` storage bucket + RLS. HR uploads + approves; agent sees own.
28. `20260419300001_a3a_compliance_grace_until.sql` — **Feature A3a**: `employees.compliance_grace_until` date column. NULL = no enforcement. Past date + missing approved docs = clock-in locked.
29. `20260419300002_a3b_compliance_notifications_sent.sql` — **Feature A3b**: dedupe table for compliance emails.
30. `20260419300003_a3b_compliance_notifications_cron.sql` — pg_cron job: `compliance-notifications-daily` at 15:00 UTC (9 AM CDMX).
31. `20260420100001_a2c_agent_self_upload_rls.sql` — **Feature A2c**: RLS policies letting agents INSERT their own docs + UPDATE rejected → pending_review + storage INSERT to own folder.
32. `20260420200001_b1_notes_verbal_warnings.sql` — **Feature B1**: extends `agent_coaching_notes` with `entry_type`, `visible_to_agent`, `updated_at`. Drops TL UPDATE/DELETE (immutable). Adds agent SELECT for visible entries.
33. `20260420300001_tl_select_team_documents.sql` + `20260420400001_drop_tl_storage_view.sql` — TL can see document STATUS on their team's profiles (no file content). Storage SELECT for TL dropped as defense in depth.
34. `20260420500001_b4_attendance_incidents.sql` + `20260420500002_b4_attendance_docs_bucket.sql` — **Feature B4**: `attendance_incidents` table + `attendance-docs` bucket for supporting docs (doctor's notes, etc.) + RLS scoped to leadership/TL(team)/agent(own).
35. `20260420600001_c1_policy_catalog.sql` + `20260420600002_c1_policy_documents_bucket.sql` — **Feature C1**: `policy_documents`, `policy_document_versions`, `policy_acknowledgments` + `policy-documents` bucket. Campaign + role scope toggles per policy.
36. `20260420700001_c1_tighten_rls.sql` + `20260420700002_c1_insert_policy_version_rpc.sql` — **C1 hardening**: versions RLS inherits parent visibility; storage SELECT path-scoped; `insert_policy_version` RPC computes version_number atomically server-side.
37. `20260421100001_a1_harden_employees_rls.sql` — **A1 RLS hardening** (PR #32). Tightens `employees` RLS so agents SELECT own row only, leadership UPDATE only. `employees_no_pay` view switched to `security_invoker=off` with role-scoped WHERE clause.
38. `20260421200001_a1b_expanded_employee_record.sql` — **A1b** (PR #33). Adds 10 new employee columns (`work_name`, `personal_email`, `hire_date`, `emergency_contact`, `bank_name`, `date_of_birth`, `marital_status`, `nss`, `last_worked_day`, `department_id`) + new `departments` catalog table (11 seeded) + RLS + admin UI at `/settings/departments`.
39. `20260421300001_a1b_expose_work_name.sql` — **A1b display** (PR #34). Extends `employees_no_pay` view with `work_name` so TLs can use the display-name helper.
40. `20260421400001_a3a_clock_in_compliance_trigger.sql` — **A3a** (PR #37). BEFORE INSERT trigger `enforce_clock_in_compliance` on `time_clock` rejects inserts for employees past `compliance_grace_until` with missing or unapproved required docs. Raises SQLSTATE `P0001` surfaced via the existing UI error path. No leadership bypass — approve the docs first.
41. `20260421500001_a3b_rerejection_dedupe_clear.sql` — **A3b** (PR #38). AFTER UPDATE trigger on `employee_documents` clears the matching `compliance_notifications_sent` row when status transitions away from `'rejected'`, so re-rejections fire fresh emails instead of being silently deduped.
42. `20260421600001_b05_grace_change_dedupe_clear.sql` — **old-B-05** (PR #39). AFTER UPDATE trigger on `employees` clears `reminder_7d/3d/1d/lock` dedupe rows when `compliance_grace_until` changes. Does NOT clear rejection rows. Mirrors A3b pattern.
43. `20260422100001_b2b3_phase1_data_model.sql` — **B2/B3 Phase 1** (PR #42). Three tables: `hr_document_requests` (TL files carta/acta request), `cartas_compromiso` (HR drafts formal carta with KPI table + snapshots), `actas_administrativas` (same shape minus KPI, plus witnesses + reincidencia link). `hr-documents` Storage bucket (private, leadership-only RLS). RLS: leadership full CRUD; TL SELECT + INSERT(requests only) on own team; agents SELECT own signed cartas/actas only. Phase 1 of 5 — no UI yet.
44. `20260422200001_hr_create_finalization_draft_rpc.sql` — **B2/B3 Phase 4a** (PR #45). `hr_create_finalization_draft(p_request_id, p_created_by)` RPC: atomically creates a `cartas_compromiso` or `actas_administrativas` draft row with auto-generated doc_ref (CC{YYYYMMDD}-{HHMM} for carta, {YYYYMMDD}-{HHMM} for acta, MX timezone), links it back to the request via `fulfilled_carta_id`/`fulfilled_acta_id`, and transitions pending requests to in_progress. SECURITY DEFINER with `is_leadership()` gate.
45. `20260422300001_hr_mark_finalization_signed_rpc.sql` — **B2/B3 Phase 5b** (PR #48). `hr_mark_finalization_signed(p_finalization_id, p_type, p_signed_scan_path)` RPC: atomically sets `signed_at` + `signed_scan_path` on the carta/acta row and transitions the parent request to `status='fulfilled'`. SECURITY DEFINER with `is_leadership()` gate. Idempotent — re-upload overwrites both fields.
46. `20260423100001_f1_resignation_packet_data_model.sql` — **Feature F Phase 1** (PR #51). `resignation_packets` table with finiquito calculation fields + identity snapshots. Extends `hr_document_requests.request_type` CHECK to include `'renuncia'` + adds `fulfilled_renuncia_id` FK. Both finalization RPCs (`hr_create_finalization_draft`, `hr_mark_finalization_signed`) extended to handle `'renuncia'` type with `RN{YYYYMMDD}-{HHMM}` doc_ref. RLS: same 3-tier pattern as cartas/actas.
47. `20260423200001_fix_tl_rls_subqueries_after_a1_hardening.sql` — **TL RLS subquery fix**. The A1 hardening (PR #32) tightened `employees` RLS so TLs can't SELECT the base table — that silently broke 6 TL-facing policies (hr_document_requests, cartas, actas, renuncias, attendance_incidents, employee_documents) plus storage.objects on `attendance-docs`, since each used a subquery against `employees` that returned empty under TL auth. Surfaced 2026-04-23 when D first tested the TL "Solicitar renuncia" / "Solicitar acta" flows. Fix: `tl_employee_on_my_team(uuid)` SECURITY DEFINER helper that bypasses RLS for the team-scope check; all 8 affected policies rewritten to call the helper. Applied via MCP 2026-04-23, file commits for audit trail.
48. `20260424100001_fix_fulfilled_status_sync_check.sql` — **Feature F polish**. Original `hr_document_requests_fulfilled_status_sync` CHECK was a biconditional ((status='fulfilled') IFF (any fulfilled_*_id IS NOT NULL)) which forbade the legitimate intermediate state where `hr_create_finalization_draft` simultaneously sets `fulfilled_renuncia_id` and transitions status pending→in_progress. Surfaced 2026-04-23 when D saved a renuncia draft (23514). Same bug would have hit carta/acta but was never exercised end-to-end. Relaxed CHECK: pending → no draft, fulfilled → has a draft, in_progress/canceled/downgraded → unconstrained. Applied via MCP 2026-04-24.
49. `20260424200001_rename_resignation_packets_narrative_column.sql` — **Feature F polish**. Renames `resignation_packets.renuncia_narrative` → `narrative` to align with `cartas_compromiso` and `actas_administrativas` (both already use `narrative`). Client save code was written using `narrative` (correct — matches the other two doc types). Surfaced 2026-04-24 (PGRST204 schema cache miss). Applied via MCP 2026-04-24; this migration file landed via the post-F-cleanup PR after the polish branch had already been squashed without it.
50. `20260424300001_e1_client_portal_data_model.sql` — **Feature E Phase 1** (PR #64). New `'client'` role: `user_profiles.client_id` FK (ON DELETE RESTRICT) + two CHECK constraints (role enum + client/employee invariant). `guard_user_profile_role` trigger updated for client users (no employee record). Three SECURITY DEFINER helpers: `is_client()`, `my_client_id()`, `my_client_campaign_ids()` — the third insulates views/RLS from upstream campaigns RLS changes (same lesson as migration 49). Two scoped views: `employees_client_view` (display_name via COALESCE, no sensitive fields) + `eod_logs_client_view` (id, employee_id, campaign_id, date, metrics only — no amend trail). Updated SELECT RLS on clients/campaigns/campaign_kpi_config to scope clients to their own data while preserving full access for other roles.

51. `20260425100001_d1_holiday_data_model.sql` — **Feature D Phase 1** (PR #74). Holiday time-off data model: `holiday_time_off_requests` table + RLS.
52. `20260425200001_d2_holiday_rpcs.sql` — **Feature D Phase 2** (PR #74). Holiday request RPCs.
53. `20260426100001_d5_holiday_notifications.sql` — **Feature D Phase 5** (PR #74). Holiday notification edge function + pg_cron job.
54. `20260426200001_d7_holiday_noshow_detection.sql` — **Feature D Phase 7** (PR #74). No-show detection trigger for holidays.
55. `20260426300001_fix_tl_employee_rls_scope.sql` — **TL RLS scope fix** (PR #78). Fixes TL employee scoping after D-series migrations.
56. `20260427100001_g1_vacation_data_model.sql` — **Feature G Phase 1** (PRs #74–#78). Vacation/PTO data model: `vacation_requests` table + RLS (agent/TL/leadership tiers). `get_vacation_balance()` SECURITY DEFINER RPC implementing LFT 2023 entitlement formula (Art. 76 — 12/14/16/18 days for years 1–4, 20+ for 5+). No UI in this phase.
57. `20260427200001_g2_vacation_request_rpc.sql` — **Feature G Phase 2**. `request_vacation_off()` SECURITY DEFINER RPC: validates 21-day advance notice, available balance, and date overlap, then inserts the request.
58. `20260427300001_g2_fix_vacation_rpc_auth.sql` — **Security fix** (commit e120bc1, 2026-04-27). **IDOR in `request_vacation_off()`**: function was `SECURITY DEFINER` but never verified caller owned `p_employee_id`. Any authenticated employee could pass a coworker's UUID and file vacation requests in their name, draining their balance. Fix: ownership guard `IF p_employee_id IS DISTINCT FROM public.my_employee_id() THEN RAISE EXCEPTION ... USING ERRCODE = '42501'` at top of function body. Found by CT security audit 2026-04-27.
59. `20260427400001_mt_phase1_organizations.sql` — **Multi-tenancy Phase 1** (PR #80, 2026-04-27). Creates `organizations` table + RLS (`organizations_read_own`). Adds `organization_id` FK to `user_profiles`. Creates `my_org_id()` SECURITY DEFINER helper. Seeds JOI org + backfills all existing `user_profiles` rows. Tightens to NOT NULL. Applied manually in corrected order (function before policy to avoid forward-reference error).
60. `20260427500001_mt_phase2_root_tables.sql` — **Multi-tenancy Phase 2** (PR #81, 2026-04-27). Adds `organization_id` NOT NULL FK to `clients`, `campaigns`, `employees`; backfills all rows to JOI org. Replaces RLS policies on all three tables with org-filtered equivalents. Rebuilds `employees_no_pay` view with `AND e.organization_id = public.my_org_id()` guard.
61. `20260427600001_mt_phase3a_employee_fk_rls.sql` — **Multi-tenancy Phase 3a** (PR #82, 2026-04-27). RLS-only updates on 15 leaf tables that have an `employee_id` FK: `time_clock`, `time_off_requests`, `payroll_records`, `agent_coaching_notes`, `attendance_incidents`, `employee_documents`, `compliance_notifications_sent`, `hr_document_requests`, `cartas_compromiso`, `actas_administrativas`, `resignation_packets`, `eod_logs`, `policy_acknowledgments`, `vacation_requests`, `holiday_requests`. Pattern: add `AND employee_id IN (SELECT id FROM public.employees WHERE organization_id = public.my_org_id())` to leadership and TL policies. Agent-self policies are already implicitly org-scoped via `my_employee_id()`.
64. `20260427900001_mt_phase5_org_employee_prefix.sql` — **Multi-tenancy Phase 5** (PR #85, 2026-04-27). Adds `organizations.employee_id_prefix text NOT NULL DEFAULT 'JOI' CHECK(^[A-Z0-9]{2,10}$)`. Updates `assign_employee_id()` trigger to look up the prefix from `organizations` at insert time instead of hardcoding `'JOI-'`. JOI org keeps `JOI-XXXX`; new orgs get their own prefix (e.g. `ACME-0001`). Backfills JOI org explicitly. Paired with `provision-org` edge function which accepts `employeeIdPrefix` in the POST body.

63. `20260427800001_mt_phase4_harden_helper_functions.sql` — **Multi-tenancy Phase 4** (2026-04-27). Adds `AND organization_id = public.my_org_id()` guards to all 6 SECURITY DEFINER helpers that read from `employees` or `campaigns`: `is_leadership()`, `is_team_lead()`, `my_tl_campaign_ids()`, `my_team_member_ids()`, `tl_employee_on_my_team()`, `my_client_campaign_ids()`. The four identity helpers (`my_org_id`, `my_employee_id`, `my_client_id`, `is_client`) only read `user_profiles` by `auth.uid()` and remain unchanged. All applied via `CREATE OR REPLACE` — no DROP needed.

62. `20260427700001_mt_phase3b_campaign_fk_and_org_roots.sql` — **Multi-tenancy Phase 3b** (PR #83, 2026-04-27). Two-part migration. Part 1 (RLS-only, 7 tables): `eod_digest_log`, `shift_settings`, `campaign_kpi_config`, `campaign_eod_recipients`, `campaign_eod_tl_notes`, `invoices`, `invoice_lines` — all scoped via `campaign_id IN (SELECT id FROM public.campaigns WHERE organization_id = public.my_org_id())`. Part 2 (schema + RLS, 4 tables): `payroll_periods`, `departments`, `policy_documents`, `company_holidays` — each gets `organization_id uuid NOT NULL REFERENCES organizations(id)`, backfilled to JOI, and two org-scoped RLS policies. `policy_documents` preserves the full complex multi-EXISTS USING clause. `company_holidays` preserves `auth.role() = 'authenticated'` check. Schema cache reloaded via NOTIFY pgrst.

65. `20260519000001_payroll_phase1_employees.sql` — **Payroll Phase 1** (2026-05-19). Adds 5 payroll rate columns to `employees`: `weekly_base_salary`, `daily_salary`, `overtime_day_pay`, `sunday_bonus_amount`, `vacation_premium_pct` (with `CHECK >= 0.25` per LFT Art. 80). Backfills `weekly_base_salary = monthly / 4` and `daily_salary = daily_discount_rate` for all seeded employees. Adds index `(department_id, shift_type, campaign_id)` for Phase 4 bulk rate editor.

66. `20260519000002_payroll_phase1_new_tables.sql` — **Payroll Phase 1** (2026-05-19). Three schema changes: (a) ALTERs existing `mexican_holidays` to add `name_es`, `name_en`, `type CHECK('LFT_OFICIAL','EMPRESA','OPCIONAL')`, `pays_premium boolean`; (b) creates `payroll_archive` (read-only import of Joe's historical Sheets data, leadership SELECT, no write policies, `CHECK(status='PAID')`); (c) creates `payroll_audit_log` (append-only, immutability trigger, org-scoped RLS). All three have RLS enabled.

67. `20260519000003_payroll_phase1_rework.sql` — **Payroll Phase 1 — DESTRUCTIVE, D approved 2026-05-19.** DROPs old `payroll_records` (0 rows) and `payroll_periods` (3 scaffold rows) and recreates both with the bi-monthly PP1/PP2 format matching Joe's `payPeriodCode_()` output. Also creates `payroll_weeks` (FK → payroll_periods, bridge between periods and employee ledger rows). All three have RLS + org scope. Two triggers on `payroll_records`: updated_at auto-stamp and PAID-lock (blocks UPDATE on PAID rows).

68. `20260519000004_payroll_phase1_seed_holidays.sql` — **Payroll Phase 1** (2026-05-19). Seeds (upserts) 7 LFT Art. 74 holidays for 2026 and 7 for 2027 into `mexican_holidays`. Moving-Monday dates computed per 2006 LFT reform. All `pays_premium = true`. Uses `ON CONFLICT (date) DO UPDATE` to fill new columns on existing 2026 rows.

69. `payroll_phase2_calc_engine` (applied 2026-05-19, no local file) — **Payroll Phase 2**. `_calc_pay_components(employees, payroll_records)→payroll_records` pure function ports Joe's calcAgentPay_ formula. `pay_calc_record(record_id)` SECURITY DEFINER RPC calls it. `trg_payroll_records_recalc` BEFORE INSERT/UPDATE trigger auto-fires so Phase 3 inserts get calculated columns automatically. Acceptance test: Javier's record ($73,987.50 total) confirmed matching Joe's Sheet.

70. `20260520000001_payroll_phase3_auto_derive.sql` (applied 2026-05-20) — **Payroll Phase 3**. Four functions: `_scheduled_days_for_shift` (DOW map, IMMUTABLE), `_derive_inputs_for_employee_week` (pure STABLE read, no auth required), `pay_derive_week` (SECURITY DEFINER driver — inserts missing records for all active employees in a week), `pay_redrive_week` (SECURITY DEFINER re-derive with diff + manual-override protection). Decisions D1–D6 locked; see `PAYROLL_DECISIONS.md`. 12 tests (T3.1–T3.12) all passed 2026-05-20.

One-off fix files (run once, not migrations):
- `supabase/fix_stale_timeclock_row.sql` — preview + delete stray same-minute clock-in/out rows caused by the pre-fix UTC date bug. Run when cleaning up before testing the timeclock on Apr 14, 2026.
- `supabase/fix_owner_and_test_account.sql` — corrects D's test account back to agent and tags the real owner. Run this AFTER creating the diomedes.sandoval@justoutsource.it auth user.
- `supabase/seed_test_employee_daniel.sql` — creates the Daniel Sandoval test employee linked to sandoval.028@gmail.com
- `supabase/seed_shift_settings_defaults.sql` — default shifts for Big Think, HFB, Torro/Scoop
- `supabase/seed_shift_settings_sloc.sql` — SLOC Weekday + Weekend shifts

## Dev seed — JOI-specific data

Files in `supabase/dev-seed/` that contain D's real employee and salary data. These are **not** schema migrations and must **not** run on white-label deployments. The data is already present in the live JOI database — only run these when bootstrapping a fresh JOI-specific instance.

- `01_seed_mock_dashboard.sql` — 7 mock agents for the DEV_MOCK_TORRO_SLOC campaign. Run for local dev; tear down with `02_teardown_mock_dashboard.sql` before launch.
- `02_teardown_mock_dashboard.sql` — removes the mock agents seeded above.
- `03_joi_employees.sql` — seeds 53 real employees (Torro, Big Think Capital, HFB, Scoop) with their EMP-001–EMP-053 IDs. Contains real names — do NOT commit to a white-label repo or run on a shared staging DB.
- `04_joi_salaries.sql` — sets monthly base salary, KPI bonus, and daily discount rate for each employee per D's payroll structure. Run after `03_joi_employees.sql`.

## What's built

**Core platform:**
- Authentication with role-based sidebar (three menus: leadership / team_lead / agent)
- Dashboard (leadership)
- Employee management page with Title + Reports To fields on the Add form
- Break-aware timeclock (60min unpaid lunch, 2x 15min paid breaks)
- Auto clock-out at scheduled shift end via pg_cron
- Employee Home page (what agents land on — stat cards, weekly hours chart, Today panel)
- Time Off requests
- Payroll history + invoicing
- Shift Settings admin UI (leadership + team_leads); per-campaign, confirmation prompt on time edits, audit log trigger logging every change
- Minutes Late This Week tracking; clock turns red past grace period
- Modern Trustee design (navy + orange #FFA700, Manrope font)

**HR suite (2026-04-19/20):**
- **Agent compliance profile** — Mexican tax fields (CURP, RFC, address, phone, bank CLABE) on every profile. Leadership edits; agents view read-only.
- **Required documents** — admin-managed catalog at `/settings/document-types`; HR + agents upload; HR approves/rejects with reason; re-upload after rejection; read-only status for TLs on their team's profiles.
- **Clock-in compliance lock** — per-employee grace window. After grace expires, missing approved docs disable the clock-in button with a red banner. In-grace status shows as amber banner. HR sets/extends grace per agent on profile.
- **Compliance email notifications** (in DRY_RUN until `APP_URL` set + `DRY_RUN=false`) — Gmail SMTP edge function sends rejection emails event-driven, plus 7/3/1-day reminders and lock-day email via pg_cron at 9 AM CDMX. Dedupe table prevents repeats.
- **Notes + verbal warnings log** (B1) — TL/leadership log entries on `agent_coaching_notes`. Two entry types (internal note, verbal warning). HR-only visibility toggle per entry exposes it to the agent. Agents see their visible entries in an "HR Log" card on their home.
- **Attendance incidents** (B4) — TL/leadership categorize absences with reason (late, sick, no_call_no_show, medical_leave, personal, bereavement, other) + optional supporting doc upload to `attendance-docs` bucket. Agents see their own history + supporting docs.
- **TL restricted agent profile access** — TLs can navigate from `/asistencia` to agent profiles on their own team. See: basic info, required docs status (no file view, no actions), notes/warnings card, attendance incidents. Hidden: tax info, salary, compliance enforcement, biweekly breakdown.
- **Policy catalog** (C1) — `/settings/policies` admin for leadership. Create policies with campaign + role scope toggles. Multiple versions per policy (atomic server-side version numbering via `insert_policy_version` RPC). Per-employee ack status card on profile.
- **Agent-facing policy acknowledgments** (C2) — `/policies` page for every role. Lists applicable policies with "View document" + "I've read and agree". Home page badge counts unacknowledged policies.
- **B2/B3 cartas + actas** — **COMPLETE** (PRs #42–#49). Full end-to-end flow: TL files request → HR drafts in split-view editor → generates PDF via jspdf → prints + collects signatures → uploads signed scan → request transitions to fulfilled. Agents see signed docs on EmployeeHome ("Mis documentos firmados" card). TLs see fulfilled docs on team agent profiles. All file access via `get-hr-document-signed-url` edge function (table-level RLS gates access, service_role issues signed URLs).
- **Feature E client portal Phase E1** — **COMPLETE** (PR #64). Schema-only: `'client'` role, `user_profiles.client_id` FK, CHECK invariant, updated role-guard trigger, three SECURITY DEFINER helpers (`is_client`, `my_client_id`, `my_client_campaign_ids`), `employees_client_view` + `eod_logs_client_view`, scoped RLS on clients/campaigns/campaign_kpi_config. Phase E2 (dashboard UI) is next. Test client seed + types regen happen post-merge.
- **Feature F resignation packet** — **COMPLETE** (PRs #51–#52). Full renuncia + finiquito + encuesta de salida flow. 4-page PDF via jspdf: resignation letter, itemized finiquito with LFT calculations (aguinaldo/vacaciones/prima), blank exit survey with Likert table + open questions + causa checkboxes. TL files `request_type='renuncia'`, HR drafts in split-view editor with auto-compute finiquito calculator, prints/signs/scans. All existing B2/B3 infrastructure (queue, editor, PDF gen, signed-scan upload, signed-URL edge function) extended for the third doc type.
- **Multi-tenancy Phases 1–5** — **COMPLETE** (PRs #80–#85, 2026-04-27). Full shared-DB org isolation. 8 tables carry `organization_id NOT NULL` directly; 22 leaf tables org-scoped via RLS subquery. All 6 SECURITY DEFINER helpers are org-aware. `provision-org` edge function + `/admin/provision-org` owner-only UI let you spin up a new customer org with a single form — creates the org, an employee record, and sends an Auth invite. Per-org employee ID prefix (`organizations.employee_id_prefix`) means each customer gets their own ID format (e.g. `ACME-0001`). An agent from Org A cannot read, write, or infer any data from Org B.
- **CI workflow** — `.github/workflows/supabase-deploy.yml` auto-deploys edge functions on push to main. Migration auto-apply is intentionally skipped (blocked on migration history cleanup); migrations currently applied manually via MCP.
- **Edge function config hardening** — **COMPLETE** (PR #79, 2026-04-27). Removed all hardcoded JOI-specific values from edge functions. `APP_DOMAIN`, `APP_URL`, and `REPLY_TO_EMAIL` are now read from project-level Supabase secrets. `APP_URL` throws on startup if unset (fail-loud). `.env.example` updated with all required vars. Secrets set in Supabase dashboard: `APP_DOMAIN=joi-payroll-hr.vercel.app`, `APP_URL=https://joi-payroll-hr.vercel.app`, `REPLY_TO_EMAIL=humanresources@justoutsource.it`.

- **Payroll Phase 1 — schema + seed** — **COMPLETE** (2026-05-19, migrations 65–68). Per-employee rate columns on `employees` (weekly_base_salary, daily_salary, overtime_day_pay, sunday_bonus_amount, vacation_premium_pct). New tables: `payroll_periods` (bi-monthly PP1/PP2), `payroll_weeks`, `payroll_records` (per-employee per-week ledger with PAID-lock trigger), `payroll_archive` (historical Joe Sheets data), `payroll_audit_log` (append-only). Mexican holidays table extended + seeded for 2026 and 2027 (14 LFT Art. 74 rows). All tables RLS-enabled + org-scoped. See `PAYROLL_PHASE1_DECISIONS.md` for all decision context.

- **Payroll Phase 2 — calc engine** — **COMPLETE** (2026-05-19, `payroll_phase2_calc_engine`). `pay_calc_record` SECURITY DEFINER RPC + `_calc_pay_components` helper port Joe's calcAgentPay_ formula: weekly_base, missed_deduction, kpi_bonus, overtime_pay, sunday_pay, vacation_pay, holiday_pay → total_pay. BEFORE INSERT/UPDATE trigger `trg_payroll_records_recalc` on `payroll_records` calls `_calc_pay_components` automatically so Phase 3 inserts get calc columns for free.

- **Payroll Phase 4a — core week view UI** — **COMPLETE** (2026-05-20). New files: `src/lib/formatCurrency.ts` (MXN formatter), `src/hooks/usePayroll.ts` (fresh TanStack Query hooks — do not edit `useSupabasePayroll.ts`), `src/pages/admin/Payroll.tsx` (landing page), `src/pages/admin/PayrollWeek.tsx` (week table + inline editing). Routes `/admin/payroll` and `/admin/payroll/week/:weekId` added under `RequireLeadership`. Sidebar entry "Payroll" added after "Employees" (replaces old "Payroll Run" entry; old `/payroll-run` still accessible by URL until Phase 4c). Re-derive button is a stub (dialog explains Phase 4c). No new migrations. See `PAYROLL_DECISIONS.md` UI-D1–D8.

- **Payroll Phase 3 — auto-derive** — **COMPLETE** (2026-05-20, `payroll_phase3_auto_derive`). Four functions: `_scheduled_days_for_shift(text)→int[]`, `_derive_inputs_for_employee_week(uuid,date,date)→jsonb`, `pay_derive_week(uuid)→jsonb`, `pay_redrive_week(uuid,boolean)→jsonb`. Reads `time_clock` + `mexican_holidays` and auto-populates `missed_days`, `overtime_days`, `sundays_worked`, `holiday_days`, `partial_week_days` on new `payroll_records` rows. Hard rules: never overwrites existing rows; re-derive requires `p_confirm=true`; manually-overridden fields survive re-derive; PAID rows are immutable. Snapshot in `auto_derived` jsonb stores actual written values for override detection. See `PAYROLL_DECISIONS.md` for D1–D6.

- **Payroll Phase 4b SIMPLIFICATION** — **APPLIED** (2026-05-20, migration `payroll_phase4b_simplify_calc`). Collapsed the 8-rate-field model to derive everything from `employees.monthly_base_salary`. Per D's mental model: monthly is the source of truth (set on employee profile), the calc engine computes daily = monthly/30 (LFT convention) and weekly = monthly/4 live. Sunday pay = `sundays_worked × daily × 0.25` (LFT Art. 79). Holiday pay = `holiday_days × daily × 2` (LFT Art. 75). Overtime pay = 0 (handled via `extra_bonus` instead). Vacation pay = 0 (deferred to new-entity LFT compliance work). Added `payroll_records.custom_deduction numeric(12,2)` for manager-entered extra deductions (partial-day misses, advances, fines). Recalc trigger updated to watch custom_deduction. Stored rate fields (weekly_base_salary / daily_salary / daily_discount_rate / overtime_day_pay / sunday_bonus_amount / vacation_premium_pct) stay in DB but are no longer read by calc — DB column drop deferred to Phase 4c. Rates Editor UI collapsed to Monthly (read-only) + KPI Bonus (editable) + derived display (Wk/Day/Sun-per-day) + red "Missing rate" badge for monthly=0. previewPay() and previewTotalPay() TypeScript helpers updated to mirror new math.

- **Payroll Phase 4b — supporting screens** — **COMPLETE** (2026-05-20). Four new pages all under `RequireLeadership`:
  - `/admin/payroll/rates` (`src/pages/admin/PayrollRates.tsx`) — bulk pay-rate editor. Filter by campaign/department/shift + search. Inline cell edit (Enter saves, Esc cancels). Multi-select + "Apply to selected" dialog for bulk raises. CHECK constraint on `vacation_premium_pct ≥ 0.25` (LFT Art. 80) surfaced as inline validation. Per-row "recompute weekly = monthly/4" helper button.
  - `/admin/payroll/agent/:id` (`src/pages/admin/PayrollAgent.tsx`) — per-agent breakdown. YTD totals (current year), 4 rate cards at top, then sections grouped by pay period (most recent first) with all input + calc breakdowns per week. Click a week row to jump to `/admin/payroll/week/:weekId`.
  - `/admin/payroll/holidays` (`src/pages/admin/PayrollHolidays.tsx`) — read-only LFT Article 74 calendar. Year selector (current ± 2), type filter (LFT_OFICIAL / EMPRESA / OPCIONAL). Reads `mexican_holidays`. Add/edit forms deferred.
  - `/admin/payroll/periods` (`src/pages/admin/PayrollPeriods.tsx`) — read-only historical browse. Status filter, year filter. Shows period_code, range, status, week count, agent count, grand total, locked_at. Click navigates to landing.
  - New hooks added to `src/hooks/usePayroll.ts`: `useRateRoster`, `useUpdateEmployeeRates`, `useBulkApplyRate`, `useAgentPayHistory`, `useEmployeeForPayroll`, `useMexicanHolidays`, `useAllPeriodsWithSummaries`. New types: `RateRosterRow`, `EditableRateField`, `AgentHistoryRow`, `MexicanHoliday`, `PeriodWithSummary`.
  - Landing page `Payroll.tsx` updated with quick-link cards to Rates / Holidays / Periods.
  - No new migrations.
  - Decisions (defaulted from Phase 4b prompt, D rubber-stamped 2026-05-20): bulk-edit yes, current-employees-only yes, holidays read-only in 4b yes, periods read-only browse yes.

## What's left

**Known blockers:**

- ~~**Feature B2/B3 — Carta de compromiso + acta administrativa.**~~ ✅ COMPLETE 2026-04-22 (PRs #42–#49). All 5 phases shipped.
- ~~**A3b real email delivery.**~~ ✅ Done 2026-04-27. `DRY_RUN_EOD=false` and `DRY_RUN_COMPLIANCE=false` both set in Supabase dashboard secrets. Cron is healthy (200s confirmed). Emails are live.
- ~~**Multi-tenancy Phase 4 — SECURITY DEFINER helper hardening.**~~ ✅ COMPLETE 2026-04-27. All 6 helpers (`is_leadership`, `is_team_lead`, `my_tl_campaign_ids`, `my_team_member_ids`, `tl_employee_on_my_team`, `my_client_campaign_ids`) now carry an explicit org guard.
- ~~**Multi-tenancy Phase 5 — Org provisioning UI.**~~ ✅ COMPLETE 2026-04-27 (PR #85). `provision-org` edge function + `/admin/provision-org` owner-only page. Per-org employee ID prefix stored on `organizations.employee_id_prefix`; `assign_employee_id()` trigger reads it at insert time so new orgs get their own prefix (e.g. `ACME-0001`) instead of `JOI-XXXX`.
- ~~**Agent smoke-test nav fixes.**~~ ✅ COMPLETE 2026-04-27 (PR #86, merged 2026-05-04). Dashboard link added as first item in agent + TL sidebar. `/solicitudes` route restored in App.tsx. "Time Off Requests" nav item re-added to agent sidebar.
- ~~**Holiday request rules.**~~ ✅ COMPLETE 2026-04-27 (PR #87 merged 2026-05-04 + migration applied 2026-04-27). `company_holidays.requires_request` column added — Christmas and New Year's set to `false` (mandatory days off, no request button shown). Next-year holidays show a disabled button with "Requests open Dec 2" until within 30 days of Jan 1 of that year.
- ~~**Holiday UUID display fix.**~~ ✅ COMPLETE (PR #84, merged 2026-05-04). `employees_no_pay` returning no match now shows "Unknown employee" instead of raw UUID. Same fix for `campaignName` in `enrichHolidayRequests`.
- ~~**Cron 401 fix.**~~ ✅ COMPLETE 2026-04-27. `send-eod-digest`, `compliance-notifications`, and `holiday-notifications` all had `verify_jwt = false` already set in the dashboard but `CRON_SECRET` env var was mismatched. Set correct value (`joi-eod-cron-2026-04-19-xK9mP2vL`) on all three. Crons now return 200. Added `verify_jwt = false` to `supabase/config.toml` so the setting survives future deploys.

**Audit followups — ALL SHIPPED 2026-04-21 (PRs #32, #37–#41). See `docs/hr-roadmap.md` § Followups for details.**

1. ~~Harden RLS on `employees` sensitive fields.~~ ✅ PR #32. Agents SELECT own only, leadership UPDATE only. `employees_no_pay` view switched to `security_invoker=off` with role-scoped WHERE.
2. ~~Server-side clock-in lock.~~ ✅ PR #37. `enforce_clock_in_compliance` BEFORE INSERT trigger on `time_clock`. P0001 surfaced to UI.
3. ~~Re-rejection email dedupe.~~ ✅ PR #38. `clear_compliance_dedupe_on_rerejection` trigger deletes the dedupe row on status transitions away from `'rejected'`.
4. ~~taxForm sync stale edits + `employee_documents` orphan storage.~~ ✅ PRs #40, #41. `useEmployeeDocuments.useUploadDocument` deletes orphan Storage file post-UPSERT (best-effort). `EmpleadoPerfil` taxForm uses a `useRef` dirty flag to skip server→state sync during in-flight edits.
5. ~~Grace-change dedupe clear.~~ ✅ PR #39. `clear_compliance_dedupe_on_grace_change` trigger clears reminder_*/lock rows when `compliance_grace_until` changes. Does NOT clear rejection rows.

**Deferred (flagged but not broken or low-urgency):**

- 3 C1 followups: usePolicies fetch-all-versions (scale), orphan policy files on version bump (intentional but no cleanup job), outdated-ack UX distinction.
- Refactor: EmpleadoPerfil.tsx is 1289 lines with 7+ card components — extract to `src/components/employee-profile/`.
- Refactor: shared "list + add-entry" card pattern across B1/B4/C1 — extract `EntryListCard`.
- Toast system consistency (sonner vs useToast) — pre-existing repo-wide.

**Smaller/cosmetic from earlier:**

- **Audit log viewer UI** — small page showing recent shift changes (trigger is already logging to `shift_settings_audit`). ~30min of work.
- **Team Coverage report** — summary of who's working which campaign per day.
- **Modern Trustee polish** — Dashboard final pass, Auth editorial card.
- **Delete `src/pages/EODFormBuilder.tsx`** — stubbed since 2026-04-14, safe to remove.

**TL-per-campaign + required email (2026-04-17):**
- **`campaigns.team_lead_id`** — TL is a property of the campaign, not the employee. DB triggers auto-sync `employees.reports_to` when campaign_id or team_lead_id changes. No manual `reports_to` writes in app code.
- **CampaignDetail** — TL dropdown in campaign header. Saving cascades `reports_to` to all agents on that campaign. Toast shows count.
- **Add Employee form** — email required, Reports To dropdown removed (auto-derived). Edge function `create-employee` handles atomic auth user + employee + user_profiles creation with invite email.
- **EmpleadoPerfil** — supervisor shown read-only (derived from campaign TL).
- **ShiftSettings** — TLs now scoped to their own campaigns only.
- **TL Home time-off cards** — fixed Invalid Date + missing employee names.
- **Attendance tabs** — scoped to campaigns (not titles), TLs see only their campaigns.
- **Migration:** `20260417000001_tl_per_campaign.sql` — team_lead_id column, sync triggers, backfill 5 known TLs, email column on employees.
- **Nelly** needs an email + invite — manual step for D (no email was assigned).
- **Employees still with NULL reports_to**: only those on campaigns without a TL set (Data Entry, Decline, Designer, SEO Specialist, Sales CS, Tech Support, Underwriting). D can set TLs via CampaignDetail UI.

**TL Dashboard (2026-04-16):**
- **TeamLeadHome page** (`src/pages/TeamLeadHome.tsx`) — proper home screen for Team Leads, replacing the `/asistencia` redirect stopgap.
- 4 cards: Today's Attendance (live clock-in status per team member), Pending Time Off (approve/deny), EOD Performance This Week (metric aggregation with top/bottom badges), Underperformer Alerts (missed EOD + frequent lates).
- 5 hooks in `src/hooks/useTeamLead.ts`: `useTeamRoster`, `useTodayTimeclockStatus`, `usePendingTimeOffForTeam`, `useTeamEODThisWeek`, `useUnderperformerAlerts`. All filter by `reports_to` for defense in depth.
- Approve/Deny writes `status`, `reviewed_by`, `reviewed_at` to `time_off_requests`.
- Zero pay fields — verified by grep.
- `RoleHome` now routes: leadership → Dashboard, team_lead → TeamLeadHome, agent → EmployeeHome.
- Shift defaults already Mon-Fri in both CampaignDetail and ShiftSettings. No campaigns with all-7-day shifts found.

**Recently shipped (2026-04-17 — RLS hardening + follow-ups):**
- **RLS policy rewrite applied.** Migration `20260416000001_rls_hardening.sql` replaced 13 tables' blanket "allow authenticated" policies with role-scoped ones matching the 5-tier model. Applied live to Supabase project `jpaihltkrohdqkqlbqkf`. Rollback at `20260416000002_rls_hardening_rollback.sql`. Full audit notes in `docs/security/rls-audit-2026-04-16.md`.
- **`employees_no_pay` view created** with `WITH (security_invoker = on)` so RLS runs under the caller's privileges instead of the view owner's. Team Lead hooks (`useTeamLead.ts`) now read from this view so salary columns can't leak even with `select("*")`.
- **`guard_user_profile_role()` BEFORE UPDATE trigger on `user_profiles`** blocks direct role escalation. Defense in depth — RLS already has no UPDATE policy on that table for non-leadership users.
- **PostgREST FK disambiguation.** `employees?select=*,campaigns(...)` was returning HTTP 300 (PGRST201) because `campaigns` has two FKs to `employees` (`employees.campaign_id` and `campaigns.team_lead_id`). Fixed in `src/hooks/useSupabasePayroll.ts`, `src/hooks/usePayrollComputed.ts`, `src/pages/TeamLeadHome.tsx` by writing the embed as `campaigns!employees_campaign_id_fkey(...)`.
- **Schema name fix.** Attendance page was querying `time_clock.minutes_late` but the actual column is `late_minutes`. Renamed all 5 references in `src/pages/Attendance.tsx`.
- **Late minutes verbose formatting.** New helper `src/lib/formatDuration.ts` → `formatMinutesVerbose()` renders `2 hours 3 minutes` (singular/plural correct, skips zero components, returns empty string for 0/null). Applied in `Attendance.tsx`, `Timeclock.tsx` (3 spots), `EmployeeHome.tsx`. `ShiftSettings.tsx` grace-period config left as-is — different UX context.
- **Smoke-tested.** SQL role simulation 6/6 PASS for owner/TL/agent. Owner browser click-through clean on main after the embed + schema fixes landed. Agent browser test deferred to when a real test account is available.

**Campaign owns shift (2026-04-16):**
- **Shift is a campaign property, not an employee property.** One campaign = one shift pattern. `shift_settings` table is the single source of truth. `employees.shift_type` is ignored by the app (column left in DB for rollback safety, will be dropped in a follow-up).
- Removed all reads/writes of `employees.shift_type` from: `useSupabasePayroll.ts` (mapEmployee, add/update/bulk mutations, history records), `Empleados.tsx` (form + table), `EmpleadoPerfil.tsx` (header), `EmployeeHome.tsx` (display), `useInvoices.ts` (agent query).
- Removed `Turno` type from `payroll.ts` and all consumers.
- `CampaignDetail.tsx` rewritten as full campaign admin screen: campaign info editing, shift settings editing (days + times + grace), KPI/EOD metrics management, assigned agents roster with remove, and assign-existing-employee dropdown.
- `usePayrollComputed.ts` already reads shift from `shift_settings.days_of_week` — no change needed.

**Bug sweep (2026-04-15):**
- **Bug 1 — TL attendance scoping:** Attendance.tsx now filters employees by `reports_to` for TLs. Leadership sees all. Nelly Sandoval seeded as reporting to sandoval801 test TL.
- **Bug 2 — TL salary leak on homepage:** `RoleHome` now routes TLs to `/asistencia` instead of Dashboard. TLs never hit the salary-exposing Dashboard.
- **Bug 3 — Shift dropdown mismatch:** EmpleadoPerfil shift dropdown was binding frontend Turno values against shift_settings names. Replaced with read-only campaign shift display.
- **Bug 4 — mapEmployee missing title/reportsTo:** `mapEmployee` in useSupabasePayroll.ts wasn't mapping `title` or `reports_to` from DB rows, breaking supervisor dropdown and title-based filtering.
- **Bug 5 — Route guards:** Added `<RequireLeadership>` to `/empleados`, `/historial`, `/facturas*`. Added `<RequireTeamLeadOrAbove>` to `/empleados/:id`, `/asistencia`, `/desempeno`. Agents can only access `/`, `/reloj`, `/eod`, `/solicitudes`, `/account`.

**Recently shipped (2026-04-15):**
- **Auto-generated employee IDs.** DB sequence + trigger (`trg_assign_employee_id`) auto-assigns `JOI-XXXX` format IDs on insert. Manual ID field stripped from Add Employee form. Migration: `20260415000001_auto_employee_id_and_holidays.sql`.
- **ClientCampaignPicker shared component** (`src/components/ClientCampaignPicker.tsx`). Cascading Client → Campaign dropdowns. Used in both Add Employee form and EmpleadoPerfil.
- **Add Employee form** now includes Client/Campaign assignment via the picker. Auto-generated ID shown in success toast.
- **Biweekly Adjustments card removed** from EmpleadoPerfil. Per-period adjustments (KPI, bonuses) now live on the Payroll Run screen. Profile keeps read-only Biweekly Breakdown.
- **`usePayrollComputed` hook** (`src/hooks/usePayrollComputed.ts`). Auto-derives days absent, sunday premium, holiday days worked, extra days worked from `time_clock` + `shift_settings` + `mexican_holidays` + approved `time_off_requests`.
- **Payroll Run page** (`/payroll-run`, leadership-only). Per-employee table with auto-computed columns (overridable via pencil popovers), manual KPI checkbox + bonus input, live net pay calculation. Saves to `payroll_records` with `overrides_json` tracking which fields were manually overridden.
- **Mexican holidays table** seeded with 2026 dates. `payroll_records.overrides_json` column added.

**Recently shipped (2026-04-14, schema refactor):**
- **Schema: clients vs campaigns split.** `clients` is now the billing entity (Torro, BTC, Scoop, HFB). `campaigns` is a child table (SLOC Weekday, MCA, Transfers, etc.). `employees.client_id` was renamed to `campaign_id` → FK to `campaigns(id)`. `invoices.client_id` stays on `clients(id)`. Migration: `20260414000003_split_clients_and_campaigns.sql`.
- Campaigns page rewritten as two-level: Client cards → expand to see campaigns. Full CRUD on both.
- CampaignDetail breadcrumb shows `Client › Campaign`.
- EmpleadoPerfil: cascading Client → Campaign dropdowns. Salary card gated on `isLeadership` (hidden from Team Leads).
- All employees mapped to correct campaigns per roster PDF. 7 inactive employees deactivated. 4 work-name renames applied (Jacob Miller, Hannia Lopez, Sofia Gonzalez, Mauro Gomez). 5 Team Leads confirmed.
- KPI config redistributed per campaign (credit-puller metrics on both SLOC campaigns, MCA/Sales Agent/Sales CS metrics split from parent).
- Shift settings reseeded for all 12 campaigns.

**Also shipped (2026-04-14):**
- EOD clock-out gate: agents can't clock out until they answer their campaign's KPI fields. The dialog lives in `src/components/ClockOutEODDialog.tsx` and is triggered from `Timeclock.tsx`. If a campaign has no active KPI fields configured, clock-out proceeds silently (no form).
- EOD Form Builder page removed — per-campaign KPI config is now on the Campaigns → [Campaign] page.
- `My EOD` sidebar item renamed to `My EOD History` and the page rewritten as a read-only list of the agent's past submissions.

## TL Dashboard — KPI Flags & Agent Breakdown (2026-04-17)

### What shipped

**Migrations:**
- `20260417000005_flag_threshold.sql` — adds `flag_threshold numeric(10,2)` to `campaign_kpi_config`. Separates the daily goal shown to agents (`min_target`) from the floor that fires the TL flag (`flag_threshold`). Both are nullable and independent.
- `20260417000006_flag_independent.sql` — adds `flag_independent boolean NOT NULL DEFAULT true` to `campaign_kpi_config`. When `false`, the field is tracked and displayed but will never trigger the flag on its own. Seeded `calls_made` to `false` — a high CP count overrides a low dial count.

**Flag logic (`src/hooks/useTeamLead.ts` — `useTeamEODThisWeek`):**
- `isBottomPerformer` fires when a tracked KPI's **daily average** drops below `flag_threshold`.
- Only fields with `flag_independent = true` are evaluated. `calls_made` (and any future effort-only metrics) won't raise a flag on their own.
- Null-safe: if an agent has zero submissions containing a field (e.g. field was added after their logs), the field is skipped entirely — no false positives from old data.
- Hook now returns `{ summaries, kpiFields }` (`TeamEODWeekResult`). `kpiFields` is an ordered array of `{ field_name, field_label }` from `campaign_kpi_config`, used for column headers.

**EOD Performance table (`src/pages/TeamLeadHome.tsx`):**
- Column headers now read from `kpiFields[i].field_label` (e.g. "Total Credit Pulls") instead of scraping raw keys from JSONB logs (which was showing "funded", "approvals", etc.).
- Removed the Submissions column — redundant once the agent breakdown is available.
- Agent name click toggles an inline breakdown row (`AgentBreakdownRow`) — no popup.
- `AgentBreakdownRow` shows This Week / Last 30 Days toggle, color-coded cells (green ≥ min_target, amber < target but > 0, red = 0), and agent notes per day.
- Flag icon (amber `Flag`) appears at the end of the row when `isBottomPerformer`. No badge text.
- Removed Underperformer Watch card entirely.

**Campaign Settings UI (`src/pages/CampaignDetail.tsx`):**
- Number KPI fields now show two separate inputs: **Daily Goal** (`min_target`, shown to agents in the EOD form) and **Flag Below** (`flag_threshold`, TL alert floor).
- When a flag threshold is set, a **"Triggers flag independently"** toggle appears. Off = this field won't raise a flag alone (useful for effort metrics like calls made).
- Metric card list shows `Flag < N (not independent)` when the toggle is off, so the config is visible without opening the edit dialog.

### What's next (TL dashboard)

- Agent-facing performance view — agents currently have no way to see their own history outside of EOD submission.
- EOD digest email — schedule + recipients are configurable but the edge function that sends the email hasn't been built yet.
- Payroll calculations — timeclock data exists but pay computation for agents hasn't been wired up.

---

## EOD Digest System — SHIPPED (2026-04-19)

**Status:** FULLY LIVE as of 2026-04-27. Edge function `send-eod-digest` is deployed via CI. All four paths live: cron daily (shift-end triggered), morning amend bundle, manual test-send, manual fire-now. TL dashboard with 5 widgets + coaching log is live. `DRY_RUN_EOD=false` — real emails sending. Add real recipients per campaign when ready to go live to clients.

---

### Original spec (for reference)

### What shipped to main

- **Migration `20260416000003_eod_digest_foundation.sql`** — tables `campaign_eod_recipients`, `campaign_eod_tl_notes`, columns `campaigns.eod_digest_cutoff_time`, `campaigns.eod_digest_timezone`. RLS 63 policies across 15 tables.
- **Migration `20260417000001_eod_digest_sending_infra.sql`** — column `campaigns.eod_reply_to_email` and table `eod_digest_log` (id, campaign_id, digest_date, digest_type check `'daily'|'late_bundle'`, sent_at, recipient_count, agent_submission_count, agent_missing_count, missing_agents jsonb, dry_run default true, smtp_message_id, error; unique `(campaign_id, digest_date, digest_type)`; index on `(campaign_id, digest_date DESC)`). RLS 65 policies across 16 tables.
- **Admin UI on `src/pages/CampaignDetail.tsx`** — EOD Digest Recipients card (CRUD + Active toggle + role-ranked sort) and Digest Schedule card (cutoff time + timezone with 5 US zone options).
- **TL Note card on `src/pages/TeamLeadHome.tsx`** — one card per campaign the TL leads, with cutoff badge, live progress counter (X of Y agents submitted today, 60s refetch + on focus), textarea with dirty-state Save, past-cutoff warning. New hooks in `src/hooks/useTeamLead.ts`: `useTLCampaigns`, `useTodaysTLNote`, `useSaveTLNote`, `useEODProgress`.
- **Dev seed under `supabase/dev-seed/`** — `01_seed_mock_dashboard.sql` creates mock campaign `DEV_MOCK_TORRO_SLOC` with 6 mock agents, 3 weeks of `time_clock` + `eod_logs`, 5 days of TL notes, 2 recipients. `02_teardown_mock_dashboard.sql` reverses it cleanly.

### Design decisions locked in

- **Delivery model:** daily digest at per-campaign cutoff. Late submissions ride in a separate "Late EOD for [date]" email the next morning. No per-submission emails.
- **Sender:** Gmail SMTP from `EOD@justoutsource.it` (D is setting up the mailbox + App Password, requires 2FA). Nodemailer in a Supabase edge function. `Reply-To` header is the per-campaign `campaigns.eod_reply_to_email` so replies route to the right human. All campaigns share one sender for v1.
- **Recipient visibility:** To-field (not BCC) for all recipients — matches Torro's culture where clients actively reply to motivate agents. Reply-All reaches everyone; single Reply routes to Reply-To only.
- **Recipient list per digest:** active entries in `campaign_eod_recipients` + all active agents on the campaign.
- **Double-send guard:** edge function writes a row to `eod_digest_log` before sending. Unique key `(campaign_id, digest_date, digest_type)` prevents pg_cron retries from spamming clients.
- **Dry-run mode:** v1 edge function runs in dry-run (writes `eod_digest_log` with `dry_run=true`, does not actually send). Real sending flipped via env var when ready.
- **Amend flow:** EODs editable. Edits before cutoff → reflected in digest. Edits after cutoff → ride in the next morning's late bundle with "(amended)" tag.

### Still to build (in order)

1. **Prompt 5b — Reply-To email input on Campaign Detail.** Add an optional email input to the EOD Digest Schedule card that persists to `campaigns.eod_reply_to_email`. Full prompt text in "Next CT prompt" below.
2. **Prompt 5c — Daily digest edge function (dry-run).** Supabase edge function `send-daily-eod-digest`. Triggered by pg_cron every 15 min. For each campaign whose `eod_digest_cutoff_time` just passed (in its `eod_digest_timezone`) and has no row in `eod_digest_log` for today's date + `digest_type='daily'`: pull today's `eod_logs`, today's TL note, active recipients, active agents. Format plain-text digest. Write `eod_digest_log` row with `dry_run=true`. No real send.
3. **Prompt 5d — Real Gmail SMTP + test button.** Enable real send behind env var. Add a manual "Send Test Digest" button on CampaignDetail that emails the signed-in user only (does not hit real recipients, does not write a real `eod_digest_log` row).
4. **Prompt 6 — Morning late-EOD bundle edge function.** Runs once at a configurable morning time. Finds EODs submitted after yesterday's cutoff, sends one "Late EOD" email, logs `digest_type='late_bundle'`.
5. **Prompt 7 — Missing-EOD submission flow for agents.** Handles the auto-clock-out edge case where agent didn't submit EOD. Surfaces an EOD entry point on EmployeeHome for past dates that are missing.
6. **Prompt 8 — Amend flow.** Edit UI for past EODs. Add `last_edited_at` and `edit_count` columns to `eod_logs`.
5. **Prompt 9 — TL dashboard diagnostic views.** Tier 1 (self-report baseline — works for every campaign): daily bars, 4-week sparklines, leaderboard, monthly heatmap, coaching log. Tier 2 (only when client shares data — e.g. Torro): per-agent conversion %, deal pipeline, reconciliation. Tier 2 degrades to "No client data feed for this campaign" for HFB/BTC.

### Next CT prompt — Prompt 5b (copy-paste into CT)

> **Task:** On `src/pages/CampaignDetail.tsx`, add a Reply-To email input to the **EOD Digest Schedule** card (the same card that has the cutoff time input and timezone Select).
>
> **Branch:** create `feature/eod-digest-reply-to-ui` off main.
>
> **Field spec:**
> - Label: "Reply-To Email"
> - Helper text: "When clients or managers hit Reply on the digest, responses go to this address. Leave blank to use the sender address."
> - Input type: email, optional (empty string → save as `null`)
> - Persists to `campaigns.eod_reply_to_email`
> - Validate: if not empty, must be a valid email shape. Inline error, block save until fixed or cleared.
> - Save pattern: same as existing cutoff/timezone fields (TanStack Query mutation, toast on success, invalidate the campaign query).
>
> **Field order in the card:** cutoff time, timezone, reply-to email.
>
> **Do not touch:** the recipients table, any other card, the edge function (doesn't exist yet), or any migration — the column `campaigns.eod_reply_to_email` already exists from migration `20260417000001_eod_digest_sending_infra.sql`.
>
> **When done:** push the branch, open for review, do not merge.

### Branch status (as of 2026-04-17)

- `main` — up to date, both EOD digest schema migrations merged, admin UI live, TL note card live, dev seed applied.
- `feature/eod-digest-schema`, `feature/eod-digest-admin-ui`, `feature/eod-tl-note-card`, `feature/dev-seed-mock-dashboard`, `feature/eod-digest-sending-infra`, `security/rls-audit` — all merged, safe to delete.

### Pre-deploy reminder

- Run `supabase/dev-seed/02_teardown_mock_dashboard.sql` to remove mock data under `DEV_MOCK_TORRO_SLOC` before public launch.
- Confirm `EOD@justoutsource.it` has 2FA enabled and a Gmail App Password generated. App Password goes in Supabase edge function env vars — never `.env.example`, never the repo.

### Parked HR backlog — ALL SHIPPED 2026-04-19/20

Both items from this section are now live. See the **HR Suite** in "What's built" above. Full history + open questions tracked in `docs/hr-roadmap.md`.

## HR Suite — SHIPPED (2026-04-19/20)

Twelve PRs in two days, covering the full HR compliance + policy lifecycle.

### Feature A — Agent compliance profile (PRs #12–#16)

- **A1** — Personal & tax info card on profile: CURP, RFC, address, phone, bank CLABE. Leadership edits; agents see own read-only. Validation in UI (CURP 18-char pattern, RFC 13-char, CLABE 18-digit, phone 10-digit).
- **A2a** — `required_document_types` catalog. Admin at `/settings/document-types`. 4 seeded types (signed contract, INE, proof of address, RFC certificate). Soft-delete only.
- **A2b** — `employee_documents` table + `employee-documents` bucket + RLS. Required Documents card on `EmpleadoPerfil` lets HR upload, approve, reject (with reason), replace.
- **A2c** — agent self-upload. Agents can submit missing docs and re-upload rejected ones via My Documents card on home.
- **A3a** — `compliance_grace_until` per employee. Clock-in button replaced with red alert when locked. Red banner on agent home when locked, amber when in grace with missing docs. HR sets/extends grace per agent on profile.
- **A3b** — Compliance email notifications. Event-driven rejection emails + cron (9 AM CDMX) 7/3/1-day reminders + lock-day email via `compliance-notifications` Gmail SMTP edge function. Dedupe table prevents repeats. **DRY_RUN still on** — set `APP_URL` + flip to false to go live.

### Feature B — HR records on agents (PRs #22, #25)

- **B1** — Notes + verbal warnings log. Extended existing `agent_coaching_notes` with `entry_type` (note | verbal_warning) + `visible_to_agent` toggle + immutability (TL UPDATE/DELETE dropped). Card on `EmpleadoPerfil` for leadership (full) + TL (own team, no visibility toggle). Agent sees visible entries on home. TL Dashboard's "Agent Log" shows type badges.
- **B4** — Attendance incident categorization. `attendance_incidents` + `attendance-docs` bucket. 7 incident types. Supporting document upload (doctor's notes, etc.) scoped per-agent per-date (unique constraint + INSERT/UPDATE-on-conflict preserves `created_by` + `supporting_doc_path` on re-categorization). Agent sees history + own docs.
- **B2/B3 BLOCKED** — carta de compromiso + acta administrativa request flows wait on JOI sourcing legal templates.

### TL restricted agent profile access (PRs #23, #24)

- Agent names on Attendance page link to `/empleados/:id` for TLs.
- EmpleadoPerfil hides Personal & Tax Info, Salary, Compliance Enforcement, Biweekly Breakdown for non-leadership.
- Assignment card shows read-only campaign name for TLs.
- Required Documents card gets `readOnly` prop for TLs — status badges only, no file content, no actions. Storage RLS for TL doc viewing was added then dropped (defense-in-depth after D decided TL shouldn't see actual file contents).

### Feature C — Policy acknowledgments (PRs #26, #27)

- **C1** — `policy_documents`, `policy_document_versions`, `policy_acknowledgments` + `policy-documents` bucket. Campaign + role scope filters per policy. Admin UI at `/settings/policies` (create + versions + activate/deactivate + ack coverage). Per-agent ack status card on EmpleadoPerfil.
- **C2** — `/policies` page for every role. Home badge counts unacknowledged policies. Ack via UPSERT (idempotent). "Manage Policies" in sidebar for leadership, "My Policies" for everyone.

### CI + ops (PR #17, #18)

- `.github/workflows/supabase-deploy.yml` — auto-deploys edge functions on merge. Required secrets: `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`.
- `db push` step intentionally skipped — repo has a pre-existing filename collision at `20260417000001` (both `eod_digest_sending_infra.sql` and `tl_per_campaign.sql`) + migration-tracking drift. Migrations are currently applied manually via MCP after merge. Cleanup tracked in `docs/hr-roadmap.md` § Followups.

### Audit + fixes (PRs #28, #29, #30)

Two code audits run (`docs/audit-feature-a.md`, `docs/audit-post-b-c.md`). Findings resolved across three fix PRs:

- **PR #28** — B4 UPSERT safety. Replaced blanket `.upsert()` with try-INSERT / catch-23505 / UPDATE. Prevents `created_by` overwrite on re-categorize and `supporting_doc_path` null-clobber when re-categorizing without a new file.
- **PR #29** — C1 hardening. Versions SELECT RLS now inherits parent policy visibility (was open). Storage SELECT restricted to visible policies' folders. `useCreatePolicy` has try/catch orphan cleanup. New `insert_policy_version` RPC computes version numbers atomically server-side (was client-side race).
- **PR #30** — 9-item cleanup bundle: shared `sanitizeFilename` to `lib/documentUpload.ts`, 4 a11y fixes (labels, aria, autoFocus), defensive date rendering in MyPolicies, `Math.ceil` alignment in `useComplianceStatus`, type cleanup.

### Dev DB seed state (for smoke testing)

- 7 Torro dev agents (DEV_MOCK_TORRO_SLOC campaign) have fake-but-format-valid CURP/RFC/CLABE/phone/address via MCP seed. Other ~40 employees have empty tax info.
- Policy catalog + document_types catalog are pre-seeded (4 required doc types). No policies seeded — HR creates them.
- `attendance_incidents` and `policy_acknowledgments` tables are empty in dev.
- 45 real employees now have A1b fields populated from PDF backfill (2026-04-21). 12 real employees not in the PDF still have empty A1b fields (Andres, Antonio, Diomedes, Edgar, Javier N., Jhon, Luis V., Nelly, Paty, Teresita, 2× D Test TL clones) — D decides case-by-case.

## HR Suite — Hardening round 2 (2026-04-21)

Seven PRs shipped consolidating A1b, locking compliance server-side, and clearing the audit followups.

**A1b — Expanded employee record (PRs #33–#36):**
- PR #33: 10 new employee columns + `departments` catalog table + `/settings/departments` admin UI.
- PDF backfill (no PR, applied via MCP): 45 of 57 real employees populated from D's PDF.
- PR #34: display layer — `work_name` exposed through `employees_no_pay`, `getDisplayName()` helper, DD/MM/YY dates via `formatDateMX()`.
- PR #35: date sweep across 30+ sites in 12 files + Policies uploader display-name cleanup.
- PR #36: TL data layer — `useTeamLead` carries `work_name`, TeamLeadHome greeting + 4 display sites use `getDisplayName`. Fix commit 182680e added a missed select in `useUnderperformerTrend`.

**Data model decision:** `full_name` = legal name (used in cartas/actas when B2/B3 ships). `work_name` = short/preferred name (used everywhere in UI). All rosters and cards use `work_name ?? full_name`.

**Compliance triggers (PRs #37–#39):**
- PR #37 (A3a): `enforce_clock_in_compliance` BEFORE INSERT trigger on `time_clock`. Rejects inserts for employees past `compliance_grace_until` with missing/unapproved required docs. No leadership bypass.
- PR #38 (A3b): `clear_compliance_dedupe_on_rerejection` AFTER UPDATE trigger on `employee_documents`. Clears `compliance_notifications_sent` row when status transitions away from `'rejected'`. Fixes silent re-rejection email dedupe bug.
- PR #39 (old-B-05): `clear_compliance_dedupe_on_grace_change` AFTER UPDATE trigger on `employees`. Clears reminder_*/lock dedupe rows when `compliance_grace_until` changes. Preserves rejection rows.

All three triggers verified live via MCP against DEV_MOCK_TORRO_SLOC agents. Migrations recorded in `supabase_migrations.schema_migrations` per the manual-apply workflow.

**Application-code fixes (PRs #40–#41):**
- PR #40 (old-B-03): `useUploadDocument` fetches existing `file_path` before upload, deletes the orphan from the `employee-documents` bucket after UPSERT succeeds. Best-effort cleanup. Grep-audited: no other upload sites touch this bucket.
- PR #41 (old-B-02): `EmpleadoPerfil` taxForm uses a `useRef` dirty flag — the sync useEffect skips server→state updates while user has unsaved edits, resets on save success. All 15 A1b-expanded input handlers use the `setTaxFormDirty` wrapper.

## Key files to know

- `src/hooks/useAuth.tsx` — `AuthProvider` + `useAuth()` context. Title + permission booleans (`isLeadership`, `isTeamLead`, `isAgent`, strict matches like `isOwner`), plus `loading` flag for gating redirects
- `src/App.tsx` — wraps the tree in `<AuthProvider>` so all components share auth state
- `src/components/RequireRole.tsx` — `<RequireLeadership>`, `<RequireTeamLeadOrAbove>`, `<RequireOwner>` route wrappers that handle the loading guard automatically
- `src/components/AppSidebar.tsx` — three menus per title tier
- `src/pages/EmployeeHome.tsx` — what agents see on login
- `src/pages/Timeclock.tsx` — break-aware clock-in/out, red clock past grace
- `src/pages/ShiftSettings.tsx` — per-campaign shift hours; team_lead scoped to own campaign
- `src/pages/Empleados.tsx` — employee list + Add form (with Title + Reports To)
- `src/App.tsx` — routing + `RoleHome` wrapper
- `src/components/ClockOutEODDialog.tsx` — pre-clock-out EOD form; renders KPI fields per campaign and blocks clock-out until submitted
- `supabase/migrations/20260413140000_titles_and_reports_to.sql` — reference for the title model

## Development commands

```
npm run dev          # start dev server
npm run build        # production build
npm run lint         # eslint
npm run test         # vitest once
npm run test:watch   # vitest watch mode
npx tsc --noEmit     # type-check without emitting
```

## Known gotchas

- Supabase MCP is verified pointing at the JOI project `jpaihltkrohdqkqlbqkf`. If a fresh session reports a different project, re-verify before running any `apply_migration` or `execute_sql` calls.
- `.git/index.lock` can get stuck if a terminal is closed mid-commit. Fix: `rm -f .git/index.lock`.
- **PostgREST embed ambiguity.** Any table with more than one FK to the same related table will return HTTP 300 + PGRST201 on a bare `table(...)` embed. Write the FK explicitly, e.g. `campaigns!employees_campaign_id_fkey(name)`. Current known case: `employees` ↔ `campaigns`.
- **`time_clock` column is `late_minutes`**, not `minutes_late`. Easy transposition. Same for any new code touching the table.
- **Views on RLS-protected tables: pick one of two valid patterns.** Postgres defaults views to run with the view owner's privileges, which bypasses RLS. Two valid patterns in this codebase: (1) `WITH (security_invoker = on)` — the view respects the caller's RLS on the base table; (2) `WITH (security_invoker = off)` + a role-gated WHERE clause inside the view using SECURITY DEFINER helpers (`is_client()`, `my_org_id()`, etc.) — the WHERE clause IS the security boundary. `employees_no_pay`, `employees_client_view`, and `eod_logs_client_view` all use pattern (2) deliberately. **See the "Supabase Security Advisor warnings" section above before changing any of these.** If you add a brand new view, picking pattern (1) is safer and simpler unless you have a specific reason to bypass RLS.
- The `employees` table has `campaign_id` (FK to `campaigns`). The `clients` table is the billing parent. A client like Torro has multiple campaigns (SLOC Weekday, MCA, etc.). Invoices roll up at the client level; agents are assigned at the campaign level.
- shadcn Table uses `<TableHeader>` as the `<thead>` wrapper and `<TableHead>` as the `<th>` cell. Easy to swap by accident.
- `user_profiles.role` is auto-synced from `employees.title` by a trigger (`trg_sync_user_profile_role`). Don't write to `role` directly — update `title` and let the trigger handle it.
- Role-gated pages MUST use the `<RequireLeadership>` / `<RequireTeamLeadOrAbove>` / `<RequireOwner>` wrappers from `src/components/RequireRole.tsx`. Don't inline-guard with `<Navigate>` — the wrapper handles the loading race; rolling your own leads to the "flash redirect before profile loads" bug.
- **Never use `new Date().toISOString().split("T")[0]` for the `date` column of `time_clock` or `eod_logs`.** That's UTC date. For an agent in Mexico (UTC-6) clocking in at 6 PM local, UTC is already the next day — so the row gets stamped with tomorrow's date and breaks today's queries. Use `todayLocal()` from `src/lib/localDate.ts`. For display, use `parseLocalDate(dateStr)` so `2026-04-14` doesn't render as Apr 13 via UTC-midnight parsing.
