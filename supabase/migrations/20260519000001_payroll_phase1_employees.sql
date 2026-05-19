-- Migration: 20260519000001_payroll_phase1_employees.sql
-- Phase 1: Add 5 payroll rate columns to employees table
-- D approved 2026-05-19. See PAYROLL_PHASE1_DECISIONS.md for full context.
--
-- Maps to Joe's calcAgentPay_ inputs (JOE_PAYROLL_HANDOFF.md §3.1, §4.1):
--   weekly_base_salary  → rule.weeklyBase
--   daily_salary        → rule.dailySalary   (stored explicitly — Decision 1)
--   overtime_day_pay    → rule.overtimePay
--   sunday_bonus_amount → rule.sundayBonus
--   vacation_premium_pct→ rule.vacationPct   (LFT Art. 80: must be >= 0.25)

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS weekly_base_salary    numeric(12,2),
  ADD COLUMN IF NOT EXISTS daily_salary          numeric(12,2),
  ADD COLUMN IF NOT EXISTS overtime_day_pay      numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sunday_bonus_amount   numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_premium_pct  numeric(5,4)  DEFAULT 0.25
    CONSTRAINT employees_vacation_premium_pct_check CHECK (vacation_premium_pct >= 0.25);
    -- LFT Art. 80: prima vacacional must be >= 25%. Enforced at DB level.

-- ---------------------------------------------------------------------------
-- Backfill weekly_base_salary = monthly_base_salary / 4
-- Safety checks run 2026-05-19 (see decisions doc):
--   Q1 = 15 employees with NULL/0 monthly (test accounts + unseeded employees).
--        These are SKIPPED — they will need manual rates via the Phase 4 Pay
--        Rates editor UI. Does not block Phase 1.
--   Q2 = 0 violations — every seeded employee's monthly is a clean × 4 multiple.
--        Backfill is green-lit.
-- ---------------------------------------------------------------------------
UPDATE public.employees
   SET weekly_base_salary = monthly_base_salary / 4
 WHERE weekly_base_salary IS NULL
   AND monthly_base_salary IS NOT NULL
   AND monthly_base_salary > 0;

-- ---------------------------------------------------------------------------
-- Backfill daily_salary from daily_discount_rate.
-- Decision 2026-05-19: daily_salary is stored explicitly, not derived at
-- calc time from weekly_base / scheduled_days. This matches Joe's rule model
-- where rule.dailySalary is a stored field independent of weeklyBase.
-- On the current JOI seed these two values coincide. After Phase 4 the Pay
-- Rates editor will let admins set them independently (e.g. weekend workers).
-- ---------------------------------------------------------------------------
UPDATE public.employees
   SET daily_salary = daily_discount_rate
 WHERE daily_salary IS NULL
   AND daily_discount_rate IS NOT NULL
   AND daily_discount_rate > 0;

-- ---------------------------------------------------------------------------
-- Index: (department_id, shift_type, campaign_id)
-- Supports the Phase 4 bulk rate editor — filter employees by rule group
-- and edit all their rates at once. Matches the conceptual "rule group" that
-- replaces Joe's rule-key system in the per-employee model.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_employees_payroll_rate_lookup
  ON public.employees (department_id, shift_type, campaign_id);
