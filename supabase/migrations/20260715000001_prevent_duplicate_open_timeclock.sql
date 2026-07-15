-- Prevent duplicate OPEN clock-in rows for the same employee on the same day.
--
-- Context (2026-07-15): Adrian Arechiga (EMP-006) accumulated 13 open time_clock
-- rows in one day. Root cause: the clock-in flow does a check-then-insert with no
-- DB-level guard, so concurrent taps (three fired within 2ms) all passed the
-- "already clocked in?" check before any committed, then all inserted. Once >1
-- open row existed, the app's .maybeSingle() status query errored and returned
-- null, so the UI kept showing "Clock In" and every tap added another row.
--
-- This partial unique index makes the database the source of truth: at most one
-- open (clock_out IS NULL) entry per (employee_id, date). A second concurrent
-- insert now fails with a unique violation instead of creating a duplicate.
-- Closed rows are unaffected, so historical/overnight data and forgotten
-- clock-outs on prior dates are fine.

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_clock_one_open_per_day
  ON public.time_clock (employee_id, date)
  WHERE clock_out IS NULL;
