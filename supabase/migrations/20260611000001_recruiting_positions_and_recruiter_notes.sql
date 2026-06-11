-- Position-fit tags + internal recruiter notes for candidates.
-- recruiting_positions = editable dropdown options (grow as you go).
-- position_fits stores position NAMES (text[]), not FKs — simple, readable,
-- and a deleted option never breaks existing candidates.

CREATE TABLE IF NOT EXISTS public.recruiting_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recruiting_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY recruiting_positions_leadership_all
  ON public.recruiting_positions
  FOR ALL TO authenticated
  USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

INSERT INTO public.recruiting_positions (name) VALUES
  ('Sales'),
  ('Customer Service'),
  ('Collections'),
  ('Tech Support')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.recruiting_candidates
  ADD COLUMN IF NOT EXISTS recruiter_notes text,
  ADD COLUMN IF NOT EXISTS position_fits text[] NOT NULL DEFAULT ARRAY[]::text[];
