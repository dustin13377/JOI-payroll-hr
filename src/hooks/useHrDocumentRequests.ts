import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edge";
import type {
  HrDocumentRequest,
  HrDocumentRequestType,
  HrDocumentRequestStatus,
  CartaKpiRow,
  ActaWitness,
  RescisionKpiRow,
} from "@/types/hr-docs";

const QUERY_KEY = "hr_document_requests";

export interface HrDocumentRequestRow {
  id: string;
  employee_id: string;
  request_type: string;
  status: string;
  filed_by: string;
  filed_at: string;
  incident_date: string;
  tl_narrative: string;
  reason: string | null;
  fulfilled_carta_id: string | null;
  fulfilled_acta_id: string | null;
  fulfilled_renuncia_id: string | null;
  fulfilled_rescision_id: string | null;
  fulfilled_rescision_desempeno_id: string | null;
  canceled_reason: string | null;
  created_at: string;
  updated_at: string;
  filer?: { full_name: string; work_name: string | null } | null;
}

function mapRow(row: HrDocumentRequestRow): HrDocumentRequest & {
  filerName: string | null;
} {
  return {
    id: row.id,
    employeeId: row.employee_id,
    requestType: row.request_type as HrDocumentRequestType,
    status: row.status as HrDocumentRequest["status"],
    filedBy: row.filed_by,
    filedAt: row.filed_at,
    incidentDate: row.incident_date,
    tlNarrative: row.tl_narrative,
    reason: row.reason,
    fulfilledCartaId: row.fulfilled_carta_id,
    fulfilledActaId: row.fulfilled_acta_id,
    fulfilledRenunciaId: row.fulfilled_renuncia_id,
    fulfilledRescisionId: row.fulfilled_rescision_id,
    fulfilledRescisionDesempenoId: row.fulfilled_rescision_desempeno_id,
    canceledReason: row.canceled_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    filerName: row.filer
      ? (row.filer.work_name?.trim() || row.filer.full_name)
      : null,
  };
}

export type HrDocumentRequestMapped = ReturnType<typeof mapRow>;

/**
 * All hr_document_requests for a given employee, ordered by filed_at DESC.
 * RLS gates access: leadership sees all, TL sees own team, agents see nothing.
 */
export function useHrDocumentRequestsForEmployee(
  employeeId: string | undefined,
) {
  return useQuery({
    queryKey: [QUERY_KEY, "by_employee", employeeId],
    queryFn: async (): Promise<HrDocumentRequestMapped[]> => {
      const { data, error } = await supabase
        .from("hr_document_requests")
        .select("*, filer:filed_by(full_name, work_name)")
        .eq("employee_id", employeeId!)
        .order("filed_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((r) => mapRow(r as unknown as HrDocumentRequestRow));
    },
    enabled: !!employeeId,
  });
}

/**
 * Insert a new hr_document_request with status='pending'.
 * filed_by is set by the caller (must equal my_employee_id() per RLS).
 */
export function useCreateHrDocumentRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      employeeId,
      requestType,
      incidentDate,
      tlNarrative,
      reason,
      filedBy,
    }: {
      employeeId: string;
      requestType: HrDocumentRequestType;
      incidentDate: string;
      tlNarrative: string;
      reason: string | null;
      filedBy: string;
    }) => {
      const { data, error } = await supabase
        .from("hr_document_requests")
        .insert({
          employee_id: employeeId,
          request_type: requestType,
          filed_by: filedBy,
          incident_date: incidentDate,
          tl_narrative: tlNarrative,
          reason: reason || null,
        })
        .select("*, filer:filed_by(full_name, work_name)")
        .single();

      if (error) throw error;
      return mapRow(data as unknown as HrDocumentRequestRow);
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({
        queryKey: [QUERY_KEY, "by_employee", vars.employeeId],
      });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "queue"] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "pending_count"] });

      // Fire-and-forget: notify leadership via email
      supabase.functions
        .invoke("notify-hr-request-filed", { body: { requestId: data.id } })
        .then(({ error }) => {
          if (error) console.warn("HR notification email failed:", error);
        })
        .catch((err) => console.warn("HR notification email error:", err));
    },
  });
}

