-- Widen the allowed interview outcomes so the Upcoming Interviews widget can
-- record more than just completed / no_show.
--
-- New outcomes:
--   couldnt_attend  -- candidate gave notice / needs to reschedule (not a no-show)
--   passed          -- interviewed, but we're not moving forward
--   offer_extended  -- interviewed, offer extended (formerly the "hired" positive path)
--
-- 'completed' is kept in the allowed set for the historical rows already using it,
-- even though the UI no longer produces it.
--
-- This only relaxes a CHECK constraint; no data is changed or removed.

alter table public.recruiting_interviews
  drop constraint if exists recruiting_interviews_outcome_check;

alter table public.recruiting_interviews
  add constraint recruiting_interviews_outcome_check
  check (
    outcome = any (array[
      'completed',
      'no_show',
      'couldnt_attend',
      'passed',
      'offer_extended'
    ]::text[])
    or outcome is null
  );
