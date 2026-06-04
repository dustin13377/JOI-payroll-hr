-- ============================================================================
-- Sensitive-data acknowledgment log
--
-- Context:
--   When an Owner/Admin opens an employee's finiquito (severance) numbers, we
--   want a timestamped record that they were put on notice of the duty of
--   confidentiality BEFORE the real amounts were revealed. This supports two
--   legal hooks under Mexican law:
--     1. LFPDPPP (2025) — the controller must prove personal data was treated
--        as confidential and that handlers were bound to that duty.
--     2. LFT Art. 47 — disclosure of confidential info causing harm is just
--        cause for dismissal; this log evidences the worker was on notice.
--
--   The frontend gate (SensitiveDataAckGate) inserts one row the first time a
--   user reveals a given record in a session. We store the EXACT wording the
--   user agreed to (acknowledgment_text) because, legally, the consent wording
--   matters more than a bare boolean.
--
--   Writes happen via direct client INSERT (not an edge function), so this
--   table DOES carry an INSERT policy — scoped so a user can only log an
--   acknowledgment under their own employee id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sensitive_data_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who acknowledged (the viewer). employees.id UUID.
  acknowledged_by uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  -- Auth user behind the acknowledgment (defensive duplicate of identity).
  acknowledged_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- What kind of sensitive view, e.g. 'finiquito_calculation', 'payroll_run'.
  context text NOT NULL CHECK (length(trim(context)) >= 2),
  -- Whose data was viewed (nullable for aggregate views like a payroll run).
  subject_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  -- Optional link back to the HR document request that surfaced the data.
  hr_document_request_id uuid,
  -- The exact confidentiality wording the user agreed to. Stored verbatim.
  acknowledgment_text text NOT NULL CHECK (length(trim(acknowledgment_text)) >= 10),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sda_acknowledged_by
  ON public.sensitive_data_acknowledgments (acknowledged_by, acknowledged_at DESC);
CREATE INDEX IF NOT EXISTS idx_sda_subject
  ON public.sensitive_data_acknowledgments (subject_employee_id, acknowledged_at DESC);
CREATE INDEX IF NOT EXISTS idx_sda_org
  ON public.sensitive_data_acknowledgments (organization_id);

-- ── org_id + auth_user auto-fill ──────────────────────────────────────────
-- Keeps the client INSERT minimal and prevents spoofing the org. Derives the
-- org from the acknowledging employee, and stamps the real auth.uid().
CREATE OR REPLACE FUNCTION public.sda_fill_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT e.organization_id INTO NEW.organization_id
    FROM public.employees e
    WHERE e.id = NEW.acknowledged_by;
  END IF;

  -- Always stamp the true auth user; never trust a client-supplied value.
  NEW.acknowledged_by_user_id := auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sda_fill_defaults ON public.sensitive_data_acknowledgments;
CREATE TRIGGER trg_sda_fill_defaults
  BEFORE INSERT ON public.sensitive_data_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.sda_fill_defaults();

ALTER TABLE public.sensitive_data_acknowledgments ENABLE ROW LEVEL SECURITY;

-- ── RLS ───────────────────────────────────────────────────────────────────
-- INSERT: a user may only log an acknowledgment under their OWN employee id.
CREATE POLICY "user_insert_own_acknowledgment"
  ON public.sensitive_data_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (
    acknowledged_by IN (
      SELECT up.employee_id FROM public.user_profiles up WHERE up.id = auth.uid()
    )
  );

-- SELECT: users can read their own acknowledgments...
CREATE POLICY "user_select_own_acknowledgment"
  ON public.sensitive_data_acknowledgments FOR SELECT TO authenticated
  USING (
    acknowledged_by IN (
      SELECT up.employee_id FROM public.user_profiles up WHERE up.id = auth.uid()
    )
  );

-- ...and leadership can read the full audit trail across the org.
CREATE POLICY "leadership_select_acknowledgments"
  ON public.sensitive_data_acknowledgments FOR SELECT TO authenticated
  USING (public.is_leadership());

-- No UPDATE/DELETE policies — acknowledgments are append-only evidence.

COMMENT ON TABLE public.sensitive_data_acknowledgments IS
  'Append-only log of confidentiality acknowledgments captured before revealing '
  'sensitive personal/financial data (e.g. finiquito amounts). Evidences notice '
  'of confidentiality duty per LFPDPPP 2025 and LFT Art. 47.';