// ── Phase 3: Queue hooks ─────────────────────────────────────────────

export interface HrDocumentRequestQueueRow extends HrDocumentRequestRow {
  employee?: {
    full_name: string;
    work_name: string | null;
    campaign_id: string | null;
    campaigns: { name: string } | null;
  } | null;
}

export type HrDocumentRequestQueueItem = HrDocumentRequestMapped & {
  employeeName: string | null;
  campaignName: string | null;
};

function mapQueueRow(row: HrDocumentRequestQueueRow): HrDocumentRequestQueueItem {
  const base = mapRow(row);
  return {
    ...base,
    employeeName: row.employee
      ? (row.employee.work_name?.trim() || row.employee.full_name)
      : null,
    campaignName: row.employee?.campaigns?.name ?? null,
  };
}

/**
 * HR queue: all requests visible to the caller, optionally filtered by status.
 * Default filter: 'pending'. Pass 'all' to see everything.
 */
export function useHrDocumentRequestsQueue(
  options?: { status?: HrDocumentRequestStatus | "all" },
) {
  const status = options?.status ?? "pending";
  return useQuery({
    queryKey: [QUERY_KEY, "queue", status],
    queryFn: async (): Promise<HrDocumentRequestQueueItem[]> => {
      let query = supabase
        .from("hr_document_requests")
        .select(
          "*, filer:employees!filed_by(full_name, work_name), employee:employees!employee_id(full_name, work_name, campaign_id, campaigns!campaign_id(name))",
        )
        .order("filed_at", { ascending: false });

      if (status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((r) =>
        mapQueueRow(r as unknown as HrDocumentRequestQueueRow),
      );
    },
  });
}

/**
 * Single request by ID with employee + filer joins.
 */
export function useHrDocumentRequest(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, "detail", id],
    queryFn: async (): Promise<HrDocumentRequestQueueItem> => {
      const { data, error } = await supabase
        .from("hr_document_requests")
        .select(
          "*, filer:employees!filed_by(full_name, work_name), employee:employees!employee_id(full_name, work_name, campaign_id, campaigns!campaign_id(name))",
        )
        .eq("id", id!)
        .single();

      if (error) throw error;
      return mapQueueRow(data as unknown as HrDocumentRequestQueueRow);
    },
    enabled: !!id,
  });
}

/**
 * Update request status. Supports: pending→in_progress, pending/in_progress→canceled/downgraded.
 * Does NOT support →fulfilled (requires Phase 4 finalization row) or →pending.
 */
export function useUpdateHrDocumentRequestStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      employeeId,
      status,
      canceledReason,
    }: {
      id: string;
      employeeId: string;
      status: "in_progress" | "canceled" | "downgraded";
      canceledReason?: string;
    }) => {
      const { error } = await supabase
        .from("hr_document_requests")
        .update({
          status,
          canceled_reason:
            status === "canceled" || status === "downgraded"
              ? (canceledReason ?? null)
              : null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "queue"] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "pending_count"] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "detail", vars.id] });
      qc.invalidateQueries({
        queryKey: [QUERY_KEY, "by_employee", vars.employeeId],
      });
    },
  });
}

