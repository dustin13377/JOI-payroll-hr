# Session Handoff

**Saved:** 2026-05-20T16:49:32-06:00
**Machine:** Cowork sandbox (claude)
**Branch:** main
**Last commit:** b80d93a payroll: phase 4a — core week view + status workflow

## What we were doing

Built out Phase 4b (4 supporting payroll screens), then collapsed the 8-rate-field model down to D's mental model: `monthly_base_salary` is the source of truth, daily and weekly are derived (`monthly/30` and `monthly/4`). Backfilled May 11-17 from a TimeClock Wizard CSV, created a payroll_weeks row, and ran auto-derive — the week view now shows 55 real agent records totaling **$214,158.34 MXN**. Walked through the end-to-end flow with real data. Patched a series of cascading crashes from legacy `calcularNomina()` callers across 5 pages. Hidden the OT column per D's "no automatic OT — use extra_bonus" decision.

## Files in flight (will be in this commit)

- `src/hooks/usePayroll.ts` — Added Phase 4b hooks (useRateRoster, useUpdateEmployeeRates, useBulkApplyRate, useAgentPayHistory, useEmployeeForPayroll, useMexicanHolidays, useAllPeriodsWithSummaries, useCurrentPeriodTotal, useEmployeeVacationBalance). Updated previewTotalPay to derive daily/weekly from monthly. Fixed useCreateNextWeek to compute next_week_start from latest_week_end + 1 day, and to set organization_id on INSERT.
- `src/types/payroll.ts` — Added `EMPTY_PAYROLL_RESULT` zero-stub. Updated PayEmployee + PayInputs types (custom_deduction, monthly_base_salary). Rewrote previewPay to mirror simplified calc engine.
- `src/App.tsx` — Added 4 new Payroll routes (rates, agent, holidays, periods), all under RequireLeadership.
- `src/pages/admin/Payroll.tsx` — Added quick-link cards (Pay Rates, Holidays, Periods). Fixed nested-quote crash in empty-state ("No weeks yet" message).
- `src/pages/admin/PayrollWeek.tsx` — Wired `custom_deduction` input next to `extra_bonus`. Hidden OT column + Overtime days input. Added sticky-thead so column headers stay visible. Removed `overflow-x-auto` on the Card (was blocking sticky).
- `src/pages/admin/PayrollRates.tsx` — NEW. Bulk pay-rate editor. Simplified to Monthly (read-only) + KPI (editable) + Derived display (Wk/Day/Sun-per-day). Red "Missing rate" badge for monthly=0. Filter uses Client (not Campaign) per D's mental model.
- `src/pages/admin/PayrollAgent.tsx` — NEW. Per-agent YTD breakdown + admin-only vacation balance card.
- `src/pages/admin/PayrollHolidays.tsx` — NEW. Read-only LFT Article 74 calendar.
- `src/pages/admin/PayrollPeriods.tsx` — NEW. Historical pay-period browser.
- `src/pages/Dashboard.tsx` — Replaced broken `useActivePeriod` (lowercase `'open'`) with `useCurrentPayPeriod` (uppercase `'OPEN'`). Wired Biweekly Payroll to `useCurrentPeriodTotal`. Replaced calcularNomina table cells with `—` placeholder.
- `src/pages/Empleados.tsx` — Replaced calcularNomina with `—` placeholder.
- `src/pages/EmpleadoPerfil.tsx` — Replaced calcularNomina with EMPTY_PAYROLL_RESULT + stub config.
- `src/pages/Historial.tsx` — Replaced calcularNomina with EMPTY_PAYROLL_RESULT.
- `src/pages/PayrollRun.tsx` — Replaced calcularNomina with EMPTY_PAYROLL_RESULT.
- `HANDOFF.md` — Phase 4b + simplification entries appended.
- `PAYROLL_PHASE4B_PROMPT.md` — NEW. The Sonnet prompt that built Phase 4b (already executed).

## DB migrations applied this session (live in Supabase, NOT in this commit)

