import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayLocal } from "@/lib/localDate";

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the agent_reviews table + the joined employee/campaign info
// the UI needs to render rows.
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewDecision = "keep" | "let_go" | "extend";
export type ReviewTerminationStatus = "pending" | "confirmed" | "denied";

export interface AgentReview {
  id: string;
  employee_id: string;
  campaign_id: string;
  week_number: number;
  due_date: string;             // ISO date (YYYY-MM-DD)
  attendance_score: number | null;
  kpi_score: number | null;
  attitude_score: number | null;
  notes: string | null;
  decision: ReviewDecision | null;
  decision_reason: string | null;
  termination_status: ReviewTerminationStatus | null;
  hr_decided_by: string | null;
  hr_decided_at: string | null;
  hr_decision_notes: string | null;
  extension_days: number | null;
  reviewed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentReviewWithJoins extends AgentReview {
  employee: {
    id: string;
    full_name: string;
    work_name: string | null;
    hire_date: string | null;
    /** Present only on queries using REVIEW_SELECT_ACTIVE. */
    is_active?: boolean;
  } | null;
  campaign: {
    id: string;
    name: string;
  } | null;
  reviewer: { full_name: string } | null;
  hr_reviewer: { full_name: string } | null;
}

/** Computed UI status for a review row. */
export type ReviewStatus =
  | "completed"
  | "due_today"
  | "overdue"
  | "upcoming";

export function reviewStatus(r: Pick<AgentReview, "completed_at" | "due_date">): ReviewStatus {
  if (r.completed_at) return "completed";
  const today = todayLocal();
  if (r.due_date < today) return "overdue";
  if (r.due_date === today) return "due_today";
  return "upcoming";
}

// ─────────────────────────────────────────────────────────────────────────────
// Selectors used by both queries
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_SELECT = `
  *,
  employee:employee_id ( id, full_name, work_name, hire_date ),
  campaign:campaign_id ( id, name ),
  reviewer:reviewed_by ( full_name ),
  hr_reviewer:hr_decided_by ( full_name )
`;

/**
 * Same shape but with an INNER join on employees so we can filter the /reviews
 * list to active employees only. Agents terminated/resigned before finishing
 * probation keep their review rows (history on their profile) but disappear
 * from the review queue and the sidebar badge.
 */
const REVIEW_SELECT_ACTIVE = `
  *,
  employee:employee_id!inner ( id, full_name, work_name, hire_date, is_active ),
  campaign:campaign_id ( id, name ),
  reviewer:reviewed_by ( full_name ),
  hr_reviewer:hr_decided_by ( full_name )
`;

const QUERY_KEYS = {
  list: ["agent-reviews", "list"] as const,
  forEmployee: (employeeId: string) => ["agent-reviews", "employee", employeeId] as const,
  pendingHr: ["agent-reviews", "pending-hr"] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All in-window reviews visible to the current user (RLS handles scoping).
 * Sorted with overdue first, then due soonest, then completed.
 *
 * `onlyOpen=true` excludes already-completed reviews — handy for the
 * "needs review" dashboard list.
 */
export function useAgentReviews(opts: { onlyOpen?: boolean } = {}) {
  const { onlyOpen = false } = opts;
  return useQuery({
    queryKey: [...QUERY_KEYS.list, { onlyOpen }],
    queryFn: async () => {
      let q = supabase
        .from("agent_reviews")
        .select(REVIEW_SELECT_ACTIVE)
        .eq("employee.is_active", true)
        .order("due_date", { ascending: true });
      if (onlyOpen) q = q.is("completed_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AgentReviewWithJoins[];
    },
  });
}

/** All reviews (any status) for one employee — used on EmpleadoPerfil. */
export function useEmployeeReviews(employeeId: string | undefined | null) {
  return useQuery({
    queryKey: employeeId ? QUERY_KEYS.forEmployee(employeeId) : ["agent-reviews", "employee", "none"],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("agent_reviews")
        .select(REVIEW_SELECT)
        .eq("employee_id", employeeId)
        .order("week_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AgentReviewWithJoins[];
    },
    enabled: !!employeeId,
  });
}

/**
 * Sidebar badge count for /reviews.
 *
 * Counts "stuff that needs attention" — runs as two parallel COUNTs and sums:
 *   1. Actionable reviews — open (completed_at IS NULL) and the due date has
 *      arrived (due_date <= today). Upcoming reviews are excluded because the
 *      Submit Review button is disabled until the due date, so they aren't
 *      actionable.
 *   2. Pending termination confirmations — TL-filed let_go decisions still
 *      waiting on HR to confirm or deny.
 *
 * RLS handles role scoping automatically:
 *   - Leadership sees org-wide totals for both buckets.
 *   - TLs see their team's actionable count + (rarely > 0) any let_go they
 *     filed that's still pending HR review.
 *   - Agents are gated at the hook level via the `enabled` flag — they can't
 *     read other people's reviews and the badge would always be 0 anyway.
 *
 * Polls every 30s. Mutations on agent_reviews invalidate the broader
 * `["agent-reviews"]` key, which transitively refreshes this count.
 */
export function usePendingAgentReviewsCount(enabled: boolean) {
  return useQuery({
    queryKey: ["agent-reviews", "pending_count"],
    queryFn: async (): Promise<number> => {
      const today = todayLocal();
      const [actionable, pendingHr] = await Promise.all([
        supabase
          .from("agent_reviews")
          // INNER join so terminated agents' open reviews don't inflate the badge
          .select("*, employee:employee_id!inner ( is_active )", { count: "exact", head: true })
          .eq("employee.is_active", true)
          .is("completed_at", null)
          .lte("due_date", today),
        supabase
          .from("agent_reviews")
          .select("*", { count: "exact", head: true })
          .eq("decision", "let_go")
          .eq("termination_status", "pending"),
      ]);
      if (actionable.error) throw actionable.error;
      if (pendingHr.error) throw pendingHr.error;
      return (actionable.count ?? 0) + (pendingHr.count ?? 0);
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 0,
  });
}

/**
 * Let-go decisions filed by TLs that are still waiting on HR confirmation.
 * Powers the HR queue. RLS will return [] for non-leadership users.
 */
export function usePendingTerminationReviews() {
  return useQuery({
    queryKey: QUERY_KEYS.pendingHr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_reviews")
        .select(REVIEW_SELECT)
        .eq("decision", "let_go")
        .eq("termination_status", "pending")
        .order("completed_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AgentReviewWithJoins[];
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations — wrap the RPCs so the UI doesn't have to know parameter names
// ─────────────────────────────────────────────────────────────────────────────

interface CompleteReviewInput {
  reviewId: string;
  employeeId: string;       // for cache invalidation only
  attendanceScore: number;
  kpiScore: number;
  attitudeScore: number;
  notes?: string;
  decision?: ReviewDecision;
  decisionReason?: string;
  extensionDays?: number;   // required when decision === "extend"
}

export function useCompleteAgentReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteReviewInput) => {
      const { error } = await supabase.rpc("complete_agent_review", {
        p_review_id: input.reviewId,
        p_attendance_score: input.attendanceScore,
        p_kpi_score: input.kpiScore,
        p_attitude_score: input.attitudeScore,
        p_notes: input.notes ?? null,
        p_decision: input.decision ?? null,
        p_decision_reason: input.decisionReason ?? null,
        p_extension_days: input.extensionDays ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["agent-reviews"] });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.forEmployee(vars.employeeId) });
    },
  });
}

interface ConfirmTerminationInput {
  reviewId: string;
  confirm: boolean;          // true = approve, false = deny
  hrNotes?: string;
}

export function useConfirmReviewTermination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConfirmTerminationInput) => {
      const { error } = await supabase.rpc("confirm_review_termination", {
        p_review_id: input.reviewId,
        p_confirm: input.confirm,
        p_hr_notes: input.hrNotes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-reviews"] });
      qc.invalidateQueries({ queryKey: ["employees"] }); // employee status flipped
    },
  });
}