/**
 * Count of hr_document_requests with unfinished work — status IN ('pending', 'in_progress').
 *
 * Used by the sidebar badge. We deliberately include in_progress because that
 * means HR opened a draft but hasn't uploaded the signed scan yet — still work
 * waiting to be finished. Only counting 'pending' was the previous behavior and
 * caused the badge to zero out the moment someone clicked "Start drafting",
 * making it feel broken.
 *
 * Terminal states (fulfilled / canceled / downgraded) are excluded.
 *
 * RLS only grants SELECT to leadership + TL, so we gate the query at the hook
 * level: agents never run it. (Earlier versions polled this for everyone and
 * produced noisy console errors on agent sessions — see PR #53 / #60 in git
 * history.)
 *
 * Polls every 30s for near-realtime freshness. Mutations on hr_document_requests
 * (and on the finalization tables via useUploadSignedScan) invalidate this key
 * so the badge updates immediately on user action.
 */
export function usePendingHrDocumentRequestsCount(enabled: boolean) {
  return useQuery({
    queryKey: [QUERY_KEY, "pending_count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("hr_document_requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
      return count ?? 0;
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 0,
  });
}

// ── Phase 4a: Finalization (draft) hooks ────────────────────────────

const FINALIZATION_KEY = "hr_finalization";

export interface FinalizationDraft {
  id: string;
  employeeId: string;
  requestId: string | null;
  docRef: string | null;
  incidentDate: string;
  narrative: string | null;
  trabajadorNameSnapshot: string | null;
  puestoSnapshot: string | null;
  horarioSnapshot: string | null;
  supervisorNameSnapshot: string | null;
  companyLegalNameSnapshot: string | null;
  companyLegalAddressSnapshot: string | null;
  incidentDateLongSnapshot: string | null;
  pdfPath: string | null;
  signedAt: string | null;
  signedScanPath: string | null;
  createdAt: string;
  updatedAt: string;
  type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno";
  // Carta-specific
  kpiTable: CartaKpiRow[];
  // Acta-specific
  witnesses: ActaWitness[];
  reincidenciaPriorCartaId: string | null;
  // Renuncia-specific (also reused by rescision_prueba for finiquito)
  effectiveDate: string | null;
  renunciaNarrative: string | null;
  hireDateSnapshot: string | null;
  salarioDiarioSnapshot: number | null;
  aguinaldoMonto: number | null;
  vacacionesMonto: number | null;
  primaVacacionalMonto: number | null;
  salariosDevengadosMonto: number | null;
  totalMonto: number | null;
  totalEnLetras: string | null;
  curpSnapshot: string | null;
  rfcSnapshot: string | null;
  claveElector: string | null;
  // Rescision_prueba-specific
  rescisionKpiTable: RescisionKpiRow[];
  contractSigningDate: string | null;
  terminationEffectiveDate: string | null;
}

function mapFinalizationRow(
  row: Record<string, unknown>,
  type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno",
): FinalizationDraft {
  // rescision_prueba doesn't have an incident_date col — falls back to termination_effective_date
  // so the existing UI cards (incident date) keep working.
  const incidentDate =
    (row.incident_date as string) ??
    (row.termination_effective_date as string) ??
    "";
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    requestId: (row.request_id as string) ?? null,
    docRef: (row.doc_ref as string) ?? null,
    incidentDate,
    narrative: (row.narrative as string) ?? null,
    trabajadorNameSnapshot: (row.trabajador_name_snapshot as string) ?? null,
    puestoSnapshot: (row.puesto_snapshot as string) ?? null,
    horarioSnapshot: (row.horario_snapshot as string) ?? null,
    supervisorNameSnapshot: (row.supervisor_name_snapshot as string) ?? null,
    companyLegalNameSnapshot:
      (row.company_legal_name_snapshot as string) ?? null,
    companyLegalAddressSnapshot:
      (row.company_legal_address_snapshot as string) ?? null,
    incidentDateLongSnapshot:
      (row.incident_date_long_snapshot as string) ?? null,
    pdfPath: (row.pdf_path as string) ?? null,
    signedAt: (row.signed_at as string) ?? null,
    signedScanPath: (row.signed_scan_path as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    type,
    kpiTable: (row.kpi_table as CartaKpiRow[]) ?? [],
    witnesses: (row.witnesses as ActaWitness[]) ?? [],
    reincidenciaPriorCartaId:
      (row.reincidencia_prior_carta_id as string) ?? null,
    // Renuncia-specific
    effectiveDate: (row.effective_date as string) ?? null,
    renunciaNarrative: (row.narrative as string) ?? null,
    hireDateSnapshot: (row.hire_date_snapshot as string) ?? null,
    salarioDiarioSnapshot: (row.salario_diario_snapshot as number) ?? null,
    aguinaldoMonto: (row.aguinaldo_monto as number) ?? null,
    vacacionesMonto: (row.vacaciones_monto as number) ?? null,
    primaVacacionalMonto: (row.prima_vacacional_monto as number) ?? null,
    salariosDevengadosMonto: (row.salarios_devengados_monto as number) ?? null,
    totalMonto: (row.total_monto as number) ?? null,
    totalEnLetras: (row.total_en_letras as string) ?? null,
    curpSnapshot: (row.curp_snapshot as string) ?? null,
    rfcSnapshot: (row.rfc_snapshot as string) ?? null,
    claveElector: (row.clave_elector as string) ?? null,
    // Rescision_prueba-specific
    rescisionKpiTable: type === "rescision_prueba" || type === "rescision_desempeno"
      ? ((row.kpi_table as RescisionKpiRow[]) ?? [])
      : [],
    contractSigningDate: (row.contract_signing_date as string) ?? null,
    terminationEffectiveDate:
      (row.termination_effective_date as string) ?? null,
  };
}

/**
 * Fetch the linked carta/acta draft for a request (if any).
 */
export function useHrFinalization(
  requestId: string | undefined,
  requestType: HrDocumentRequestType | undefined,
) {
  return useQuery({
    queryKey: [FINALIZATION_KEY, requestId],
    queryFn: async (): Promise<FinalizationDraft | null> => {
      const table =
        requestType === "rescision_desempeno"
          ? "rescision_desempeno_documents"
          : requestType === "rescision_prueba"
            ? "rescision_prueba_documents"
            : requestType === "renuncia"
              ? "resignation_packets"
              : requestType === "acta"
                ? "actas_administrativas"
                : "cartas_compromiso";

      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("request_id", requestId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapFinalizationRow(
        data as Record<string, unknown>,
        requestType!,
      );
    },
    enabled: !!requestId && !!requestType,
  });
}

/**
 * Call the hr_create_finalization_draft RPC to atomically create
 * the carta/acta row and link it to the request.
 */
export function useCreateHrFinalizationDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      createdBy,
    }: {
      requestId: string;
      createdBy: string;
      employeeId: string; // for cache invalidation
    }) => {
      const { data, error } = await supabase.rpc(
        "hr_create_finalization_draft",
        { p_request_id: requestId, p_created_by: createdBy },
      );
      if (error) throw error;
      return data as { id: string; type: string; doc_ref: string };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [FINALIZATION_KEY, vars.requestId] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "detail", vars.requestId] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "queue"] });
      qc.invalidateQueries({
        queryKey: [QUERY_KEY, "by_employee", vars.employeeId],
      });
    },
  });
}

