# UI Layout & Feature Location

Living reference for what every page does, who can see it, and where it lives.
Update this when pages are added, renamed, restructured, or deleted.

Last updated: 2026-05-21

---

## Roles and landing pages

`App.tsx → RoleHome()` decides what `/` renders based on the logged-in user:

| Role(s)                       | Lands on `/`                                | File                            |
|-------------------------------|---------------------------------------------|---------------------------------|
| owner / admin / manager       | `Dashboard`                                 | `src/pages/Dashboard.tsx`       |
| team_lead                     | `TeamLeadHome`                              | `src/pages/TeamLeadHome.tsx`    |
| agent                         | `EmployeeHome`                              | `src/pages/EmployeeHome.tsx`    |
| client                        | redirected to `/client` → `ClientDashboard` | `src/pages/ClientDashboard.tsx` |

Auth wrappers (in `src/components/RequireRole.tsx`):
- `RequireOwner` — owner only
- `RequireLeadership` — owner + admin + manager
- `RequireTeamLeadOrAbove` — owner + admin + manager + team_lead
- `RequireClient` — client portal access

---

## Page layouts

Two top-level layouts:

- **`AppLayout`** (`src/components/AppLayout.tsx`) — wraps every non-client route. Renders `AppSidebar` on the left and the page on the right.
- **`ClientLayout`** (`src/components/ClientLayout.tsx`) — completely separate layout for `/client/*`. No `AppSidebar`. Designed for external client users who only see their own campaigns.

---

## Sidebar nav per role

Source: `src/components/AppSidebar.tsx`.

### Leadership (owner / admin / manager)
**Menu**: Dashboard, Employees, Payroll, Payroll History, Invoices (USD), Campaigns, My Policies, Announcements.

**Human Resources**: Attendance, Performance, 30-Day Reviews, Time Off Requests, Document Types, Departments, Manage Policies, Time Off, Cartas y Actas, My Timeclock, My EOD History.

**Owner-only**: System Users.

### Team Lead
Home, My Team, 30-Day Reviews, Time Off Requests, Shift Settings, My Policies, My Timeclock, My EOD History, Announcements.

### Agent
Dashboard, My Timeclock, My EOD History, Time Off Requests, My Policies, Vacation, Holiday Requests, Announcements.

---

## Pages by area

### Home & landing

| Page              | Route           | Role gate          | What it does                                                                                          |
|-------------------|-----------------|--------------------|-------------------------------------------------------------------------------------------------------|
| `Dashboard`       | `/` (leadership)| leadership only    | Payroll overview: current cutoff banner, biweekly period summary, alert tiles (TCW, late punches).    |
| `TeamLeadHome`    | `/` (TL)        | team_lead only     | "My Day" hero + My Team modules. See "Shared HomeHero" + "ApprovalsCard" + "TodaysRosterCard" below. |
| `EmployeeHome`    | `/` (agent)     | agent only         | Clock-in panel + Quick Actions + week stats + bulletin/documents/policies cards.                      |
| `ClientDashboard` | `/client`       | client only        | List of client's campaigns with quick stats. Lives inside `ClientLayout`, not `AppSidebar`.           |
| `Index`           | `/index` legacy | any                | Stub / redirect. Not in normal nav flow.                                                              |
| `Auth`            | `/auth`         | public             | Login screen. Signups currently disabled (memory: invite-only since 2026-05-18).                      |
| `ResetPassword`   | `/reset-password` | public          | Password reset flow.                                                                                  |
| `NotFound`        | `*`             | any                | 404 page.                                                                                             |

### People

| Page              | Route               | Role gate              | What it does                                                                                  |
|-------------------|---------------------|------------------------|-----------------------------------------------------------------------------------------------|
| `Empleados`       | `/empleados`        | leadership             | Employee management list: filter, search, new-hire flagging, terminate, role/title changes.   |
| `EmpleadoPerfil`  | `/empleados/:id`    | TL+                    | Individual employee profile: personal info, documents, attendance history, Agent Log, payroll snapshot, terminate dialog. |
| `SystemUsers`     | `/admin/system-users` | owner only           | Non-employee logins (partners/auditors) with `is_system_user` flag. Hidden from payroll views. |
| `Account`         | `/account`          | any auth               | The current user's account settings (name, email, password).                                  |

### Time & attendance

