# UI Layout & Feature Location

Living reference for what each role sees, which page lives where, and what's
on every screen. Update this when pages move, get renamed, or get killed.

Last updated: 2026-05-21

---

## Roles and landing pages

`App.tsx → RoleHome()` decides what `/` renders based on the logged-in user:

| Role(s)                       | Lands on `/`                                | File                          |
|-------------------------------|---------------------------------------------|-------------------------------|
| owner / admin / manager       | `Dashboard`                                 | `src/pages/Dashboard.tsx`     |
| team_lead                     | `TeamLeadHome`                              | `src/pages/TeamLeadHome.tsx`  |
| agent                         | `EmployeeHome`                              | `src/pages/EmployeeHome.tsx`  |
| client                        | redirected to `/client` → `ClientDashboard` | `src/pages/ClientDashboard.tsx` |

Auth wrappers used by routes: `RequireOwner`, `RequireLeadership`
(owner+admin+manager), `RequireTeamLeadOrAbove`, `RequireClient`. Defined in
`src/components/RequireRole.tsx`.

---

## Sidebar nav per role

Source: `src/components/AppSidebar.tsx`.

### Leadership (owner / admin / manager)
**Menu**
- Dashboard `/`
- Employees `/empleados`
- Payroll `/admin/payroll`
- Payroll History `/historial`
- Invoices (USD) `/facturas`
- Campaigns `/campaigns`
- My Policies `/policies`
- Announcements `/comunicados`

**Human Resources**
- Attendance `/asistencia`
- Performance `/desempeno`
- 30-Day Reviews `/reviews`
- Time Off Requests `/solicitudes`
- Document Types `/settings/document-types`
- Departments `/settings/departments`
- Manage Policies `/settings/policies`
- Time Off `/hr/time-off`
- Cartas y Actas `/hr/document-queue`
- My Timeclock `/reloj`
- My EOD History `/eod`

**Owner-only**
- System Users `/admin/system-users`

### Team Lead
- Home `/` → `TeamLeadHome`
- My Team `/asistencia` → `Attendance` (same page leadership sees, scoped to their direct reports)
- 30-Day Reviews `/reviews`
- Time Off Requests `/solicitudes`
- Shift Settings `/settings/shifts`
- My Policies `/policies`
- My Timeclock `/reloj`
- My EOD History `/eod`
- Announcements `/comunicados`

### Agent
- Dashboard `/` → `EmployeeHome`
- My Timeclock `/reloj`
- My EOD History `/eod`
- Time Off Requests `/solicitudes`
- My Policies `/policies`
- Vacation `/vacation`
- Holiday Requests `/holidays`
- Announcements `/comunicados`

---

## Page-by-page inventory (current state)

### `EmployeeHome` (Agent landing — `/`)
File: `src/pages/EmployeeHome.tsx` (~1,200 lines)

Top of page (matches the clean screenshot D shared):
1. Header — "Hi, [name]" + date + campaign + status badge
2. Personal goal reminder (only if set)
3. Policies to review banner (only if any unacked)
4. Compliance banner (locked or in-grace, only if missing docs)
5. Missing EOD banner (only if any)
6. **Today panel + Quick Actions** — 2/3 + 1/3 grid:
   - Today: big clock, date, "Clock In" button (or elapsed/status if clocked in, or shift-complete summary if done)
   - Quick Actions: Timeclock, Submit EOD, Request Time Off, Announcements
7. Stat row: Hours This Week / Days Worked / Minutes Late This Week

Below that (more cards): Bulletin announcements, document uploads, agent log /
incidents, signed HR documents, applicable policies — large stack.

### `TeamLeadHome` (TL landing — `/`)
File: `src/pages/TeamLeadHome.tsx`

Current stack (9 sections top-to-bottom):
1. Header — "Hi, [name]" + campaign + team size + "Open Dashboard" button
2. ClockInWidget — TL's own personal clock-in
3. Today's EOD Note (one card **per campaign** the TL leads, with cutoff badge + textarea + last-saved)
4. Upcoming Holiday card per campaign (approve / dismiss requests)
5. Vacation Requests card per campaign (Forward to HR / Deny)
6. Today's Attendance card — agent-by-agent list with status badges and Nudge button
7. Pending Time Off card — approve / deny
8. EOD Performance This Week — full-width KPI table, click a row to expand into per-day breakdown (week or last-30-days toggle, color-coded by min_target)
9. Alerts card — underperformer flags

### `Attendance` ("My Team" for TLs — `/asistencia`)
File: `src/pages/Attendance.tsx`