export interface DraftUpdateFields {
  narrative?: string | null;
  trabajador_name_snapshot?: string | null;
  puesto_snapshot?: string | null;
  horario_snapshot?: string | null;
  supervisor_name_snapshot?: string | null;
  company_legal_name_snapshot?: string | null;
  company_legal_address_snapshot?: string | null;
  incident_date_long_snapshot?: string | null;
  kpi_table?: CartaKpiRow[] | RescisionKpiRow[];
  witnesses?: ActaWitness[];
  reincidencia_prior_carta_id?: string | null;
  // Renuncia + rescision_prueba shared (finiquito)
  effective_date?: string | null;
  hire_date_snapshot?: string | null;
  salario_diario_snapshot?: number | null;
  aguinaldo_monto?: number | null;
  vacaciones_monto?: number | null;
  prima_vacacional_monto?: number | null;
  salarios_devengados_monto?: number | null;
  total_monto?: number | null;
  total_en_letras?: string | null;
  curp_snapshot?: string | null;
  rfc_snapshot?: string | null;
  clave_elector?: string | null;
  // Rescision_prueba-specific
  contract_signing_date?: string | null;
  termination_effective_date?: string | null;
}

/**
 * Save draft fields to the carta/acta row.
 */
export function useSaveFinalizationDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      draftId,
      type,
      fields,
    }: {
      draftId: string;
      type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno";
      fields: DraftUpdateFields;
      requestId: string; // for cache invalidation
    }) => {
      const table =
        type === "rescision_desempeno"
          ? "rescision_desempeno_documents"
          : type === "rescision_prueba"
            ? "rescision_prueba_documents"
            : type === "renuncia"
              ? "resignation_packets"
              : type === "acta"
                ? "actas_administrativas"
                : "cartas_compromiso";

      // Cast: union of 4 finalization tables makes Supabase's typed update
      // unhappy — the column shapes differ across tables. We trust the caller
      // to send only fields that exist on the chosen table.
      const { error } = await supabase
        .from(table)
        .update(fields as never)
        .eq("id", draftId);

      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: [FINALIZATION_KEY, vars.requestId],
      });
    },
  });
}

