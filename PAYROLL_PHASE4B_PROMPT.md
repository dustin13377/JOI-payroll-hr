# Sonnet Prompt — JOI Payroll Phase 4b (Supporting Screens: Rates / Per-Agent / Holidays / Periods)

> **How D uses this:** Open a fresh Cowork session. Paste this entire file as the first message.

---

You are building Phase 4b of the JOI payroll port. Phase 4a shipped the workhorse week view. Phase 4b adds four supporting screens that round out the manager's payroll workflow:

1. `/admin/payroll/rates` — bulk pay-rate editor (filter agents by campaign/department/shift, edit weekly_base/daily_salary/etc.)
2. `/admin/payroll/agent/[id]` — per-agent YTD breakdown (Joe's `agentPayrollBreakdown` equivalent in the app)
3. `/admin/payroll/holidays` — LFT Article 74 calendar view (read-only display of the holidays seeded in Phase 1)
4. `/admin/payroll/periods` — pay-period management (list of open + locked periods, with summary totals)

Phase 4c will follow with the re-derive diff dialog, CSV export, and final cleanup of `useSupabasePayroll.ts`.

## Build Order (important — do NOT one-shot all four)

Build, commit, and verify ONE screen at a time. Don't ship all four together. After each route works, commit it with a clear message and move to the next. If you hit a blocker on screen 2, the first one is already in. Order by value:

1. **Rates editor first.** Highest immediate value — D needs this to give raises without going to the DB.
2. **Per-agent breakdown second.** Useful for paystub-history view.
3. **Holidays third.** Mostly display-only, quick win.
4. **Periods management last.** Lowest priority, mostly read-only.

## Read These First

1. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/PAYROLL_PLAN.md` — Section 8 (UI plan).
2. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/CLAUDE.md` — destructive-ops rule, no git push.
3. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/HANDOFF.md` — current state with 4a done.
4. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/src/pages/admin/Payroll.tsx` and `/Users/admin/Desktop/JOI/JOI Payroll and HR app/src/pages/admin/PayrollWeek.tsx` — Phase 4a's pages, match their patterns
5. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/src/hooks/usePayroll.ts` — Phase 4a's fresh hooks file. Add new hooks here, don't create a separate file.
6. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/src/lib/formatCurrency.ts` — the MXN formatter Phase 4a created. Use it.
7. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/src/components/AppSidebar.tsx` — Phase 4a added the Payroll entry to `leadershipItems`. New routes don't need their own sidebar entries (they're sub-routes under /admin/payroll); link to them from the landing page.
8. Phase 1, 2, 3 migration files — know the table shapes.

Auto-memory has JOI context. The TL clock-in widget item in memory is DEFERRED — don't touch it.

## Hard Rules

1. **`RequireLeadership` wraps all four routes** (matches Phase 4a). Phase 1 RLS enforces server-side.
2. **No new DB migrations** unless absolutely necessary. If you find yourself wanting one, stop and tell D. All four screens should work against the schema we already have.
3. **MXN throughout via `formatMXN` from `@/lib/formatCurrency`.**
4. **No `git push` from sandbox.** Hand D terminal commands.
5. **No destructive SQL.** Show any SQL before executing.
6. **PAID-period data is read-only in the UI.** Period view shows it, doesn't let you edit anything. Per-agent view shows historical PAID rows but no edit affordance on them.

## Decisions Already Made (from prior sessions)

- Per-employee rates (no pay_rules table).
- Owner + admin + manager access. Same `RequireLeadership` wrapper as Phase 4a.
- Sidebar entry for `/admin/payroll` already exists; sub-routes link from inside the app (breadcrumbs, back buttons, "View Rates" link from Week view, etc.).

## Decisions Pending — Ask D in a Single Numbered List (no widget)

D doesn't want the AskUserQuestion widget — ask in chat as a plain numbered list.

1. **Rates editor — bulk-edit or one-at-a-time?** Recommend: **filter + select multiple rows + apply same edit (e.g., "give every Torro Weekday agent a $200/week raise").** Single-row edit also supported via inline expand. Lets owner give raises to a whole group efficiently.

2. **Rates editor scope — show only employees, or pay-rule snapshots from `payroll_archive`?** Recommend: **current employees only.** Archive rates were frozen at the time of payment; editing them retroactively would corrupt history.

3. **Holiday view — should the page allow adding company-specific holidays (type `EMPRESA`) beyond LFT defaults?** Recommend: **yes, but in 4b just display LFT_OFICIAL + EMPRESA + OPCIONAL. Add/edit forms come in a future phase.** For 4b: read-only list with type-filter and search.

4. **Periods page — what actions does it support?** Recommend: **read-only in 4b.** Show period code, date range, status (OPEN/LOCKED), grand total, agent count, locked_at/locked_by. The "start new period" action stays on the main `/admin/payroll` landing. The "lock to PAID" action stays in the week view's "Mark Period PAID" button. So this page is just a historical browse view.

Wait for D's answers before writing code. If he doesn't answer all four, default to recommendations.

## Deliverables — One Screen at a Time

### Screen 1: Rates Editor (`/admin/payroll/rates`)

**Page:** `src/pages/admin/PayrollRates.tsx`

**Hooks to add** in `src/hooks/usePayroll.ts`:
- `useRateRoster()` — SELECT from employees JOIN campaigns + departments, returns rows with: id, employee_id, full_name, campaign_name, department_name, shift_type, weekly_base_salary, daily_salary, kpi_bonus_amount, daily_discount_rate, overtime_day_pay, sunday_bonus_amount, vacation_premium_pct, monthly_base_salary
- `useBulkUpdateRates(updates: Array<{ employee_id: string; field: string; value: number }>)` — single mutation that updates each employee row. Server-side RLS enforces permissions.

**Layout:**
- Top: filter bar (Campaign multiselect, Department multiselect, Shift multiselect, Search by name).
- Table: one row per employee. Columns = ID, Name, Campaign, Department, Shift, Weekly Base, Daily Salary, KPI Bonus, Daily Discount, Overtime/Day, Sunday Bonus, Vacation %.
- Each money field is editable inline (click to edit, blur to save).
- Bulk-action bar: select rows (checkbox column), click "Apply Raise" or "Apply Field Update" — modal asks "Set [field] to [value] for [N] selected employees" — confirm + save.
- "Recompute weekly = monthly / 4" link next to weekly_base column header (helper to fix drift).
- After any save, queryClient invalidates `useWeekRecords` (since rates feed the calc engine).

**Permissions:** owner + admin + manager. Manager can only see/edit rates for employees in their campaigns (RLS enforces). The page UI should hide rows it can't show rather than throw.

**Commit when this screen works end-to-end.** Use message: `payroll(4b): rates editor`.

### Screen 2: Per-Agent Breakdown (`/admin/payroll/agent/[id]`)

**Page:** `src/pages/admin/PayrollAgent.tsx`

**Hooks to add:**
- `useAgentPayHistory(employeeId)` — SELECT payroll_records WHERE employee_id = ? JOIN payroll_weeks JOIN pay_periods ORDER BY week_end DESC

**Layout:**
- Header: employee name, campaign, current weekly_base, current daily_salary, "Edit rates" link to `/admin/payroll/rates?filter=<id>`
- Tabs or sections by pay period (e.g., MAY26PP1, APRIL26PP2, etc.), most recent first.
- Within each pay period section: a table of weeks for that period — week date range, status badge, totals (weekly_base, kpi, overtime_pay, sunday_pay, vacation_pay, holiday_pay, extra_bonus, total).
- YTD totals at top of page (sum of all PAID + COMPLETE records for the current calendar year).
- Click a row to navigate to the week view at that week.

**Permissions:** owner + admin + manager + campaign access. If a manager tries to access an agent outside their campaign, return 403.

**Commit:** `payroll(4b): per-agent breakdown`.

### Screen 3: Holidays View (`/admin/payroll/holidays`)

**Page:** `src/pages/admin/PayrollHolidays.tsx`

**Hooks to add:**
- `useMexicanHolidays(year?: number)` — SELECT from mexican_holidays ORDER BY date. Default year = current year.

**Layout:**
- Header: "Mexican Holidays (LFT Article 74)"
- Year selector dropdown
- Type filter (LFT_OFICIAL / EMPRESA / OPCIONAL / All)
- Table: Date, Day-of-week, name_es, name_en, Type badge, "Pays Premium" indicator
- Footer note: "Holidays marked PAYS PREMIUM trigger 2× daily-rate bonus per LFT Article 75."

**Permissions:** owner + admin + manager.

**Commit:** `payroll(4b): holidays view`.

### Screen 4: Periods Management (`/admin/payroll/periods`)

**Page:** `src/pages/admin/PayrollPeriods.tsx`

**Hooks to add:**
- `useAllPeriods(limit?: number)` — SELECT pay_periods ORDER BY end_date DESC LIMIT 24 (default last 2 years)
- `usePeriodSummary(periodId)` — aggregate from payroll_records JOIN payroll_weeks for total agent count and grand total
- Composite hook `usePeriodsWithSummaries()` if performance allows

**Layout:**
- Header: "Pay Periods"
- Filter: Status (Open / Locked / All), Year
- Table: Period Code, Date Range, Status badge, Agents, Grand Total (MXN), Locked At, Locked By
- Click row → navigate to `/admin/payroll` with that period as the active context (or directly to the first week in that period — your call)
- Stats card at top: Total locked YTD, Current open period

**Permissions:** owner + admin + manager.

**Commit:** `payroll(4b): periods management`.

## After All Four Screens Land

1. Update `src/pages/admin/Payroll.tsx` (landing page) with quick-link cards or a nav row pointing to Rates, Holidays, Periods. Per-agent doesn't need a top-level link — it's reached by clicking an agent name in the week view or anywhere else an agent's name appears.

2. Update `HANDOFF.md` with `Payroll Phase 4b — DONE`.

3. Update `PAYROLL_DECISIONS.md` with Phase 4b decisions.

## Acceptance Checks (Phase 4b)

| # | Check | How |
|---|---|---|
| P4b.1 | All 4 routes resolve under RequireLeadership | Sign in as agent → all 4 redirect or 403 |
| P4b.2 | Rates editor — edit one rate, save, week_view total updates | Manual test flow |
| P4b.3 | Rates editor — bulk edit 5 selected rows | Single save, all 5 update |
| P4b.4 | Per-agent breakdown shows YTD + per-PP groupings | Visual check |
| P4b.5 | Holidays view shows ≥ 7 LFT_OFICIAL rows for 2026 | Phase 1 seeded these |
| P4b.6 | Periods view shows current open period + any past locked periods | Aggregates correct |
| P4b.7 | Manager only sees agents in their campaigns on rates page | RLS test |
| P4b.8 | Editing a rate on a PAID employee's row does NOT retroactively recompute their PAID weeks | Verify the trigger's PAID-protection still works |

## What This Phase Does NOT Do

- ❌ No re-derive diff dialog. Phase 4c.
- ❌ No CSV export. Phase 4c.
- ❌ No retiring `useSupabasePayroll.ts`. Phase 4c.
- ❌ No add/edit form for `mexican_holidays`. Future phase.
- ❌ No "start new period" form (lives on landing page from Phase 4a).
- ❌ No paystub PDFs.

## Done Looks Like

D pastes deploy. App builds. D signs in as owner. Visits each of the 4 new routes. Edits a few rates and sees a week's totals update. Sees one agent's YTD. Sees the LFT holidays. Sees the historical periods. HANDOFF.md ends with `Payroll Phase 4b — DONE`.

## If Stuck

If any of the 4 screens hits a real blocker (missing schema, RLS not working as expected), STOP at that screen, ship the ones that work, and tell D. Don't power through with hacks — the screens are independent enough that we can ship 3 of 4 if needed.