- **`payroll_phase4b_simplify_calc`** — Rewrote `_calc_pay_components` to derive `daily = monthly/30`, `weekly = monthly/4`. Added `payroll_records.custom_deduction numeric(12,2)`. Sunday pay = `daily × 0.25` (LFT Art. 79). Overtime pay = `0` (handled via `extra_bonus`). Vacation pay = `0` (deferred to new entity). Trigger guard updated to watch `custom_deduction`.
- **Vacation entitlement** — added `employees.vacation_days_entitled int DEFAULT 0`. Backfilled per LFT 2024 Art. 76: 12 active employees got days, 148 total entitled.
- **May 11-17 TCW backfill** — inserted ~180 rows into `time_clock` from TimeClock Wizard CSV. Created `payroll_weeks` row for May 11-17 (id `cc6a801b-5381-4417-a376-bba59f6a86e4`), ran auto-derive — 55 `payroll_records` rows created, week total $214,158.34 MXN.

## Decisions made this session

- **Per-employee rate model** (not rule-based). `monthly_base_salary` is source of truth; derive daily=monthly/30 and weekly=monthly/4.
- **Sunday pay = daily × 0.25** (LFT Art. 79). **Holiday pay = daily × 2** (LFT Art. 75). **Vacation pay = 0** for now (deferred to new entity).
- **No automatic OT pay.** Use `extra_bonus` to compensate. OT column + input hidden in UI; auto-derive still counts in background.
- **Rates Editor filter:** Client / Department / Shift (not Campaign — that's implementation detail per D's mental model).
- **Vacation entitlement is admin-only display** — never on agent screens until D explicitly OKs.
- **`custom_deduction` field** for manager-entered subtractions (partial-day misses, advance repayments, fines).
- **Phase 5 archive replay abandoned** — historical data has gaps + roster turnover makes replay unreliable. Engine validation will happen via parallel-run on next live pay period.

## Open todos (priority order)

- [ ] Joe reviews the live week (`/admin/payroll/week/cc6a801b-5381-4417-a376-bba59f6a86e4`). Spot-check 3-5 agents' `total_pay` vs his Sheet. If they match to the cent, engine validated.
- [ ] Set `monthly_base_salary` for 4 employees with $0: Diego Landeros, Alejandro Araujo, Ruben Curiel, Daniel Oswaldo Romero
- [ ] Set `hire_date` for 7 employees missing it (Paty Rodriguez is the only real-employee one; rest are admin/test accounts)
- [ ] Adrian Arechiga's hire_date in DB (2025-11-03) looks wrong — he was in Joe's January 2026 payroll
- [ ] Decide what to do with Paty + Carlos Pedro (NO_DATA but got full base pay — different clock system, or actually missed?)
- [ ] When Joe approves the math, run May PP2 in parallel with his Sheet for both weeks (May 11-17 + May 18-24)
- [ ] Phase 4c (when ready): re-derive diff dialog, CSV export, retire `useSupabasePayroll.ts` (silences the `period_id=eq.X` 400 console error)
- [ ] TL clock-in widget extraction (deferred — TLs can read timeclock status but no clock-in button on TeamLeadHome)

## Next step when you come back

Send Joe the URL `http://localhost:8080/admin/payroll/week/cc6a801b-5381-4417-a376-bba59f6a86e4` and ask him to spot-check 3-5 agents' totals against what his Sheet would compute for the same week. Drop his feedback into the next session — bugs are fast fixes; convention questions ("Sunday should be 30% not 25%") are single-line changes in `_calc_pay_components`.

## Watch out for

- **The Dashboard has a 400 console error** from `usePayrollRecords?period_id=eq.X` — harmless legacy noise from useSupabasePayroll.ts, retires in Phase 4c.
- **5 commits sit unpushed locally** (Phase 1, 2, 3, 4a, and this Phase 4b commit). When you `git push`, the live app gets all of it. Live currently uses the old `/payroll-run` page; pushing replaces that path.
- **The TCW import inserted 182 rows into `time_clock` for May 11-17.** Real data, not test data. Don't delete.
- **Vacation balance card only shows on `/admin/payroll/agent/:id`.** Never surface to agent UI until D's explicit go.
- **`pay_derive_week` requires `is_leadership()`** — works fine when D is logged in via browser; failed in sandbox SQL because auth.uid() is null there.
- **Use `EMPTY_PAYROLL_RESULT`** for any future legacy page that still calls `calcularNomina()` to avoid white screens. Phase 4c will retire all such callers.
- **`npm run build` not run locally yet** — `tsc --noEmit` is clean. The Vite sandbox build failed due to a rollup arch mismatch (Linux ARM64 vs macOS binaries), but D's Mac will build fine.
- **There may be a stale `.git/index.lock`** in the project — sandbox couldn't remove it. If `git add` complains, run `rm -f .git/index.lock` first.
