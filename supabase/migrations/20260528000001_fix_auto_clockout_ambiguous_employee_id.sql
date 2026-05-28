-- Fix: auto_clockout_overdue() was failing on every cron run since 2026-04-13
-- because the RETURNS TABLE column "employee_id" collided with tc.employee_id
-- in the body (Postgres 17 is strict about this shadowing).
--
-- 12,879 failed runs total. 7 stranded clock-ins were closed by the next 5-min
-- tick after this migration applied.
--
-- Keeping function signature stable so callers and grants don't change.
-- Just renaming the CTE/RETURNING aliases to disambiguate.

CREATE OR REPLACE FUNCTION public.auto_clockout_overdue()
RETURNS TABLE (closed_id uuid, employee_id uuid, scheduled_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grace_min int := 30;
BEGIN
  RETURN QUERY
  WITH to_close AS (
    SELECT
      tc.id AS tc_id,
      tc.employee_id AS tc_eid,
      tc.clock_in,
      tc.shift_end_expected,
      COALESCE(EXTRACT(EPOCH FROM (tc.lunch_end - tc.lunch_start)) / 60.0, 0) AS lunch_minutes
    FROM public.time_clock tc
    WHERE tc.clock_out IS NULL
      AND tc.shift_end_expected IS NOT NULL
      AND tc.shift_end_expected < (now() - (grace_min || ' minutes')::interval)
  ),
  updated AS (
    UPDATE public.time_clock tc
       SET clock_out = c.shift_end_expected,
           auto_clocked_out = true,
           total_hours = ROUND(
             (EXTRACT(EPOCH FROM (c.shift_end_expected - c.clock_in)) / 3600.0
              - (c.lunch_minutes / 60.0))::numeric,
             2
           )
      FROM to_close c
     WHERE tc.id = c.tc_id
    RETURNING tc.id AS upd_id, tc.employee_id AS upd_eid, tc.shift_end_expected AS upd_end
  )
  SELECT upd_id, upd_eid, upd_end FROM updated;
END;
$$;

COMMENT ON FUNCTION public.auto_clockout_overdue IS
  'Closes open time_clock entries whose shift_end_expected passed > 30 min ago. Sets auto_clocked_out=true. Returns closed row info for downstream notifiers. Renamed inner aliases 2026-05-28 to avoid Postgres 17 ambiguous-column error.';
