import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AgentLogEntry {
  id: string;
  agent_id: string;
  author_id: string;
  campaign_id: string;
  entry_type: "note" | "verbal_warning";
  note: string;
  visible_to_agent: boolean;
  about_date: string | null; // YYYY-MM-DD — the day this note is *about*
  created_at: string;
  updated_at: string;
  author?: { full_name: string } | null;
}

const QUERY_KEY = "agent-log-entries";

export function useAgentLogEntries(agentId: string | undefined | null) {
  return useQuery({
    queryKey: [QUERY_KEY, agentId],
    queryFn: async () => {
      if (!agentId) return [];
      const { data, error } = await supabase
        .from("agent_coaching_notes")
        .select("*, author:author_id(full_name)")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AgentLogEntry[];
    },
    enabled: !!agentId,
  });
}

/**
 * Coaching notes whose about_date falls within a date range — feeds the
 * Clock-in History calendar so a note shows up on the day it refers to.
 * Keyed on the range so month navigation refetches cleanly.
 */
export function useAgentLogEntriesInRange(
  agentId: string | undefined | null,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: [QUERY_KEY, "range", agentId, startDate, endDate],
    queryFn: async () => {
      if (!agentId) return [];
      const { data, error } = await supabase
        .from("agent_coaching_notes")
        .select("*, author:author_id(full_name)")
        .eq("agent_id", agentId)
        .not("about_date", "is", null)
        .gte("about_date", startDate)
        .lte("about_date", endDate)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AgentLogEntry[];
    },
    enabled: !!agentId,
  });
}

export function useCreateAgentLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      agentId,
      entryType,
      note,
      campaignId,
      authorId,
      visibleToAgent = false,
      aboutDate = null,
    }: {
      agentId: string;
      entryType: "note" | "verbal_warning";
      note: string;
      campaignId: string;
      authorId: string;
      visibleToAgent?: boolean;
      aboutDate?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("agent_coaching_notes")
        .insert({
          agent_id: agentId,
          author_id: authorId,
          campaign_id: campaignId,
          entry_type: entryType,
          note,
          visible_to_agent: visibleToAgent,
          about_date: aboutDate,
        })
        .select("*, author:author_id(full_name)")
        .single();
      if (error) throw error;
      return data as AgentLogEntry;
    },
    onSuccess: () => {
      // Prefix match invalidates both the per-agent list and the calendar range query.
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useToggleEntryVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      agentId,
      visibleToAgent,
    }: {
      id: string;
      agentId: string;
      visibleToAgent: boolean;
    }) => {
      const { error } = await supabase
        .from("agent_coaching_notes")
        .update({ visible_to_agent: visibleToAgent })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Prefix match invalidates both the per-agent list and the calendar range query.
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
