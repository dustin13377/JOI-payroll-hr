-- Rescisión de Periodo de Prueba (probation termination, Art. 39-A LFT).
-- New 4th HR document type alongside carta / acta / renuncia.
--
-- Mirrors the resignation_packets pattern:
--   1. New table public.rescision_prueba_documents
--   2. Adds fulfilled_rescision_id to hr_document_requests
--   3. Drops + recreates the three CHECKs (request_type, at_most_one_fulfilled,
--      fulfilled_status_sync) to include the new type
--   4. RLS — org-scoped per phase 3a (mirror of resignation_packets policies)
--   5. Extends hr_create_finalization_draft RPC to seed 5 default KPI rows
--      (Llamadas, Talk Time, Package Back, Citas, Calidad) — TL can add/remove/rename
--   6. Extends hr_mark_finalization_signed RPC for the new type
--
-- KPI row shape stored as JSONB:
--   { kpi: string, required: string, recorded: string, met: string }
-- (different from carta's area/indicador/meta — these are 4 cols per the PDF
--  template: Métrica/KPI · Requerido · Registrado · Cumplimiento)

-- ── Table: rescision_prueba_documents ──────────────────────────────

CREATE TABLE public.rescision_prueba_documents (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_id                      uuid        REFERENCES public.hr_document_requests(id) ON DELETE SET NULL,
  doc_ref                         text        UNIQUE,

  -- Snapshot fields (reused from cartas/actas/renuncias)
  trabajador_name_snapshot        text,
  puesto_snapshot                 text,
  horario_snapshot                text,
  supervisor_name_snapshot        text,
  company_legal_name_snapshot     text,
  company_legal_address_snapshot  text,
  incident_date_long_snapshot     text,

  -- Rescision-specific dates
  hire_date_snapshot              date,           -- Fecha de ingreso
  contract_signing_date           date,           -- when the periodo de prueba contract was signed
  termination_effective_date      date NOT NULL,  -- effective rescission date (Section V)

  -- KPI table (editable rows). Default seeded by RPC.
  -- Shape: [{ kpi, required, recorded, met }]
  kpi_table                       jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Finiquito calculations (frozen at generation time — same pattern as renuncia)
  salario_diario_snapshot         numeric(12,2),
  aguinaldo_monto                 numeric(12,2),
  vacaciones_monto                numeric(12,2),
  prima_vacacional_monto          numeric(12,2),
  total_monto                     numeric(12,2),
  total_en_letras                 text,

  -- Identity snapshots (for signature page)
  curp_snapshot                   text,
  rfc_snapshot                    text,

  -- HR narrative (optional — for any additional context)
  narrative                       text,

  -- Signing pattern (reuses carta/acta/renuncia)
  pdf_path                        text,
  signed_at                       timestamptz,
  signed_scan_path                text,

  created_by                      uuid        NOT NULL REFERENCES public.employees(id),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CHECK ((signed_at IS NULL) = (signed_scan_path IS NULL))
);

CREATE INDEX idx_rescision_prueba_employee
  ON public.rescision_prueba_documents (employee_id, created_at DESC);

CREATE INDEX idx_rescision_prueba_request
  ON public.rescision_prueba_documents (request_id);

CREATE TRIGGER trg_rescision_prueba_updated_at
  BEFORE UPDATE ON public.rescision_prueba_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Extend hr_document_requests ────────────────────────────────────

