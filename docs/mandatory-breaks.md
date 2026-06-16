# Mandatory breaks + late-return reasons

Shipped: 2026-06-16 (migration `20260616000001_mandatory_breaks_late_reason`)

## What changed

1. **Breaks are now mandatory before clock-out.** An employee cannot clock out
   until lunch and both 15-minute breaks have each been started *and* ended. The
   Timeclock screen shows a checklist of what's still required and disables the
   Clock Out button until they're all done.

2. **Late return from a break requires a reason.** When an employee ends a break
   that ran over its cap, a dialog appears and they must type a short reason
   (min 3 characters) before the break can be ended. The reason is saved on the
   time_clock row and shown to supervisors.

## How "late" is decided

The app uses **duration caps**, not fixed clock-times:

- Lunch cap: 60 minutes (unpaid — deducted from hours)
- Break 1 / Break 2 cap: 15 minutes each (paid — not deducted)

A return counts as late once elapsed time exceeds `cap + grace`. Grace defaults
to **0** (any minute over). It's configurable per campaign via
`shift_settings.break_grace_minutes` so it can be loosened later without a code
change.

## Data model

`time_clock` new columns:

- `lunch_late_reason text` — reason for ending lunch over cap (null = on time)
- `break1_late_reason text` — reason for ending break 1 over cap
- `break2_late_reason text` — reason for ending break 2 over cap

`shift_settings` new column:

- `break_grace_minutes int not null default 0`

## Safety nets for forgotten breaks

Because breaks now block clock-out, two existing mechanisms prevent employees
from getting stuck:

- **Auto clock-out** (`auto_clockout_overdue`, pg_cron every 5 min) closes any
  open entry 30 min after its scheduled shift end, regardless of break state.
- **Edit punch** dialog lets HR/TL/managers add or fix break times after the
  fact; it also now displays any late-return reasons the employee gave.

## UI touch points

- `src/pages/Timeclock.tsx` — reason dialog, clock-out gate, history indicators
- `src/components/EditPunchDialog.tsx` — read-only display of late reasons

## Follow-up

- Regenerate Supabase TS types after shipping:
  `supabase gen types typescript --project-id jpaihltkrohdqkqlbqkf > src/integrations/supabase/types.ts`
- Optional later: surface late-return reasons in the TL/attendance dashboards.
