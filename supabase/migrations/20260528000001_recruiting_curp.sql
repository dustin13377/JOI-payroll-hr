-- Add CURP column for Mexican national ID + dedup capability.
-- CURP is 18 characters when present, but kept as text (no length CHECK)
-- because (a) the form is free-text and may receive bad input,
-- (b) we don't want strict validation to drop applicants on the floor.

ALTER TABLE public.recruiting_candidates
  ADD COLUMN IF NOT EXISTS curp text;

-- Unique partial index: enforce uniqueness only when curp is provided.
-- Two NULL curp values are NOT considered duplicates (NULL != NULL in SQL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_recruiting_candidates_curp_unique
  ON public.recruiting_candidates (curp)
  WHERE curp IS NOT NULL;
