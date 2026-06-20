import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { SensitiveDataAckGate, FINIQUITO_ACK_TEXT } from "@/components/SensitiveDataAckGate";
import { ArrowLeft, Save, FileText, Plus, Trash2, AlertTriangle, Unlink, Eye, Upload, ExternalLink, AlertCircle, CheckCircle, RefreshCw, User, Briefcase, Calendar, Quote } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDateMX, formatDateMXLong, formatDateSpanishFull } from "@/lib/localDate";
import {
  COMPANY_LEGAL_NAME,
  COMPANY_LEGAL_ADDRESS,
} from "@/lib/companyInfo";
import {
  useHrDocumentRequest,
  useHrFinalization,
  useCreateHrFinalizationDraft,
  useSaveFinalizationDraft,
  usePriorSignedCartaForEmployee,
  useCartaById,
  useUploadFinalizedPdf,
  useUploadSignedScan,
  type FinalizationDraft,
} from "@/hooks/useHrDocumentRequests";
import type { CartaKpiRow, ActaWitness, RescisionKpiRow } from "@/types/hr-docs";
import { generateCartaPdf } from "@/lib/pdf/generateCartaPdf";
import { generateActaPdf } from "@/lib/pdf/generateActaPdf";
import { generateRenunciaPacketPdf } from "@/lib/pdf/generateRenunciaPacketPdf";
import { generateRescisionPdf } from "@/lib/pdf/generateRescisionPdf";
import { generateRescisionDesempenoPdf } from "@/lib/pdf/generateRescisionDesempenoPdf";
import {
  calcAguinaldoProporcional,
  calcVacaciones,
  calcPrimaVacacional,
  calcFiniquitoTotal,
  numberToSpanishWords,
} from "@/lib/lftCalculations";

// ── Snapshot auto-populate helpers ──────────────────────────────────

interface SnapshotSeed {
  trabajadorNameSnapshot: string;
  puestoSnapshot: string;
  horarioSnapshot: string;
  supervisorNameSnapshot: string;
  companyLegalNameSnapshot: string;
  companyLegalAddressSnapshot: string;
  incidentDateLongSnapshot: string;
  curpSnapshot?: string;
  rfcSnapshot?: string;
  hireDateSnapshot?: string;
  salarioDiarioSnapshot?: string;
  effectiveDate?: string;
}

function formatShiftRange(
  startTime: string | null,
  endTime: string | null,
  daysOfWeek: number[] | null,
): string {
  if (!startTime || !endTime) return "";
  const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const fmt = (t: string) => {
    const [h, m] = t.split(":");
    const hr = parseInt(h, 10);
    const ampm = hr >= 12 ? "PM" : "AM";
    const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
    return `${hr12}:${m} ${ampm}`;
  };
  const days =
    daysOfWeek && daysOfWeek.length > 0
      ? daysOfWeek.map((d) => DAY_LABELS[d]).join("-")
      : "Lun-Vie";
  return `${days} ${fmt(startTime)} – ${fmt(endTime)}`;
}

// ── Form state shape ────────────────────────────────────────────────

interface DraftFormState {
  narrative: string;
  trabajadorNameSnapshot: string;
  puestoSnapshot: string;
  horarioSnapshot: string;
  supervisorNameSnapshot: string;
  companyLegalNameSnapshot: string;
  companyLegalAddressSnapshot: string;
  incidentDateLongSnapshot: string;
  kpiTable: CartaKpiRow[];
  witnesses: ActaWitness[];
  reincidenciaPriorCartaId: string | null;
  // Renuncia-specific
  effectiveDate: string;
  renunciaNarrative: string;
  hireDateSnapshot: string;
  salarioDiarioSnapshot: string;
  aguinaldoMonto: string;
  vacacionesMonto: string;
  primaVacacionalMonto: string;
  salariosDevengadosMonto: string;
  totalMonto: string;
  totalEnLetras: string;
  curpSnapshot: string;
  rfcSnapshot: string;
  claveElector: string;
  // Rescision_prueba-specific
  rescisionKpiTable: RescisionKpiRow[];
  contractSigningDate: string;
  terminationEffectiveDate: string;
}

function draftToFormState(draft: FinalizationDraft): DraftFormState {
  return {
    narrative: draft.narrative ?? "",
    trabajadorNameSnapshot: draft.trabajadorNameSnapshot ?? "",
    puestoSnapshot: draft.puestoSnapshot ?? "",
    horarioSnapshot: draft.horarioSnapshot ?? "",
    supervisorNameSnapshot: draft.supervisorNameSnapshot ?? "",
    companyLegalNameSnapshot: draft.companyLegalNameSnapshot ?? "",
    companyLegalAddressSnapshot: draft.companyLegalAddressSnapshot ?? "",
    incidentDateLongSnapshot: draft.incidentDateLongSnapshot ?? "",
    kpiTable: draft.kpiTable ?? [],
    witnesses: draft.witnesses ?? [],
    reincidenciaPriorCartaId: draft.reincidenciaPriorCartaId,
    effectiveDate: draft.effectiveDate ?? "",
    renunciaNarrative: draft.renunciaNarrative ?? "",
    hireDateSnapshot: draft.hireDateSnapshot ?? "",
    salarioDiarioSnapshot: draft.salarioDiarioSnapshot != null ? String(draft.salarioDiarioSnapshot) : "",
    aguinaldoMonto: draft.aguinaldoMonto != null ? String(draft.aguinaldoMonto) : "",
    vacacionesMonto: draft.vacacionesMonto != null ? String(draft.vacacionesMonto) : "",
    primaVacacionalMonto: draft.primaVacacionalMonto != null ? String(draft.primaVacacionalMonto) : "",
    salariosDevengadosMonto: draft.salariosDevengadosMonto != null ? String(draft.salariosDevengadosMonto) : "",
    totalMonto: draft.totalMonto != null ? String(draft.totalMonto) : "",
    totalEnLetras: draft.totalEnLetras ?? "",
    curpSnapshot: draft.curpSnapshot ?? "",
    rfcSnapshot: draft.rfcSnapshot ?? "",
    claveElector: draft.claveElector ?? "",
    rescisionKpiTable: draft.rescisionKpiTable ?? [],
    contractSigningDate: draft.contractSigningDate ?? "",
    terminationEffectiveDate: draft.terminationEffectiveDate ?? "",
  };
}

function seedToFormState(seed: SnapshotSeed): DraftFormState {
  return {
    narrative: "",
    kpiTable: [],
    witnesses: [],
    reincidenciaPriorCartaId: null,
    effectiveDate: "",
    renunciaNarrative: "",
    hireDateSnapshot: "",
    salarioDiarioSnapshot: "",
    aguinaldoMonto: "",
    vacacionesMonto: "",
    primaVacacionalMonto: "",
    salariosDevengadosMonto: "",
    totalMonto: "",
    totalEnLetras: "",
    curpSnapshot: "",
    rfcSnapshot: "",
    claveElector: "",
    rescisionKpiTable: [],
    contractSigningDate: "",
    terminationEffectiveDate: "",
    ...seed,
  };
}

