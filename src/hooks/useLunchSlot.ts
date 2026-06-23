import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LUNCH_WINDOWS,
  lunchIndexForLabel,
  emptiestWindow,
  type LunchWindow,
} from "@/lib/lunchBalancer";
import { getBreakSchedule } from "@/lib/breakSchedules";

/**
 * "Freeze current, balance new hires."
 *
 * Returns a computed lunch window ONLY for a new hire — someone whose schedule
 * entry has `lunch: null`. Agents with a fixed lunch time (every current agent)
 * return null, so the banner keeps their printed lunch unchanged.
 *
 * For a new hire we seed each window's count from teammates who already have a
 * fixed lunch, then place the unscheduled teammates (lunch: null) one by one in
 * stable hire order into the emptiest window, and return the target's window.
 *
 * Pass the human-facing employees.employee_id (e.g. "EMP-003").
 */
export function useLunchSlot(employeeCode: string | null | undefined): LunchWindow | null {
  const { data } = useQuery({
    queryKey: ["lunch-slot", employeeCode],
    enabled: !!employeeCode,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const mine = getBreakSchedule(employeeCode);
      // Not on file, or has a fixed lunch → nothing to compute (keep static).
      if (!mine || mine.lunch !== null) return null;

      // Resolve the new hire → which team (campaign) they're on.
      const { data: me, error } = await supabase
        .from("employees")
        .select("employee_id, campaign_id")
        .eq("employee_id", employeeCode as string)
        .maybeSingle();
      if (error) throw error;
      if (!me?.campaign_id) return null;

      // Active roster for that campaign, in stable join order.
      const { data: team, error: teamErr } = await supabase
        .from("employees")
        .select("employee_id, created_at, id")
        .eq("is_active", true)
        .eq("campaign_id", me.campaign_id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (teamErr) throw teamErr;
      if (!team?.length) return null;

      // Seed counts from teammates with a fixed lunch; queue the auto ones.
      const counts = LUNCH_WINDOWS.map(() => 0);
      const autoHires: string[] = [];
      for (const t of team) {
        const sched = getBreakSchedule(t.employee_id);
        if (sched && sched.lunch !== null) {
          counts[lunchIndexForLabel(sched.lunch)]++;
        } else if (sched && sched.lunch === null) {
          autoHires.push(t.employee_id);
        }
        // Teammates not on file at all have no schedule yet → skip.
      }

      // Place auto hires (already in stable order) into the emptiest window.
      for (const code of autoHires) {
        const w = emptiestWindow(counts);
        if (code === employeeCode) return LUNCH_WINDOWS[w];
        counts[w]++;
      }
      return null;
    },
  });

  return data ?? null;
}
