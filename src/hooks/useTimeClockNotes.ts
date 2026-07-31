import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TimeClockNote {
  reason: string;
  action: string; // "insert" | "update"
  edited_at: string; // ISO timestamp
  editor_name: string;
}

/**
 * History of manager / TL edit notes for one employee's punch on a given day.
 *
 * These are the existing time_clock_audit "reasons" — every punch edit already
 * records one, with who made it and when. We read them through the
 * get_time_clock_notes RPC (SECURITY DEFINER) so the editor's NAME resolves even
 * for a team lead, who can't read other users' profile rows directly. Newest
 * first; the function caps the result at 10.
 */
export function useTimeClockNotes(
  employeeId: string | null | undefined,
  date: string | null | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: ["time-clock-notes", employeeId, date],
    enabled: !!employeeId && !!date && enabled,
    queryFn: async (): Promise<TimeClockNote[]> => {
      const { data, error } = await supabase.rpc("get_time_clock_notes", {
        p_employee_id: employeeId,
        p_date: date,
      });
      if (error) throw error;
      return (data ?? []) as TimeClockNote[];
    },
  });
}
