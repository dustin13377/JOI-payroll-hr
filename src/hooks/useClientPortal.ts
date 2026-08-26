import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayLocal } from "@/lib/localDate";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientHolidaySummary {
  holiday_date: string;
  holiday_name: string;
  requires_coverage: boolean;
  approved_off: number;
  total_headcount: number;
}

export interface ClientCampaign {
  id: string;
  name: string;
  client_id: string;
}

export interface ClientEmployee {
  id: string;
  display_name: string | null;
  campaign_id: string | null;
  title: string | null;
  is_active: boolean | null;
}

export interface ClientEodLog {
  id: string;
  employee_id: string | null;
  campaign_id: string | null;
  date: string | null;
  metrics: Record<string, unknown> | null;
}

export interface ClientRole {
  role_name: string;
}

export interface ClientApplicant {
  id: string;
  full_name: string | null;
  applied_position: string | null;
  stage: string;
  created_at: string;
  cv_url: string | null;
  ft_source: string | null;
  ft_channel: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the Monday (YYYY-MM-DD) and Sunday of the ISO week containing `today`. */
function currentWeekRange(): { monday: string; sunday: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return { monday: fmt(mon), sunday: fmt(sun) };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Fetches campaigns visible to the authenticated client user.
 * RLS on `campaigns` limits results to `client_id = my_client_id()`.
 */
export function useClientCampaigns() {
  return useQuery({
    queryKey: ["client-campaigns"],
    queryFn: async (): Promise<ClientCampaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, client_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientCampaign[];
    },
  });
}

/**
 * Fetches all employees visible to the client from `employees_client_view`.
 * The view's WHERE clause scopes results to the client's own campaigns.
 */
export function useClientEmployees() {
  return useQuery({
    queryKey: ["client-employees"],
    queryFn: async (): Promise<ClientEmployee[]> => {
      const { data, error } = await supabase
        .from("employees_client_view")
        .select("id, display_name, campaign_id, title, is_active")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as ClientEmployee[];
    },
  });
}

/**
 * Fetches the next upcoming holiday summary for a campaign via the
 * get_client_holiday_summary RPC. Returns null if no upcoming holiday exists
 * or the campaign isn't visible to the current client user.
 */
export function useClientHolidaySummary(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["clientHolidaySummary", campaignId],
    enabled: !!campaignId,
    queryFn: async (): Promise<ClientHolidaySummary | null> => {
      if (!campaignId) return null;
      const { data, error } = await supabase
        .rpc("get_client_holiday_summary", { p_campaign_id: campaignId });
      if (error) throw error;
      const row = (data as ClientHolidaySummary[] | null)?.[0] ?? null;
      // Only show holidays that haven't passed yet
      if (!row || row.holiday_date <= todayLocal()) return null;
      return row;
    },
  });
}

/**
 * Fetches the roles this client has assigned in the recruiting system. Each
 * row is one card on the client dashboard; applicants are grouped underneath.
 * RLS on recruiting_role_clients scopes to the caller's own client_id.
 */
export function useClientRoles() {
  return useQuery({
    queryKey: ["client-roles"],
    queryFn: async (): Promise<ClientRole[]> => {
      const { data, error } = await (supabase as any)
        .from("recruiting_role_clients")
        .select("role_name")
        .order("role_name");
      if (error) throw error;
      return (data ?? []) as ClientRole[];
    },
  });
}

/**
 * Fetches all applicants visible to the client from
 * `recruiting_candidates_client_view`. The view's WHERE clause already scopes
 * to rows whose applied_position matches a role assigned to my_client_id().
 */
export function useClientApplicants() {
  return useQuery({
    queryKey: ["client-applicants"],
    queryFn: async (): Promise<ClientApplicant[]> => {
      const { data, error } = await (supabase as any)
        .from("recruiting_candidates_client_view")
        .select("id, full_name, applied_position, stage, created_at, cv_url, ft_source, ft_channel")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientApplicant[];
    },
  });
}

// ── Recruitment-side: client preferences on individual applicants ────────────

export type ClientApplicantPref = "reject" | "back_burner" | "want_interview";

export interface ClientApplicantPreference {
  candidate_id: string;
  preference: ClientApplicantPref;
}

const PREFS_KEY = ["client-applicant-preferences"] as const;

/**
 * All applicant preferences this client user has set. Keyed by candidate_id
 * client-side so a row can look up "what did I mark this person as?" in O(1).
 */
