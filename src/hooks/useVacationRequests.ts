import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getDisplayName } from "@/lib/displayName";

export interface VacationRequest {
  id: string;
  employee_id: string;
  campaign_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: "pending_tl" | "pending_hr" | "approved" | "denied" | "cancelled";
  notes: string | null;
  tl_reviewed_by: string | null;
  tl_reviewed_at: string | null;
  hr_reviewed_by: string | null;
  hr_reviewed_at: string | null;
  denial_reason: string | null;
  created_at: string;
  // Phase A additions — type of time off + paid/unpaid (LFT: paid only for vacation)
  request_type: "vacation" | "sick" | "personal" | "other";
  is_paid: boolean;
}

export interface VacationBalance {
  entitlement_days: number;
  used_days: number;
  available_days: number;
  years_of_service: number;
  next_entitlement_date: string | null;
}

export function useVacationBalance(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ["vacationBalance", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<VacationBalance | null> => {
      const { data, error } = await supabase.rpc("get_vacation_balance", {
        p_employee_id: employeeId!,
      });
      if (error) throw error;
      if (!data || (data as VacationBalance[]).length === 0) return null;
      return (data as VacationBalance[])[0];
    },
  });
}

export function useMyVacationRequests(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ["vacationRequests", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<VacationRequest[]> => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VacationRequest[];
    },
  });
}

export type TimeOffRequestType = "vacation" | "sick" | "personal" | "other";

interface RequestVacationOffVars {
  employeeId: string;
  campaignId: string;
  startDate: string;
  endDate: string;
  notes?: string;
  /** Defaults to 'vacation' for backward compat with old call sites. */
  requestType?: TimeOffRequestType;
}

export function useRequestVacationOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: RequestVacationOffVars): Promise<VacationRequest> => {
      const { data, error } = await supabase.rpc("request_vacation_off", {
        p_employee_id: vars.employeeId,
        p_campaign_id: vars.campaignId,
        p_start_date: vars.startDate,
        p_end_date: vars.endDate,
        p_notes: vars.notes ?? null,
        p_request_type: vars.requestType ?? "vacation",
      });
      if (error) throw error;
      return data as VacationRequest;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["vacationRequests", vars.employeeId] });
      queryClient.invalidateQueries({ queryKey: ["vacationBalance", vars.employeeId] });
      queryClient.invalidateQueries({ queryKey: ["vacation_requests", "pending_count"] });
      queryClient.invalidateQueries({ queryKey: ["home-timeoff", vars.employeeId] });
    },
  });
}

interface CancelVacationRequestVars {
  requestId: string;
  employeeId: string;
}

export function useCancelVacationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CancelVacationRequestVars) => {
      const { error } = await supabase
        .from("vacation_requests")
        .update({ status: "cancelled" })
        .eq("id", vars.requestId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["vacationRequests", vars.employeeId] });
      queryClient.invalidateQueries({ queryKey: ["vacationBalance", vars.employeeId] });
      queryClient.invalidateQueries({ queryKey: ["vacation_requests", "pending_count"] });
      queryClient.invalidateQueries({ queryKey: ["home-timeoff", vars.employeeId] });
    },
  });
}

// ── TL hooks ─────────────────────────────────────────────────────────────────

export interface TLVacationRequest extends VacationRequest {
  displayName: string;
}

export function useTLPendingVacationRequests(campaignId: string | null) {
  return useQuery({
    queryKey: ["tlPendingVacationRequests", campaignId],
    enabled: !!campaignId,
    queryFn: async (): Promise<TLVacationRequest[]> => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("*, employees!vacation_requests_employee_id_fkey(work_name, full_name)")
        .eq("campaign_id", campaignId!)
        .eq("status", "pending_tl")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const e = row.employees as { work_name: string | null; full_name: string | null } | null;
        const { employees: _e, ...rest } = row as typeof row & { employees: unknown };
        void _e;
        return {
          ...(rest as VacationRequest),
          displayName: getDisplayName({ work_name: e?.work_name ?? null, full_name: e?.full_name ?? "" }),
        };
      });
    },
  });
}

interface TLApproveVars {
  id: string;
  campaignId: string;
}

export function useTLApproveVacationRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (vars: TLApproveVars) => {
      const { error } = await supabase
        .from("vacation_requests")
        .update({
          status: "pending_hr",
          tl_reviewed_by: user?.id ?? null,
          tl_reviewed_at: new Date().toISOString(),
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tlPendingVacationRequests", vars.campaignId] });
      queryClient.invalidateQueries({ queryKey: ["team-timeoff-pending"] });
      queryClient.invalidateQueries({ queryKey: ["vacation_requests", "pending_count"] });
    },
  });
}

interface TLDenyVars {
  id: string;
  campaignId: string;
  reason: string;
}

export function useTLDenyVacationRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (vars: TLDenyVars) => {
      const { error } = await supabase
        .from("vacation_requests")
        .update({
          status: "denied",
          tl_reviewed_by: user?.id ?? null,
          tl_reviewed_at: new Date().toISOString(),
          denial_reason: vars.reason,
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tlPendingVacationRequests", vars.campaignId] });
      queryClient.invalidateQueries({ queryKey: ["team-timeoff-pending"] });
      queryClient.invalidateQueries({ queryKey: ["vacation_requests", "pending_count"] });
    },
  });
}

