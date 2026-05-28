import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Count of vacation_requests still waiting on someone (pending_tl OR pending_hr).
 * RLS scopes automatically — TLs see their team's pending_tl + pending_hr,
 * leadership sees the whole org. Used by sidebar badge. Polls every 30s.
 *
 * Gated by an `enabled` flag so we only poll for users who can actually
 * approve (leadership + TL). Agents see their own via RLS but the badge
 * represents "things waiting for me to act on", which doesn't apply.
 *
 * Now reads the unified vacation_requests table — covers all time-off
 * types (vacation/sick/personal/other), paid + unpaid alike.
 * See TIME_OFF_UNIFICATION_PLAN.md.
 */
export function usePendingTimeOffCount(enabled: boolean) {
  return useQuery({
    queryKey: ["vacation_requests", "pending_count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("vacation_requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending_tl", "pending_hr"]);
      if (error) throw error;
      return count ?? 0;
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 0,
  });
}
