# Time Off Unification Plan

**Status:** COMPLETE — all 4 phases shipped 2026-05-28
**Last updated:** 2026-05-28
**Owner:** D

## The problem

The app currently has **two parallel time-off systems** that confuse everyone:

| Page | Sidebar entry | Table | Flow |
|---|---|---|---|
| `/solicitudes` | "Time Off Requests" | `time_off_requests` | 1-step approval, no balance tracking |
| `/vacation` | "Vacation" | `vacation_requests` | 2-step (TL → HR), tracks balance, enforces 21-day notice |

Both are wired into the sidebar for all 3 roles (Owner, TL, Agent). Agents don't know which to use. TLs don't know where to look. Cesar submitted on `/vacation`, D went looking on `/solicitudes`, nothing matched.

There are also **two stale pending requests** stuck because TLs never knew to check:
- Mariana Perez — submitted May 19, sitting at `pending_tl` for 9 days
- Cesar Soltero — submitted May 28, sitting at `pending_tl`

## The vision

**One button. One form. One queue.**

Employee clicks "Request Time Off." The form looks slightly different depending on tenure:

### Less than 1 year of service
- Reason dropdown: **Sick / Personal / Other**
- All requests = unpaid
- Header reads: "Time Off Request"
- No balance shown (there is none yet)

### One year or more
- Reason dropdown: **Vacation (paid) / Sick / Personal / Other**
- Vacation deducts from LFT balance, requires 21-day notice
- Sick/Personal/Other = still unpaid unless company policy says otherwise
- Header reads: "Paid Time Off Request" when Vacation selected, "Time Off Request" otherwise
- Shows vacation balance card at top

### Why this matches reality
Mexican LFT only grants paid vacation after 1 full year of service. Before that, employees can still need time off — it's just unpaid leave, granted at company discretion. One unified form handles both cases without making the employee pick the right "type" of form.

## The approval flow (unchanged, but unified)

Same 2-step approval for every request, regardless of paid vs unpaid:

1. Agent submits → status `pending_tl`
2. Their TL approves → status `pending_hr`
3. HR/Owner approves → status `approved`

**Owner override:** D (or any owner) can approve from any stage. If she approves a `pending_tl` request, it jumps straight to `approved` (no need to wait on TL).

## What gets built

### Schema (in `vacation_requests` table)

Add two columns:
- `request_type` — enum: `vacation`, `sick`, `personal`, `other`
- `is_paid` — boolean — only true when request_type=vacation AND tenure ≥1 year

Add a check constraint: `is_paid=true` requires `request_type='vacation'`.

### Migration (one row to move)

Francisco's existing approved row in `time_off_requests` (May 21–23 Personal) gets copied to `vacation_requests` with `request_type='personal'`, `is_paid=false`, `status='approved'`. Original row stays put until cleanup phase.

### Code changes

**Form (the agent's view):**
- Rename `VacationRequests.tsx` → `TimeOff.tsx` (the new one)
- Add tenure check (already have `years_of_service` in `get_vacation_balance` RPC)
- Reason dropdown conditional on tenure
- Submit RPC: extend `request_vacation_off` to accept type + is_paid, or rename to `request_time_off`

**HR page (`/hr/time-off`):**
- Add new "Pending TL Approval" section above existing "Pending HR Approval"
- Shows TL name so D can see who's not approving
- Each row has an "Approve (Owner Override)" button that jumps straight to approved

**Sidebar:**
- Remove "Time Off Requests" entry from all 3 roles (Leadership, TL, Agent)
- Rename "Vacation" → "Time Off" in Agent sidebar
- Badge counts pending requests in `vacation_requests` only

**Downstream consumers (must be updated together):**
- `usePayrollComputed.ts` — switch from `time_off_requests` to `vacation_requests` (only approved rows matter for PTO day math)
- `useTeamLead.ts` `usePendingTimeOffForTeam` — switch table
- `EmployeeHome.tsx` pending widget — switch table
- `HomeHero.tsx` link — point at new unified page

**Cleanup (last, after everything verified):**
- Delete `TimeOff.tsx` (old page)
- Delete `/solicitudes` route from `App.tsx`
- Rename `time_off_requests` → `_legacy_time_off_requests` (don't drop yet, in case of audit needs)

## Build order (so nothing breaks)

**Phase A — additive, no rewires yet (~30 min)**
1. Add `request_type` + `is_paid` columns to `vacation_requests` (default vacation/true so existing rows stay valid)
2. Migrate Francisco's row to `vacation_requests`
3. Both tables coexist, both flows still work

**Phase B — switch the consumers (~1 hr)**
4. Update `usePayrollComputed.ts` to read `vacation_requests`
5. Update `useTeamLead.ts` to read `vacation_requests`
6. Update `EmployeeHome.tsx` widget to read `vacation_requests`
7. Manually verify payroll for current period still matches before/after
8. Manually verify TL home still shows pending correctly

**Phase C — UI unification (~1 hr)**
9. Update form with tenure-aware dropdown + paid/unpaid logic
10. Add Pending TL Approval section to HR Time Off page
11. Add owner-override mutation (jumps any pending stage straight to approved)
12. Update sidebar badge to count vacation_requests

**Phase D — kill the old (~20 min)**
13. Remove sidebar entries
14. Remove `/solicitudes` route + page file
15. Rename old table to `_legacy_time_off_requests`
16. Approve Cesar's + Mariana's pending requests as part of validation

**Total estimate:** ~3 hours of focused work. Definitely a separate session, not a "while we're here" fix.

## Decisions locked in (2026-05-28)

1. **Sick/Personal/Other = UNPAID for all employees, regardless of tenure.** JOI follows LFT — only Vacation (for 1+ year of service) is paid. No company-policy paid sick days.

2. **TLs see only their team's pending requests.** Keep current scoping. They can approve OR deny.

3. **Notice period for non-vacation requests = 1 week (7 days).** Vacation stays at 21 days (LFT). Form should block submissions under the minimum, like it already does for vacation.

4. **Cesar + Mariana approved manually via SQL on 2026-05-28** to unblock them while the rebuild is planned. Both are now `status='approved'`, reviewed by D as both TL and HR.

## What NOT to do (rejected approaches)

- ❌ Build the "Pending TL section + sidebar badge + delete /solicitudes" patch as discussed earlier — it solves the symptom without solving the structural problem. Two systems would still exist behind the scenes.
- ❌ Archive `time_off_requests` table without migrating Francisco's row first — would silently break his PTO days in payroll.
- ❌ Have agents choose "type" of request on the form themselves — they'd pick wrong half the time. App should know based on tenure.
