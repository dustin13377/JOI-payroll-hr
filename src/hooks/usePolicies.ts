import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE_BYTES, sanitizeFilename } from "@/lib/documentUpload";
import { useUserProfile } from "@/hooks/useUserProfile";

export interface PolicyDocument {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  is_global: boolean;
  scoped_campaign_ids: string[] | null;
  applicable_roles: string[] | null;
  created_at: string;
  updated_at: string;
  current_version?: PolicyDocumentVersion | null;
}

export interface PolicyDocumentVersion {
  id: string;
  policy_document_id: string;
  version_number: number;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string;
  published_at: string;
  change_notes: string | null;
  created_at: string;
  uploader?: { full_name: string; work_name?: string | null } | null;
}

export interface PolicyAckStatus {
  employeeId: string;
  employeeName: string;
  ackedVersionId: string | null;
  ackedAt: string | null;
  status: "acknowledged" | "outdated" | "not_acknowledged";
}

const POLICIES_KEY = "policies";
const VERSIONS_KEY = "policy-versions";

function validateFile(file: File) {
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
    throw new Error("Unsupported file type. Please upload PDF, JPG, or PNG.");
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error("File too large. Maximum size is 10 MB.");
  }
}

export function usePolicies() {
  return useQuery({
    queryKey: [POLICIES_KEY],
    queryFn: async () => {
      const { data: policies, error } = await supabase
        .from("policy_documents")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;

      // Fetch latest version for each policy
      const { data: versions, error: vErr } = await supabase
        .from("policy_document_versions")
        .select("*, uploader:uploaded_by(full_name, work_name)")
        .order("version_number", { ascending: false });
      if (vErr) throw vErr;

      const latestByPolicy = new Map<string, PolicyDocumentVersion>();
      for (const v of (versions || [])) {
        if (!latestByPolicy.has(v.policy_document_id)) {
          latestByPolicy.set(v.policy_document_id, v as PolicyDocumentVersion);
        }
      }

      return (policies || []).map((p) => ({
        ...p,
        current_version: latestByPolicy.get(p.id) ?? null,
      })) as PolicyDocument[];
    },
  });
}

export function usePolicyVersions(policyId: string | undefined | null) {
  return useQuery({
    queryKey: [VERSIONS_KEY, policyId],
    queryFn: async () => {
      if (!policyId) return [];
      const { data, error } = await supabase
        .from("policy_document_versions")
        .select("*, uploader:uploaded_by(full_name, work_name)")
        .eq("policy_document_id", policyId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data || []) as PolicyDocumentVersion[];
    },
    enabled: !!policyId,
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  // organization_id is NOT NULL on policy_documents — must be set explicitly
  // on every INSERT. Closes audit finding H-2 (2026-05-27).
  const { organizationId } = useUserProfile();
  return useMutation({
    mutationFn: async ({
      title,
      description,
      isGlobal,
      scopedCampaignIds,
      applicableRoles,
      file,
      changeNotes,
      uploadedBy,
    }: {
      title: string;
      description?: string;
      isGlobal: boolean;
      scopedCampaignIds?: string[];
      applicableRoles?: string[];
      file: File;
      changeNotes?: string;
      uploadedBy: string;
    }) => {
      validateFile(file);

      if (!organizationId) {
        throw new Error(
          "Cannot create policy: your user profile is missing organization_id. " +
          "Reload the page and try again — if it persists, contact an admin.",
        );
      }

      // Create policy document
      const { data: policy, error: pErr } = await supabase
        .from("policy_documents")
        .insert({
          title,
          description: description || null,
          is_global: isGlobal,
          scoped_campaign_ids: isGlobal ? null : (scopedCampaignIds || null),
          applicable_roles: applicableRoles?.length ? applicableRoles : null,
          organization_id: organizationId,
        })
        .select()
        .single();
      if (pErr) throw pErr;

      // Upload file + create v1; clean up policy row on failure
      const safeName = sanitizeFilename(file.name);
      const filePath = `${policy.id}/${Date.now()}-${safeName}`;
      try {
        const { error: uploadErr } = await supabase.storage
          .from("policy-documents")
          .upload(filePath, file, { upsert: false });
        if (uploadErr) throw uploadErr;

        const { error: vErr } = await supabase
          .from("policy_document_versions")
          .insert({
            policy_document_id: policy.id,
            version_number: 1,
            file_path: filePath,
            file_name: file.name,
            mime_type: file.type,
            file_size_bytes: file.size,
            uploaded_by: uploadedBy,
            change_notes: changeNotes || null,
          });
        if (vErr) throw vErr;
      } catch (err) {
        // Clean up orphan policy row + best-effort remove uploaded file
        await supabase.from("policy_documents").delete().eq("id", policy.id);
        await supabase.storage.from("policy-documents").remove([filePath]);
        throw err;
      }

      return policy as PolicyDocument;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [POLICIES_KEY] });
    },
  });
}

export function useUpdatePolicyMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Pick<PolicyDocument, "title" | "description" | "is_active" | "sort_order" | "is_global" | "scoped_campaign_ids" | "applicable_roles">>;
    }) => {
      const { error } = await supabase
        .from("policy_documents")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [POLICIES_KEY] });
    },
  });
}

