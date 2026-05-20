-- =============================================================================
-- Payroll Phase 5 — Step 1: Extend payroll_archive with display + source columns
-- Reconstructed 2026-05-20 from DB introspection (applied without local file).
--
-- Adds columns needed to faithfully mirror Joe's Sheets structure and support
-- the validation engine (Phase 5 Step 3).
-- =============================================================================

ALTER TABLE public.payroll_archive
  ADD COLUMN IF NOT EXISTS agent_name         text,
  ADD COLUMN IF NOT EXISTS include_in_payroll boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS week_label         text,
  ADD COLUMN IF NOT EXISTS week_month         text,
  ADD COLUMN IF NOT EXISTS joe_period_code    text,
  ADD COLUMN IF NOT EXISTS joe_status         text;
