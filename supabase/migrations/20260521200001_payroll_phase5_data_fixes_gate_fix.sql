-- =============================================================================
-- Payroll Phase 5 — Data fixes + gate logic fix
-- 2026-05-21
--
-- 1. Fix gate condition: original was (match_rate >= 95 AND diverge = 0)
--    which is effectively "100% match". Intent is match_rate >= 95%.
-- 2. Backfill commission from overtime_pay for TLs (Deysi, Javier, Cesar, Charlie)
--    Joe stored TL commissions in overtime_pay; commission column was always NULL.
-- 3. Exclude Paty Rodriguez $0 rows from payroll — she was added to DB
--    retroactively; those weeks were never paid.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix gate condition in pay_validate_archive_all
--    (full function body — gate line changed from AND diverge=0 to match_rate only)
-- ---------------------------------------------------------------------------
-- See 20260521200002 and 20260521200003 for subsequent revisions.
-- This file records the data fixes only; function was further updated in later passes.

-- ---------------------------------------------------------------------------
-- 2 & 3. Data corrections — temporarily disable read-only guard
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_archive DISABLE TRIGGER trg_payroll_archive_readonly_update;

-- Fix 2: Backfill TL commission from overtime_pay
UPDATE public.payroll_archive
SET
  commission    = overtime_pay,
  overtime_pay  = 0,
  overtime_days = 0
WHERE agent_name IN ('Deysi Esperanza', 'Javier Caballero', 'Cesar Cardenas', 'Charlie Farfan')
  AND overtime_pay > 0;

-- Fix 3: Exclude Paty Rodriguez retroactive $0 rows
UPDATE public.payroll_archive
SET include_in_payroll = false
WHERE agent_name ILIKE '%Paty Rodriguez%'
  AND total_pay = 0;

ALTER TABLE public.payroll_archive ENABLE TRIGGER trg_payroll_archive_readonly_update;