/**
 * Find the most recent signed carta for an employee (for reincidencia auto-cite).
 * Returns null if no prior signed carta exists.
 */
export function usePriorSignedCartaForEmployee(
  employeeId: string | undefined,
) {
  return useQuery({
    queryKey: ["prior_signed_carta", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cartas_compromiso")
        .select("id, doc_ref, created_at, signed_at")
        .eq("employee_id", employeeId!)
        .not("signed_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as {
        id: string;
        doc_ref: string | null;
        created_at: string;
        signed_at: string;
      } | null;
    },
    enabled: !!employeeId,
  });
}

/**
 * Fetch a single carta by ID (for reincidencia display on PDF).
 */
export function useCartaById(id: string | null | undefined) {
  return useQuery({
    queryKey: ["carta_by_id", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cartas_compromiso")
        .select("id, doc_ref, created_at")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as { id: string; doc_ref: string | null; created_at: string };
    },
    enabled: !!id,
  });
}

/**
 * Upload a finalized PDF to hr-documents bucket and save pdf_path.
 */
export function useUploadFinalizedPdf() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      draftId,
      type,
      employeeId,
      docRef,
      pdfBlob,
    }: {
      draftId: string;
      type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno";
      employeeId: string;
      docRef: string;
      pdfBlob: Blob;
      requestId: string;
    }) => {
      // doc_ref prefixes: CC (carta), RN (renuncia), RP (rescision_prueba); acta has no prefix
      const hasPrefix =
        docRef.startsWith("CC") ||
        docRef.startsWith("RN") ||
        docRef.startsWith("RP") ||
        docRef.startsWith("RD");
      const year = hasPrefix ? docRef.slice(2, 6) : docRef.slice(0, 4);
      const folder =
        type === "carta"
          ? "cartas"
          : type === "renuncia"
            ? "renuncias"
            : type === "rescision_prueba" || type === "rescision_desempeno"
              ? "rescisiones"
              : "actas";
      const path = `${folder}/${year}/${employeeId}/${docRef}.pdf`;

      const { error: upErr } = await supabase.storage
        .from("hr-documents")
        .upload(path, pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) throw upErr;

      const table =
        type === "rescision_desempeno"
          ? "rescision_desempeno_documents"
          : type === "rescision_prueba"
            ? "rescision_prueba_documents"
            : type === "renuncia"
              ? "resignation_packets"
              : type === "acta"
                ? "actas_administrativas"
                : "cartas_compromiso";
      const { error: dbErr } = await supabase
        .from(table)
        .update({ pdf_path: path })
        .eq("id", draftId);
      if (dbErr) throw dbErr;

      return path;
    },
    onSuccess: (_path, vars) => {
      qc.invalidateQueries({ queryKey: [FINALIZATION_KEY, vars.requestId] });
      qc.invalidateQueries({
        queryKey: [QUERY_KEY, "detail", vars.requestId],
      });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "queue"] });
      qc.invalidateQueries({
        queryKey: [QUERY_KEY, "by_employee", vars.employeeId],
      });
    },
  });
}

