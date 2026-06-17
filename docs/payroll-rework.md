# Payroll Rework — Kickoff Brief for Joe

_For Joe + his Claude session · Last updated: 2026-06-16_

> Joe has run JOI payroll for months and knows the formulas, the edge cases, and
> the history. This brief is **not** a payroll tutorial — it's a map of the current
> code state, the goal, and the rules of the road. Joe: where my read of the code
> conflicts with what you know, trust yourself and flag it.

## Kickoff message for Joe's Claude (paste this in)

Joe — paste the block below into a fresh Claude session opened in the repo folder.
It tells your Claude what to do, what's flexible, and what the hard lines are.

```
You're helping Joe finish the payroll rework in the JOI-payroll-hr app. Read
docs/payroll-rework.md in this repo first — it's the brief. Then work with Joe
through the Task plan, one task = one branch = one PR.

FIRST THING, before anything else: connect to GitHub. We can't pull the app
files or open a PR until you're authenticated. Walk Joe through:
  gh auth login   (GitHub.com → HTTPS → login with a web browser)
  gh auth setup-git
Then do the first pull of the app: `gh repo clone sandoval-art/JOI-payroll-hr`
(or `git pull` if it's already cloned). Confirm you can see the files before
moving on.

How to treat this brief:
- The payroll FORMULAS and how the feature should FUNCTION are guidance, not law.
  D wrote them from his understanding; Joe has actually run payroll for months.
  Where they conflict, trust Joe, flag the difference, and adjust. These are not
  hard rules.

HARD RULES (do not bend these):
- NEVER delete, drop, or truncate database data or tables. Adding or altering
  columns/tables is fine; anything destructive stops and waits for D's approval.
- If a change reaches OUTSIDE the payroll app (other features, shared tables,
  auth, app-wide config, anything that could affect the rest of the app), STOP.
  Write a short brief as a markdown file in the repo (docs/) describing the
  change and what it could affect, so D can review the impact before it ships.
  Don't quietly make app-wide changes inside a payroll PR.
- main is protected. You may commit, push, and open PRs, but D is the only one
  who merges to main and the only one who applies migrations to production.

Start by confirming GitHub access, then ask Joe the four questions under
"Things only Joe knows — please confirm" before touching Task 1.
```

## Goal

Stop losing track of missed days and bonuses. Make one payroll screen that pulls
what the app already knows, calculates correct **quincenal** net pay (15th + last
day of month), lets you override exceptions, and locks the period when done.

This is a **finish-and-fix**, not a rebuild. The attendance/holiday/time-off merge
already works — don't throw it away.

## Pay cadence (confirmed by D)

Quincenal — paid on the **15th and last day** of each month. No weekly pay.
Joe: confirm no employee group is actually weekly before Task 1.

---

## Onboarding — getting GitHub + Supabase access

Joe's Claude can walk him through this. Repo: `sandoval-art/JOI-payroll-hr`.

### GitHub — use the `gh` CLI (least-friction path)

The GitHub CLI is the one tool that handles **login AND opening PRs**, so Joe's
Claude can run the whole commit → push → PR loop from its own session. No SSH
keys, no manually-pasted access tokens, no git credential fiddling. Joe should
not have to memorize git — his Claude drives this.

1. Accept the collaborator invite (email from GitHub, or github.com/notifications).
   Joe gets **Write** access.
2. Install prerequisites: Node 18+, npm, git, and the **GitHub CLI** (`gh`).
   - macOS: `brew install gh`
   - Windows: `winget install GitHub.cli`
   - Linux / other: https://github.com/cli/cli#installation
3. **Authenticate once.** This is the step that removes every other workaround —
   `gh` sets up git push auth for you as part of login:
   ```bash
   gh auth login
   # choose: GitHub.com → HTTPS → "Login with a web browser"
   gh auth setup-git   # makes git push/pull use the gh credentials
   ```
4. Clone and install:
   ```bash
   gh repo clone sandoval-art/JOI-payroll-hr
   cd JOI-payroll-hr
   npm install
   ```
5. **`main` is protected — nobody pushes to it directly, including Joe.** All work
   goes branch → commit → push → PR (see "Ship loop" below). D reviews and merges.
   (Required approval = 1, no self-merge.)

### Ship loop — how Joe's Claude commits each change

Joe's Claude runs this itself. One task = one branch = one PR. Joe just describes
the change and reviews; he doesn't touch git by hand.