- 4 overview cards: Present / Absent / Late Today / Repeat Lates This Week
- Campaign filter dropdown (scoped to TL's own campaigns for non-leadership)
- Agent table with clock-in/out times, hours, status, edit-punch (pencil) button
- Auto-refreshes every 30s
- Uses `employees_no_pay` view for TLs (hides sensitive pay columns)

### `TLDashboard` (orphan — `/team-lead/dashboard`)
File: `src/pages/TLDashboard.tsx`
**Not in any sidebar.** Only reachable via the "Open Dashboard" button at the top of `TeamLeadHome`.

Sections:
- Daily Submissions chart (last 7 days)
- Missing Yesterday card
- Weekly Leaderboard (Mon→Today) with "Submit EOD" button (for no-login agents)
- 4-Week Trends chart
- Monthly Heatmap
- Agent Log / Coaching Notes (add note dialog)

### `Dashboard` (Leadership landing — `/`)
File: `src/pages/Dashboard.tsx` — not yet audited in this doc. TODO.

---

## Known overlap and dead routes

| Issue                                                                   | Where                                          |
|-------------------------------------------------------------------------|------------------------------------------------|
| Today's Attendance card on TeamLeadHome overlaps with /asistencia       | `TeamLeadHome` card 6 vs `Attendance`          |
| EOD Performance This Week overlaps with TLDashboard's Weekly Leaderboard| `TeamLeadHome` card 8 vs `TLDashboard`         |
| TLDashboard is orphaned — no nav entry                                  | `App.tsx` route exists, no sidebar item        |
| `/admin/provision-org` route + page still wired but nav is commented out| `AppSidebar.tsx` line ~266                     |
| `/payroll-run` legacy page still reachable by URL after Phase 4a switch | `App.tsx` line 156                             |

---

## Implementation status

| PR  | What                                                       | Status         |
|-----|------------------------------------------------------------|----------------|
| 1a  | Create `HomeHero` + use it at top of `TeamLeadHome`        | Done 2026-05-21 |
| 1b  | TL Home bottom: merge approvals card, new Today's Roster  | Pending        |
| 2   | Kill TLDashboard, absorb Missing Yesterday + Submit-for-agent + coaching notes | Pending |
| 3   | Slim EmployeeHome to use HomeHero + new bottom structure   | Pending        |

### Shared HomeHero (PR 1a)

`src/components/HomeHero.tsx` — renders header + Today panel + Quick Actions + stat row. Self-contained queries: today's time_clock entry, shift_settings, week entries, bulletin unread count. Owns the clock-in mutation and confirm dialog.

Props: `employeeId`, `firstName`, `subtitle`, `campaignId`.

`TeamLeadHome` now uses it; the old inline header + `ClockInWidget` usage is gone. `ClockInWidget.tsx` still exists but is no longer imported anywhere — safe to delete after a stability window.

---

## Proposed direction (DRAFT — needs D approval)

### Constraint D set on 2026-05-21
> TLs are still required to make calls, get packages back, do credit pulls,
> etc. — they're working agents on top of being TLs. So TL Home must include
> all the personal stuff agents see (clock-in, EOD, announcements, time off)
> AND the team-management stuff.

### TL Home — proposed structure
Mirror the agent EmployeeHome top-of-page pattern, then append a "My Team"
section below.

**Top half (personal — same as agent home):**
1. Header — Hi, [name] + status badge
2. Banners — policies to review, compliance, missing EODs
3. Today panel + Quick Actions (Timeclock / Submit EOD / Request Time Off / Announcements)
4. Stat row — Hours This Week, Days Worked, Minutes Late

**Bottom half (team management, collapsible by section):**
5. Today's EOD Note — only this stays at the top of the team section; it's a daily must-do
6. Approvals queue — combine Holiday + Vacation + Time Off into one "Approvals" card with sub-tabs or stacked groups. Auto-hide when empty.
7. Today's Roster — replaces the current Today's Attendance card. Quick scan of who's clocked in / late / absent with Nudge. Link to "Open My Team" for the full board.
8. EOD Performance This Week — keep
9. Alerts — keep

### What to do with TLDashboard
Per D: kill the standalone page. Absorb the useful bits into TL Home or My Team.
- **Missing Yesterday** → merge into "Today's Roster" card on Home
- **Submit EOD for no-login agent** → keep the dialog component, move the trigger to Today's Roster (per agent)
- **Coaching Notes / Agent Log** → either inline in the EOD Performance breakdown row, or move to the agent's profile page (`/empleados/:id`)
- **Daily Submissions chart / 4-Week Trends / Monthly Heatmap** → these are *nice* but not daily-driver views. Candidates for either (a) a much smaller "Trends" card on Home or (b) the existing Performance page (`/desempeno`)
- Delete the route `/team-lead/dashboard` and the "Open Dashboard" button

### Agent Home — proposed tightening
The clean header D screenshotted is the right pattern. Below the stat row,
the page currently keeps stacking — bulletin, documents, incidents, policies,
signed HR docs, etc. Candidates to slim:
- Collapse "Signed HR Documents" behind a link/button — agents rarely need it daily
- Collapse "Applicable Policies" behind a link — agents see them on `/policies`
- Bulletin: keep top 1–2 unread, link to full list
- Documents: keep upload prompt only when something is missing; otherwise hide

Open question: which two things does an agent actually do here every day —
clock in + submit EOD? If so, those should own the screen and everything else
should be a banner-when-needed or a link.