// ── Phase 5b: Signed-scan upload ────────────────────────────────────

/**
 * Upload a signed scan PDF and atomically mark the finalization as signed
 * + transition the parent request to 'fulfilled'.
 */
export function useUploadSignedScan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      draftId,
      type,
      employeeId,
      docRef,
      scanBlob,
    }: {
      draftId: string;
      type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno";
      employeeId: string;
      docRef: string;
      scanBlob: Blob;
      requestId: string;
    }) => {
      const hasPrefix =
        docRef.startsWith("CC") ||
        docRef.startsWith("RN") ||
        docRef.startsWith("RP") ||
        docRef.startsWith("RD");
      const year = hasPrefix ? docRef.slice(2, 6) : docRef.slice(0, 4);
      const folder =
        type === "carta"
          ? "cartas"
          : type === "renuncia"
            ? "renuncias"
            : type === "rescision_prueba" || type === "rescision_desempeno"
              ? "rescisiones"
              : "actas";
      const path = `${folder}/${year}/${employeeId}/${docRef}.signed.pdf`;

      const { error: upErr } = await supabase.storage
        .from("hr-documents")
        .upload(path, scanBlob, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) throw upErr;

      const { error: rpcErr } = await supabase.rpc(
        "hr_mark_finalization_signed",
        {
          p_finalization_id: draftId,
          p_type: type,
          p_signed_scan_path: path,
        },
      );
      if (rpcErr) throw rpcErr;

      return path;
    },
    onSuccess: (_path, vars) => {
      qc.invalidateQueries({ queryKey: [FINALIZATION_KEY, vars.requestId] });
      qc.invalidateQueries({
        queryKey: [QUERY_KEY, "detail", vars.requestId],
      });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "queue"] });
      qc.invalidateQueries({
        queryKey: [QUERY_KEY, "by_employee", vars.employeeId],
      });
      // Signed-scan upload transitions the parent request from in_progress
      // → fulfilled, which drops it out of the sidebar badge count.
      qc.invalidateQueries({ queryKey: [QUERY_KEY, "pending_count"] });
    },
  });
}

// ── Phase 5c: Signed-URL via edge function + agent query ────────────

/**
 * Issue a signed URL for a carta/acta file via the edge function.
 * Works for all roles — the edge function uses the caller's JWT to
 * verify table-level RLS access, then issues via service_role.
 */
export async function issueHrDocumentSignedUrl(
  finalizationId: string,
  type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno",
  fileType: "pdf" | "signed_scan",
): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    "get-hr-document-signed-url",
    { body: { finalizationId, type, fileType } },
  );
  if (error) throw new Error(await edgeErrorMessage(error));
  if (!data?.signedUrl) throw new Error("No signed URL returned");
  return data.signedUrl as string;
}

export interface SignedHrDocument {
  id: string;
  type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno";
  docRef: string | null;
  incidentDate: string;
  signedAt: string;
  pdfPath: string | null;
  signedScanPath: string | null;
}

/**
 * Fetch all signed cartas + actas for the current agent.
 * RLS on both tables ensures agents only see their own signed docs.
 */
