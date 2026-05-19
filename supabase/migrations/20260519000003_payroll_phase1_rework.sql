-- Migration: 20260519000003_payroll_phase1_rework.sql
-- Phase 1: DROP abandoned scaffolding → CREATE new payroll_periods +
--          payroll_weeks + payroll_records.
--
-- ⚠️  DESTRUCTIVE — D APPROVED 2026-05-19 (PAYROLL_PHASE1_DECISIONS.md §Decision 3)
--     payroll_records: 0 rows confirmed 2026-05-19.
--     payroll_periods: 3 rows confirmed 2026-05-19 — all test scaffold in the
--       old Q1/Q2 format, zero records attached. Safe to drop.
--
-- NOTE: payroll_weeks is created HERE (not migration 2) because it has a FK
-- → payroll_periods. Building it in migration 2 would cause this migration's
-- CASCADE DROP to silently destroy it.

DROP TABLE IF EXISTS public.payroll_records CASCADE;
DROP TABLE IF EXISTS public.payroll_periods CASCADE;

-- ============================================================================
-- payroll_periods  (rebuilt with Joe's period-code format)
-- One row per bi-monthly pay period.
-- PP1 = weeks whose end-date falls on or before the 15th of the month.
-- PP2 = weeks whose end-date falls after the 15th.
-- Code format: 'APRIL26PP1' — matches Joe's payPeriodCode_() output exactly.
-- ============================================================================
CREATE TABLE public.payroll_periods (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  period_code     text    NOT NULL UNIQUE,
  year            int     NOT NULL,
  month           int     NOT NULL CHECK (month BETWEEN 1 AND 12),
  half            text    NOT NULL CHECK (half IN ('PP1', 'PP2')),
  start_date      date    NOT NULL,
  end_date        date    NOT NULL,
  status          text    NOT NULL DEFAULT 'OPEN'
                    CONSTRAINT payroll_periods_status_check
                    CHECK (status IN ('OPEN', 'COMPLETE', 'LOCKED')),
  locked_at       timestamptz,
  locked_by       uuid    REFERENCES auth.users(id),
  organization_id uuid    NOT NULL REFERENCES public.organizations(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

-- Phase 1: leadership-wide access. Phase 4 will narrow manager scope by campaign.
CREATE POLICY "payroll_periods_leadership_all"
  ON public.payroll_periods FOR ALL
  USING (public.is_leadership() AND organization_id = public.my_org_id())
  WITH CHECK (public.is_leadership() AND organization_id = public.my_org_id());

CREATE INDEX IF NOT EXISTS idx_payroll_periods_code
  ON public.payroll_periods (period_code);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status
  ON public.payroll_periods (status);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_org
  ON public.payroll_periods (organization_id);

-- ============================================================================
-- payroll_weeks  (new — one row per week-block per period)
-- Mirrors Joe's week-header row in the Payroll Run sheet.
-- Bridge between bi-monthly periods and the per-employee per-week ledger rows.
-- week_start = Monday, week_end = Sunday.
-- ============================================================================
CREATE TABLE public.payroll_weeks (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id         uuid    NOT NULL
                      REFERENCES public.payroll_periods(id) ON DELETE RESTRICT,
  week_number       int     NOT NULL CHECK (week_number BETWEEN 1 AND 5),
  week_start        date    NOT NULL,
  week_end          date    NOT NULL,
  status            text    NOT NULL DEFAULT 'UNPAID'
                      CONSTRAINT payroll_weeks_status_check
                      CHECK (status IN ('UNPAID', 'COMPLETE', 'PAID')),
  status_changed_at timestamptz,
  status_changed_by uuid    REFERENCES auth.users(id),
  organization_id   uuid    NOT NULL REFERENCES public.organizations(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, week_number)
);

ALTER TABLE public.payroll_weeks ENABLE ROW LEVEL SECURITY;

-- Phase 1: leadership-wide. Phase 4 narrows.
CREATE POLICY "payroll_weeks_leadership_all"
  ON public.payroll_weeks FOR ALL
  USING (public.is_leadership() AND organization_id = public.my_org_id())
  WITH CHECK (public.is_leadership() AND organization_id = public.my_org_id());

CREATE INDEX IF NOT EXISTS idx_payroll_weeks_period_id
  ON public.payroll_weeks (period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_weeks_status
  ON public.payroll_weeks (status);
CREATE INDEX IF NOT EXISTS idx_payroll_weeks_org
  ON public.payroll_weeks (organization_id);

-- ============================================================================
-- payroll_records  (rebuilt — one row per employee per week)
-- Column mapping to Joe's Payroll Run agent row (JOE_PAYROLL_HANDOFF.md §3.4):
--   include_in_payroll → col 4  (Include In Payroll: YES/NO)
--   missed_days        → col 5
--   overtime_days      → col 6
--   sundays_worked     → col 7
--   vacation_days      → col 8
--   holiday_days       → col 9
--   kpi_achieved       → col 10
--   extra_bonus        → col 18 (Spiffs)
--   partial_week_days  → col 20
--   weekly_base…total  → cols 11–19 (calculated, written by pay_calc_record Phase 2)
--   status             → col 21
-- ============================================================================
CREATE TABLE public.payroll_records (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Structural FKs
  week_id             uuid    NOT NULL
                        REFERENCES public.payroll_weeks(id) ON DELETE RESTRICT,
  employee_id         uuid    NOT NULL
                        REFERENCES public.employees(id),
  campaign_id         uuid    REFERENCES public.campaigns(id),
  -- ^ Snapshot of employee's campaign at row creation. Not used for rate
  --   lookups — rates come from employees.* fields (Phase 2 calc engine).
  organization_id     uuid    NOT NULL REFERENCES public.organizations(id),

  -- Inputs (auto-derived by Phase 3 pay_derive_week; manually overridable)
  include_in_payroll  boolean NOT NULL DEFAULT true,
  missed_days         int     NOT NULL DEFAULT 0,
  overtime_days       int     NOT NULL DEFAULT 0,
  sundays_worked      int     NOT NULL DEFAULT 0,
  vacation_days       int     NOT NULL DEFAULT 0,
  holiday_days        int     NOT NULL DEFAULT 0,
  kpi_achieved        boolean NOT NULL DEFAULT true,
  extra_bonus         numeric(12,2) NOT NULL DEFAULT 0,
  partial_week_days   int,
  -- ^ NULL = full week. Positive int = days worked (mid-week hire start).
  --   Triggers calcAgentPay_ partial-week branch (Joe HANDOFF §4.2):
  --   weeklyBase = dailySalary × daysWorked; no missedDed; no vacationPay.

  -- Calculated breakdown (written by pay_calc_record RPC — Phase 2)
  -- ALL numeric(12,2): MXN only, never float/real/double precision.
  weekly_base         numeric(12,2),
  kpi_bonus           numeric(12,2),
  missed_deduction    numeric(12,2),
  overtime_pay        numeric(12,2),
  sunday_pay          numeric(12,2),
  vacation_pay        numeric(12,2),
  holiday_pay         numeric(12,2),
  -- ^ LFT Art. 75 extra only: holidayDays × dailySalary × 2.
  --   weeklyBase already covers the regular day; this adds the premium.
  total_pay           numeric(12,2),

  -- Status + metadata
  status              text    NOT NULL DEFAULT 'UNPAID'
                        CONSTRAINT payroll_records_status_check
                        CHECK (status IN ('UNPAID', 'COMPLETE', 'PAID')),
  memo                text,
  auto_derived        jsonb,
  -- ^ Phase 3 snapshot: raw time_clock-derived values BEFORE any manual
  --   override. Lets the UI show "auto vs. manual" diff per input field.

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (week_id, employee_id)
);

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- Phase 1: leadership-wide. Phase 4 adds manager-scoped campaign policies
-- (employee's campaign_id IN manager's team_lead_campaigns).
CREATE POLICY "payroll_records_leadership_all"
  ON public.payroll_records FOR ALL
  USING (public.is_leadership() AND organization_id = public.my_org_id())
  WITH CHECK (public.is_leadership() AND organization_id = public.my_org_id());

CREATE INDEX IF NOT EXISTS idx_payroll_records_week_id
  ON public.payroll_records (week_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_employee_id
  ON public.payroll_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_campaign_id
  ON public.payroll_records (campaign_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_status
  ON public.payroll_records (status);
CREATE INDEX IF NOT EXISTS idx_payroll_records_org
  ON public.payroll_records (organization_id);

-- Trigger naming: PostgreSQL fires BEFORE triggers alphabetically.
-- trg_payroll_records_paid_lock sorts before trg_payroll_records_updated_at,
-- so the lock fires first and raises before the stamp runs — correct behaviour.
-- (Stamping updated_at on a row we're about to reject would be a no-op anyway.)

-- updated_at auto-stamp on every UPDATE
CREATE OR REPLACE FUNCTION public.payroll_records_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.payroll_records_set_updated_at();

-- PAID-lock: blocks any UPDATE on a PAID row.
-- To correct a PAID record, the owner must first call the unlock_paid_period
-- RPC (Phase 2). Acceptance check P1.4 verifies this trigger fires.
CREATE OR REPLACE FUNCTION public.payroll_records_paid_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'PAID' THEN
    RAISE EXCEPTION
      'Cannot modify a PAID payroll record. Unlock the pay period first.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payroll_records_paid_lock
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.payroll_records_paid_lock();
