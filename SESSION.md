# Session Handoff

**Saved:** 2026-05-27T18:16:58+00:00
**Machine:** Diomedess-Mac-mini (work driven via Cowork session)
**Branch:** main
**Last commit before handoff:** `7c8243d` — security: close audit H-3 — server-side lateness via DB trigger

## What we were doing

Full-day security pass on the JOI app. Ran a fresh audit (`SECURITY_AND_DATALAYER_AUDIT.md`), then closed all Criticals + all Highs in one sitting (5 commits + 1 DB migration applied). Side-quests along the way: fixed an expired Supabase deploy token, corrected a stale `project_id` in `supabase/config.toml`, and got `sandoval-agent@gmail.com` set up on `sandoval801@gmail.com`'s test team so the HR notification flow could be smoke-tested end-to-end.

## Files in flight

These are uncommitted changes from earlier sessions — being bundled into this handoff commit because they were sitting in the working tree. They're **not** part of today's security work; review carefully before pushing further on top of them.

- `src/components/EditNameDialog.tsx` (new) — UI for editing employee names. Pairs with the migration below.
- `supabase/migrations/20260527100001_employee_name_changes_audit_and_rpc.sql` (new) — audit trail + RPC for the name-edit feature. **Migration has NOT been applied to the DB yet.** Apply via Supabase SQL editor or MCP when you wire the feature up.
- `src/hooks/useInvoices.ts` (modified) — invoice hook tweaks, in-progress.
- `src/pages/EmpleadoPerfil.tsx` (modified) — profile page tweaks, likely tied to the name-edit feature.
- `src/pages/FacturaDetalle.tsx` (modified) — invoice detail page tweaks, in-progress.
- `TIMECLOCK_CORRECTIONS_2026-05-18.sql` (new) — scratch notes from May 18 time-clock fix work.
- `TIMECLOCK_DIFF_2026-05-18.md` (new) — scratch notes from same.

The two `TIMECLOCK_*` files at the repo root look like scratch — consider deleting next pass, they don't belong in `main`.

## Decisions made this session

- **Audit-driven security cadence:** tackle by severity (Criticals → Highs → Mediums/Lows), one commit per finding, push immediately so each fix is independently revertible.
- **Multi-origin CORS pattern is now standard** for env-driven edge functions: `ALLOWED_ORIGIN` is comma-separated, the function echoes back the request's Origin only on allowlist match, falls back to the first entry as fail-closed, adds `Vary: Origin`. Adopted in `notify-hr-request-filed`, `create-employee`, `edit-time-clock`, `resend-invite`. `submit-eod-for-agent` still uses single-origin — upgrade later if desired.
- **`useUserProfile()` now exposes `organizationId`.** Future hooks that INSERT into multi-tenant tables should read it from there. Closes a whole class of "forgot organization_id" bugs.
- **Security-critical fields belong on the server.** H-3 fix moved `is_late` / `late_minutes` to a Postgres BEFORE trigger. Reuse this pattern for any field downstream payroll/HR processes trust.
- **`ALLOWED_ORIGIN` Supabase secret updated** to `https://app.justoutsource.it,http://localhost:8080` to unblock local dev. No prod loss — exact-origin match still enforced.
- **`DRY_RUN_HR_NOTIFICATIONS` flipped from `true` to `false`** — real emails now fire when a TL files an HR request. Verified working with sandoval801 → sandoval-agent test carta.

## Open todos

- [ ] **M-1** — `Auth.tsx` uses `window.location.origin` for password-reset redirect. Phishing risk if a Vercel preview deploy ever ends up in Supabase's redirect allowlist. Hardcode the prod URL or read from `VITE_PUBLIC_APP_URL`.
- [ ] **M-2** — `SystemUsers.tsx` does a 2-step create (`create-employee` then `UPDATE employees SET is_system_user = true`). If step 2 fails, you get a ghost system user. Fix by adding `is_system_user` to the `create-employee` body so it's atomic.
- [ ] **M-3** — orphan policy cleanup in `useCreatePolicy` is best-effort. Make it transactional via RPC, or run a nightly sweep.
- [ ] **L-1** — `useSupabasePayroll.useAddEmployee` / `useAddEmployeesBulk` insert directly into `employees` instead of going through the `create-employee` edge function. Route everything through one door.
- [ ] **L-2** — already addressed as part of C-2 fix; can be closed in the audit log.
- [ ] **L-3** — Supabase types file is stale (`feedback_supabase_types_stale`). Regenerate to catch future missing-column INSERTs at compile time.
- [ ] **Cross-campaign TL access helper gap** (surfaced today during the sandoval-agent debug, NOT in the original audit): `my_tl_campaign_ids()` only checks `campaigns.team_lead_id` — it does NOT UNION in `team_lead_campaigns`. Adrian/Javier/Deysi probably can't see all 3 Torro campaigns in their "My Team" view even though the cross-campaign feature is built for HR-request RLS. Verify by logging in as Adrian and checking team visibility across SLOC Weekday / SLOC Weekend / MCA.
- [ ] **Spot-check the H-3 trigger** with a real clock-in. Have sandoval-agent or sandoval801 clock in tomorrow morning, then query `SELECT clock_in, is_late, late_minutes FROM time_clock WHERE employee_id = … ORDER BY created_at DESC LIMIT 1;` — make sure values match what the trigger should compute given `shift_settings` + grace + Mexico_City timezone.

## Next step when you come back

Spot-check the H-3 trigger with a real clock-in (instructions in the last open todo above). If the timezone math is right, tackle the remaining audit items in parallel batches:

1. **M-1 + M-2 together** (both auth-flow related)
2. **M-3 + L-1 together** (both INSERT hygiene)
3. **L-3 standalone** (Supabase types regen — mechanical, touches every hook)

D wants these done in parallel tomorrow rather than serially.

## Watch out for

- **DRY_RUN_HR_NOTIFICATIONS is now `false` in prod.** Any HR request filed (carta, acta, renuncia) sends real emails to leadership. If you're testing, file against a sandbox employee or pre-warn leadership.
- **H-3 trigger uses hardcoded `America/Mexico_City`** timezone. Fine for now (all agents in Guadalajara), but if JOI expands outside central Mexico the trigger needs to read from a per-campaign timezone setting.
- **Uncommitted files in this handoff commit are in-progress feature work**, not part of today's security audit. The `20260527100001_employee_name_changes_audit_and_rpc.sql` migration has NOT been applied to the DB.
- **Supabase MCP access works from this Cowork session** (project `jpaihltkrohdqkqlbqkf` under `sandoval-art's Org`) — earlier today it didn't, only `sandoval028-ctrl` was visible. Future sessions may need re-authorization.
- **Two BEFORE triggers fire on `time_clock` INSERT in this order:** `enforce_clock_in_compliance_trigger` (existing) → `trg_time_clock_set_lateness` (new today). If you add a third, name it alphabetically after both, or test ordering explicitly.
- **GitHub Actions Node 20 deprecation warning** on every Supabase deploy run — not blocking, but bump `actions/checkout@v4` and `supabase/setup-cli@v1` to Node-24-compatible versions before June 2026.
- **`SECURITY_AND_DATALAYER_AUDIT.md` lives at repo root.** Don't lose it — it's the source of truth for what's open vs. closed.
