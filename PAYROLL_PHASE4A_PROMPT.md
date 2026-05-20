# Sonnet Prompt — JOI Payroll Phase 4a (Core UI: Week View + Status Workflow)

> **How D uses this:** Open a fresh Cowork session. Paste this entire file as the first message.

---

You are building Phase 4a of the JOI payroll port. **This is the workhorse UI** — the screen where managers and the owner spend their time. Two routes only in 4a:

1. `/admin/payroll` — landing page (current pay period + list of weeks + new-week button)
2. `/admin/payroll/week/[id]` — the week table view (45 agents, inline editable inputs, live totals, status workflow)

Phase 4b (per-agent breakdown, rates editor, periods management, holidays view) and Phase 4c (re-derive button, paid-period lock UI, CSV export for parallel-run) come in separate prompts. Don't build them here.

## Read These First

1. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/PAYROLL_PLAN.md` — Section 8 (UI plan).
2. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/CLAUDE.md` — destructive-ops rule, no git push from sandbox.
3. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/HANDOFF.md` — Phases 1/2/3 done state.
4. **Existing UI conventions to MATCH:**
   - `src/App.tsx` — `RequireRole` wrapper pattern
   - `src/pages/SystemUsers.tsx` — owner-only page example
   - `src/pages/Empleados.tsx` — table page example
   - `src/components/AppSidebar.tsx` — sidebar navigation pattern
   - `src/components/ui/*` — shadcn/ui primitives (Card, Button, Badge, Input, Select, Dialog, etc.)
   - `src/hooks/useSupabasePayroll.ts` — existing payroll hooks (heavily out of date; you'll write fresh hooks)
   - `src/hooks/useTeamLead.ts` — manager-campaigns helper pattern
5. Phase 1/2/3 migration files (so you know the table shapes you're working with).

Auto-memory has the JOI context including role hierarchy, RLS patterns, and current TL/manager mappings.

## Hard Rules

1. **`RequireRole(['owner','admin','manager'])` on both routes.** No agent or TL access in 4a. Belt-and-suspenders: also use the existing useSession/role hooks for client-side gating, AND rely on Phase 1's RLS for server-side enforcement.
2. **Money display: MXN format throughout.** Use `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })` or the project's existing currency helper if one exists.
3. **PAID rows are visually frozen.** Greyed background (`bg-muted` or similar), inputs disabled, no edit affordances.
4. **`extra_bonus` permissions (locked in chat with D):**
   - UNPAID row → manager (for their campaigns) + owner can edit
   - COMPLETE row → owner only can edit
   - PAID row → nobody can edit
5. **Status badge colors match Joe's convention:** 🟡 yellow for UNPAID, 🔵 blue for COMPLETE, ✅ green for PAID. Use shadcn Badge with custom Tailwind classes.
6. **Inline expand to edit, not navigate-away.** Click an agent row to expand the input editors in place. Don't push to a per-agent edit page in 4a.
7. **No `git push` from sandbox.** Hand D terminal commands.
8. **No destructive SQL** — 4a is UI only. If you find yourself needing a migration, stop and tell D first.

## Decisions Already Made (from D, this session)

- Permissions for extra_bonus: managers edit UNPAID for their campaigns; owner only edits COMPLETE; nobody edits PAID.
- UI pattern: inline expand for row editing, not navigate-to-page.
- Desktop-first. Mobile is fine to deprioritize for 4a; a basic responsive collapse is enough.

## Decisions Pending — Ask D as a Plain Numbered List

D does NOT want the AskUserQuestion widget. Ask as numbered list in chat text.

1. **Where in the existing sidebar nav does Payroll live?** Top-level entry (e.g., between "Empleados" and "Time Off"), or nested under a new "Finance" / "Admin" group? Look at `src/components/AppSidebar.tsx` and recommend based on existing pattern.

2. **Manager-campaign access — confirm the source table.** Phase 3's `pay_derive_week` already handles RLS; this is about what the UI shows. There's a `team_lead_campaigns` join table (per memory `project_cross_campaign_tl_access`). Is there a separate `manager_campaigns` join, or do managers see all campaigns? Check the schema and the existing `useTeamLead.ts` patterns. Recommend based on what you find; if managers don't have a campaigns filter yet, default to "managers see all campaigns" and flag for D to clarify.

3. **KPI achieved column UX** — should it be a toggle in the row (click on/off), a dropdown (YES/NO), or just display-only with a tooltip "auto-derived from EOD logs"? Recommend: toggle. Auto-derive populates it; manager can flip it. This is the most-edited cell after `extra_bonus`.

4. **"Add Next Week" button** — owner-only, or owner + manager? Recommend: owner only (creating weeks is a payroll-cadence decision that shouldn't bypass owner sign-off).

Wait for D's answers before writing code. If he doesn't answer all 4, default to my recommendations.

## Deliverables (in order)

### 1. Pre-flight checks

- Confirm Phase 3 RPCs are live: `pay_derive_week`, `pay_redrive_week`.
- Confirm tables: `pay_periods`, `payroll_weeks`, `payroll_records`, `employees`, `mexican_holidays`, `payroll_audit_log`.
- `SELECT count(*) FROM payroll_records` → expected 0 if Phase 3 hasn't been triggered yet; might be > 0 if D tested.
- Identify the existing currency formatter helper, if any.
- Identify the existing manager-role check helper.

Report findings before writing code.

### 2. Hooks (`src/hooks/usePayroll.ts` — NEW; do not edit `useSupabasePayroll.ts`)

Write fresh TanStack Query hooks. The existing `useSupabasePayroll.ts` is out-of-date Phase-0 code; do not touch it (we'll remove it in Phase 4c after the new UI is fully wired).

Hooks to write:

```typescript
// LANDING
useCurrentPayPeriod()                          // SELECT * FROM pay_periods WHERE status = 'OPEN' ORDER BY end_date DESC LIMIT 1
useWeeksInPeriod(periodId)                     // SELECT * FROM payroll_weeks WHERE period_id = ? ORDER BY week_number
useCreateNextWeek()                            // mutation: insert payroll_weeks row, then call pay_derive_week

// WEEK VIEW
useWeek(weekId)                                // payroll_weeks row + period info
useWeekRecords(weekId)                         // payroll_records JOIN employees JOIN campaigns; only rows the caller can see (RLS)
useUpdatePayrollRecord()                       // mutation on a single record's inputs; trigger handles recalc
useMarkWeekComplete()                          // mutation: UPDATE payroll_weeks SET status = 'COMPLETE' + cascade to all rows
useMarkPeriodPaid()                            // mutation: UPDATE pay_periods.status = 'LOCKED' + all weeks/records → 'PAID' (owner only)

// PERMISSIONS HELPERS
useCanEditExtraBonus(record)                   // returns boolean based on record.status + current user role + campaign access
useCanCreateWeek()                             // returns boolean (owner only)
useCanLockToPaid()                             // returns boolean (owner only)
```

All mutations invalidate the relevant query keys on success.

### 3. Landing page `src/pages/admin/Payroll.tsx`

- Title + current period summary card (period code, date range, status, total pay so far).
- List of weeks in current period with status badges and clickable links to `/admin/payroll/week/[id]`.
- "Add Next Week" button (owner only — uses `useCanCreateWeek`).
- If no current period exists: empty state with "Start a new pay period" CTA (owner only).
- Link to past periods at the bottom (placeholder for Phase 4b).

### 4. Week view `src/pages/admin/PayrollWeek.tsx`

The workhorse screen. Layout:

```
┌─ Header ─────────────────────────────────────────────────────┐
│ Week 2 of April 2026 (04/06/26 – 04/12/26)                   │
│ Period: APRIL26PP1   Status: 🟡 UNPAID                       │
│ Total: $128,450 MXN   Agents: 45                             │
│ [Re-derive] [Mark Week Complete] [Mark Period PAID]          │
└──────────────────────────────────────────────────────────────┘
┌─ Agent table ────────────────────────────────────────────────┐
│ Agent     Campaign  Missed OT Sun Vac Hol KPI Extra  Total   │
│ ▶ Javier  Torro     0      1  0   0   0   ✓   $0    $6,750  │
│ ▶ Adrian  Torro     2      0  0   0   0   ✗   $0    $2,200  │
│ ▼ Deysi   Torro     0      3  1   0   0   ✓   $0    $8,942  │
│   ┌─ Expanded edit row ──────────────────────────────────┐   │
│   │ Auto-derived from time_clock (May 18, 10:14am):      │   │
│   │ Missed: [0  ▼]  OT: [3  ▼]  Sundays: [1  ▼]          │   │
│   │ Vacation: [0  ▼]  Holiday: [0  ▼]  KPI: [✓ achieved] │   │
│   │ Extra bonus (spiffs): [$0.00]                        │   │
│   │ Partial week: [—]                                    │   │
│   │ Live total: $8,942.00                                │   │
│   │ [Save] [Cancel]                                      │   │
│   └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

Key behaviors:

- Table sortable by Agent / Campaign / Total Pay descending.
- Row click → inline expand to edit (close any other expanded row first).
- Input fields show auto-derived values populated from `auto_derived` jsonb snapshot. A small "auto-derived" tag appears next to fields that haven't been manually overridden; once edited, the tag changes to "manual override (was: X)".
- Live total updates as user types (call `useWeekRecords` invalidation OR optimistic update via the calc — server is canonical, client preview is for UX).
- "Save" calls `useUpdatePayrollRecord` which fires the Phase 2 trigger.
- Status badge per row matches week status, but each row has its own status that can show "needs review" (status `UNPAID` with `auto_derived.status = 'NO_DATA'`).
- `extra_bonus` field disabled if `useCanEditExtraBonus(record)` returns false.
- PAID rows: entire row greyed, no expand affordance, click does nothing.
- "Mark Week Complete" button: confirms via Dialog, then calls `useMarkWeekComplete`.
- "Mark Period PAID" button: owner only. Confirms via Dialog with strong language ("This locks all weeks in this pay period as PAID. PAID rows are immutable. Continue?"). Then calls `useMarkPeriodPaid`.
- "Re-derive" button: shows in 4a as a stub that opens a dialog "Re-derive from time_clock — coming in Phase 4c." (Backend RPC exists but the diff UI is 4c.)

### 5. Routing

Add to `src/App.tsx`:
```tsx
<Route path="/admin/payroll" element={
  <RequireRole roles={['owner','admin','manager']}>
    <Payroll />
  </RequireRole>
} />
<Route path="/admin/payroll/week/:weekId" element={
  <RequireRole roles={['owner','admin','manager']}>
    <PayrollWeek />
  </RequireRole>
} />
```

Add a sidebar entry per Decision #1.

### 6. Tests

Skip unit tests for the UI in 4a — too much surface area for the value. Instead:
- Add a smoke check at the bottom of the Phase 4a deliverable: a numbered list of manual click-through steps D can run on staging to verify each behavior (landing loads → click into week → expand row → edit missed_days → see total update → save → mark complete → mark paid). 10-15 steps.

### 7. Code-review pass

Sub-agent reviews:
- `RequireRole` wraps both routes
- All money displays use MXN formatter
- PAID rows are visually disabled AND have disabled inputs (defense in depth)
- `extra_bonus` permission logic respects the 3-state matrix (UNPAID/COMPLETE/PAID × role × campaign access)
- The "Mark Period PAID" dialog has confirmation language strong enough to prevent fat-finger lockouts
- No direct mutation of `payroll_records.weekly_base / kpi_bonus / missed_deduction / overtime_pay / sunday_pay / vacation_pay / holiday_pay / total_pay` from the UI — those are trigger-computed only

### 8. Update HANDOFF.md + PAYROLL_DECISIONS.md

### 9. Deploy commands for D

Standard pattern:
```
cd ~/path/to/JOI-app
git pull
npm install     # if any new deps
npm run build   # confirm it compiles
git add -A
git commit -m "payroll: phase 4a — core week view + status workflow"
git push
```

No `supabase db push` in 4a — no migrations.

## Acceptance Checks (Phase 4a)

| # | Check | How |
|---|---|---|
| P4a.1 | Both routes resolve under RequireRole | Sign in as agent → both routes redirect or 403 |
| P4a.2 | Landing shows current period + weeks list | Visual confirm |
| P4a.3 | "Add Next Week" visible only to owner | Sign in as manager → button hidden |
| P4a.4 | Week table loads all agents for the week | ~45 rows; sortable |
| P4a.5 | Row expand → inputs editable | Confirm one field saves and total recalculates |
| P4a.6 | extra_bonus disabled on COMPLETE row if user is manager | Manager UI shows readonly field |
| P4a.7 | PAID row fully disabled, no expand affordance | Visual + click test |
| P4a.8 | Mark Week Complete cascades status to all rows | UPDATE payroll_records.status |
| P4a.9 | Mark Period PAID locks everything; PAID rows can't be edited even by owner | Try editing and confirm rejected |
| P4a.10 | Manager only sees agents in campaigns they manage | RLS test |

## What This Phase Does NOT Do

- ❌ No per-agent breakdown page. Phase 4b.
- ❌ No rates editor. Phase 4b.
- ❌ No holiday calendar view. Phase 4b.
- ❌ No pay period management screen. Phase 4b.
- ❌ No re-derive diff dialog (button exists but is a stub). Phase 4c.
- ❌ No CSV export. Phase 4c.

## Done Looks Like

D pastes deploy. App builds. D signs in as owner, clicks Payroll in sidebar, sees current period, clicks into the current week, sees ~45 agents with auto-derived inputs, clicks one to expand, changes `missed_days`, sees the total update, saves, marks the week complete. Then signs in as a manager and sees only their campaigns' agents, with `extra_bonus` editable on UNPAID but readonly elsewhere. Sign in as an agent → can't access either route.

## If Stuck

If the existing UI conventions are unclear (e.g., no obvious manager-campaigns query pattern, no currency formatter), pause and ask D. Don't invent new conventions when the codebase already has them — the goal is to look like part of the app, not bolted on.
