# Payroll Rebuild — Handoff for D

_From Joe (+ his Claude), 2026-06-19. Branch: `payroll/task2-autopay`._

This is the complete **quincenal payroll rebuild** Joe specced — built and tested
locally against your `baseline_schema.sql` + seed. It's additive (new tables/screens);
nothing destructive was run. Below is what it does, every file, and the exact prod
steps only you can do. There's a **paste-into-Claude block at the bottom** so your
Claude has the full context immediately.

---

## How payroll works now (the rules Joe confirmed)
Gross / pre-tax (your accountant handles IMSS/ISR). Paid **quincenal** (1st–15th, 16th–end).

- **Base** = monthly ÷ 2 · **Daily** = monthly ÷ 30
- **Missed day** (unjustified absence on a *scheduled* day) = − daily. Off/rest days are paid automatically.
- **Makeup vs overtime**: an off-day someone *works* covers a missed day first (a **makeup**, + daily, no bonus); once misses are covered, further worked off-days are **overtime** (+ $1,000/day). Carries across periods.
- **Sunday premium** (prima dominical) = 25% × daily × Sundays worked.
- **Vacation premium** = 25% × daily × approved vacation days (base already pays the day).
- **Holiday worked** = 2 × daily.
- **Spiffs**: pulled per period from the spiffs table (entered in USD) and converted **USD→MXN ×17**.
- **Override**: any input can be hand-adjusted before lock.

## What was built
**Calc (pure, unit-tested):**
- `src/lib/payrollEngine.ts` (+ `payrollEngine.test.ts`, 16 tests) — `computeNetPay()` + `classifyOffDays()`.

**Data derivation:**
- `src/hooks/usePayrollComputed.ts` — extended to return per-day status (calendar bar), Sundays-worked count, time-off days.
- `src/hooks/usePrepayLock.ts` — Close & Lock: snapshot + lock period + auto-create next period.

**Screens (`/admin/payroll/...`, owner-only):**
- `src/pages/admin/PrePayroll.tsx` (`/prepay`) — the main screen: calendar day-bar + legend, color-coded breakdown, net + month total, PP1/PP2 toggle, Close & Lock.
- `src/pages/admin/PrepayHistory.tsx` (`/prepay/history`) — locked periods + **Send paystubs**.
- `src/App.tsx` — routes added.

**Migrations:**
- `20260618000001_payroll_quincenal_base.sql` — `_calc_pay_components` base monthly/4 → **monthly/2** (faithful CREATE OR REPLACE of your live function; only the base line changed).
- `20260619000001_prepay_lines_snapshot.sql` — `prepay_lines` (frozen per-period snapshot).
- `20260619000002_spiffs.sql` — `spiffs` table mirroring the live Spiffs page.

**Edge function:**
- `supabase/functions/send-paystubs/index.ts` — emails each employee their paystub. Local→Mailpit; prod→Gmail.

**Docs:** `docs/prepay-lock-design.md`, `docs/payroll-rework-divergences.md`, this file.

## To go live (your steps — prod only)
1. **Review the PR.**
2. **Apply the 3 migrations** to prod. ⚠️ **Reconcile the `spiffs` table**: prod already has a spiffs table from the live Spiffs page (it's not in the repo schema). Either point payroll at the prod table or map columns — see `docs/payroll-rework-divergences.md` is calc; spiff mapping is in `20260619000002_spiffs.sql` header.
3. **Deploy** the `send-paystubs` edge function.
4. **Set secrets** so paystubs send via Gmail: `PAYSTUB_SMTP=gmail` (GMAIL_USER / GMAIL_APP_PASSWORD already exist for the EOD digest).
5. **Verify** one test quincena against known employees; check net pay by hand.
6. **Retire the legacy weekly payroll** when ready (the old `/admin/payroll/week/*`, `PayrollRun`, week-based records). This is **destructive — not included**; do it as your own reviewed migration.

## Local dev (to reproduce what we have)
See `docs/payroll-rework.md` + Joe's `PAYROLL_DEV_SETUP.md`. Short version: archive
the historical migrations, use `baseline_schema.sql` as the single baseline,
`supabase db reset`, create a test owner login, `npm run dev`.

---

## Paste this into your Claude
```
You're picking up a finished quincenal payroll rebuild for the JOI-payroll-hr app,
on branch payroll/task2-autopay. Read docs/PAYROLL_REBUILD_HANDOFF.md and
docs/payroll-rework-divergences.md first. The new payroll lives at
/admin/payroll/prepay (+ /prepay/history). Pure calc is src/lib/payrollEngine.ts
(unit-tested). It computes quincenal pay from the time clock: base monthly/2,
missed days, makeup-vs-overtime ($1,000/day), Sunday 25%, vacation 25%, spiffs
USD→MXN ×17. Close & Lock snapshots into prepay_lines and auto-opens the next
period; paystubs email via the send-paystubs edge function (Gmail in prod when
PAYSTUB_SMTP=gmail). Migrations: 20260618000001 (base monthly/2), 20260619000001
(prepay_lines), 20260619000002 (spiffs — RECONCILE with the prod spiffs table from
the live Spiffs page). Help me: apply migrations, reconcile spiffs, deploy the edge
function + set PAYSTUB_SMTP=gmail, verify one quincena, then retire the legacy
weekly payroll. Don't drop anything destructive without confirming with me first.
```