ALTER TABLE public.hr_document_requests
  ADD COLUMN fulfilled_rescision_id uuid
  REFERENCES public.rescision_prueba_documents(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- Drop + recreate the three relevant CHECKs to include 'rescision_prueba'.
ALTER TABLE public.hr_document_requests
  DROP CONSTRAINT IF EXISTS hr_document_requests_request_type_check;
ALTER TABLE public.hr_document_requests
  DROP CONSTRAINT IF EXISTS hr_document_requests_at_most_one_fulfilled;
ALTER TABLE public.hr_document_requests
  DROP CONSTRAINT IF EXISTS hr_document_requests_fulfilled_status_sync;

ALTER TABLE public.hr_document_requests
  ADD CONSTRAINT hr_document_requests_request_type_check
  CHECK (request_type IN ('carta', 'acta', 'renuncia', 'rescision_prueba'));

ALTER TABLE public.hr_document_requests
  ADD CONSTRAINT hr_document_requests_at_most_one_fulfilled
  CHECK (
    (CASE WHEN fulfilled_carta_id     IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN fulfilled_acta_id      IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN fulfilled_renuncia_id  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN fulfilled_rescision_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

ALTER TABLE public.hr_document_requests
  ADD CONSTRAINT hr_document_requests_fulfilled_status_sync CHECK (
    (status = 'pending'
      AND fulfilled_carta_id     IS NULL
      AND fulfilled_acta_id      IS NULL
      AND fulfilled_renuncia_id  IS NULL
      AND fulfilled_rescision_id IS NULL)
    OR
    (status = 'fulfilled'
      AND (fulfilled_carta_id     IS NOT NULL
        OR fulfilled_acta_id      IS NOT NULL
        OR fulfilled_renuncia_id  IS NOT NULL
        OR fulfilled_rescision_id IS NOT NULL))
    OR
    (status IN ('in_progress', 'canceled', 'downgraded'))
  );

-- ── RLS: rescision_prueba_documents ────────────────────────────────
-- Mirror of resignation_packets phase-3a org-scoped policies.

ALTER TABLE public.rescision_prueba_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leadership_all_rescisiones"
  ON public.rescision_prueba_documents FOR ALL TO authenticated
  USING (
    public.is_leadership()
    AND employee_id IN (SELECT id FROM public.employees WHERE organization_id = public.my_org_id())
  )
  WITH CHECK (
    public.is_leadership()
    AND employee_id IN (SELECT id FROM public.employees WHERE organization_id = public.my_org_id())
  );

CREATE POLICY "tl_select_team_rescisiones"
  ON public.rescision_prueba_documents FOR SELECT TO authenticated
  USING (
    public.is_team_lead()
    AND public.tl_employee_on_my_team(employee_id)
    AND employee_id IN (SELECT id FROM public.employees WHERE organization_id = public.my_org_id())
  );

CREATE POLICY "agents_select_own_signed_rescisiones"
  ON public.rescision_prueba_documents FOR SELECT TO authenticated
  USING (
    employee_id = public.my_employee_id()
    AND signed_at IS NOT NULL
    AND signed_scan_path IS NOT NULL
  );

-- ── Extend hr_create_finalization_draft RPC ───────────────────────
-- Adds rescision_prueba branch. Seeds 5 default KPI rows so TL only
-- needs to fill Registrado + Cumplimiento (rows can still be edited /
-- added / removed in the UI).

CREATE OR REPLACE FUNCTION public.hr_create_finalization_draft(
  p_request_id uuid,
  p_created_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request    record;
  v_doc_ref    text;
  v_new_id     uuid;
  v_type       text;
  v_default_kpis jsonb;
BEGIN
  IF NOT public.is_leadership() THEN
    RAISE EXCEPTION 'Forbidden: only leadership may create finalization drafts'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
    FROM public.hr_document_requests
   WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.fulfilled_carta_id     IS NOT NULL
     OR v_request.fulfilled_acta_id   IS NOT NULL
     OR v_request.fulfilled_renuncia_id IS NOT NULL
     OR v_request.fulfilled_rescision_id IS NOT NULL THEN
    RAISE EXCEPTION 'Request already has a finalization row'
      USING ERRCODE = 'P0001';
  END IF;

  v_type := v_request.request_type;

  IF v_type = 'carta' THEN
    v_doc_ref := 'CC' || to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    INSERT INTO public.cartas_compromiso (
      employee_id, request_id, doc_ref, incident_date, kpi_table, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, '[]'::jsonb, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_carta_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSIF v_type = 'acta' THEN
    v_doc_ref := to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    INSERT INTO public.actas_administrativas (
      employee_id, request_id, doc_ref, incident_date, witnesses, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, '[]'::jsonb, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_acta_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSIF v_type = 'renuncia' THEN
    v_doc_ref := 'RN' || to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    INSERT INTO public.resignation_packets (
      employee_id, request_id, doc_ref, effective_date, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_renuncia_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSIF v_type = 'rescision_prueba' THEN
    v_doc_ref := 'RP' || to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    -- Seed 5 default KPI rows (Funding Specialist template per source doc).
    -- HR can edit / add / remove in the UI.
    v_default_kpis := jsonb_build_array(
      jsonb_build_object('kpi', 'Llamadas diarias',                  'required', '350 llamadas', 'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Talk Time diario',                  'required', '3 h / día',    'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Package Back / Credit Pull',        'required', '7 / día',      'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Citas agendadas (Google Calendar)', 'required', '6 / día',      'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Calidad de llamada (auditoría)',    'required', '≥ 90 %',       'recorded', '', 'met', '')
    );
    INSERT INTO public.rescision_prueba_documents (
      employee_id, request_id, doc_ref,
      termination_effective_date, kpi_table, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, v_default_kpis, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_rescision_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSE
    RAISE EXCEPTION 'Unknown request_type: %', v_type;
  END IF;

  RETURN jsonb_build_object('id', v_new_id, 'type', v_type, 'doc_ref', v_doc_ref);
END;
$$;

-- ── Extend hr_mark_finalization_signed RPC ────────────────────────

CREATE OR REPLACE FUNCTION public.hr_mark_finalization_signed(
  p_finalization_id  uuid,
  p_type             text,
  p_signed_scan_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request_id uuid;
BEGIN
  IF NOT public.is_leadership() THEN
    RAISE EXCEPTION 'Forbidden: only leadership may mark docs as signed'
      USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('carta', 'acta', 'renuncia', 'rescision_prueba') THEN
    RAISE EXCEPTION 'Unknown type: %', p_type USING ERRCODE = '22023';
  END IF;

  IF p_type = 'carta' THEN
    UPDATE public.cartas_compromiso
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  ELSIF p_type = 'acta' THEN
    UPDATE public.actas_administrativas
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  ELSIF p_type = 'renuncia' THEN
    UPDATE public.resignation_packets
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  ELSE
    UPDATE public.rescision_prueba_documents
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  END IF;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Finalization row not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.hr_document_requests
     SET status = 'fulfilled',
         canceled_reason = NULL
   WHERE id = v_request_id
     AND status <> 'fulfilled';

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'finalization_id', p_finalization_id,
    'status', 'fulfilled'
  );
END;
$$;
