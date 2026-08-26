import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// HR-side inbox for the client_agent_feedback table.
//
// Client users submit "notes / questions / write-up requests" about specific
// agents through the client portal Team drilldown. Leadership reads them here
// on /admin/client-messages and can acknowledge or resolve.
//
// Types are stale on the supabase types file (memory: "Supabase Types Stale
// (DEBT)"), so this file uses `(supabase as any)` for the two tables — same
// workaround useClientPortal.ts already uses for this table.
// ─────────────────────────────────────────────────────────────────────────────

export type ClientMessageType = "note" | "question" | "write_up_request";
export type ClientMessageStatus = "open" | "acknowledged" | "resolved";

export interface ClientMessage {
  id: string;
  client_id: string;
  employee_id: string; // UUID (employees.id)
  type: ClientMessageType;
  body: string;
  status: ClientMessageStatus;
  created_at: string;
  created_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  // Joined via PostgREST FK embedding.
  client: { id: string; name: string } | null;
  employee: {
    id: string;
    employee_id: string; // the human-facing TEXT code used in profile URLs
    full_name: string;
    work_name: string | null;
  } | null;
}

const QUERY_KEY = ["client-messages"] as const;
const COUNT_KEY = ["client-messages", "open_count"] as const;

/**
 * All client_agent_feedback rows visible to leadership, newest first.
 * `includeResolved=false` filters out `status = 'resolved'` server-side so the
 * common inbox view stays small; the toggle flips it on to show history.
 */
export function useClientMessages(includeResolved: boolean) {
  return useQuery({
    queryKey: [...QUERY_KEY, { includeResolved }] as const,
    queryFn: async (): Promise<ClientMessage[]> => {
      let q = (supabase as any)
        .from("client_agent_feedback")
        .select(
          `
          id, client_id, employee_id, type, body, status, created_at,
          created_by, resolved_at, resolved_by, resolution_note,
          client:client_id ( id, name ),
          employee:employee_id ( id, employee_id, full_name, work_name )
        `,
        )
        .order("created_at", { ascending: false });
      if (!includeResolved) q = q.neq("status", "resolved");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClientMessage[];
    },
  });
}

/**
 * Count of `status = 'open'` client messages, for the sidebar badge.
 * "Acknowledged" rows are NOT counted — someone has already looked at them.
 * RLS on the table only lets leadership read, so gate the query at the hook.
 * Polls every 30s to stay in sync with new submissions.
 */
export function useOpenClientMessagesCount(enabled: boolean) {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase as any)
        .from("client_agent_feedback")
        .select("*", { count: "exact", head: true })
        .eq("status", "open");
      if (error) throw error;
      return count ?? 0;
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation — Acknowledge and Resolve are the two write actions leadership has.
// RLS policy `client_agent_feedback_leadership_all` handles the auth check.
// ─────────────────────────────────────────────────────────────────────────────

export type UpdateAction = "acknowledge" | "resolve";

export function useUpdateClientFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      resolutionNote,
    }: {
      id: string;
      action: UpdateAction;
      /** Optional note captured from the Resolve dialog. Ignored for acknowledge. */
      resolutionNote?: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;

      if (action === "acknowledge") {
        const { error } = await (supabase as any)
          .from("client_agent_feedback")
          .update({ status: "acknowledged" })
          .eq("id", id);
        if (error) throw error;
        return;
      }

      // action === "resolve"
      const trimmedNote = (resolutionNote ?? "").trim();
      const { error } = await (supabase as any)
        .from("client_agent_feedback")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
          resolution_note: trimmedNote ? trimmedNote : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: COUNT_KEY });
    },
  });
}
