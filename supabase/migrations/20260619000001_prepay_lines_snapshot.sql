-- =============================================================================
-- Pre-Payroll — snapshot table for locked quincenal periods (additive).
--
-- The legacy payroll model stores pay per WEEK (period → weeks → payroll_records).
-- The new Pre-Payroll screen computes per QUINCENA from the time clock. To let a
-- finished period be "Closed & Locked" with frozen numbers (so later time-clock
-- edits can't change a month already paid), we snapshot each employee's computed
-- pay into this table at lock time. Reading history just reads these rows.
--
-- Fully additive — does NOT touch payroll_records / payroll_weeks / the existing
-- calc. Owner/admin-only via RLS, org-scoped. See docs/prepay-lock-design.md.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.prepay_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id      uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL DEFAULT public.my_org_id(),

  -- snapshot inputs (from the time clock at lock time)
  monthly_base     numeric(12,2) NOT NULL DEFAULT 0,
  missed_days      integer       NOT NULL DEFAULT 0,
  makeup_days      integer       NOT NULL DEFAULT 0,
  overtime_days    integer       NOT NULL DEFAULT 0,
  sundays_worked   integer       NOT NULL DEFAULT 0,
  vacation_days    integer       NOT NULL DEFAULT 0,

  -- snapshot amounts (engine output, frozen)
  base             numeric(12,2) NOT NULL DEFAULT 0,
  missed_deduction numeric(12,2) NOT NULL DEFAULT 0,
  makeup_credit    numeric(12,2) NOT NULL DEFAULT 0,
  overtime_pay     numeric(12,2) NOT NULL DEFAULT 0,
  sunday_pay       numeric(12,2) NOT NULL DEFAULT 0,
  vacation_premium numeric(12,2) NOT NULL DEFAULT 0,
  holiday_pay      numeric(12,2) NOT NULL DEFAULT 0,
  spiff_mxn        numeric(12,2) NOT NULL DEFAULT 0,
  net              numeric(12,2) NOT NULL DEFAULT 0,

  created_at       timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (period_id, employee_id)
);

ALTER TABLE public.prepay_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prepay_lines_admin_all" ON public.prepay_lines
  TO authenticated
  USING (public.is_owner_or_admin() AND organization_id = public.my_org_id())
  WITH CHECK (public.is_owner_or_admin() AND organization_id = public.my_org_id());

CREATE INDEX IF NOT EXISTS idx_prepay_lines_period ON public.prepay_lines (period_id);
