-- Migration: 20260521000001_bulletin_board_phase1.sql
-- Phase 1: Announcements with acknowledgements
-- Approved by D 2026-05-21.
--
-- Tables:
--   bulletin_posts — announcements created by managers/owners
--   bulletin_acks  — per-employee acknowledgement records
-- ---------------------------------------------------------------------------

-- ── bulletin_posts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bulletin_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL DEFAULT 'announcement'
                    CHECK (type IN ('announcement', 'questionnaire', 'recognition')),
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',
  author_id       uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  -- NULL campaign_id = visible to all staff; set to target a single campaign.
  campaign_id     uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  requires_ack    boolean NOT NULL DEFAULT true,
  is_published    boolean NOT NULL DEFAULT false,
  published_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── bulletin_acks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bulletin_acks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  acked_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, employee_id)   -- one ack per person per post
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bulletin_posts_published_idx
  ON public.bulletin_posts (is_published, published_at DESC);

CREATE INDEX IF NOT EXISTS bulletin_acks_post_idx
  ON public.bulletin_acks (post_id);

CREATE INDEX IF NOT EXISTS bulletin_acks_employee_idx
  ON public.bulletin_acks (employee_id);

-- ── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_bulletin_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bulletin_posts_updated_at ON public.bulletin_posts;
CREATE TRIGGER bulletin_posts_updated_at
  BEFORE UPDATE ON public.bulletin_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_bulletin_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.bulletin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletin_acks  ENABLE ROW LEVEL SECURITY;

-- Helper: get role of the calling user
-- Reuses the same pattern as other tables in this project.

-- bulletin_posts: managers and owners can do everything
CREATE POLICY "managers can manage bulletin posts"
  ON public.bulletin_posts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.user_profiles up ON up.employee_id = e.id
      WHERE up.user_id = auth.uid()
        AND e.title IN ('manager', 'admin', 'owner')
        AND e.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.user_profiles up ON up.employee_id = e.id
      WHERE up.user_id = auth.uid()
        AND e.title IN ('manager', 'admin', 'owner')
        AND e.is_active = true
    )
  );

-- bulletin_posts: all active employees can read published posts
-- (scoped to their campaign if campaign_id is set)
CREATE POLICY "employees can read published posts"
  ON public.bulletin_posts
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      campaign_id IS NULL
      OR campaign_id = (
        SELECT e.campaign_id FROM public.employees e
        JOIN public.user_profiles up ON up.employee_id = e.id
        WHERE up.user_id = auth.uid()
          AND e.is_active = true
        LIMIT 1
      )
    )
  );

-- bulletin_acks: employees can insert and view their own acks
CREATE POLICY "employees can ack posts"
  ON public.bulletin_acks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = (
      SELECT e.id FROM public.employees e
      JOIN public.user_profiles up ON up.employee_id = e.id
      WHERE up.user_id = auth.uid()
        AND e.is_active = true
      LIMIT 1
    )
  );

CREATE POLICY "employees can view own acks"
  ON public.bulletin_acks
  FOR SELECT
  TO authenticated
  USING (
    employee_id = (
      SELECT e.id FROM public.employees e
      JOIN public.user_profiles up ON up.employee_id = e.id
      WHERE up.user_id = auth.uid()
        AND e.is_active = true
      LIMIT 1
    )
  );

-- managers can view all acks (to track who has/hasn't read)
CREATE POLICY "managers can view all acks"
  ON public.bulletin_acks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.user_profiles up ON up.employee_id = e.id
      WHERE up.user_id = auth.uid()
        AND e.title IN ('manager', 'admin', 'owner')
        AND e.is_active = true
    )
  );
