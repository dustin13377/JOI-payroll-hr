import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmploymentHistoryRow {
  id: string;
  employee_id: string;
  from_status: "active" | "terminated" | "resigned" | "on_leave" | null;
  to_status: "active" | "terminated" | "resigned" | "on_leave";
  reason: string | null;
  notes: string | null;
  rehire_eligible: boolean | null;
  last_worked_day: string | null;
  changed_by: string | null;
  changed_at: string;
  // optional joined display name for the actor
  actor_name?: string | null;
}

/**
 * Returns the employment history for an employee (newest first).
 * employeeUuid is the UUID — employees.id, not the readable employees.employee_id.
 *
 * RLS limits this to leadership-tier users; agents/TLs will get an empty array.
 */
export function useEmploymentHistory(employeeUuid: string | null | undefined) {
  return useQuery({
    queryKey: ["employment-history", employeeUuid],
    enabled: !!employeeUuid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employment_history")
        .select("*")
        .eq("employee_id", employeeUuid!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as EmploymentHistoryRow[];

      // Best-effort actor name lookup: changed_by → user_profiles.id →
      // employees.id → full_name. We do one batched query.
      const actorIds = Array.from(
        new Set(rows.map((r) => r.changed_by).filter((id): id is string => !!id))
      );
      if (actorIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, employee_id")
        .in("id", actorIds);

      const empUuids = (profiles ?? [])
        .map((p: any) => p.employee_id)
        .filter((id: string | null): id is string => !!id);

      let nameByEmpUuid: Record<string, string> = {};
      if (empUuids.length > 0) {
        const { data: emps } = await supabase
          .from("employees")
          .select("id, full_name")
          .in("id", empUuids);
        nameByEmpUuid = Object.fromEntries(
          (emps ?? []).map((e: any) => [e.id, e.full_name])
        );
      }

      const nameByUserId: Record<string, string> = Object.fromEntries(
        (profiles ?? []).map((p: any) => [
          p.id,
          (p.employee_id && nameByEmpUuid[p.employee_id]) || "",
        ])
      );

      return rows.map((r) => ({
        ...r,
        actor_name: r.changed_by ? nameByUserId[r.changed_by] || null : null,
      }));
    },
  });
}