| Page                | Route               | Role gate     | What it does                                                                                |
|---------------------|---------------------|---------------|---------------------------------------------------------------------------------------------|
| `Timeclock`         | `/reloj`            | any auth      | Full clock-in / clock-out / break / lunch / EOD interface. Shown as "My Timeclock" in nav.   |
| `EODForm`           | `/eod`              | any auth      | "My EOD History" — past EOD submissions, backfill missing entries within 2 days.            |
| `Attendance`        | `/asistencia`       | TL+           | Real-time attendance board: Present/Absent/Late/Repeat-Lates, agent table, edit-punch dialog. For TLs this is the "My Team" nav item, scoped to their direct reports. |
| `Performance`       | `/desempeno`        | TL+           | EOD reports per campaign — historical KPI views.                                            |
| `ShiftSettings`     | `/settings/shifts`  | TL+           | Per-campaign shift definitions: start, end, grace, working days.                            |
| `VacationRequests`  | `/vacation`         | any auth      | Agent vacation request form + status list. Manager review elsewhere.                        |
| `HolidayRequests`   | `/holidays`         | any auth      | Agent opt-out for upcoming holidays (Mexican holidays). TLs approve via the Approvals card. |
| `HrTimeOff`         | `/hr/time-off`      | leadership    | HR-wide view of all time-off requests across the org.                                       |
| `TimeOff`           | `/solicitudes`      | any auth      | Time Off Requests page — agents see their own; TLs see their team's queue with approve/deny. |
| `AgentReviews`      | `/reviews`          | TL+           | 30-day review queue. Lifecycle: notified → reviewed → archived. Email notifications gated by `DRY_RUN_REVIEW`. |

### Payroll

The current payroll system lives under `/admin/payroll/*` (Phase 4a+). The legacy `/payroll-run` page is still reachable by URL but no longer in the sidebar.

| Page                    | Route                          | Role gate    | What it does                                                                              |
|-------------------------|--------------------------------|--------------|-------------------------------------------------------------------------------------------|
| `admin/Payroll`         | `/admin/payroll`               | leadership   | Payroll home: week list, current period status, kick off a run.                          |
| `admin/PayrollWeek`     | `/admin/payroll/week/:weekId`  | leadership   | Per-week run detail: per-agent earnings, adjustments, finalize.                          |
| `admin/PayrollAgent`    | `/admin/payroll/agent/:id`     | leadership   | Per-agent pay detail across periods.                                                     |
| `admin/PayrollRates`    | `/admin/payroll/rates`         | leadership   | Set per-employee pay rates (monthly_base_salary, daily_discount_rate, etc.).             |
| `admin/PayrollHolidays` | `/admin/payroll/holidays`      | leadership   | Mexican statutory holiday calendar — drives holiday pay logic.                           |
| `admin/PayrollPeriods`  | `/admin/payroll/periods`       | leadership   | Biweekly pay periods — define cutoffs and pay dates.                                     |
| `PayrollRun`            | `/payroll-run` (legacy)        | leadership   | Old single-week run UI from before Phase 4a. URL still resolves; no nav entry.            |
| `Historial`             | `/historial`                   | leadership   | Read-only payroll history view.                                                          |
| `Facturas`              | `/facturas`                    | leadership   | USD invoices list (e.g. JOI billing clients in USD).                                     |
| `FacturaNueva`          | `/facturas/nueva`              | leadership   | Create a new USD invoice.                                                                |
| `FacturaDetalle`        | `/facturas/:id`                | leadership   | View / print one invoice.                                                                |

### HR documents

| Page                | Route                              | Role gate   | What it does                                                                          |
|---------------------|------------------------------------|-------------|---------------------------------------------------------------------------------------|
| `HrDocumentQueue`   | `/hr/document-queue`               | leadership  | "Cartas y Actas" — pending letter/acta drafts to review and send.                     |
| `HrDocumentDraft`   | `/hr/document-queue/:id/edit`      | leadership  | Editor for one letter draft. Includes preview + send.                                 |
| `DocumentTypes`     | `/settings/document-types`         | leadership  | Required document types config (per role / per status).                               |
| `Departments`       | `/settings/departments`            | leadership  | Department list — used for the 3-tier client/campaign/department model.               |

### Policies

| Page              | Route                  | Role gate   | What it does                                                                                  |
|-------------------|------------------------|-------------|-----------------------------------------------------------------------------------------------|
| `Policies`        | `/settings/policies`   | leadership  | Manage policies — create, version, set acknowledgment requirements.                           |
| `MyPolicies`      | `/policies`            | any auth    | Agent's own applicable policies + ack history.                                                |

### Campaigns

| Page                | Route               | Role gate    | What it does                                                                                  |
|---------------------|---------------------|--------------|-----------------------------------------------------------------------------------------------|
| `Campaigns`         | `/campaigns`        | leadership   | Campaign list across all clients. Now owns KPI field config (was EODFormBuilder).             |
| `CampaignDetail`    | `/campaigns/:id`    | leadership   | Single campaign: assigned TLs, KPI field config, EOD digest cutoff, recipients.               |
| `EODFormBuilder`    | (no route)          | n/a          | **DEPRECATED 2026-04-14** — file kept temporarily so stale imports trip a build error; safe to delete. |

