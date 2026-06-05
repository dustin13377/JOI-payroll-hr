// Uptraining (Constancia de Capacitación Continua) — data layer.
//
// Light-fill flow: TL/HR generate a pre-filled PDF (agent header + campaign KPI
// minimums), fill + sign it on paper, then upload the signed scan here. The
// agent can view their own signed copies. Files live in the `uptraining-docs`
// bucket under `{employeeId}/...`; RLS enforces leadership/TL/agent access.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateSpanishFull } from "@/lib/localDate";
import { COMPANY_LEGAL_NAME } from "@/lib/companyInfo";
import type { UptrainingSeed, UptrainingKpiRow } from "@/lib/pdf/generateUptrainingPdf";

export interface UptrainingDocument {
  id: string;
  employeeId: string;
  filePath: string;
  originalFilename: string | null;
  note: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

function rowToDoc(r: {
  id: string;
  employee_id: string;
  file_path: string;
  original_filename: string | null;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
}): UptrainingDocument {
  return {
    id: r.id,
    employeeId: r.employee_id,
    filePath: r.file_path,
    originalFilename: r.original_filename,
    note: r.note,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  };
}

/**
 * Gather the auto-fill data for the Constancia de Uptraining: full LEGAL agent
 * + supervisor names, position, campaign, hire date, and the campaign's KPI
 * minimums. Returns a seed ready for generateUptrainingPdf.
 */
export async function gatherUptrainingSeed(
  employeeId: string,
): Promise<UptrainingSeed> {
  // Employee + department + campaign (note the !campaign_id FK hint — the
  // employees↔campaigns relationship is bidirectional and PostgREST needs it).
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select(
      "full_name, hire_date, campaign_id, departments(name), campaigns!campaign_id(name, team_lead_id)",
    )
    .eq("id", employeeId)
    .single();
  if (empErr) throw empErr;

  const campaign = emp?.campaigns as { name?: string; team_lead_id?: string } | null;

  // Supervisor / TL full legal name
  let supervisorLegalName = "";
  if (campaign?.team_lead_id) {
    const { data: tl } = await supabase
      .from("employees")
      .select("full_name")
      .eq("id", campaign.team_lead_id)
      .single();
    if (tl?.full_name) supervisorLegalName = tl.full_name.toUpperCase();
  }

  // Campaign KPI minimums (only active fields that declare a minimum target).
  let kpiRows: UptrainingKpiRow[] = [];
  if (emp?.campaign_id) {
    const { data: kpis } = await supabase
      .from("campaign_kpi_config")
      .select("field_label, min_target, is_active, display_order")
      .eq("campaign_id", emp.campaign_id)
      .eq("is_active", true)
      .not("min_target", "is", null)
      .order("display_order", { ascending: true });
    if (kpis) {
      kpiRows = kpis.map((k) => ({
        label: k.field_label,
        min: k.min_target != null ? String(k.min_target) : "",
      }));
    }
  }

  return {
    agentLegalName: (emp?.full_name ?? "").toUpperCase(),
    puesto: (emp?.departments as { name?: string } | null)?.name ?? "",
    campaign: campaign?.name ?? "",
    hireDateLong: emp?.hire_date ? formatDateSpanishFull(emp.hire_date) : "",
    supervisorLegalName,
    companyLegalName: COMPANY_LEGAL_NAME,
    elaboracionDateLong: formatDateSpanishFull(new Date().toISOString().slice(0, 10)),
    kpiRows,
  };
}

/** List uploaded uptraining docs for an employee (leadership/TL view). */
export function useUptrainingDocumentsForEmployee(employeeId: string | null) {
  return useQuery({
    queryKey: ["uptraining-docs", employeeId],
    queryFn: async () => {
      if (!employeeId) return [] as UptrainingDocument[];
      const { data, error } = await supabase
        .from("uptraining_documents")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToDoc);
    },
    enabled: !!employeeId,
  });
}

/** Agent self-view — RLS restricts to their own rows. */
export const useMyUptrainingDocuments = useUptrainingDocumentsForEmployee;

/** Upload a signed/filled scan and record it. */
export function useUploadUptrainingDocument() {
  const qc = useQueryClient();
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

  return useMutation({
    mutationFn: async ({
      employeeId,
      uploadedBy,
      file,
      note,
    }: {
      employeeId: string;
      uploadedBy: string;
      file: File;
      note?: string;
    }) => {
      if (file.type !== "application/pdf") {
        throw new Error("El archivo debe ser PDF.");
      }
      if (file.size > MAX_SIZE) {
        throw new Error("El archivo debe pesar menos de 10MB.");
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${employeeId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("uptraining-docs")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase
        .from("uptraining_documents")
        .insert({
          employee_id: employeeId,
          file_path: path,
          original_filename: file.name,
          uploaded_by: uploadedBy,
          note: note?.trim() || null,
        });
      if (insErr) {
        // Best-effort cleanup so we don't orphan the file on a failed insert.
        await supabase.storage.from("uptraining-docs").remove([path]);
        throw insErr;
      }

      return { path };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["uptraining-docs", vars.employeeId] });
    },
  });
}

/** Open a stored uptraining doc in a new tab via a short-lived signed URL. */
export async function openUptrainingDoc(filePath: string): Promise<void> {
  const { data, error } = await supabase.storage
    .from("uptraining-docs")
    .createSignedUrl(filePath, 3600);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}
