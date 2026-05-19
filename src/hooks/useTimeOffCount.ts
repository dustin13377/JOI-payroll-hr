import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Count of time_off_requests with status='pending'.
 * RLS scopes automatically. Used by sidebar badge. Polls every 30s.
 *
 * Gated by an `enabled` flag so we only poll for users who can actually
 * approve (leadership + TL). Agents see their own pending requests via
 * RLS but the badge represents "things waiting for me to act on", which
 * doesn't apply to them.
 */
export function usePendingTimeOffCount(enabled: boolean) {
  return useQuery({
    queryKey: ["time_off_requests", "pending_count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("time_off_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 0,
  });
}
