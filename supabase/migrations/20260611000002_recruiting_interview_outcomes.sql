-- Interview attendance tracking from the Upcoming Interviews widget.
-- Each calendar event marked Completed / No show becomes (or updates) a
-- recruiting_interviews row, keyed by event_key = '<start ISO>|<summary>'
-- so re-clicking corrects the same row instead of duplicating.

ALTER TABLE public.recruiting_interviews
  ADD COLUMN IF NOT EXISTS outcome text
    CHECK (outcome IN ('completed','no_show') OR outcome IS NULL),
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_key text;

-- Full unique constraint (NULLs allowed, multiple NULLs fine) so PostgREST
-- upsert can use ON CONFLICT (event_key).
ALTER TABLE public.recruiting_interviews
  ADD CONSTRAINT recruiting_interviews_event_key_unique UNIQUE (event_key);

CREATE INDEX IF NOT EXISTS idx_recruiting_interviews_outcome
  ON public.recruiting_interviews (candidate_id, outcome)
  WHERE outcome IS NOT NULL;