// ── HR hooks ─────────────────────────────────────────────────────────────────

export interface HRVacationRequest extends VacationRequest {
  displayName: string;
  campaignName: string;
  /** Primary TL on the campaign — shows owner who's the bottleneck on pending_tl rows. */
  tlName: string | null;
}

function mapHRRow(row: Record<string, unknown>): HRVacationRequest {
  const e = row.employees as { work_name: string | null; full_name: string | null } | null;
  const c = row.campaigns as {
    name: string | null;
    team_lead: { work_name: string | null; full_name: string | null } | null;
  } | null;
  const { employees: _e, campaigns: _c, ...rest } = row;
  void _e; void _c;
  const tl = c?.team_lead ?? null;
  return {
    ...(rest as VacationRequest),
    displayName: getDisplayName({ work_name: e?.work_name ?? null, full_name: e?.full_name ?? "" }),
    campaignName: c?.name ?? "",
    tlName: tl ? getDisplayName({ work_name: tl.work_name ?? null, full_name: tl.full_name ?? "" }) : null,
  };
}

// Pulled in by HR Time Off page so D / admins / managers can see requests
// stuck at the TL stage and override-approve. Joined to campaigns.team_lead_id
// → employees so we can show who the bottleneck TL is.
export function useHRPendingTLVacationRequests() {
  return useQuery({
    queryKey: ["hrPendingTLVacationRequests"],
    queryFn: async (): Promise<HRVacationRequest[]> => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select(
          "*, employees!vacation_requests_employee_id_fkey(work_name, full_name), " +
          "campaigns(name, team_lead:employees!campaigns_team_lead_id_fkey(work_name, full_name))"
        )
        .eq("status", "pending_tl")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapHRRow(row as unknown as Record<string, unknown>));
    },
  });
}

export function useHRPendingVacationRequests() {
  return useQuery({
    queryKey: ["hrPendingVacationRequests"],
    queryFn: async (): Promise<HRVacationRequest[]> => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select(
          "*, employees!vacation_requests_employee_id_fkey(work_name, full_name), " +
          "campaigns(name, team_lead:employees!campaigns_team_lead_id_fkey(work_name, full_name))"
        )
        .eq("status", "pending_hr")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapHRRow(row as unknown as Record<string, unknown>));
    },
  });
}

export function useHRAllVacationRequests() {
  return useQuery({
    queryKey: ["hrAllVacationRequests"],
    queryFn: async (): Promise<HRVacationRequest[]> => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select(
          "*, employees!vacation_requests_employee_id_fkey(work_name, full_name), " +
          "campaigns(name, team_lead:employees!campaigns_team_lead_id_fkey(work_name, full_name))"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapHRRow(row as unknown as Record<string, unknown>));
    },
  });
}

interface HRApproveVars {
  id: string;
}

export function useHRApproveVacationRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (vars: HRApproveVars) => {
      const { error } = await supabase
        .from("vacation_requests")
        .update({
          status: "approved",
          hr_reviewed_by: user?.id ?? null,
          hr_reviewed_at: new Date().toISOString(),
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrPendingVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["hrAllVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["vacation_requests", "pending_count"] });
    },
  });
}

// Owner override: approve a request stuck at pending_tl, jumping straight to
// 'approved' without waiting on the TL. Sets both tl_reviewed_by and
// hr_reviewed_by to the owner (audit trail = "owner overrode TL stage").
interface OwnerOverrideVars {
  id: string;
}

export function useOwnerOverrideApproveVacationRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (vars: OwnerOverrideVars) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("vacation_requests")
        .update({
          status: "approved",
          tl_reviewed_by: user?.id ?? null,
          tl_reviewed_at: now,
          hr_reviewed_by: user?.id ?? null,
          hr_reviewed_at: now,
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrPendingTLVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["hrPendingVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["hrAllVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["vacation_requests", "pending_count"] });
    },
  });
}

interface HRDenyVars {
  id: string;
  reason: string;
}

export function useHRDenyVacationRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (vars: HRDenyVars) => {
      const { error } = await supabase
        .from("vacation_requests")
        .update({
          status: "denied",
          hr_reviewed_by: user?.id ?? null,
          hr_reviewed_at: new Date().toISOString(),
          denial_reason: vars.reason,
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrPendingVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["hrAllVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["vacation_requests", "pending_count"] });
    },
  });
}

interface HRCancelVars {
  id: string;
}

/**
 * HR cancels a request from /hr/time-off — covers "plans changed" after
 * approval as well as withdrawing a still-pending request on the
 * employee's behalf. Audit trail lands in hr_reviewed_by/at.
 */
export function useHRCancelVacationRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (vars: HRCancelVars) => {
      const { error } = await supabase
        .from("vacation_requests")
        .update({
          status: "cancelled",
          hr_reviewed_by: user?.id ?? null,
          hr_reviewed_at: new Date().toISOString(),
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrPendingVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["hrPendingTLVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["hrAllVacationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["vacation_requests", "pending_count"] });
    },
  });
}
