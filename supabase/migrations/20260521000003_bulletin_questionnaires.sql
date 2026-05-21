-- Migration: 20260521000003_bulletin_questionnaires.sql
-- Phase 3: Questionnaires — questions + responses tables
-- Approved by D 2026-05-21.

CREATE TABLE IF NOT EXISTS public.bulletin_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  type         text NOT NULL DEFAULT 'open_ended'
                 CHECK (type IN ('multiple_choice', 'open_ended')),
  options      jsonb,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bulletin_questions_post_idx
  ON public.bulletin_questions (post_id, sort_order);

CREATE TABLE IF NOT EXISTS public.bulletin_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  question_id    uuid NOT NULL REFERENCES public.bulletin_questions(id) ON DELETE CASCADE,
  respondent_id  uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  answer_text    text,
  answer_option  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, respondent_id)
);

CREATE INDEX IF NOT EXISTS bulletin_responses_post_idx   ON public.bulletin_responses (post_id);
CREATE INDEX IF NOT EXISTS bulletin_responses_question_idx ON public.bulletin_responses (question_id);
CREATE INDEX IF NOT EXISTS bulletin_responses_respondent_idx ON public.bulletin_responses (respondent_id);

ALTER TABLE public.bulletin_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletin_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees can read questions on published posts"
  ON public.bulletin_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bulletin_posts bp WHERE bp.id = post_id AND bp.is_published = true AND (bp.expires_at IS NULL OR bp.expires_at > now())));

CREATE POLICY "managers can manage questions"
  ON public.bulletin_questions FOR ALL TO authenticated
  USING (public.is_leadership()) WITH CHECK (public.is_leadership());

CREATE POLICY "employees can submit responses"
  ON public.bulletin_responses FOR INSERT TO authenticated
  WITH CHECK (respondent_id = public.my_employee_id());

CREATE POLICY "employees can view own responses"
  ON public.bulletin_responses FOR SELECT TO authenticated
  USING (respondent_id = public.my_employee_id());

CREATE POLICY "managers can view all responses"
  ON public.bulletin_responses FOR SELECT TO authenticated
  USING (public.is_leadership());