// ── Main component ──────────────────────────────────────────────────

export default function HrDocumentDraft() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { employeeId: authEmployeeId, canViewSalary, isManager, isLeadership, isOwner } = useAuth();
  // Confidentiality gate: shown to managers + admins (leadership), but the
  // owner is exempt. Note this exempts the owner ROLE, not a specific person.
  const ackGateActive = isLeadership && !isOwner;
  const MASKED = "* * * * *";
  // Managers-and-up can VIEW the finiquito math — but only after acknowledging
  // the confidentiality box. The owner is exempt from the box (ackGateActive is
  // false for them). Finalizing/uploading the signed PDF is allowed for Owner/HR
  // always, and for managers once they've acked the confidentiality box (see
  // canFinalize). finiquitoAcked mirrors the gate so the PDF honors the same
  // rule the on-screen calculator does — no amounts leak without an ack.
  const canViewFiniquito = canViewSalary || isManager;
  const [finiquitoAcked, setFiniquitoAcked] = useState(false);
  // True only when the viewer may see real amounts AND (owner, or has acked).
  const finiquitoUnmasked =
    canViewFiniquito && (!ackGateActive || finiquitoAcked);

  // Request + existing draft
  const { data: request, isLoading: reqLoading } = useHrDocumentRequest(id);
  const { data: draft, isLoading: draftLoading } = useHrFinalization(
    id,
    request?.requestType,
  );

  // Snapshot seed data (fetched once for auto-populate)
  const [snapshotSeed, setSnapshotSeed] = useState<SnapshotSeed | null>(null);
  const seedFetched = useRef(false);

  useEffect(() => {
    if (!request || seedFetched.current) return;
    seedFetched.current = true;

    (async () => {
      // Fetch employee full_name, department, campaign_id
      const { data: emp } = await supabase
        .from("employees")
        .select(
          "full_name, department_id, campaign_id, curp, rfc, hire_date, monthly_base_salary, departments(name), campaigns!campaign_id(name, team_lead_id)",
        )
        .eq("id", request.employeeId)
        .single();

      // Fetch shift_settings for campaign
      let horario = "";
      if (emp?.campaign_id) {
        const { data: shifts } = await supabase
          .from("shift_settings")
          .select("start_time, end_time, days_of_week")
          .eq("campaign_id", emp.campaign_id)
          .limit(1)
          .maybeSingle();
        if (shifts) {
          horario = formatShiftRange(
            shifts.start_time,
            shifts.end_time,
            shifts.days_of_week as number[] | null,
          );
        }
      }

      // Fetch TL legal name (PDFs need the full legal name, not work_name)
      let supervisorName = "";
      const tlId = (emp?.campaigns as { team_lead_id?: string } | null)
        ?.team_lead_id;
      if (tlId) {
        const { data: tl } = await supabase
          .from("employees")
          .select("full_name")
          .eq("id", tlId)
          .single();
        if (tl) {
          supervisorName = tl.full_name;
        }
      }

      const monthlyBase = (emp as Record<string, unknown>)?.monthly_base_salary as number | null;
      const salarioDiario = monthlyBase ? Math.round((monthlyBase / 30) * 100) / 100 : null;

      setSnapshotSeed({
        trabajadorNameSnapshot: (emp?.full_name ?? "").toUpperCase(),
        puestoSnapshot:
          (emp?.departments as { name?: string } | null)?.name ?? "",
        horarioSnapshot: horario,
        supervisorNameSnapshot: supervisorName,
        companyLegalNameSnapshot: COMPANY_LEGAL_NAME,
        companyLegalAddressSnapshot: COMPANY_LEGAL_ADDRESS,
        incidentDateLongSnapshot: formatDateSpanishFull(request.incidentDate),
        curpSnapshot: (emp as Record<string, unknown>)?.curp as string ?? "",
        rfcSnapshot: (emp as Record<string, unknown>)?.rfc as string ?? "",
        hireDateSnapshot: (emp as Record<string, unknown>)?.hire_date as string ?? "",
        salarioDiarioSnapshot: salarioDiario != null ? String(salarioDiario) : "",
        effectiveDate: request.incidentDate ?? "",
      });
    })();
  }, [request]);

  // Prior signed carta for reincidencia (actas only)
  const { data: priorCarta } = usePriorSignedCartaForEmployee(
    request?.requestType === "acta" ? request?.employeeId : undefined,
  );

  // ── Form state with dirty flag ─────────────────────────────────────
  const [form, setForm] = useState<DraftFormState>({
    narrative: "",
    trabajadorNameSnapshot: "",
    puestoSnapshot: "",
    horarioSnapshot: "",
    supervisorNameSnapshot: "",
    companyLegalNameSnapshot: "",
    companyLegalAddressSnapshot: "",
    incidentDateLongSnapshot: "",
    kpiTable: [],
    witnesses: [],
    reincidenciaPriorCartaId: null,
    effectiveDate: "",
    renunciaNarrative: "",
    hireDateSnapshot: "",
    salarioDiarioSnapshot: "",
    aguinaldoMonto: "",
    vacacionesMonto: "",
    primaVacacionalMonto: "",
    salariosDevengadosMonto: "",
    totalMonto: "",
    totalEnLetras: "",
    curpSnapshot: "",
    rfcSnapshot: "",
    claveElector: "",
    rescisionKpiTable: [],
    contractSigningDate: "",
    terminationEffectiveDate: "",
  });
  const formDirty = useRef(false);

  const setFormDirty = (
    updater: DraftFormState | ((prev: DraftFormState) => DraftFormState),
  ) => {
    formDirty.current = true;
    setForm(updater);
  };

  // Sync from server (draft or seed) — skip if user has unsaved edits
  useEffect(() => {
    if (formDirty.current) return;
    if (draft) {
      const state = draftToFormState(draft);
      // Backfill any empty snapshot fields from live employee/company data
      if (snapshotSeed) {
        if (!state.trabajadorNameSnapshot) state.trabajadorNameSnapshot = snapshotSeed.trabajadorNameSnapshot;
        if (!state.puestoSnapshot) state.puestoSnapshot = snapshotSeed.puestoSnapshot;
        if (!state.horarioSnapshot) state.horarioSnapshot = snapshotSeed.horarioSnapshot;
        if (!state.supervisorNameSnapshot) state.supervisorNameSnapshot = snapshotSeed.supervisorNameSnapshot;
        if (!state.companyLegalNameSnapshot) state.companyLegalNameSnapshot = snapshotSeed.companyLegalNameSnapshot;
        if (!state.companyLegalAddressSnapshot) state.companyLegalAddressSnapshot = snapshotSeed.companyLegalAddressSnapshot;
        if (!state.incidentDateLongSnapshot) state.incidentDateLongSnapshot = snapshotSeed.incidentDateLongSnapshot;
        if (draft.type === "renuncia") {
          if (!state.curpSnapshot) state.curpSnapshot = snapshotSeed.curpSnapshot ?? "";
          if (!state.rfcSnapshot) state.rfcSnapshot = snapshotSeed.rfcSnapshot ?? "";
          if (!state.hireDateSnapshot) state.hireDateSnapshot = snapshotSeed.hireDateSnapshot ?? "";
          if (!state.salarioDiarioSnapshot) state.salarioDiarioSnapshot = snapshotSeed.salarioDiarioSnapshot ?? "";
          if (!state.effectiveDate) state.effectiveDate = snapshotSeed.effectiveDate ?? "";
        }
        if (draft.type === "rescision_prueba" || draft.type === "rescision_desempeno") {
          if (!state.curpSnapshot) state.curpSnapshot = snapshotSeed.curpSnapshot ?? "";
          if (!state.rfcSnapshot) state.rfcSnapshot = snapshotSeed.rfcSnapshot ?? "";
          if (!state.hireDateSnapshot) state.hireDateSnapshot = snapshotSeed.hireDateSnapshot ?? "";
          if (!state.salarioDiarioSnapshot) state.salarioDiarioSnapshot = snapshotSeed.salarioDiarioSnapshot ?? "";
          if (!state.terminationEffectiveDate) state.terminationEffectiveDate = snapshotSeed.effectiveDate ?? "";
          // Contract/continuation date default:
          //   rescision_prueba    → hire date (probation contract signed at hire)
          //   rescision_desempeno → hire + 30 days (end of the prueba period;
          //     when the fixed-term contract continued). HR can still adjust.
          if (!state.contractSigningDate) {
            const hire = snapshotSeed.hireDateSnapshot ?? "";
            if (draft.type === "rescision_desempeno" && hire) {
              const d = new Date(`${hire}T00:00:00`);
              d.setDate(d.getDate() + 30);
              state.contractSigningDate = d.toISOString().slice(0, 10);
            } else {
              state.contractSigningDate = hire;
            }
          }
        }
      }
      setForm(state);
    } else if (snapshotSeed) {
      const state = seedToFormState(snapshotSeed);
      if (priorCarta) {
        state.reincidenciaPriorCartaId = priorCarta.id;
      }
      setForm(state);
    }
  }, [draft, snapshotSeed, priorCarta]);

  // ── Mutations ──────────────────────────────────────────────────────
  const createDraft = useCreateHrFinalizationDraft();
  const saveDraft = useSaveFinalizationDraft();
  const saving = createDraft.isPending || saveDraft.isPending;

  async function handleSave() {
    if (!request || !authEmployeeId) return;

    const fields: Record<string, unknown> = {
      narrative: form.narrative || null,
      trabajador_name_snapshot: form.trabajadorNameSnapshot || null,
      puesto_snapshot: form.puestoSnapshot || null,
      horario_snapshot: form.horarioSnapshot || null,
      company_legal_name_snapshot: form.companyLegalNameSnapshot || null,
      company_legal_address_snapshot:
        form.companyLegalAddressSnapshot || null,
    };

    if (request.requestType === "carta") {
      fields.supervisor_name_snapshot = form.supervisorNameSnapshot || null;
      fields.incident_date_long_snapshot = form.incidentDateLongSnapshot || null;
      fields.kpi_table = form.kpiTable;
    } else if (request.requestType === "acta") {
      fields.supervisor_name_snapshot = form.supervisorNameSnapshot || null;
      fields.incident_date_long_snapshot = form.incidentDateLongSnapshot || null;
      fields.witnesses = form.witnesses;
      fields.reincidencia_prior_carta_id =
        form.reincidenciaPriorCartaId || null;
    } else if (request.requestType === "renuncia") {
      fields.effective_date = form.effectiveDate || null;
      // narrative is already set from form.narrative (the Formal Narrative box)
      // in the base `fields` above. Don't overwrite it with renunciaNarrative —
      // that field is never edited in the UI, so it would clobber what HR typed.
      fields.hire_date_snapshot = form.hireDateSnapshot || null;
      fields.salario_diario_snapshot = form.salarioDiarioSnapshot ? parseFloat(form.salarioDiarioSnapshot) : null;
      fields.aguinaldo_monto = form.aguinaldoMonto ? parseFloat(form.aguinaldoMonto) : null;
      fields.vacaciones_monto = form.vacacionesMonto ? parseFloat(form.vacacionesMonto) : null;
      fields.prima_vacacional_monto = form.primaVacacionalMonto ? parseFloat(form.primaVacacionalMonto) : null;
      fields.salarios_devengados_monto = form.salariosDevengadosMonto ? parseFloat(form.salariosDevengadosMonto) : null;
      fields.total_monto = form.totalMonto ? parseFloat(form.totalMonto) : null;
      fields.total_en_letras = form.totalEnLetras || null;
      fields.curp_snapshot = form.curpSnapshot || null;
      fields.rfc_snapshot = form.rfcSnapshot || null;
      fields.clave_elector = form.claveElector || null;
    } else if (
      request.requestType === "rescision_prueba" ||
      request.requestType === "rescision_desempeno"
    ) {
      fields.supervisor_name_snapshot = form.supervisorNameSnapshot || null;
      fields.incident_date_long_snapshot = form.incidentDateLongSnapshot || null;
      fields.kpi_table = form.rescisionKpiTable;
      fields.contract_signing_date = form.contractSigningDate || null;
      // termination_effective_date is NOT NULL — leave it unset if blank
      if (form.terminationEffectiveDate) {
        fields.termination_effective_date = form.terminationEffectiveDate;
      }
      fields.hire_date_snapshot = form.hireDateSnapshot || null;
      fields.salario_diario_snapshot = form.salarioDiarioSnapshot ? parseFloat(form.salarioDiarioSnapshot) : null;
      fields.aguinaldo_monto = form.aguinaldoMonto ? parseFloat(form.aguinaldoMonto) : null;
      fields.vacaciones_monto = form.vacacionesMonto ? parseFloat(form.vacacionesMonto) : null;
      fields.prima_vacacional_monto = form.primaVacacionalMonto ? parseFloat(form.primaVacacionalMonto) : null;
      fields.salarios_devengados_monto = form.salariosDevengadosMonto ? parseFloat(form.salariosDevengadosMonto) : null;
      fields.total_monto = form.totalMonto ? parseFloat(form.totalMonto) : null;
      fields.total_en_letras = form.totalEnLetras || null;
      fields.curp_snapshot = form.curpSnapshot || null;
      fields.rfc_snapshot = form.rfcSnapshot || null;
    }

    try {
      if (!draft) {
        // First save: create via RPC then update fields
        const result = await createDraft.mutateAsync({
          requestId: request.id,
          createdBy: authEmployeeId,
          employeeId: request.employeeId,
        });
        // Now update the freshly-created row with the form fields
        await saveDraft.mutateAsync({
          draftId: result.id,
          type: result.type as "carta" | "acta" | "renuncia" | "rescision_prueba",
          fields,
          requestId: request.id,
        });
      } else {
        await saveDraft.mutateAsync({
          draftId: draft.id,
          type: draft.type,
          fields,
          requestId: request.id,
        });
      }
      formDirty.current = false;
      toast.success("Draft saved");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // ── PDF hooks + handlers ───────────────────────────────────────────
  const uploadPdf = useUploadFinalizedPdf();
  // For acta reincidencia: fetch linked carta (may differ from priorCarta after desvincular)
  const { data: linkedCarta } = useCartaById(
    draft?.type === "acta" ? draft?.reincidenciaPriorCartaId : undefined,
  );

  /** Merge current form state onto the draft so PDF always uses live UI values. */
  function draftWithFormOverlay(): FinalizationDraft | null {
    if (!draft) return null;
    return {
      ...draft,
      narrative: form.narrative || draft.narrative,
      trabajadorNameSnapshot: form.trabajadorNameSnapshot || draft.trabajadorNameSnapshot,
      puestoSnapshot: form.puestoSnapshot || draft.puestoSnapshot,
      horarioSnapshot: form.horarioSnapshot || draft.horarioSnapshot,
      supervisorNameSnapshot: form.supervisorNameSnapshot || draft.supervisorNameSnapshot,
      companyLegalNameSnapshot: form.companyLegalNameSnapshot || draft.companyLegalNameSnapshot,
      companyLegalAddressSnapshot: form.companyLegalAddressSnapshot || draft.companyLegalAddressSnapshot,
      incidentDateLongSnapshot: form.incidentDateLongSnapshot || draft.incidentDateLongSnapshot,
      kpiTable: form.kpiTable.length > 0 ? form.kpiTable : draft.kpiTable,
      witnesses: form.witnesses.length > 0 ? form.witnesses : draft.witnesses,
      effectiveDate: form.effectiveDate || draft.effectiveDate,
      hireDateSnapshot: form.hireDateSnapshot || draft.hireDateSnapshot,
      salarioDiarioSnapshot: form.salarioDiarioSnapshot ? parseFloat(form.salarioDiarioSnapshot) : draft.salarioDiarioSnapshot,
      aguinaldoMonto: form.aguinaldoMonto ? parseFloat(form.aguinaldoMonto) : draft.aguinaldoMonto,
      vacacionesMonto: form.vacacionesMonto ? parseFloat(form.vacacionesMonto) : draft.vacacionesMonto,
      primaVacacionalMonto: form.primaVacacionalMonto ? parseFloat(form.primaVacacionalMonto) : draft.primaVacacionalMonto,
      salariosDevengadosMonto: form.salariosDevengadosMonto ? parseFloat(form.salariosDevengadosMonto) : draft.salariosDevengadosMonto,
      totalMonto: form.totalMonto ? parseFloat(form.totalMonto) : draft.totalMonto,
      totalEnLetras: form.totalEnLetras || draft.totalEnLetras,
      curpSnapshot: form.curpSnapshot || draft.curpSnapshot,
      rfcSnapshot: form.rfcSnapshot || draft.rfcSnapshot,
      claveElector: form.claveElector || draft.claveElector,
      rescisionKpiTable:
        form.rescisionKpiTable.length > 0
          ? form.rescisionKpiTable
          : draft.rescisionKpiTable,
      contractSigningDate: form.contractSigningDate || draft.contractSigningDate,
      terminationEffectiveDate:
        form.terminationEffectiveDate || draft.terminationEffectiveDate,
    };
  }

  function generatePdfBlob(): Blob | null {
    const liveDraft = draftWithFormOverlay();
    if (!liveDraft || !request) return null;
    if (request.requestType === "carta") {
      return generateCartaPdf(liveDraft, request);
    }
    if (request.requestType === "renuncia") {
      return generateRenunciaPacketPdf(liveDraft, request, { maskSalary: !finiquitoUnmasked });
    }
    if (request.requestType === "rescision_prueba") {
      return generateRescisionPdf(liveDraft, request, { maskSalary: !finiquitoUnmasked });
    }
    if (request.requestType === "rescision_desempeno") {
      return generateRescisionDesempenoPdf(liveDraft, request, { maskSalary: !finiquitoUnmasked });
    }
    return generateActaPdf(
      liveDraft,
      request,
      linkedCarta ?? null,
    );
  }

  async function handlePreviewPdf() {
    if (!draft || !request) {
      toast.error("Save the draft first");
      return;
    }
    // Auto-save before preview so DB matches what HR sees
    if (formDirty.current) {
      await handleSave();
    }
    const blob = generatePdfBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  async function handleFinalizePdf() {
    if (!draft || !request) return;
    if (!canFinalize) {
      toast.error("Acknowledge the confidentiality box above to finalize finiquito documents.");
      return;
    }
    // Auto-save before PDF generation
    if (formDirty.current) {
      await handleSave();
    }
    const blob = generatePdfBlob();
    if (!blob) return;
    try {
      await uploadPdf.mutateAsync({
        draftId: draft.id,
        type: draft.type,
        employeeId: request.employeeId,
        docRef: draft.docRef ?? draft.id,
        pdfBlob: blob,
        requestId: request.id,
      });
      toast.success("PDF saved");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleViewSavedPdf() {
    if (!draft?.pdfPath) return;
    const { data, error } = await supabase.storage
      .from("hr-documents")
      .createSignedUrl(draft.pdfPath, 3600);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  // ── Signed-scan upload ─────────────────────────────────────────────
  const uploadScan = useUploadSignedScan();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const MAX_SCAN_SIZE = 10 * 1024 * 1024; // 10 MB

  function handleScanFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (scanInputRef.current) scanInputRef.current.value = "";
    if (!file) return;

    if (!canFinalize) {
      toast.error("Acknowledge the confidentiality box above to upload the signed scan.");
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("File must be PDF");
      return;
    }
    if (file.size > MAX_SCAN_SIZE) {
      toast.error("File must be under 10MB");
      return;
    }
    if (!draft || !request) return;

    uploadScan.mutate(
      {
        draftId: draft.id,
        type: draft.type,
        employeeId: request.employeeId,
        docRef: draft.docRef ?? draft.id,
        scanBlob: file,
        requestId: request.id,
      },
      {
        onSuccess: () => {
          toast.success(
            draft.signedAt
              ? "Scan replaced"
              : "Scan saved. Request marked as fulfilled.",
          );
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  async function handleViewSignedScan() {
    if (!draft?.signedScanPath) return;
    const { data, error } = await supabase.storage
      .from("hr-documents")
      .createSignedUrl(draft.signedScanPath, 3600);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  // ── Loading / not found ────────────────────────────────────────────

  if (reqLoading || draftLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <LogoLoadingIndicator size="lg" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-muted-foreground">Request not found.</p>
        <Button variant="outline" onClick={() => navigate("/hr/document-queue")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to queue
        </Button>
      </div>
    );
  }

  const isTerminal =
    request.status === "canceled" || request.status === "downgraded";

  // Docs that contain salary information. Managers can fill these in but
  // cannot finalize or upload the signed scan — those produce the legally-
  // binding document and require real amounts visible to the actor.
  const isSalaryDoc =
    request.requestType === "renuncia" ||
    request.requestType === "rescision_prueba" ||
    request.requestType === "rescision_desempeno";
  // Owner/HR can always finalize. Managers can finalize salary docs once they've
  // acknowledged the confidentiality box (finiquitoUnmasked encodes "allowed to
  // see real amounts AND has acked if required"). Non-salary docs are open to all.
  const canFinalize = !isSalaryDoc || canViewSalary || finiquitoUnmasked;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/hr/document-queue")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Queue
          </Button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {request.requestType === "acta"
              ? "Disciplinary Act"
              : request.requestType === "renuncia"
                ? "Resignation Packet"
                : request.requestType === "rescision_prueba"
                  ? "Probation Termination"
                  : request.requestType === "rescision_desempeno"
                    ? "Performance Termination"
                    : "Commitment Letter"}
          </h1>
          <Badge variant="outline" className="text-xs">
            {draft?.docRef ?? "— (generated on save)"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {draft && (
            <span className="text-xs text-muted-foreground">
              Last saved: {formatDateMX(draft.updatedAt)}
            </span>
          )}
          {!isTerminal && (
            <>
              <Button onClick={handleSave} disabled={saving} size="sm">
                <Save className="mr-1 h-4 w-4" />
                {saving ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviewPdf}
                disabled={
                  !draft ||
                  (request.requestType === "rescision_prueba" ||
                  request.requestType === "rescision_desempeno"
                    ? !form.terminationEffectiveDate
                    : !form.narrative.trim())
                }
              >
                <Eye className="mr-1 h-4 w-4" /> Preview PDF
              </Button>
              {canFinalize ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleFinalizePdf}
                  disabled={!draft || uploadPdf.isPending}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  {uploadPdf.isPending ? "Uploading..." : "Finalize & Save PDF"}
                </Button>
              ) : (
                <span
                  className="text-xs text-muted-foreground italic"
                  title="Finalizing requires the actual finiquito amounts. Acknowledge the confidentiality box above to unlock."
                >
                  Acknowledge confidentiality box to finalize
                </span>
              )}
            </>
          )}
          {draft?.pdfPath && (
            <Button variant="link" size="sm" onClick={handleViewSavedPdf}>
              <ExternalLink className="mr-1 h-3 w-3" /> View Saved PDF
            </Button>
          )}
        </div>
      </div>

      {/* Stale PDF warning */}
      {formDirty.current && draft?.pdfPath && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            You have unsaved changes. The saved PDF reflects the previous version — regenerate after saving to update it.
          </p>
        </div>
      )}

      {isTerminal && (
        <div className="rounded-lg border border-destructive/30 p-3 text-sm bg-destructive/5">
          This request was{" "}
          {request.status === "canceled" ? "canceled" : "downgraded"}.
          {request.canceledReason && (
            <> Reason: {request.canceledReason}</>
          )}
        </div>
      )}

      {/* ── Signed-scan upload section ──────────────────── */}
      {draft && !isTerminal && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Signed Scan
          </h3>

          {/* Hidden file input */}
          <input
            ref={scanInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            aria-label="Upload signed scan"
            onChange={handleScanFileSelect}
          />

          {!canFinalize && !draft.signedAt && (
            <p className="text-xs text-muted-foreground italic">
              Acknowledge the confidentiality box above (Confidencial — datos de
              finiquito y salario) to unlock finalizing and uploading the signed
              scan. You verify the real finiquito amounts on the printed
              document before locking it.
            </p>
          )}

          {canFinalize && !draft.pdfPath && (
            <p className="text-xs text-muted-foreground">
              Generate and save the PDF first before uploading the signed scan.
            </p>
          )}

          {canFinalize && draft.pdfPath && !draft.signedAt && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => scanInputRef.current?.click()}
                disabled={uploadScan.isPending}
              >
                <Upload className="mr-1 h-4 w-4" />
                {uploadScan.isPending
                  ? "Uploading..."
                  : "Upload Signed Scan"}
              </Button>
              <span className="text-xs text-muted-foreground">
                PDF, max 10MB
              </span>
            </div>
          )}

          {draft.signedAt && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-50 border border-emerald-200">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-sm text-emerald-800">
                  Signed on {formatDateMX(draft.signedAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewSignedScan}
                >
                  <ExternalLink className="mr-1 h-3 w-3" /> View Signed
                  Scan
                </Button>
                {canFinalize && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => scanInputRef.current?.click()}
                    disabled={uploadScan.isPending}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    {uploadScan.isPending
                      ? "Uploading..."
                      : "Replace scan"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Split-view: CSS grid + sticky left */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
        {/* Left: TL narrative (read-only, sticky on desktop) */}
        <aside className="md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto space-y-4">
            {/* ── Agent identity card ──────────────────────── */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-lg font-semibold">
                  {request.employeeName ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                {request.campaignName && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {request.campaignName}
                  </span>
                )}
              </div>
            </div>

            {/* ── Request metadata card ────────────────────── */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={
                    request.requestType === "acta" ||
                    request.requestType === "rescision_prueba" ||
                    request.requestType === "rescision_desempeno"
                      ? "destructive"
                      : request.requestType === "renuncia"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {request.requestType === "acta"
                    ? "Disciplinary Act"
                    : request.requestType === "renuncia"
                      ? "Voluntary Resignation"
                      : request.requestType === "rescision_prueba"
                        ? "Probation Termination"
                        : request.requestType === "rescision_desempeno"
                          ? "Performance Termination"
                          : "Commitment Letter"}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {request.status === "pending"
                    ? "Pending"
                    : request.status === "in_progress"
                      ? "In Progress"
                      : request.status === "fulfilled"
                        ? "Fulfilled"
                        : request.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Incident Date</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    {formatDateMX(request.incidentDate)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Filed By</span>
                  <span>{request.filerName ?? "—"}</span>
                </div>
              </div>
              {request.reason && (
                <>
                  <Separator />
                  <div className="text-sm">
                    <span className="text-xs text-muted-foreground block mb-1">Reason</span>
                    <span className="italic">{request.reason}</span>
                  </div>
                </>
              )}
            </div>

            {/* ── TL narrative card ───────────────────────── */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Quote className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  TL Narrative
                </span>
              </div>
              <div className="rounded-md border-l-4 border-primary/30 bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-wrap italic">
                {request.tlNarrative}
              </div>
            </div>
        </aside>

        {/* Right: HR draft form */}
        <section className="space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Formal Draft (HR)
            </h2>

            {/* ── Section: Datos del trabajador ─────────────── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee Info</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="snap-name" className="text-xs text-muted-foreground">
                    Employee (legal name)
                  </Label>
                  <Input
                    id="snap-name"
                    value={form.trabajadorNameSnapshot}
                    onChange={(e) =>
                      setFormDirty((f) => ({
                        ...f,
                        trabajadorNameSnapshot: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snap-puesto" className="text-xs text-muted-foreground">
                    Position
                  </Label>
                  <Input
                    id="snap-puesto"
                    value={form.puestoSnapshot}
                    onChange={(e) =>
                      setFormDirty((f) => ({
                        ...f,
                        puestoSnapshot: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snap-supervisor" className="text-xs text-muted-foreground">
                    Supervisor
                  </Label>
                  <Input
                    id="snap-supervisor"
                    value={form.supervisorNameSnapshot}
                    onChange={(e) =>
                      setFormDirty((f) => ({
                        ...f,
                        supervisorNameSnapshot: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snap-date" className="text-xs text-muted-foreground">
                    Incident date (long form)
                  </Label>
                  <Input
                    id="snap-date"
                    value={form.incidentDateLongSnapshot}
                    onChange={(e) =>
                      setFormDirty((f) => ({
                        ...f,
                        incidentDateLongSnapshot: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="snap-horario" className="text-xs text-muted-foreground">
                  Schedule
                  <span className="ml-2 font-normal italic">
                    Ej: Lun-Mar-Mié-Jue 7:00 AM – 6:00 PM · Hora de Comida: 13:00
                  </span>
                </Label>
                <Textarea
                  id="snap-horario"
                  rows={2}
                  value={form.horarioSnapshot}
                  onChange={(e) =>
                    setFormDirty((f) => ({
                      ...f,
                      horarioSnapshot: e.target.value,
                    }))
                  }
                  placeholder="Ej: Lun-Vie 9:00 AM – 6:00 PM · Lunch hour: 1:00 PM – 2:00 PM"
                />
              </div>
            </section>

            <Separator />

            {/* ── Section: Empresa ──────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="snap-company" className="text-xs text-muted-foreground">
                    Legal name
                  </Label>
                  <Input
                    id="snap-company"
                    value={form.companyLegalNameSnapshot}
                    onChange={(e) =>
                      setFormDirty((f) => ({
                        ...f,
                        companyLegalNameSnapshot: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snap-address" className="text-xs text-muted-foreground">
                    Fiscal address
                  </Label>
                  <Textarea
                    id="snap-address"
                    rows={2}
                    value={form.companyLegalAddressSnapshot}
                    onChange={(e) =>
                      setFormDirty((f) => ({
                        ...f,
                        companyLegalAddressSnapshot: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Section: Narrativa formal ─────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Formal Narrative</span>
              </div>
              <Textarea
                id="narrative"
                rows={14}
                className="min-h-[200px] text-sm leading-relaxed"
                value={form.narrative}
                onChange={(e) =>
                  setFormDirty((f) => ({
                    ...f,
                    narrative: e.target.value,
                  }))
                }
                placeholder="Draft the formal version based on the TL narrative on the left."
              />
            </section>

            {/* ── KPI table editor (cartas only) ──────────────── */}
            {request.requestType === "carta" && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium uppercase tracking-wider">
                    Areas for Improvement (KPI)
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFormDirty((f) => ({
                        ...f,
                        kpiTable: [
                          ...f.kpiTable,
                          { area: "", indicador: "", meta: "" },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add row
                  </Button>
                </div>
                {form.kpiTable.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No KPI rows. Add one using the button above.
                  </p>
                )}
                {form.kpiTable.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end rounded-md border p-2"
                  >
                    <div className="space-y-1">
                      {idx === 0 && (
                        <Label className="text-[10px] text-muted-foreground">
                          Area
                        </Label>
                      )}
                      <Input
                        value={row.area}
                        placeholder="e.g. Attendance"
                        onChange={(e) =>
                          setFormDirty((f) => {
                            const t = [...f.kpiTable];
                            t[idx] = { ...t[idx], area: e.target.value };
                            return { ...f, kpiTable: t };
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      {idx === 0 && (
                        <Label className="text-[10px] text-muted-foreground">
                          Indicador / KPI
                        </Label>
                      )}
                      <Input
                        value={row.indicador}
                        placeholder="e.g. Punctuality"
                        onChange={(e) =>
                          setFormDirty((f) => {
                            const t = [...f.kpiTable];
                            t[idx] = {
                              ...t[idx],
                              indicador: e.target.value,
                            };
                            return { ...f, kpiTable: t };
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      {idx === 0 && (
                        <Label className="text-[10px] text-muted-foreground">
                          Meta
                        </Label>
                      )}
                      <Input
                        value={row.meta}
                        placeholder="e.g. 0 tardies"
                        onChange={(e) =>
                          setFormDirty((f) => {
                            const t = [...f.kpiTable];
                            t[idx] = { ...t[idx], meta: e.target.value };
                            return { ...f, kpiTable: t };
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setFormDirty((f) => ({
                          ...f,
                          kpiTable: f.kpiTable.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Reincidencia banner (actas only) ────────────── */}
            {request.requestType === "acta" && (
              <>
                {form.reincidenciaPriorCartaId && priorCarta && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800 flex-1">
                      <span className="font-medium">Repeat offense:</span> this
                      act cites the prior commitment letter{" "}
                      <span className="font-mono text-xs">
                        {priorCarta.doc_ref ?? "no ref"}
                      </span>{" "}
                      de {formatDateMX(priorCarta.created_at)}.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-amber-700"
                      onClick={() =>
                        setFormDirty((f) => ({
                          ...f,
                          reincidenciaPriorCartaId: null,
                        }))
                      }
                    >
                      <Unlink className="mr-1 h-3 w-3" /> Unlink
                    </Button>
                  </div>
                )}
                {!form.reincidenciaPriorCartaId &&
                  priorCarta === null && (
                    <p className="text-xs text-muted-foreground italic">
                      No prior signed commitment letter found for this employee.
                    </p>
                  )}

                {/* ── Witness editor (actas only) ──────────────── */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium uppercase tracking-wider">
                      Witnesses
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFormDirty((f) => ({
                          ...f,
                          witnesses: [
                            ...f.witnesses,
                            { name: "", role: "" },
                          ],
                        }))
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add witness
                    </Button>
                  </div>
                  {form.witnesses.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No witnesses. Add one using the button above.
                    </p>
                  )}
                  {form.witnesses.map((w, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end rounded-md border p-2"
                    >
                      <div className="space-y-1">
                        {idx === 0 && (
                          <Label className="text-[10px] text-muted-foreground">
                            Witness name
                          </Label>
                        )}
                        <Input
                          value={w.name}
                          placeholder="Full name"
                          onChange={(e) =>
                            setFormDirty((f) => {
                              const ws = [...f.witnesses];
                              ws[idx] = { ...ws[idx], name: e.target.value };
                              return { ...f, witnesses: ws };
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && (
                          <Label className="text-[10px] text-muted-foreground">
                            Role / Relation
                          </Label>
                        )}
                        <Input
                          value={w.role}
                          placeholder="e.g. Coworker"
                          onChange={(e) =>
                            setFormDirty((f) => {
                              const ws = [...f.witnesses];
                              ws[idx] = { ...ws[idx], role: e.target.value };
                              return { ...f, witnesses: ws };
                            })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          setFormDirty((f) => ({
                            ...f,
                            witnesses: f.witnesses.filter(
                              (_, i) => i !== idx,
                            ),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Renuncia-specific: finiquito calculator ─────── */}
            {request.requestType === "renuncia" && (
              <div className="space-y-4 pt-2 border-t">
                {/* Effective date */}
                <div className="space-y-1">
                  <Label htmlFor="effective-date" className="text-xs font-medium">
                    Effective resignation date
                  </Label>
                  <Input
                    id="effective-date"
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) =>
                      setFormDirty((f) => ({
                        ...f,
                        effectiveDate: e.target.value,
                      }))
                    }
                  />
                </div>

                {/* Finiquito calculator */}
                <div className="space-y-3 rounded-lg border p-3">
                  <SensitiveDataAckGate
                    active={ackGateActive}
                    context="finiquito_calculation"
                    acknowledgmentText={FINIQUITO_ACK_TEXT}
                    subjectEmployeeId={request.employeeId}
                    hrDocumentRequestId={request.id}
                    onAcknowledged={() => setFiniquitoAcked(true)}
                  >
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium uppercase tracking-wider">
                      Severance — LFT Calculation
                    </Label>
                    {canViewFiniquito && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const sd = parseFloat(form.salarioDiarioSnapshot);
                          const hd = form.hireDateSnapshot;
                          const rd = form.effectiveDate;
                          if (!sd || !hd || !rd) {
                            toast.error("Enter hire date, daily wage, and effective date first");
                            return;
                          }
                          const aguinaldo = calcAguinaldoProporcional({ salarioDiario: sd, hireDate: hd, resignationDate: rd });
                          const vac = calcVacaciones({ salarioDiario: sd, hireDate: hd, resignationDate: rd });
                          const prima = calcPrimaVacacional(vac.amount);
                          const devengados = parseFloat(form.salariosDevengadosMonto) || 0;
                          const total = calcFiniquitoTotal({ aguinaldo, vacaciones: vac.amount, prima, salariosDevengados: devengados });
                          setFormDirty((f) => ({
                            ...f,
                            aguinaldoMonto: String(aguinaldo),
                            vacacionesMonto: String(vac.amount),
                            primaVacacionalMonto: String(prima),
                            totalMonto: String(total),
                            totalEnLetras: numberToSpanishWords(total),
                          }));
                        }}
                      >
                        Auto-calculate
                      </Button>
                    )}
                  </div>

                  {!canViewFiniquito && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Salary information is hidden. Visible to Owner and HR only.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Hire date
                      </Label>
                      <Input
                        type="date"
                        value={form.hireDateSnapshot}
                        onChange={(e) =>
                          setFormDirty((f) => ({
                            ...f,
                            hireDateSnapshot: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Daily wage ($ MXN)
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.salarioDiarioSnapshot : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            salarioDiarioSnapshot: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Prorated Christmas bonus
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.aguinaldoMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            aguinaldoMonto: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Accrued vacation
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.vacacionesMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            vacacionesMonto: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Vacation premium (25%)
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.primaVacacionalMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            primaVacacionalMonto: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Salarios Devengados de Días
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.salariosDevengadosMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => {
                            // Live-update the Total as devengados changes, using
                            // the current aguinaldo / vacaciones / prima values.
                            const total = calcFiniquitoTotal({
                              aguinaldo: parseFloat(f.aguinaldoMonto) || 0,
                              vacaciones: parseFloat(f.vacacionesMonto) || 0,
                              prima: parseFloat(f.primaVacacionalMonto) || 0,
                              salariosDevengados: parseFloat(e.target.value) || 0,
                            });
                            return {
                              ...f,
                              salariosDevengadosMonto: e.target.value,
                              totalMonto: String(total),
                              totalEnLetras: numberToSpanishWords(total),
                            };
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground font-medium">
                        Total
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.totalMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            totalMonto: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Total in words
                    </Label>
                    <Textarea
                      rows={2}
                      value={canViewFiniquito ? form.totalEnLetras : MASKED}
                      readOnly={!canViewFiniquito}
                      className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                      onChange={(e) =>
                        canViewFiniquito &&
                        setFormDirty((f) => ({
                          ...f,
                          totalEnLetras: e.target.value,
                        }))
                      }
                    />
                  </div>
                  </SensitiveDataAckGate>
                </div>

                {/* Identity snapshots */}
                <div className="space-y-3 rounded-lg border p-3">
                  <Label className="text-xs font-medium uppercase tracking-wider">
                    Identity Data
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        CURP
                      </Label>
                      <Input
                        value={form.curpSnapshot}
                        readOnly
                        className="bg-muted/30"
                      />
                      {!form.curpSnapshot && (
                        <p className="text-[10px] text-amber-600">
                          — (missing)
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        RFC
                      </Label>
                      <Input
                        value={form.rfcSnapshot}
                        readOnly
                        className="bg-muted/30"
                      />
                      {!form.rfcSnapshot && (
                        <p className="text-[10px] text-amber-600">
                          — (missing)
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Voter ID Key
                      </Label>
                      <Input
                        value={form.claveElector}
                        onChange={(e) =>
                          setFormDirty((f) => ({
                            ...f,
                            claveElector: e.target.value,
                          }))
                        }
                        placeholder="Enter voter ID key"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Rescisión (Periodo de Prueba o Bajo Desempeño) ─── */}
            {(request.requestType === "rescision_prueba" ||
              request.requestType === "rescision_desempeno") && (
              <div className="space-y-4 pt-2 border-t">
                {/* Contract + termination dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="rp-hire-date" className="text-xs font-medium">
                      Hire date
                    </Label>
                    <Input
                      id="rp-hire-date"
                      type="date"
                      value={form.hireDateSnapshot}
                      onChange={(e) =>
                        setFormDirty((f) => ({
                          ...f,
                          hireDateSnapshot: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rp-contract-date" className="text-xs font-medium">
                      {request.requestType === "rescision_desempeno"
                        ? "Fin del periodo de capacitación inicial (continuación)"
                        : "Contract signing date"}
                    </Label>
                    <Input
                      id="rp-contract-date"
                      type="date"
                      value={form.contractSigningDate}
                      onChange={(e) =>
                        setFormDirty((f) => ({
                          ...f,
                          contractSigningDate: e.target.value,
                        }))
                      }
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {request.requestType === "rescision_desempeno"
                        ? "Fecha en que terminó la capacitación inicial y continuó el contrato. Por defecto ≈30 días tras el ingreso."
                        : "Defaults to hire date if blank."}
                    </p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="rp-termination-date" className="text-xs font-medium">
                      Termination effective date
                    </Label>
                    <Input
                      id="rp-termination-date"
                      type="date"
                      value={form.terminationEffectiveDate}
                      onChange={(e) =>
                        setFormDirty((f) => ({
                          ...f,
                          terminationEffectiveDate: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* KPI editor — 4 cols (kpi/required/recorded/met) */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium uppercase tracking-wider">
                      KPIs — Required vs Recorded
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFormDirty((f) => ({
                          ...f,
                          rescisionKpiTable: [
                            ...f.rescisionKpiTable,
                            { kpi: "", required: "", recorded: "", met: "", daysNotMet: "" },
                          ],
                        }))
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add row
                    </Button>
                  </div>
                  {form.rescisionKpiTable.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No KPI rows. Default rows are seeded on first save —
                      reload if you don't see them.
                    </p>
                  )}
                  {form.rescisionKpiTable.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-end rounded-md border p-2"
                    >
                      <div className="space-y-1">
                        {idx === 0 && (
                          <Label className="text-[10px] text-muted-foreground">
                            Métrica / KPI
                          </Label>
                        )}
                        <Input
                          value={row.kpi}
                          placeholder="e.g. Llamadas diarias"
                          onChange={(e) =>
                            setFormDirty((f) => {
                              const t = [...f.rescisionKpiTable];
                              t[idx] = { ...t[idx], kpi: e.target.value };
                              return { ...f, rescisionKpiTable: t };
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && (
                          <Label className="text-[10px] text-muted-foreground">
                            Requerido
                          </Label>
                        )}
                        <Input
                          value={row.required}
                          placeholder="e.g. 350"
                          onChange={(e) =>
                            setFormDirty((f) => {
                              const t = [...f.rescisionKpiTable];
                              t[idx] = { ...t[idx], required: e.target.value };
                              return { ...f, rescisionKpiTable: t };
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && (
                          <Label className="text-[10px] text-muted-foreground">
                            Registrado
                          </Label>
                        )}
                        <Input
                          value={row.recorded}
                          placeholder="actual"
                          onChange={(e) =>
                            setFormDirty((f) => {
                              const t = [...f.rescisionKpiTable];
                              t[idx] = { ...t[idx], recorded: e.target.value };
                              return { ...f, rescisionKpiTable: t };
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && (
                          <Label className="text-[10px] text-muted-foreground">
                            Cumplimiento
                          </Label>
                        )}
                        <select
                          value={row.met}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onChange={(e) =>
                            setFormDirty((f) => {
                              const t = [...f.rescisionKpiTable];
                              const met = e.target.value;
                              // Clear the days count when it no longer applies.
                              t[idx] = {
                                ...t[idx],
                                met,
                                daysNotMet: met === "No" ? t[idx].daysNotMet ?? "" : "",
                              };
                              return { ...f, rescisionKpiTable: t };
                            })
                          }
                        >
                          <option value="">—</option>
                          <option value="Sí">Sí</option>
                          <option value="No">No</option>
                          <option value="Parcial">Parcial</option>
                        </select>
                        {row.met === "No" && (
                          <Input
                            type="number"
                            min="0"
                            value={row.daysNotMet ?? ""}
                            placeholder="Días sin cumplir"
                            className="mt-1"
                            onChange={(e) =>
                              setFormDirty((f) => {
                                const t = [...f.rescisionKpiTable];
                                t[idx] = { ...t[idx], daysNotMet: e.target.value };
                                return { ...f, rescisionKpiTable: t };
                              })
                            }
                          />
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          setFormDirty((f) => ({
                            ...f,
                            rescisionKpiTable: f.rescisionKpiTable.filter(
                              (_, i) => i !== idx,
                            ),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Finiquito calculator — identical to renuncia */}
                <div className="space-y-3 rounded-lg border p-3">
                  <SensitiveDataAckGate
                    active={ackGateActive}
                    context="finiquito_calculation"
                    acknowledgmentText={FINIQUITO_ACK_TEXT}
                    subjectEmployeeId={request.employeeId}
                    hrDocumentRequestId={request.id}
                    onAcknowledged={() => setFiniquitoAcked(true)}
                  >
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium uppercase tracking-wider">
                      Severance — LFT Calculation
                    </Label>
                    {canViewFiniquito && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const sd = parseFloat(form.salarioDiarioSnapshot);
                          const hd = form.hireDateSnapshot;
                          const rd = form.terminationEffectiveDate;
                          if (!sd || !hd || !rd) {
                            toast.error("Enter hire date, daily wage, and termination date first");
                            return;
                          }
                          const aguinaldo = calcAguinaldoProporcional({ salarioDiario: sd, hireDate: hd, resignationDate: rd });
                          const vac = calcVacaciones({ salarioDiario: sd, hireDate: hd, resignationDate: rd });
                          const prima = calcPrimaVacacional(vac.amount);
                          const devengados = parseFloat(form.salariosDevengadosMonto) || 0;
                          const total = calcFiniquitoTotal({ aguinaldo, vacaciones: vac.amount, prima, salariosDevengados: devengados });
                          setFormDirty((f) => ({
                            ...f,
                            aguinaldoMonto: String(aguinaldo),
                            vacacionesMonto: String(vac.amount),
                            primaVacacionalMonto: String(prima),
                            totalMonto: String(total),
                            totalEnLetras: numberToSpanishWords(total),
                          }));
                        }}
                      >
                        Auto-calculate
                      </Button>
                    )}
                  </div>

                  {!canViewFiniquito && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Salary information is hidden. Visible to Owner and HR only.
                    </p>
                  )}

                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Daily wage ($ MXN)
                    </Label>
                    <Input
                      type={canViewFiniquito ? "number" : "text"}
                      step="0.01"
                      value={canViewFiniquito ? form.salarioDiarioSnapshot : MASKED}
                      readOnly={!canViewFiniquito}
                      className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                      onChange={(e) =>
                        canViewFiniquito &&
                        setFormDirty((f) => ({
                          ...f,
                          salarioDiarioSnapshot: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Prorated Christmas bonus
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.aguinaldoMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            aguinaldoMonto: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Accrued vacation
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.vacacionesMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            vacacionesMonto: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Vacation premium (25%)
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.primaVacacionalMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            primaVacacionalMonto: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Salarios Devengados de Días
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.salariosDevengadosMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => {
                            // Live-update the Total as devengados changes, using
                            // the current aguinaldo / vacaciones / prima values.
                            const total = calcFiniquitoTotal({
                              aguinaldo: parseFloat(f.aguinaldoMonto) || 0,
                              vacaciones: parseFloat(f.vacacionesMonto) || 0,
                              prima: parseFloat(f.primaVacacionalMonto) || 0,
                              salariosDevengados: parseFloat(e.target.value) || 0,
                            });
                            return {
                              ...f,
                              salariosDevengadosMonto: e.target.value,
                              totalMonto: String(total),
                              totalEnLetras: numberToSpanishWords(total),
                            };
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground font-medium">
                        Total
                      </Label>
                      <Input
                        type={canViewFiniquito ? "number" : "text"}
                        step="0.01"
                        value={canViewFiniquito ? form.totalMonto : MASKED}
                        readOnly={!canViewFiniquito}
                        className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                        onChange={(e) =>
                          canViewFiniquito &&
                          setFormDirty((f) => ({
                            ...f,
                            totalMonto: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Total in words
                    </Label>
                    <Textarea
                      rows={2}
                      value={canViewFiniquito ? form.totalEnLetras : MASKED}
                      readOnly={!canViewFiniquito}
                      className={!canViewFiniquito ? "bg-muted/30 tracking-widest" : undefined}
                      onChange={(e) =>
                        canViewFiniquito &&
                        setFormDirty((f) => ({
                          ...f,
                          totalEnLetras: e.target.value,
                        }))
                      }
                    />
                  </div>
                  </SensitiveDataAckGate>
                </div>
              </div>
            )}
        </section>
      </div>
    </div>
  );
}