```bash
git checkout main && git pull          # start from latest
git checkout -b payroll/<task>         # e.g. payroll/quincenal-base
# ...Claude makes the code changes...
git add -A
git commit -m "payroll: <what changed>"
git push -u origin payroll/<task>
gh pr create --fill --base main        # opens the PR in one shot
```

`gh pr create --fill` reuses the commit message as the PR title/body. To add
detail: `gh pr create --base main --title "..." --body "..."`. Check CI/status
later with `gh pr status`.

**The merge stays with D.** `gh` lets Joe's Claude open the PR, but `main` is
protected and D is the only one who merges. That's deliberate — it's the safety
net, not a workaround to remove.

### Supabase — local dev database (chosen approach: free, fully isolated)

Joe builds against a **local Supabase** on his own machine. $0/month, no prod
access, no live-data risk. Production is `joi-hr` (ref `jpaihltkrohdqkqlbqkf`), org
on the free plan — **do not** point local dev at it.

**One-time bootstrap (D only — needs the prod DB password):**
The repo currently has no committed migrations; this step exports the prod schema
into the repo so local dev (and a proper git schema record) become possible.
```bash
# in the repo root
supabase login
supabase init                       # creates supabase/ + config.toml (if missing)
supabase link --project-ref jpaihltkrohdqkqlbqkf   # enter prod DB password
supabase db pull                    # writes supabase/migrations/<ts>_remote_schema.sql
```
Commit the generated `supabase/` files on a branch → PR → D merges. From now on,
schema changes ship as migration files in PRs (no more MCP-only migrations).

**Per-developer (Joe):**
1. Install Docker + the Supabase CLI.
2. `supabase start` — boots a local stack and applies the committed migrations.
   The output prints a local `API URL` and `anon key`.
3. Seed test data (see `supabase/seed.sql` — ~5 fake employees with punches,
   a campaign, shift settings, and a holiday so payroll has something to compute).
   Joe's Claude can generate this against the live local schema.
