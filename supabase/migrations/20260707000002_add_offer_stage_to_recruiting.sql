-- Offer / Pending Start stage for recruiting.
--
-- Adds a pre-hire "standby" state: a candidate who's been given an offer with an
-- expected start date. On day 1, HR/manager marks the outcome:
--   * Showed up -> runs the existing hire-from-candidate flow (stage -> hired)
--   * No-show   -> stage -> 'no_show' (terminal, flagged, kept in history)
--
-- All additive. The two CHECK constraints are dropped and recreated only to
-- WIDEN the allowed value lists — no rows are touched, no data lost.

-- 1. New columns (nullable, no default) -------------------------------------
alter table public.recruiting_candidates
  add column if not exists offer_start_date  date,
  add column if not exists offer_extended_at  timestamptz,
  add column if not exists offer_extended_by  uuid;

-- 2. Widen the stage check to include 'offer' + 'no_show' --------------------
alter table public.recruiting_candidates
  drop constraint if exists recruiting_candidates_stage_check;
alter table public.recruiting_candidates
  add constraint recruiting_candidates_stage_check
  check (stage = any (array[
    'new', 'triaged', 'contacted', 'interview_scheduled', 'interviewed',
    'warm_hold', 'reactivated', 'offer', 'hired', 'passed', 'withdrew',
    'ghosted', 'no_show'
  ]));

-- 3. Widen the final_status check to include 'no_show' -----------------------
alter table public.recruiting_candidates
  drop constraint if exists recruiting_candidates_final_status_check;
alter table public.recruiting_candidates
  add constraint recruiting_candidates_final_status_check
  check (
    final_status is null
    or final_status = any (array['hired', 'passed', 'withdrew', 'ghosted', 'no_show'])
  );
