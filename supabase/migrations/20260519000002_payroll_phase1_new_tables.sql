-- Migration: 20260519000002_payroll_phase1_new_tables.sql
-- Phase 1: Extend existing mexican_holidays table + create payroll_archive
--          and payroll_audit_log.
--
-- NOTE: payroll_weeks is in migration 3 (co-located with new payroll_periods
-- due to FK dependency ordering — see decisions doc).
--
-- Phase 1 RLS pattern: all new payroll tables use is_leadership() for now.
-- Phase 4 replaces these with campaign-scoped manager policies.

-- ============================================================================
-- mexican_holidays — EXTEND existing table
-- The table was created in migration 20260415000001 with only (date, name).
-- We add name_es, name_en, type, pays_premium needed for the Phase 1 schema
-- and the Phase 3 auto-derive (holidayDays = time_clock dates ∩ this table
-- WHERE pays_premium = true).
-- ============================================================================

ALTER TABLE public.mexican_holidays
  ADD COLUMN IF NOT EXISTS name_es     text,
  ADD COLUMN IF NOT EXISTS name_en     text,
  ADD COLUMN IF NOT EXISTS type        text
    CONSTRAINT mexican_holidays_type_check
    CHECK (type IN ('LFT_OFICIAL', 'EMPRESA', 'OPCIONAL')),
  ADD COLUMN IF NOT EXISTS pays_premium boolean NOT NULL DEFAULT false;

-- The existing policy "Allow read for authenticated" already covers SELECT.
-- Add write policies for leadership (leadership manages the holiday calendar).
-- Safe to use IF NOT EXISTS equivalent via DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mexican_holidays' AND policyname = 'mexican_holidays_write_leadership'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "mexican_holidays_write_leadership"
        ON public.mexican_holidays
        FOR ALL
        USING (public.is_leadership())
        WITH CHECK (public.is_leadership())
    $p$;
  END IF;
END$$;

-- ============================================================================
-- payroll_archive
-- Read-only store of Joe's historical Sheets payroll data (March + April 2026).
-- Imported once in Phase 5 via service_role. After import, no client writes.
-- Acceptance test T1: SELECT SUM(total_pay) WHERE legacy_agent_id = 1 = $73,987.50
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_archive (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Import metadata
  source            text        NOT NULL DEFAULT 'JOE_SHEETS_2026_05_19',
  period_code       text        NOT NULL,   -- e.g. 'MARCH26PP1'

  -- Week boundaries (from Joe's week-header row)
  week_start        date,
  week_end          date,

  -- Agent identity
  legacy_agent_id   int,                    -- Joe's numeric Agent ID (Javier = 1)
  employee_id       uuid        REFERENCES public.employees(id),
  -- ^ nullable: alumni-only rows may not map to an active employee UUID
  rule_key          text,                   -- Joe's CAMPAIGN|DEPT|SHIFT for traceability

  -- Inputs (mirrors Joe's Payroll Run agent row — JOE_PAYROLL_HANDOFF.md §3.4)
  missed_days         int           NOT NULL DEFAULT 0,
  overtime_days       int           NOT NULL DEFAULT 0,
  sundays_worked      int           NOT NULL DEFAULT 0,
  vacation_days       int           NOT NULL DEFAULT 0,
  holiday_days        int           NOT NULL DEFAULT 0,
  kpi_achieved        boolean       NOT NULL DEFAULT true,
  extra_bonus         numeric(12,2) NOT NULL DEFAULT 0,
  partial_week_days   int,

  -- Calculated breakdown (snapshot from Joe's Sheets — never recomputed)
  weekly_base         numeric(12,2),
  kpi_bonus           numeric(12,2),
  missed_deduction    numeric(12,2),
  overtime_pay        numeric(12,2),
  sunday_pay          numeric(12,2),
  vacation_pay        numeric(12,2),
  holiday_pay         numeric(12,2),
  total_pay           numeric(12,2),

  status              text          NOT NULL DEFAULT 'PAID'
                      CONSTRAINT payroll_archive_status_check CHECK (status = 'PAID'),
  -- Archive rows are always PAID; constraint guards against bad Phase 5 import code.
  paid_at             date,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id),
  imported_at         timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_archive ENABLE ROW LEVEL SECURITY;

-- Leadership can read historical records for YTD totals and paystub history
CREATE POLICY "payroll_archive_select_leadership"
  ON public.payroll_archive FOR SELECT
  USING (public.is_leadership() AND organization_id = public.my_org_id());

-- No INSERT/UPDATE/DELETE policy for any authenticated role.
-- Phase 5 import runs as service_role (bypasses RLS). After import the archive
-- is effectively frozen by the absence of write policies.

CREATE INDEX IF NOT EXISTS idx_payroll_archive_employee_id
  ON public.payroll_archive (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_archive_period_code
  ON public.payroll_archive (period_code);
CREATE INDEX IF NOT EXISTS idx_payroll_archive_legacy_agent
  ON public.payroll_archive (legacy_agent_id);
CREATE INDEX IF NOT EXISTS idx_payroll_archive_org
  ON public.payroll_archive (organization_id);

-- ============================================================================
-- payroll_audit_log
-- Append-only. Trigger blocks UPDATE and DELETE forever.
-- All inserts go through SECURITY DEFINER RPCs (pay_calc_record Phase 2)
-- and status-change functions. No direct client INSERT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_audit_log (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id       uuid,   -- nullable: also captures week/period-level actions
  action          text    NOT NULL
                    CONSTRAINT payroll_audit_log_action_check
                    CHECK (action IN (
                      'CREATE', 'EDIT_INPUT', 'RECALC',
                      'STATUS_CHANGE', 'OVERRIDE', 'UNLOCK_PAID'
                    )),
  before          jsonb,
  after           jsonb,
  actor           uuid    REFERENCES auth.users(id),
  at              timestamptz NOT NULL DEFAULT now(),
  organization_id uuid    NOT NULL REFERENCES public.organizations(id)
  -- org_id required for multi-tenant RLS; consistent with all other payroll_* tables.
);

ALTER TABLE public.payroll_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_audit_log_select_leadership"
  ON public.payroll_audit_log FOR SELECT
  USING (public.is_leadership() AND organization_id = public.my_org_id());

-- No INSERT/UPDATE/DELETE policies. All writes via SECURITY DEFINER RPCs only.

-- Immutability trigger — append-only enforcement
CREATE OR REPLACE FUNCTION public.payroll_audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RAISE EXCEPTION
    'payroll_audit_log is append-only: UPDATE and DELETE are not permitted'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_payroll_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.payroll_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.payroll_audit_log_immutable();