### Communications

| Page         | Route          | Role gate   | What it does                                                                                            |
|--------------|----------------|-------------|---------------------------------------------------------------------------------------------------------|
| `Comunicados`| `/comunicados` | any auth    | Bulletin / announcements. Owner/admin can publish posts that require acknowledgment; agents acknowledge. |

### Client portal (separate `ClientLayout`)

| Page                    | Route                       | Role gate | What it does                                                |
|-------------------------|-----------------------------|-----------|-------------------------------------------------------------|
| `ClientDashboard`       | `/client`                   | client    | List of client's campaigns with summary tiles.              |
| `ClientCampaignDetail`  | `/client/campaign/:id`      | client    | Per-campaign view tailored for the external client.         |

### Admin / setup

| Page             | Route                      | Role gate | What it does                                                                                              |
|------------------|----------------------------|-----------|-----------------------------------------------------------------------------------------------------------|
| `ProvisionOrg`   | `/admin/provision-org`     | owner     | New-organization provisioning. Route + page + edge function exist; nav entry hidden until multi-tenancy is in scope. |
| `SystemUsers`    | `/admin/system-users`      | owner     | Listed above under People. Manages partners / auditors with `is_system_user = true`.                       |

---

## Shared components worth knowing about

| Component                                                | Purpose                                                                            |
|----------------------------------------------------------|------------------------------------------------------------------------------------|
| `src/components/AppLayout.tsx`                           | Default layout: sidebar + main content.                                            |
| `src/components/AppSidebar.tsx`                          | Role-aware sidebar nav.                                                            |
| `src/components/ClientLayout.tsx`                        | Standalone layout for the client portal — no internal sidebar.                     |
| `src/components/RequireRole.tsx`                         | All `Require*` route guards live here.                                             |
| `src/components/HomeHero.tsx`                            | Shared "My Day" hero: header + Today + Quick Actions + stat row. Used by TL home; agent home migrates to it in PR 3. |
| `src/components/TodaysRosterCard.tsx`                    | TL home roster — Missing-yesterday strip + Nudge buttons.                          |
| `src/components/ClockOutEODDialog.tsx`                   | Modal that captures EOD answers when an agent clocks out.                          |
| `src/components/SubmitEODForAgentDialog.tsx`             | TL submits EOD on behalf of a no-login agent (Day 1–30). Writes `eod_logs_audit`.   |
| `src/components/EditPunchDialog.tsx`                     | Edit a `time_clock` row's clock-in/out.                                            |
| `src/components/ChangeRoleDialog.tsx`                    | Update `employees.title` (then `user_profiles.role` nudges via trigger).            |
| `src/components/TerminateEmployeeDialog.tsx`             | Terminate flow on `EmpleadoPerfil`.                                                |
| `src/components/GoalPromptDialog.tsx`                    | First-login prompt for an agent's personal goal.                                   |
| `src/components/DocumentStatusBadge.tsx`                 | Pill showing required-doc compliance state.                                        |
| `src/components/ClientCampaignPicker.tsx`                | Client/campaign selector used in payroll and elsewhere.                            |
| `src/components/NavLink.tsx`                             | Sidebar nav link wrapper.                                                          |
| `src/components/bulletin/*`                              | Bulletin post composer + viewers.                                                  |
| `src/components/employee-profile/*`                      | Sub-cards used by `EmpleadoPerfil` (HR log, documents, attendance, signed docs).   |
| `src/components/ui/*`                                    | shadcn primitives (Button, Card, Dialog, Table, etc.).                             |

---

## Implementation status (recent refactors)

| PR  | What                                                                                | Status               |
|-----|-------------------------------------------------------------------------------------|----------------------|
| 1a  | Create `HomeHero` + use it at top of `TeamLeadHome`                                 | Done 2026-05-21      |
| 1b  | Merge Holiday + Vacation + Time Off → one `ApprovalsCard`                           | Done 2026-05-21      |
| 2   | Kill TLDashboard, new `TodaysRosterCard` with Missing Yesterday + Submit-for-agent + working Nudge button | Done in working tree 2026-05-21 (not pushed) |
| 3   | Slim `EmployeeHome` to use `HomeHero` + new bottom structure                        | Pending              |

### HomeHero (PR 1a)

`src/components/HomeHero.tsx` — header + Today panel + Quick Actions + stat row. Self-contained: queries `time_clock`, `shift_settings`, week entries, bulletin unread count. Owns clock-in mutation + confirm dialog. Props: `employeeId`, `firstName`, `subtitle`, `campaignId`.

