-- Measure the time-off notice window in Guadalajara time, not UTC.
--
-- Context (2026-07-16): Lydia Juarez (EMP-009) could not save an unpaid
-- Personal-leave request. The DB rejected it with "Personal leave requires at
-- least 7 days notice". Root cause: request_vacation_off computed the earliest
-- allowed start date with CURRENT_DATE, which on Supabase is UTC. The web form
-- computes the same window in the employee's local (America/Mexico_City) time.
-- After ~6pm local, UTC has already rolled to the next calendar day, so the
-- form lets an employee pick a date that the RPC then rejects as "too soon" --
-- even though it is exactly 7 (or 21) days out on their calendar.
--
-- Fix: derive v_today from America/Mexico_City so the notice window matches the
-- business timezone and the front-end. Same principle we already apply to
-- time_clock/eod_logs via todayLocal(). Only the date basis changes; every
-- rule (21-day vacation, 7-day other, tenure, balance, overlap) is unchanged.
--
-- NOTE: the active RPC (with p_request_type) lived only in the live DB, not in
-- repo migrations (version drift). This file re-establishes it in the repo.

CREATE OR REPLACE FUNCTION public.request_vacation_off(
  p_employee_id uuid,
  p_campaign_id uuid,
  p_start_date date,
  p_end_date date,
  p_notes text DEFAULT NULL::text,
  p_request_type text DEFAULT 'vacation'::text
)
 RETURNS vacation_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days        integer;
  v_balance     record;
  v_overlap     integer;
  v_result      public.vacation_requests;
  v_is_paid     boolean;
  v_min_notice  integer;
  v_type_label  text;
  v_today       date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  -- Self-service only
  IF p_employee_id IS DISTINCT FROM public.my_employee_id() THEN
    RAISE EXCEPTION 'Forbidden: you may only file time-off requests for yourself'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_type NOT IN ('vacation','sick','personal','other') THEN
    RAISE EXCEPTION 'Invalid request_type: %', p_request_type USING ERRCODE = 'P0001';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date' USING ERRCODE = 'P0001';
  END IF;

  -- Notice rule: Vacation 21 days (LFT), everything else 7 days
  v_min_notice := CASE WHEN p_request_type = 'vacation' THEN 21 ELSE 7 END;
  v_type_label := CASE WHEN p_request_type = 'vacation' THEN 'Vacation' ELSE initcap(p_request_type) || ' leave' END;

  IF p_start_date < (v_today + (v_min_notice || ' days')::interval)::date THEN
    RAISE EXCEPTION '% requires at least % days notice', v_type_label, v_min_notice
      USING ERRCODE = 'P0001';
  END IF;

  v_days := (p_end_date - p_start_date + 1);

  IF p_request_type = 'vacation' THEN
    SELECT * INTO v_balance FROM public.get_vacation_balance(p_employee_id);

    IF v_balance.years_of_service < 1 THEN
      RAISE EXCEPTION 'Paid vacation requires at least 1 year of service' USING ERRCODE = 'P0001';
    END IF;

    IF v_balance.available_days < v_days THEN
      RAISE EXCEPTION 'Insufficient vacation balance (% days requested, % available)',
        v_days, v_balance.available_days USING ERRCODE = 'P0001';
    END IF;

    v_is_paid := true;
  ELSE
    v_is_paid := false;
  END IF;

  SELECT COUNT(*) INTO v_overlap
  FROM public.vacation_requests
  WHERE employee_id = p_employee_id
    AND status NOT IN ('denied', 'cancelled')
    AND start_date <= p_end_date
    AND end_date   >= p_start_date;

  IF v_overlap > 0 THEN
    RAISE EXCEPTION 'You already have a time-off request overlapping those dates' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.vacation_requests
    (employee_id, campaign_id, start_date, end_date, days_requested, notes, status, request_type, is_paid)
  VALUES
    (p_employee_id, p_campaign_id, p_start_date, p_end_date, v_days, p_notes, 'pending_tl', p_request_type, v_is_paid)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;
