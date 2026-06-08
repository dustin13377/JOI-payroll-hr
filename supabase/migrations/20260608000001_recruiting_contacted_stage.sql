-- Add a "contacted" pipeline stage between 'triaged' (Reviewed) and
-- 'interview_scheduled'. Set when a recruiter sends the WhatsApp interview
-- invite (Calendly link). Additive only — no existing rows change, no data
-- is dropped. Just widens the allowed-values CHECK on recruiting_candidates.stage.

ALTER TABLE public.recruiting_candidates
  DROP CONSTRAINT IF EXISTS recruiting_candidates_stage_check;

ALTER TABLE public.recruiting_candidates
  ADD CONSTRAINT recruiting_candidates_stage_check
  CHECK (stage IN (
    'new','triaged','contacted','interview_scheduled','interviewed',
    'warm_hold','reactivated',
    'hired','passed','withdrew','ghosted'
  ));
