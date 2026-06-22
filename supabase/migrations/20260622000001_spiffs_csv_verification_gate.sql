-- =============================================================================
-- Spiffs CSV verification gate.
--
-- Managers can bulk-upload spiffs from a CSV (same format as the spiffs tracker
-- sheet). Uploaded rows land in a new 'unverified' status: they are invisible to
-- both agent pay (PrePayroll spiff pull) and client billing (attach_pending_spiffs
-- only touches 'pending') until a manager cross-references the sheet and verifies
-- them. Verifying flips the row to 'pending' and stamps verified_by / verified_at.
--
-- Hand-entered single spiffs (source='app') are unaffected — still live instantly.
-- Additive: existing rows are untouched.
-- =============================================================================

-- 1. Allow the new 'unverified' status.
ALTER TABLE public.spiffs DROP CONSTRAINT spiffs_status_check;
ALTER TABLE public.spiffs ADD CONSTRAINT spiffs_status_check
  CHECK (status IN ('unverified','pending','billed','void'));

-- 2. Allow rows that came from a CSV upload.
ALTER TABLE public.spiffs DROP CONSTRAINT spiffs_source_check;
ALTER TABLE public.spiffs ADD CONSTRAINT spiffs_source_check
  CHECK (source IN ('app','sheet_import','csv_import'));

-- 3. Audit trail: who verified the row and when.
ALTER TABLE public.spiffs ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.spiffs ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.employees(id);