### ApprovalsCard (PR 1b)

Inside `TeamLeadHome.tsx`. One `<ApprovalsCard employeeId={…} />` replaces what used to be up to 2N+1 separate cards (Holiday per campaign + Vacation per campaign + Pending Time Off).

Sub-components:
- `TimeOffSection` — pending time-off across all direct reports. Owns its own approve/deny mutation.
- `HolidaySection` — per campaign, auto-hides if no upcoming holiday.
- `VacationSection` — per campaign, auto-hides if no pending vacation.

### TodaysRosterCard + Nudge audit log (PR 2)

`src/components/TodaysRosterCard.tsx` replaces the old "Today's Attendance" card on `TeamLeadHome`.

- **Missing yesterday's EOD strip** — amber rows for any agent who clocked in yesterday without submitting an EOD. Each row's "Submit for [name]" button opens `SubmitEODForAgentDialog` with `defaultDate = yesterday`. Lazy-fetches campaign KPI config when the dialog opens.
- **Working Nudge button** — for late/absent agents. Upserts into `tl_nudges (employee_id, date, nudged_by, nudged_at)`. Button switches to `"Nudged X min ago"` once tapped. **Audit log only — no notification is sent.**

New data hooks in `src/hooks/useTeamLead.ts`:
- `useMissingYesterdayEod(tlEmployeeId)` — agents clocked in yesterday but no `eod_logs` entry for yesterday.
- `useTodayNudges(tlEmployeeId)` — `Map<employee_id, NudgeRow>` for O(1) lookup per roster row.
- `useCreateNudge()` — upsert mutation.

### Killed in PR 2

- **`src/pages/TLDashboard.tsx`** — entire page. Useful bits absorbed into `TodaysRosterCard`. The rest (Daily Submissions chart, Weekly Leaderboard, 4-Week Trends, Monthly Heatmap, inline Coaching Note dialog) were not regularly used. Agent Log on `EmpleadoPerfil` (and `AgentHRLogCard` on `EmployeeHome`) remains the canonical place to read/write notes.
- **`/team-lead/dashboard` route** in `App.tsx`.
- **`src/components/ClockInWidget.tsx`** — orphaned after PR 1a, removed in PR 2.

### DB migrations log (this refactor)

- `tl_nudges_and_drop_coaching_notes` — created `tl_nudges` (composite PK `(employee_id, date)`, 4 RLS policies using `is_leadership()` / `is_team_lead()` / `my_team_member_ids()` / `my_employee_id()` / `my_org_id()`). Also dropped `agent_coaching_notes` — **this was a mistake**.
- `restore_agent_coaching_notes` — rolled back the drop. The table backs the broader Agent Log feature (notes + verbal warnings) used by `EmpleadoPerfil` and the `AgentHRLogCard` on `EmployeeHome`. Test rows lost; no real data lost.

---

## Known overlap and dead-route hygiene

| Issue                                                                                | Where                                                                |
|--------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| `EODFormBuilder` is deprecated; safe to delete                                       | `src/pages/EODFormBuilder.tsx`                                       |
| `PayrollRun` is the legacy payroll UI; route still resolves but no nav entry         | `src/pages/PayrollRun.tsx`, route `/payroll-run` in `App.tsx`        |
| `/admin/provision-org` route + page wired but nav entry commented out                | `src/components/AppSidebar.tsx` lines ~266-290                       |
| `ClockInWidget` orphaned after PR 1a (removed in PR 2 once shipped)                  | `src/components/ClockInWidget.tsx`                                   |

---

## Proposed direction for PR 3 (Agent Home)

Top of page stays — same `HomeHero` agent home already uses. Below it, three thin sections replace the long stack of cards:

1. **Needs your attention** — banners that only render when something's pending: missing EOD (Submit now button), policies to ack (Review button), compliance grace warnings.
2. **At a glance** — the daily-changing visuals: latest unread announcement (one item with "See all →") + the existing Hours This Week bar chart.
3. **More** — 2×2 grid of compact link tiles for things agents rarely need: My documents, Policies, Cartas y actas, Personal goal. Each tile shows a one-line status under its title.

Cuts: the standalone "Signed HR documents" card, "Applicable policies" card, "Document uploads" card, and the always-on goal reminder card all move behind tiles or banners.

---

## How to keep this doc up to date

- Add a row when a page is created, renamed, or relocated.
- Strike a row through (or mark `**DEPRECATED**` like `EODFormBuilder`) when a page is being phased out — leave it visible until the file is actually deleted.
- Update the implementation status table after each PR.
- DB migrations affecting UI behavior get a line in the migrations log.
