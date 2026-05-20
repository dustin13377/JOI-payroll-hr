-- =============================================================================
-- Payroll Phase 5 — Step 2: Make payroll_archive fully read-only
-- Reconstructed 2026-05-20 from DB introspection (applied without local file).
--
-- payroll_archive is a one-time import of Joe's Sheets history (2026-05-19).
-- It must never be modified after import — all three mutation types are blocked.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_payroll_archive_readonly()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payroll_archive is read-only. Source: Joe''s Sheets import 2026-05-19. To amend, contact admin.';
END;
$$;

-- Block all three mutation types
DROP TRIGGER IF EXISTS trg_payroll_archive_readonly_insert ON public.payroll_archive;
CREATE TRIGGER trg_payroll_archive_readonly_insert
  BEFORE INSERT ON public.payroll_archive
  FOR EACH ROW EXECUTE FUNCTION public.trg_payroll_archive_readonly();

DROP TRIGGER IF EXISTS trg_payroll_archive_readonly_update ON public.payroll_archive;
CREATE TRIGGER trg_payroll_archive_readonly_update
  BEFORE UPDATE ON public.payroll_archive
  FOR EACH ROW EXECUTE FUNCTION public.trg_payroll_archive_readonly();

DROP TRIGGER IF EXISTS trg_payroll_archive_readonly_delete ON public.payroll_archive;
CREATE TRIGGER trg_payroll_archive_readonly_delete
  BEFORE DELETE ON public.payroll_archive
  FOR EACH ROW EXECUTE FUNCTION public.trg_payroll_archive_readonly();