export function usePublishNewVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      policyId,
      file,
      changeNotes,
      uploadedBy,
    }: {
      policyId: string;
      file: File;
      changeNotes?: string;
      uploadedBy: string;
    }) => {
      validateFile(file);

      const safeName = sanitizeFilename(file.name);
      const filePath = `${policyId}/${Date.now()}-${safeName}`;

      // Upload file first
      const { error: uploadErr } = await supabase.storage
        .from("policy-documents")
        .upload(filePath, file, { upsert: false });
      if (uploadErr) throw uploadErr;

      // Atomic version insert via RPC (server computes version_number)
      try {
        const { data, error } = await supabase.rpc("insert_policy_version", {
          p_policy_id: policyId,
          p_file_path: filePath,
          p_file_name: file.name,
          p_mime_type: file.type,
          p_file_size_bytes: file.size,
          p_uploaded_by: uploadedBy,
          p_change_notes: changeNotes || null,
        });
        if (error) throw error;
        return data as PolicyDocumentVersion;
      } catch (err) {
        // Clean up orphaned storage file on RPC failure
        await supabase.storage.from("policy-documents").remove([filePath]);
        throw err;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [POLICIES_KEY] });
      qc.invalidateQueries({ queryKey: [VERSIONS_KEY, vars.policyId] });
    },
  });
}

export function useAckStatusForPolicy(policyId: string | undefined | null, currentVersionId: string | undefined | null) {
  return useQuery({
    queryKey: ["policy-ack-status", policyId, currentVersionId],
    queryFn: async () => {
      if (!policyId || !currentVersionId) return [];

      // Get the policy to know its scope filters
      const { data: policy, error: pErr } = await supabase
        .from("policy_documents")
        .select("*")
        .eq("id", policyId)
        .single();
      if (pErr) throw pErr;

      // Get all applicable employees
      const empQuery = supabase
        .from("employees")
        .select("id, full_name, campaign_id, title")
        .eq("is_active", true);

      const { data: employees, error: eErr } = await empQuery;
      if (eErr) throw eErr;

      // Filter by policy scope
      let applicable = employees || [];
      if (!policy.is_global && policy.scoped_campaign_ids) {
        applicable = applicable.filter((e) => policy.scoped_campaign_ids.includes(e.campaign_id));
      }
      if (policy.applicable_roles) {
        applicable = applicable.filter((e) => policy.applicable_roles.includes(e.title));
      }

      // Get acks for current version
      const { data: acks, error: aErr } = await supabase
        .from("policy_acknowledgments")
        .select("employee_id, policy_document_version_id, acknowledged_at")
        .eq("policy_document_version_id", currentVersionId);
      if (aErr) throw aErr;

      // Get acks for older versions (to detect "outdated")
      const { data: allVersionAcks, error: avErr } = await supabase
        .from("policy_acknowledgments")
        .select("employee_id, policy_document_version_id, acknowledged_at")
        .in("employee_id", applicable.map((e) => e.id));
      if (avErr) throw avErr;

      const currentAckMap = new Map((acks || []).map((a) => [a.employee_id, a]));
      const anyAckMap = new Map((allVersionAcks || []).map((a) => [a.employee_id, a]));

      return applicable.map((emp): PolicyAckStatus => {
        const currentAck = currentAckMap.get(emp.id);
        if (currentAck) {
          return {
            employeeId: emp.id,
            employeeName: emp.full_name,
            ackedVersionId: currentAck.policy_document_version_id,
            ackedAt: currentAck.acknowledged_at,
            status: "acknowledged",
          };
        }
        const anyAck = anyAckMap.get(emp.id);
        if (anyAck) {
          return {
            employeeId: emp.id,
            employeeName: emp.full_name,
            ackedVersionId: anyAck.policy_document_version_id,
            ackedAt: anyAck.acknowledged_at,
            status: "outdated",
          };
        }
        return {
          employeeId: emp.id,
          employeeName: emp.full_name,
          ackedVersionId: null,
          ackedAt: null,
          status: "not_acknowledged",
        };
      });
    },
    enabled: !!policyId && !!currentVersionId,
  });
}

export async function getPolicyFileSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("policy-documents")
    .createSignedUrl(filePath, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

// ── C2: Agent-facing hooks ────────────────────────────────────────────

const MY_ACKS_KEY = "my-policy-acks";

export function useMyPolicyAcks() {
  return useQuery({
    queryKey: [MY_ACKS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policy_acknowledgments")
        .select("policy_document_version_id, acknowledged_at");
      if (error) throw error;
      return (data || []) as { policy_document_version_id: string; acknowledged_at: string }[];
    },
  });
}

export function useAcknowledgePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      versionId,
      employeeId,
    }: {
      versionId: string;
      employeeId: string;
    }) => {
      const { error } = await supabase
        .from("policy_acknowledgments")
        .upsert(
          {
            employee_id: employeeId,
            policy_document_version_id: versionId,
            acknowledged_at: new Date().toISOString(),
          },
          { onConflict: "employee_id,policy_document_version_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MY_ACKS_KEY] });
      qc.invalidateQueries({ queryKey: ["agent-policy-acks"] });
    },
  });
}

/**
 * Returns policies applicable to the current user (by their campaign + role).
 * Uses the same data as usePolicies() but filters client-side for the
 * personal view — ensures leadership on /policies only sees policies that
 * actually apply to them individually.
 */
export function useMyApplicablePolicies(employeeCampaignId: string | null, employeeRole: string | undefined) {
  const { data: allPolicies = [], isLoading } = usePolicies();

  const applicable = allPolicies.filter((p) => {
    if (!p.is_active) return false;
    // Campaign filter
    if (!p.is_global && p.scoped_campaign_ids) {
      if (!employeeCampaignId || !p.scoped_campaign_ids.includes(employeeCampaignId)) return false;
    }
    // Role filter
    if (p.applicable_roles && employeeRole) {
      if (!p.applicable_roles.includes(employeeRole)) return false;
    }
    return true;
  });

  return { data: applicable, isLoading };
}
