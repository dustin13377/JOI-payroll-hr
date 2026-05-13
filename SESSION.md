# Session Handoff

**Saved:** 2026-05-13T17:50:01-06:00
**Machine:** Diomedess-Mac-mini
**Branch:** main
**Last commit:** 34be89b refactor(edge-functions): decouple from auto-injected SUPABASE_ANON_KEY

## What we were doing

JOI production went live on `app.justoutsource.it` via Jacque's team (Vercel). Spent most of the day on go-live cleanup: Supabase URL/auth config, edge function secrets, an anon-key decoupling refactor so we're insulated from the legacy JWT key retirement (end of 2026), and started building the employee offboarding / rehire-check feature. The offboarding feature is partially built — DB migrations already applied to prod, frontend code committed in this handoff but untested in role-scoped views.

## Files in flight

Employee offboarding feature (H-series), bundled into this handoff commit:

- `src/components/TerminateEmployeeDialog.tsx` — new dialog: status (terminated/resigned/on_leave), reason, notes, Do-Not-Rehire toggle
- `src/components/employee-profile/EmploymentHistoryCard.tsx` — new card on agent profile showing employment_history rows
- `src/hooks/useEmploymentHistory.ts` — new hook reading employment_history
- `src/pages/Empleados.tsx` — ~621 line diff, big changes (add-employee flow now runs check_rehire RPC, list filters by employment_status)
- `src/pages/EmpleadoPerfil.tsx` — wire in TerminateEmployeeDialog + EmploymentHistoryCard
- `src/hooks/useAuth.tsx`, `src/hooks/useSupabasePayroll.ts`, `src/integrations/supabase/types.ts` — type regen + minor adjustments
- `src/components/ui/input.tsx`, `src/pages/Auth.tsx`, `src/pages/ResetPassword.tsx`, `public/favicon.ico` — incidental tweaks
- `supabase/migrations/20260513100001_h1_employee_offboarding_fields.sql` — already applied to prod
- `supabase/migrations/20260513110001_h2_employment_history.sql` — already applied to prod

## Decisions made this session

- Edge functions now read `APP_SUPABASE_KEY` first, fall back to auto-injected `SUPABASE_ANON_KEY`. Pattern documented in `docs/developer-handoff.md`. Affects `holiday-notifications`, `get-hr-document-signed-url`. `provision-org` had dead declaration, removed.
- Anon key rotation deferred to next week. Stage 1 (swap consumers to publishable key) is half-done — Vercel still uses legacy key, edge function code is ready but secret value points at publishable already. Don't click "Disable JWT-based API keys" until Vercel is swapped + smoke-tested.
- The 3 "Security Definer View" CRITICAL warnings from Supabase advisor are intentional, documented in `HANDOFF.md`. Do NOT flip `security_invoker = on`.
- Owner password (`diomedes.sandoval@justoutsource.it`) was reset to `test123` mid-day to unstick a login issue, then changed to a real password via in-app flow after go-live. Memory updated — owner is NOT a test123 account.
- "New Organization" sidebar nav is commented out (white-label feature parked).
- Offboarding feature: `employment_status` enum is source of truth; `is_active` mirrors it via trigger for back-compat. `employment_history` is append-only, leadership-read-only, writes via trigger only.

## Open todos

- [ ] Reply to Jaxon about (1) webhook sync vs hourly cron, (2) Vercel/fork ownership clarification, (3) env-var-as-secret confirmation. Draft is in chat history.
- [ ] Smoke test offboarding feature in prod: terminate a test agent, verify `employment_history` row appears, verify `check_rehire` warns when trying to re-add the same person.
- [ ] Smoke test offboarding in TL and agent role-scoped views (these have bitten us before — see `feedback_auth_loading_guard.md`).
- [ ] Verify `DRY_RUN_HOLIDAY` value in Supabase Edge Function secrets — may still be set to `true` and silently dropping holiday emails. See `project_dry_run_holiday_check.md` memory.
- [ ] Anon key rotation Stage 2: swap Vercel to publishable key (`sb_publishable_u4XONGCOC2lwDjS0k3cwAQ_n6ZkJbe8`), test, then disable legacy key. Wait until prod is stable for 24-48h (so do Wed/Thu next week at earliest).
- [ ] Resolve two-GitHub-accounts confusion: `sandoval-art` owns the repo, `sandoval028-ctrl` is the Mac's default. Caused push failures today. Pick one and stick with it.
- [ ] Resolve two-clones-of-repo problem: `~/JOI-payroll-hr` is a stale clean clone, `/Users/admin/Desktop/JOI/JOI Payroll and HR app` is the active one. Delete the stale one to prevent committing in the wrong place.

## Next step when you come back

Open `app.justoutsource.it` as owner, navigate to Empleados, click into an agent profile, and click the new Terminate button. Walk through the dialog. Confirm: (1) employee row updates with `employment_status = 'terminated'`, (2) a new row lands in `employment_history`, (3) the agent no longer appears in the active list, (4) re-adding an employee with the same CURP or name+DOB triggers a rehire-check warning. If any of those fail, that's the first thing to fix.

## Watch out for

- **Offboarding feature is shipped but untested.** Vercel will auto-deploy this push within ~1 hour (hourly fork-sync). Tomorrow morning, real users (Paty, TLs) may interact with it before you've smoke-tested. Be ready to roll back if something explodes — `git revert HEAD~1` will undo this commit cleanly (the edge-function commit before it is safe to keep).
- **The `Empleados.tsx` diff is 621 lines.** Worth eyeballing the diff once tomorrow in a calm headspace before users hit it.
- **`employment_history` RLS is leadership-only read.** If TL or agent views start showing employment history, that's an RLS leak — file it immediately.
- **The two-clones / two-accounts problems are still unresolved.** If you push from `~/JOI-payroll-hr` by mistake tomorrow, work will silently disappear.
- **Anon key Stage 2 is a HIGH-risk click.** The "Disable JWT-based API keys" button breaks everything still using the legacy key. Don't click it until Vercel is on the publishable key AND all 3 anon-key-reading edge functions are confirmed working on `APP_SUPABASE_KEY`.
