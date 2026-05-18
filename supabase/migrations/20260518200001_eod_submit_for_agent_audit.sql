-- ============================================================================
-- EOD submit-for-agent: audit table + submitted_by column
--
-- Context:
--   New hires don't have a Supabase Auth account until Day 31 (after their
--   30-day review passes), so they cannot file their own EOD log. A team lead
--   covering for them needs to file the EOD on their behalf, with a required
--   reason and a full audit trail. Mirrors the time_clock_audit pattern used
--   by the edit-time-clock edge function.
--
-- This migration does NOT add a new RLS INSERT policy for TLs on eod_logs —
-- the submit-eod-for-agent edge function uses the service role and performs
-- its own auth + scope check (caller must be leadership or a TL sharing a
-- campaign with the target employee, and the target must have NO user_profile
-- row yet — i.e. no login). RLS for direct client inserts stays unchanged.
-- ============================================================================

-- 1. submitted_by_user_id on eod_logs --------------------------------------
--    Lets us distinguish "agent submitted their own EOD" from "TL covered for
--    a no-login agent" without inferring from joins.
ALTER TABLE public.eod_logs
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.eod_logs.submitted_by_user_id IS
  'Auth user who filed this EOD. NULL = unknown / pre-2026-05-18 backfill. '
  'When != employee.user_profiles.id, it was filed on the agent''s behalf.';

-- 2. eod_logs_audit table --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eod_logs_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eod_log_id uuid REFERENCES public.eod_logs(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  edited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  edited_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action IN ('insert', 'update')),
  before_state jsonb,
  after_state jsonb NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eod_logs_audit_employee_date
  ON public.eod_logs_audit (employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_eod_logs_audit_edited_by
  ON public.eod_logs_audit (edited_by);
CREATE INDEX IF NOT EXISTS idx_eod_logs_audit_org
  ON public.eod_logs_audit (organization_id);

ALTER TABLE public.eod_logs_audit ENABLE ROW LEVEL SECURITY;

-- 3. RLS on eod_logs_audit -------------------------------------------------
--    Leadership: full read across their org.
CREATE POLICY "leadership_select_eod_logs_audit"
  ON public.eod_logs_audit FOR SELECT TO authenticated
  USING (public.is_leadership());

--    TLs: read audit rows for agents on their team only.
CREATE POLICY "tl_select_team_eod_logs_audit"
  ON public.eod_logs_audit FOR SELECT TO authenticated
  USING (
    public.is_team_lead()
    AND employee_id IN (SELECT public.my_team_member_ids())
  );

--    No INSERT/UPDATE/DELETE policies — writes only happen via the
--    submit-eod-for-agent edge function (service role bypasses RLS).