export function useClientApplicantPreferences() {
  return useQuery({
    queryKey: PREFS_KEY,
    queryFn: async (): Promise<Map<string, ClientApplicantPref>> => {
      const { data, error } = await (supabase as any)
        .from("client_applicant_preferences")
        .select("candidate_id, preference");
      if (error) throw error;
      const rows = (data ?? []) as ClientApplicantPreference[];
      const m = new Map<string, ClientApplicantPref>();
      for (const r of rows) m.set(r.candidate_id, r.preference);
      return m;
    },
  });
}

/**
 * Sets or clears the client's preference on a candidate. Passing `null`
 * removes the row (client "unset" it). Sets pin client_id and created_by
 * from the current session — RLS + the client_id column default handle both.
 */
export function useSetClientApplicantPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidateId,
      preference,
    }: {
      candidateId: string;
      preference: ClientApplicantPref | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      const clientMeta = auth?.user?.user_metadata as { client_id?: string } | undefined;
      const clientId = clientMeta?.client_id;
      if (!userId || !clientId) throw new Error("Not signed in as a client user");

      if (preference == null) {
        const { error } = await (supabase as any)
          .from("client_applicant_preferences")
          .delete()
          .eq("candidate_id", candidateId)
          .eq("client_id", clientId);
        if (error) throw error;
        return;
      }

      const { error } = await (supabase as any)
        .from("client_applicant_preferences")
        .upsert(
          {
            candidate_id: candidateId,
            client_id: clientId,
            preference,
            created_by: userId,
          },
          { onConflict: "candidate_id,client_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PREFS_KEY }),
  });
}

// ── Team-side: client feedback about agents ──────────────────────────────────

export type ClientAgentFeedbackType = "note" | "question" | "write_up_request";
export type ClientAgentFeedbackStatus = "open" | "acknowledged" | "resolved";

export interface ClientAgentFeedback {
  id: string;
  employee_id: string;
  type: ClientAgentFeedbackType;
  body: string;
  status: ClientAgentFeedbackStatus;
  created_at: string;
}

const FEEDBACK_KEY = ["client-agent-feedback"] as const;

/** Client's own submitted feedback (all rows for their client scope). */
export function useMyAgentFeedback() {
  return useQuery({
    queryKey: FEEDBACK_KEY,
    queryFn: async (): Promise<ClientAgentFeedback[]> => {
      const { data, error } = await (supabase as any)
        .from("client_agent_feedback")
        .select("id, employee_id, type, body, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientAgentFeedback[];
    },
  });
}

/**
 * Submits a piece of feedback (note / question / write-up request) about
 * one agent. RLS enforces client_id + created_by; we only need to supply
 * the target employee and the payload.
 */
export function useCreateAgentFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      employeeId,
      type,
      body,
    }: {
      employeeId: string;
      type: ClientAgentFeedbackType;
      body: string;
    }) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Message is empty");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      const clientMeta = auth?.user?.user_metadata as
        | { client_id?: string }
        | undefined;
      const clientId = clientMeta?.client_id;
      if (!userId || !clientId) throw new Error("Not signed in as a client user");

      const { data: row, error } = await (supabase as any)
        .from("client_agent_feedback")
        .insert({
          employee_id: employeeId,
          client_id: clientId,
          type,
          body: trimmed,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Fire-and-forget HR notification. The row is already saved; a failed
      // email must not fail the mutation — HR can still see the feedback in
      // /admin/client-messages. Log so a broken send is visible in the console.
      try {
        const { error: notifyErr } = await supabase.functions.invoke(
          "notify-client-feedback",
          { body: { feedbackId: (row as { id: string }).id } },
        );
        if (notifyErr) {
          console.warn("notify-client-feedback failed:", notifyErr.message);
        }
      } catch (notifyEx) {
        console.warn("notify-client-feedback threw:", notifyEx);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FEEDBACK_KEY }),
  });
}

/**
 * Fetches this-week EOD logs for a specific campaign from `eod_logs_client_view`.
 * Scoped to Monday–Sunday of the current ISO week.
 */
export function useClientEodLogsThisWeek(campaignId: string | undefined) {
  const { monday, sunday } = currentWeekRange();

  return useQuery({
    queryKey: ["client-eod-week", campaignId, monday],
    enabled: !!campaignId,
    queryFn: async (): Promise<ClientEodLog[]> => {
      const { data, error } = await supabase
        .from("eod_logs_client_view")
        .select("id, employee_id, campaign_id, date, metrics")
        .eq("campaign_id", campaignId!)
        .gte("date", monday)
        .lte("date", sunday)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientEodLog[];
    },
  });
}
