# Session Handoff

**Saved:** 2026-05-19T16:09:24+00:00
**Machine:** claude (Mac mini desktop, via Cowork)
**Branch:** main
**Last commit:** f0cedd0 feat(hr): add sidebar badge for pending time-off requests

## What we were doing

Closed out two leftover items from yesterday's security audit and got the 30-day review notification system live. Most of today's work was Supabase-side (secrets, DB migrations, edge function redeploys), not code-side — so the git diff is small but the runtime state is meaningfully different.

## Files in flight

- `docs/email-templates/supabase-invite-user.html` — being committed with this handoff
- `docs/email-templates/supabase-reset-password.html` — being committed with this handoff
- (CORS fix on 7 edge functions already shipped earlier today in commit `56f7a2b`)

## Decisions made this session

- **CORS fallback hardening (7 edge functions)** — changed `?? "*"` to `?? "https://app.justoutsource.it"` so functions fail closed if the `ALLOWED_ORIGIN` secret is ever missing. Files: `submit-eod-for-agent`, `notify-hr-request-filed`, `get-hr-document-signed-url`, `provision-org`, `review-notifications`, `compliance-notifications`, `holiday-notifications`. Committed (`56f7a2b`) and redeployed via Supabase MCP. All 7 ACTIVE with `verify_jwt: true` preserved. Closes audit Finding #5.
- **DRY_RUN_HOLIDAY flipped to `"false"`** — PTO/holiday notification emails now actually send instead of just logging. All 4 DRY_RUN flags (EOD, COMPLIANCE, HOLIDAY, REVIEW) are now off.
- **30-Day Review System went LIVE** — `DRY_RUN_REVIEW` flipped to `"false"`. First real fire will be 2026-05-25 at 9 AM CDMX for Angeles Elisa Vázquez Ramírez (hired 2026-05-18, SLOC Weekday, week-1 review). A scheduled task is set for 9:30 AM that day to auto-verify the logs + dedupe table.
- **Leadership emails set on `employees` table** — Diomedes Sandoval (owner, EMP JOI-001) → `diomedes@justoutsource.it`. Paty Rodriguez (admin, EMP-042) → `humanresources@justoutsource.it` (note plural "resources" — shared HR inbox). Both were NULL before. The escalation RPC requires `email IS NOT NULL`, so before today neither would have received escalations.
- **TL review routing expanded** — migrated `find_pending_tl_review_emails` to UNION campaign primary `team_lead_id` + `team_lead_campaigns` join table, plus added `tl.employment_status = 'active'` filter to skip ex-TLs. Migration name: `expand_tl_review_routing_to_all_assigned_tls`. Result: all 3 Torro TLs (Adrian, Javier, Deysi) get the digest when SLOC Weekday agents are due, not just the primary TL.
- **Paty's role confirmed as HR-equivalent** — `title = admin` already passes `is_leadership()`. No new "HR" tier needed. She is missing a login though (no `user_profiles` row, no `auth.users` row) — see open todos.
- **Audit hygiene leftovers (3 Mediums + 2 Lows) deferred** — not active exploits, not worth blocking product work. See `SECURITY_AUDIT_2026-05-18.md`.
- **Former Employees reconciliation deferred to manual** — D will scrub the active 58 list directly in the app rather than via SQL.

## Open todos

- [ ] **Monitor first live 30-day review fire on 2026-05-25** — scheduled task at 9:30 AM CDMX will auto-check logs + dedupe table and report back. No manual action needed unless it reports a failure.
- [ ] **Decide whether to invite Paty to log in.** She has admin role + email but no auth account. To invite, use the Add Employee flow's "resend invite" path or trigger `resend-invite` edge fn with her employee_id (`52822b91-b270-4793-9287-b7d41173d0e3`).
- [ ] **Data quality: 13 employees have `hire_date = NULL`.** The 30-day review trigger relies on `hire_date` to seed review rows — if any of these are actual new hires, their reviews won't get seeded. Worth a cleanup pass.
- [ ] **Data quality: 6 agents have `campaign_id = NULL`** — invisible to campaign-scoped views (EOD, payroll). EMP IDs: 104, 106, 108, 110, 052, 118. Names: Daniel Oswaldo Romero Perez, Federico Jasiel Salas Macias, Fernando Gutierrez Espinosa, José Andrés Hernández Arroyo, Oscar Andres Pedrazzini Herrera, Samantha Montero Gutierrez.
- [ ] **Former Employees manual reconciliation** (D taking offline)
- [ ] Eventually: audit Mediums #6 (provision-org rollback), #7 (policy_document_versions defense-in-depth), #8 (npm audit dev deps). Low priority.

## Next step when you come back

Pick a fresh thread — Torro pilot readiness is the obvious next one. The scheduled task on 2026-05-25 handles review-system verification automatically; you don't need to remember it.

## Watch out for

- **All 4 DRY_RUN flags are now `"false"`** — `DRY_RUN_EOD`, `DRY_RUN_COMPLIANCE`, `DRY_RUN_HOLIDAY`, `DRY_RUN_REVIEW`. Real emails fire from cron. To silence one, set it back to anything other than the literal string `"false"`.
- **You'll receive 2 escalation emails per missed review** — once to `diomedes@justoutsource.it` (owner record) and once to `sandoval.028@gmail.com` (HR Test admin record). Acceptable for now; clean up later by stripping the email from the HR Test record if it gets noisy.
- **Edge function CORS is strict now** — if you add a staging or preview domain that needs to hit edge functions from a browser, widen the `ALLOWED_ORIGIN` secret in Supabase. The code fallback only allows `https://app.justoutsource.it`.
- **DB changes from this session are NOT in `supabase/migrations/`** — the email UPDATEs and the `expand_tl_review_routing_to_all_assigned_tls` RPC migration are live on Supabase but there's no migration file in the repo. If you ever replay migrations from a fresh DB you'll lose them. Worth dumping current schema and committing tracked migrations at some point.
- **Edge function code in git matches what's deployed** — no drift between source and Supabase.
