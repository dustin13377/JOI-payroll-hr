# Session Handoff

**Saved:** 2026-05-25T12:40:19-06:00
**Machine:** Cowork sandbox (writing for D's main laptop / desktop)
**Branch:** main
**Last commit:** e008c06 session-handoff: client aliases for spiff CSV import, untested in browser

## What we were doing

Shipped three big interconnected pieces tonight: (1) clock-in history calendar on the employee profile, (2) a per-client US holiday system so SLOC/MCA agents aren't penalized on Memorial Day-type closures, and (3) campaign assignment history so when employees move clients mid-period the right client gets the invoice and the right client's holidays apply to payroll. All TypeScript clean, two synthetic SQL tests passed, calendar manually tested in browser by D.

## Files in flight

All committed together with SESSION.md.

**Modified:**
- `src/App.tsx` — added `/admin/payroll/client-holidays` route + import
- `src/hooks/useCampaigns.ts` — `useCampaigns()` now filters `is_active = true` by default, opt-in `includeInactive`
- `src/hooks/useInvoices.ts` — new `useAgentsForClientPeriod(clientId, weekStart, weekEnd)` hook + `AgentForClientPeriod` type; old `useAgentsByClient` kept for compat
- `src/integrations/supabase/types.ts` — patched in `client_holidays`, `employee_campaign_assignments`, `campaigns.is_active`
- `src/pages/EmpleadoPerfil.tsx` — Salary Config moved into Assignment card; wired Clock-in History card + Campaign History card; campaign-change picker now opens `ChangeCampaignDialog`; campaignShifts query now selects `grace_minutes`
- `src/pages/FacturaNueva.tsx` — uses new historical hook, auto-fills days_worked from punches, shows "Joined" / "Left" badges (in-app only, not on PDF), "select dates first" message
- `src/pages/admin/Payroll.tsx` — Client Holidays tile linking to new admin page
- `src/types/supabase.ts` — same patches as integrations/supabase/types.ts

**New:**
- `src/components/ChangeCampaignDialog.tsx` — effective date + optional reason; writes history row + syncs employees.campaign_id
- `src/components/employee-profile/CampaignHistoryCard.tsx` — read-only timeline of past campaigns, TL+ visible, hides when only one row
- `src/components/employee-profile/ClockInHistoryCard.tsx` — monthly calendar with color-coded squares, click to edit via EditPunchDialog
- `src/pages/admin/ClientHolidays.tsx` — admin page to add/remove client holidays
- `joi-payroll-period-2026-05-16-to-2026-05-31.csv` — D's payroll CSV from earlier today (already in workspace, not session-created)

## Decisions made this session

- Client holidays are a SEPARATE table from `mexican_holidays` / `company_holidays` (intentional). Use `/admin/payroll/client-holidays` for US holidays.
- Client holidays do NOT trigger 3× premium pay if worked. Only `mexican_holidays.pays_premium = true` does (LFT Art. 75).
- Calendar color logic: green/yellow/red/purple/gray/blue-pulsing. "Off" legend renamed to "Clock in/out" per D's preference.
- Today's in-progress (clocked in, not out yet) stays gray-with-pulse — don't penalize an unfinished day.
- Campaign-change effective date defaults to today but is editable. Reason is open-text, optional. No dropdown of preset reasons.
- `campaigns.is_active` flag added — closed campaigns hidden from dropdowns but history stays. No UI to flip the flag yet (SQL only).
- `employees.campaign_id` is kept as the current-pointer for backward compat. All UI/legacy code that reads it keeps working.
- Invoice and payroll use historical lookup (`employee_campaign_assignments`); profile UI and calendar still use current pointer.
- Salary Configuration card was removed as a standalone card, merged into the Assignment card (leadership-only sub-section).
- ShiftSettings still allows multiple shifts per campaign — D wants single-shift-per-campaign enforced later (unique constraint + UI). Deferred.

## DB migrations applied this session

1. `client_holidays_table` — CREATE TABLE + RLS + Memorial Day 2026 for Torro
2. `payroll_derive_excludes_client_holidays` — `_derive_inputs_for_employee_week` excludes mexican_holidays + client_holidays from missed_days
3. `employee_campaign_assignments` — CREATE TABLE + RLS + unique-current-row constraint + backfill (70 rows for all employees with campaign_id) + `campaigns.is_active` flag
4. `payroll_derive_historical_campaign` — `_derive_inputs_for_employee_week` now uses `employee_campaign_assignments` for client-holiday lookup (per-day historical campaign), not `v_emp.campaign_id`

## Open todos

- [ ] D to test Mauro's move tomorrow (5/26): open EMP-032 profile → change campaign from Transfers (BTC) to HFB campaign → dialog should require effective date 2026-05-26 + accept reason
- [ ] D to verify BTC's May 18–24 invoice still includes Mauro after his move (via FacturaNueva)
- [ ] Build "Edit Campaign" UI so D can flip `campaigns.is_active = false` without SQL when a client is lost
- [ ] Consolidate `mexican_holidays` + `company_holidays` (duplicate tables with same data) — separate cleanup task
- [ ] Full regen of `src/types/supabase.ts` — several columns still missing (campaigns.organization_id, requires_holiday_coverage, etc.)
- [ ] Enforce single-shift-per-campaign (DB unique constraint + UI tweak) — D wants this
- [ ] Future: "remove from campaign" (set campaign_id = NULL) currently uses direct UPDATE without history. If D needs to track that case too, add a history-aware version.

## Next step when you come back

Open the JOI app at `/empleados/EMP-032` (Mauro Gomez), pick a new campaign via the picker — the `ChangeCampaignDialog` should pop up with today's date prefilled. Set effective date = 2026-05-26, reason = "BTC client lost, moving to HFB", confirm. Then go to Facturas → New Invoice → pick **Big Think Capital** → enter dates 2026-05-18 to 2026-05-24 — Mauro should appear with his actual punch days and NO badge (he was on BTC for the full week).

## Watch out for

- **Sandbox can't push** — D had to paste git commands manually.
- **`employees.campaign_id` direct UPDATEs in old code paths** — if some old hook/migration UPDATEs this column directly (e.g. during termination flow), it bypasses the history table and the audit trail gets a hole. Search for `.from("employees").update.*campaign_id` if you see weird history later.
- **`useAgentsByClient` (old hook) still exists** but only `FacturaNueva` references it (and now uses the new one). Safe to delete in a future cleanup pass.
- **Calendar uses CURRENT campaign for shift/holiday lookup**, not historical. So for past months where an agent was on a different campaign, the colors might be wrong. Phase 3 only fixed the payroll function. If D notices weird past-month colors after campaign moves, that's why — can be fixed by making the calendar's shift+holiday queries historical too.
- **Supabase types file is stale** in places — work compiles because of `any` casts but TypeScript won't catch every missing column. Patch manually when adding tables/columns.
- **Two duplicate holiday tables** — `mexican_holidays` (used by payroll function) and `company_holidays` (used by feature-D admin + new client_holidays system). Same data, different consumers.
- **Three SQL tests passed but no browser test of payroll Refresh button after the function changes.** D should click "Refresh from time clock" on a Torro week after Memorial Day and confirm `missed_days` shows 0 (not 1) for agents who didn't punch on 5/25.