export function useMySignedHrDocuments(employeeId: string | null) {
  return useQuery({
    queryKey: ["my_signed_hr_documents", employeeId],
    queryFn: async (): Promise<SignedHrDocument[]> => {
      const [cartasRes, actasRes, renunciasRes, rescisionesRes, rescisionesDesempenoRes] = await Promise.all([
        supabase
          .from("cartas_compromiso")
          .select("id, doc_ref, incident_date, signed_at, pdf_path, signed_scan_path")
          .eq("employee_id", employeeId!)
          .not("signed_at", "is", null)
          .order("signed_at", { ascending: false }),
        supabase
          .from("actas_administrativas")
          .select("id, doc_ref, incident_date, signed_at, pdf_path, signed_scan_path")
          .eq("employee_id", employeeId!)
          .not("signed_at", "is", null)
          .order("signed_at", { ascending: false }),
        supabase
          .from("resignation_packets")
          .select("id, doc_ref, effective_date, signed_at, pdf_path, signed_scan_path")
          .eq("employee_id", employeeId!)
          .not("signed_at", "is", null)
          .order("signed_at", { ascending: false }),
        supabase
          .from("rescision_prueba_documents")
          .select("id, doc_ref, termination_effective_date, signed_at, pdf_path, signed_scan_path")
          .eq("employee_id", employeeId!)
          .not("signed_at", "is", null)
          .order("signed_at", { ascending: false }),
        supabase
          .from("rescision_desempeno_documents")
          .select("id, doc_ref, termination_effective_date, signed_at, pdf_path, signed_scan_path")
          .eq("employee_id", employeeId!)
          .not("signed_at", "is", null)
          .order("signed_at", { ascending: false }),
      ]);

      if (cartasRes.error) throw cartasRes.error;
      if (actasRes.error) throw actasRes.error;
      if (renunciasRes.error) throw renunciasRes.error;
      if (rescisionesRes.error) throw rescisionesRes.error;
      if (rescisionesDesempenoRes.error) throw rescisionesDesempenoRes.error;

      const cartas: SignedHrDocument[] = (cartasRes.data ?? []).map((r) => ({
        id: r.id,
        type: "carta" as const,
        docRef: r.doc_ref,
        incidentDate: r.incident_date,
        signedAt: r.signed_at!,
        pdfPath: r.pdf_path,
        signedScanPath: r.signed_scan_path,
      }));

      const actas: SignedHrDocument[] = (actasRes.data ?? []).map((r) => ({
        id: r.id,
        type: "acta" as const,
        docRef: r.doc_ref,
        incidentDate: r.incident_date,
        signedAt: r.signed_at!,
        pdfPath: r.pdf_path,
        signedScanPath: r.signed_scan_path,
      }));

      const renuncias: SignedHrDocument[] = (renunciasRes.data ?? []).map((r) => ({
        id: r.id,
        type: "renuncia" as const,
        docRef: r.doc_ref,
        incidentDate: r.effective_date,
        signedAt: r.signed_at!,
        pdfPath: r.pdf_path,
        signedScanPath: r.signed_scan_path,
      }));

      const rescisiones: SignedHrDocument[] = (rescisionesRes.data ?? []).map((r) => ({
        id: r.id,
        type: "rescision_prueba" as const,
        docRef: r.doc_ref,
        incidentDate: r.termination_effective_date,
        signedAt: r.signed_at!,
        pdfPath: r.pdf_path,
        signedScanPath: r.signed_scan_path,
      }));

      const rescisionesDesempeno: SignedHrDocument[] = (rescisionesDesempenoRes.data ?? []).map((r) => ({
        id: r.id,
        type: "rescision_desempeno" as const,
        docRef: r.doc_ref,
        incidentDate: r.termination_effective_date,
        signedAt: r.signed_at!,
        pdfPath: r.pdf_path,
        signedScanPath: r.signed_scan_path,
      }));

      return [...cartas, ...actas, ...renuncias, ...rescisiones, ...rescisionesDesempeno].sort(
        (a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime(),
      );
    },
    enabled: !!employeeId,
  });
}
