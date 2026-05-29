-- Recruiting module: candidates, messages, interviews.
-- All tables prefixed `recruiting_*`. Zero FKs to existing application tables.
-- The only cross-system reference is `assigned_to → auth.users.id`.
--
-- RLS uses the existing public.is_leadership() helper defined in
-- 20260416000001_rls_hardening.sql (SECURITY DEFINER, no-arg, calls auth.uid()
-- internally). No new helper function is created here.

-- =====================================================================
-- 1. recruiting_candidates
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.recruiting_candidates (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  -- Provenance
  source                    text NOT NULL DEFAULT 'form'
                             CHECK (source IN ('form', 'referral', 'other')),

  -- Parsed from form email
  full_name                 text,
  email                     text,
  phone                     text,
  city                      text,
  role_interest             text
                             CHECK (role_interest IN
                               ('b2b_setter','funding_activation','customer_reactivation')
                               OR role_interest IS NULL),
  english_level_self        text NOT NULL DEFAULT 'unknown'
                             CHECK (english_level_self IN ('C1','C2','below_c1','unknown')),
  referral_source           text,
  applicant_notes           text,
  raw_email_body            text,
  raw_email_received_at     timestamptz,
  needs_manual_review       boolean NOT NULL DEFAULT false,

  -- Triage / assessment
  geo_qualified             boolean,
  english_level_assessed    text
                             CHECK (english_level_assessed IN ('C1','C2','below_c1')
                               OR english_level_assessed IS NULL),
  qualified_for_roles       text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Pipeline
  stage                     text NOT NULL DEFAULT 'new'
                             CHECK (stage IN
                               ('new','triaged','interview_scheduled','interviewed',
                                'warm_hold','reactivated',
                                'hired','passed','withdrew','ghosted')),
  stage_changed_at          timestamptz NOT NULL DEFAULT now(),
  assigned_to               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_contacted_at         timestamptz,
  next_followup_at          timestamptz,

  -- Outcome
  final_status              text
                             CHECK (final_status IN ('hired','passed','withdrew','ghosted')
                               OR final_status IS NULL),
  pass_reason               text,
  hired_for_role            text,
  hired_at                  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_recruiting_candidates_stage
  ON public.recruiting_candidates (stage);
CREATE INDEX IF NOT EXISTS idx_recruiting_candidates_english_assessed
  ON public.recruiting_candidates (english_level_assessed);
CREATE INDEX IF NOT EXISTS idx_recruiting_candidates_next_followup
  ON public.recruiting_candidates (next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruiting_candidates_assigned
  ON public.recruiting_candidates (assigned_to);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.recruiting_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruiting_candidates_updated_at
  ON public.recruiting_candidates;
CREATE TRIGGER trg_recruiting_candidates_updated_at
BEFORE UPDATE ON public.recruiting_candidates
FOR EACH ROW EXECUTE FUNCTION public.recruiting_set_updated_at();

-- stage_changed_at trigger: bump when stage changes
CREATE OR REPLACE FUNCTION public.recruiting_set_stage_changed_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruiting_candidates_stage_changed_at
  ON public.recruiting_candidates;
CREATE TRIGGER trg_recruiting_candidates_stage_changed_at
BEFORE UPDATE ON public.recruiting_candidates
FOR EACH ROW EXECUTE FUNCTION public.recruiting_set_stage_changed_at();

-- =====================================================================
-- 2. recruiting_messages
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.recruiting_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      uuid NOT NULL
                     REFERENCES public.recruiting_candidates(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  direction         text NOT NULL CHECK (direction IN ('outbound','inbound')),
  channel           text NOT NULL
                     CHECK (channel IN ('whatsapp','email','sms','call_log')),
  template_key      text,
  subject           text,
  body              text NOT NULL,
  sent_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'sent'
                     CHECK (status IN ('sent','failed','link_generated'))
);

CREATE INDEX IF NOT EXISTS idx_recruiting_messages_candidate
  ON public.recruiting_messages (candidate_id, created_at DESC);

-- =====================================================================
-- 3. recruiting_interviews
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.recruiting_interviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        uuid NOT NULL
                       REFERENCES public.recruiting_candidates(id) ON DELETE CASCADE,
  conducted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conducted_at        timestamptz NOT NULL DEFAULT now(),
  interview_type      text NOT NULL DEFAULT 'screen'
                       CHECK (interview_type IN ('screen','deep_dive','role_fit','final')),
  english_score       int CHECK (english_score BETWEEN 1 AND 5),
  communication_score int CHECK (communication_score BETWEEN 1 AND 5),
  coachability_score  int CHECK (coachability_score BETWEEN 1 AND 5),
  overall_score       int CHECK (overall_score BETWEEN 1 AND 5),
  recommendation      text CHECK (recommendation IN ('advance','hold','pass') OR recommendation IS NULL),
  notes               text
);

CREATE INDEX IF NOT EXISTS idx_recruiting_interviews_candidate
  ON public.recruiting_interviews (candidate_id, conducted_at DESC);

-- =====================================================================
-- 4. RLS — leadership only
--    Uses the existing public.is_leadership() helper (SECURITY DEFINER,
--    no args) defined in 20260416000001_rls_hardening.sql.
--    leadership = owner / admin / manager per that function.
-- =====================================================================
ALTER TABLE public.recruiting_candidates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiting_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiting_interviews  ENABLE ROW LEVEL SECURITY;

-- Candidates: full CRUD for leadership
CREATE POLICY recruiting_candidates_leadership_all
  ON public.recruiting_candidates
  FOR ALL TO authenticated
  USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

-- Messages: full CRUD for leadership
CREATE POLICY recruiting_messages_leadership_all
  ON public.recruiting_messages
  FOR ALL TO authenticated
  USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

-- Interviews: full CRUD for leadership
CREATE POLICY recruiting_interviews_leadership_all
  ON public.recruiting_interviews
  FOR ALL TO authenticated
  USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

-- Edge Function service-role inserts bypass RLS automatically (service role
-- is exempt). No service-role policy needed for the inbound-application
-- function.
