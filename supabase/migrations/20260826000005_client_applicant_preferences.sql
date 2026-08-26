-- Client-side preferences on individual applicants: reject, back-burner,
-- or want-to-interview. One row per (candidate, client) pair.
--
-- These are advisory signals TO JOI's recruiter — they DO NOT mutate the
-- candidate's internal stage or funnel. On JOI's Recruiting page, rows are
-- highlighted based on these preferences (green = client wants interview,
-- light blue = client wants on back burner). JOI still owns the actual stage.

CREATE TYPE public.client_applicant_preference AS ENUM (
  'reject',
  'back_burner',
  'want_interview'
);

CREATE TABLE IF NOT EXISTS public.client_applicant_preferences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES public.recruiting_candidates(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  preference    public.client_applicant_preference NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (candidate_id, client_id)
);

CREATE INDEX IF NOT EXISTS client_applicant_preferences_client_idx
  ON public.client_applicant_preferences (client_id, preference);
CREATE INDEX IF NOT EXISTS client_applicant_preferences_candidate_idx
  ON public.client_applicant_preferences (candidate_id);

CREATE OR REPLACE FUNCTION public.client_applicant_preferences_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_applicant_preferences_touch ON public.client_applicant_preferences;
CREATE TRIGGER client_applicant_preferences_touch
  BEFORE UPDATE ON public.client_applicant_preferences
  FOR EACH ROW EXECUTE FUNCTION public.client_applicant_preferences_touch();

ALTER TABLE public.client_applicant_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_applicant_preferences_leadership_all
  ON public.client_applicant_preferences
  FOR ALL TO authenticated
  USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

CREATE POLICY client_applicant_preferences_client_select
  ON public.client_applicant_preferences
  FOR SELECT TO authenticated
  USING (public.is_client() AND client_id = public.my_client_id());

CREATE POLICY client_applicant_preferences_client_insert
  ON public.client_applicant_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_client()
    AND client_id = public.my_client_id()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.recruiting_candidates_client_view v
      WHERE v.id = client_applicant_preferences.candidate_id
    )
  );

CREATE POLICY client_applicant_preferences_client_update
  ON public.client_applicant_preferences
  FOR UPDATE TO authenticated
  USING (public.is_client() AND client_id = public.my_client_id())
  WITH CHECK (public.is_client() AND client_id = public.my_client_id());

CREATE POLICY client_applicant_preferences_client_delete
  ON public.client_applicant_preferences
  FOR DELETE TO authenticated
  USING (public.is_client() AND client_id = public.my_client_id());

COMMENT ON TABLE public.client_applicant_preferences IS
  'Advisory client signals about individual applicants. Drives row highlighting on the internal Recruiting page. Does NOT mutate candidate stage — JOI still owns the funnel.';