4. Create `.env.local` in the repo root:
   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<local anon key from `supabase start`>
   ```
5. `npm run dev` → app runs against the local DB. Log in as a seeded `admin`.

**Migrations going forward:** Joe writes migration files under `supabase/migrations`
and tests them locally (`supabase db reset`). They ride his PR. **Only D applies
them to production** (via `supabase db push` or the Supabase MCP) after merge.

---

## Current code state (file map)

**Already works — the merge engine:**
- `src/hooks/usePayrollComputed.ts` — per period, computes days absent, Sundays
  worked, holidays worked, extra days from `time_clock` + `shift_settings` +
  `mexican_holidays` + approved `vacation_requests`.
- `src/hooks/useHolidayPayFlags.ts` — 200% holiday premium flags.
- `src/hooks/useVacationPayFlags.ts` — 25% prima vacacional flags.

**The calc engine:**
- `src/types/payroll.ts` — `previewPay()` (client) + `calculatePay()` (RPC).
- DB twin: `pay_calc_record()` in migration
  `20260519000005_payroll_phase2_calc_engine.sql`.

**Two competing screens (the core mess):**
- `src/pages/PayrollRun.tsx` (`/payroll-run`) — LEGACY. Shows the computed numbers
  but `computeNet()` returns `EMPTY_PAYROLL_RESULT`, so **net pay renders $0**.
  Likely what made payroll feel broken.
- `/admin/payroll` (Phase 4a/4b): `Payroll`, `PayrollWeek`, `PayrollAgent`,
  `PayrollRates`, `PayrollPeriods`, `PayrollHolidays` — newer system, real engine.

## Known issues to fix

1. **Cadence mismatch.** Base pay derives as `monthly / 4` (weekly) and the new
   screens are week-organized (`/admin/payroll/week/:weekId`). We pay quincenal →
   base should be `monthly / 2`. `getCurrentPeriodDates()` already emits correct
   quincenas (1–15, 16–end); the math just doesn't match it.
2. **Two screens.** Need one. Legacy `/payroll-run` shows $0 net pay.
3. **Mid-migration leftovers.** Dead `calcularNomina()`, legacy shims, "Phase 4c"
   TODOs.

---

## Hotfix log / notes for Joe

**2026-06-17 — disabled legacy auto-create-period (stopgap, feeds Task 3).**
Production was throwing `null value in column "period_code" of relation
"payroll_periods" violates not-null constraint` (3× at 08:25). Cause: Phase 1 made
`period_code/year/month/half` NOT NULL on `payroll_periods`, but the legacy
`useCreatePeriod()` in `src/hooks/useSupabasePayroll.ts` only inserts
`start_date/end_date/period_type`. Dashboard, EmpleadoPerfil, and PayrollRun all
call it from an auto-create `useEffect`, and `useActivePeriod()` reads the old
lowercase status `"open"` (live system uses `"OPEN"`), so no period is ever found
and the broken insert fired on every page visit.

Stopgap applied: `useCreatePeriod()` is now a no-op (logs a warning, touches no DB).
This only stops the bleeding — it does not remove the dead path.

**Joe, when you do Task 3 (retire the legacy screen):** also delete these
now-dead auto-create effects and the legacy period hooks rather than leaving the
no-op shim. Sites to clean up:
- `src/pages/Dashboard.tsx` (~line 62–67 auto-create effect)
- `src/pages/EmpleadoPerfil.tsx` (~line 292–297)
- `src/pages/PayrollRun.tsx` (~line 81–86)
- `src/pages/Historial.tsx` (~line 120, re-create on close)
- `src/hooks/useSupabasePayroll.ts` — `useCreatePeriod`, `useActivePeriod`,
  `useClosePeriod` (all query lowercase status; superseded by `usePayroll.ts`).

### Knock-on: who still reads the dead `useActivePeriod()`

`useActivePeriod()` queries lowercase status `"open"`, so it has returned `null`
since Phase 1 (live status is `"OPEN"`). These were already degraded before the
2026-06-17 no-op — the no-op did not cause them, it just stopped the insert error.
Replacements already exist in the new `/admin/payroll` system; these legacy
surfaces should be repointed or removed during the rework:

- **EmpleadoPerfil.tsx** — payroll summary card (`empPayrollRecord` from empty
  `records`) shows blank net pay. Real figure is at `/admin/payroll/agent/:id`.
- **Dashboard.tsx** — SPIFF import "Confirm" (`handleConfirmSpiff`). Was silently
  no-op'ing (early-return on always-null `activePeriod`). As of 2026-06-17 it shows
  an error toast and aborts instead of silently dropping bonuses. NOTE: a period-id
  repoint is NOT the fix — the live `payroll_records` table has no `period_id` and
  no `additional_bonuses` column, and its unique key is `(week_id, employee_id)`.
  The legacy `useUpsertPayrollRecord` (writes `period_id`/`additional_bonuses`,
  onConflict `employee_id,period_id`) is broken against this schema. Real rewire:
  write SPIFF amounts by `week_id` into `extra_bonus` (or `commission`). KPI cards/
  biweekly total already use the new hooks and are fine.
- **Historial.tsx** — "Close Period" button (`{activePeriod && …}`) never renders;
  close/lock belongs to the new system (Task 4).
- **PayrollRun.tsx** — gated on `activePeriod`, stuck on loading; retired in Task 3.
- **Empleados.tsx** — declares `records` from the dead hook but never uses it;
  drop the orphan query.

---

## Task plan (one task = one PR, in order)

1. **Lock cadence to quincenal.** Change base from `monthly/4` to `monthly/2` in
   BOTH `previewPay` (TS) and `pay_calc_record` (SQL) — they must stay in sync.
   Update copy in `PayrollRates.tsx`. Re-label "weekly" base → "quincena" without
   breaking stored data.
2. **Make net pay real on one screen.** Wire `usePayrollComputed` + the flag hooks
   into the new engine screen so net pay computes via `previewPay`/`calculatePay`.
   Keep the per-row overrides + KPI/bonus inputs from `PayrollRun.tsx`.
3. **Retire the legacy screen.** Remove/redirect `/payroll-run` once the new screen
   has parity.
4. **Close & lock period.** Implement the disabled "Close Period" action; closing
   locks records and sends the period to history.
5. **Verify.** Run one test quincena on 2–3 known employees, check net pay by hand,
   sign off only when it matches.

## Things only Joe knows — please confirm

- Why was base set to `monthly/4`? Was the new system meant to be weekly on
  purpose, or is that drift?
- Is `/admin/payroll` (Phase 4a/4b) intended to fully replace `PayrollRun`, or do
  they serve different purposes?
- What's left of "Phase 4c"? Any of this already in flight?
- Any deductions beyond absences/custom (e.g., IMSS, ISR, loans) that should land
  in this rework vs. later?

## Guardrails

- Branch → PR. **D is the only one who merges to `main` and applies prod
  migrations.** `main` is protected; PRs need approval.
- `previewPay` (TS) and `pay_calc_record` (SQL) must always agree.
- This is calculation/UI logic only — don't modify employee pay data.
