-- Per-candidate "highlight" flag used by the Upcoming Interviews widget to
-- color-code the row for candidates D wants to keep an eye on. Replaces the
-- old hardcoded POSITION_ROW_COLORS map keyed on applied_position title, which
-- broke every time a title was renamed.
--
-- Default false so existing rows are opted-out. HR/recruiter UI toggles it.

ALTER TABLE public.recruiting_candidates
  ADD COLUMN IF NOT EXISTS is_highlighted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.recruiting_candidates.is_highlighted IS
  'When true, the Upcoming Interviews widget colors this candidate''s calendar row so HR can spot them at a glance. Set from the CandidateDrawer.';
