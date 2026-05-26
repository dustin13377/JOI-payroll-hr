import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Client {
  id: string;
  name: string;
  prefix: string;
  bill_to_name: string | null;
  bill_to_address: string | null;
}

export interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  week_number: number;
  week_start: string;
  week_end: string;
  due_date: string;
  status: string;
  created_at: string;
  client?: Client;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  agent_name: string;
  days_worked: number;
  unit_price: number;
  total: number;
  spiffs: number;
  total_price: number;
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data || []) as Client[];
    },
  });
}

export function useInvoices(clientId?: string) {
  return useQuery({
    queryKey: ["invoices", clientId],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, clients(*)")
        .order("created_at", { ascending: false });
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        client: row.clients,
      })) as Invoice[];
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ["invoice", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .select("*, clients(*)")
        .eq("id", id!)
        .single();
      if (invError) throw invError;

      const { data: lines, error: linesError } = await supabase
        .from("invoice_lines")
        .select("*")
        .eq("invoice_id", id!)
        .order("agent_name");
      if (linesError) throw linesError;

      return {
        ...invoice,
        client: (invoice as any).clients,
        lines: (lines || []) as InvoiceLine[],
      } as Invoice & { lines: InvoiceLine[] };
    },
  });
}

export function useAgentsByClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ["agentsByClient", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      // Get all campaign IDs for this client
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("client_id", clientId!);
      const campaignIds = (campaigns || []).map(c => c.id);
      if (campaignIds.length === 0) return [];

      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, employee_id")
        .eq("is_active", true)
        .in("campaign_id", campaignIds);
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Historical version of useAgentsByClient — picks agents whose assignment to
 * ANY campaign under this client overlapped with [weekStart, weekEnd].
 *
 * Returns each agent with:
 *   - days_worked: count of distinct time_clock dates (clock_in NOT NULL)
 *     during their assignment window for this specific client. Holidays
 *     and absences naturally fall out because they have no clock-in.
 *   - joined_mid_week_on: date if assignment started AFTER weekStart, else null
 *   - left_mid_week_on:   date if assignment ended BEFORE weekEnd, else null
 *
 * Use this instead of useAgentsByClient for new invoices so people who
 * moved campaigns mid-period appear on the correct client's invoice for
 * the days they were actually there.
 */
export type AgentForClientPeriod = {
  id: string;
  full_name: string;
  employee_id: string;
  days_worked: number;
  joined_mid_week_on: string | null;
  left_mid_week_on: string | null;
  /** Explicit per-employee daily bill rate from employees.daily_bill_rate.
   *  Used to prefill the invoice line's unit_price. 0 means "no rate set" —
   *  PDF download stays disabled until the operator types one in. */
  daily_bill_rate: number;
};

export function useAgentsForClientPeriod(
  clientId: string | undefined,
  weekStart: string | undefined,
  weekEnd: string | undefined,
) {
  return useQuery({
    queryKey: ["agentsForClientPeriod", clientId, weekStart, weekEnd],
    enabled: !!clientId && !!weekStart && !!weekEnd,
    queryFn: async (): Promise<AgentForClientPeriod[]> => {
      // 1. Campaigns under this client — exclude DEV_MOCK_* campaigns which
      //    exist for development/testing only and should never appear on a
      //    real invoice. They stay visible on the Campaigns admin page.
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("client_id", clientId!)
        .not("name", "ilike", "DEV_MOCK%");
      const campaignIds = (campaigns || []).map((c) => c.id);
      if (campaignIds.length === 0) return [];

      // 2. Assignment rows under those campaigns that overlap the period.
      //    Overlap: start_date <= weekEnd AND (end_date IS NULL OR end_date >= weekStart)
      //    Also pulls employees.daily_bill_rate so we can prefill the
      //    invoice line's unit_price downstream.
      const { data: assignments, error: aErr } = await supabase
        .from("employee_campaign_assignments")
        .select("employee_id, campaign_id, start_date, end_date, employee:employees(id, full_name, employee_id, daily_bill_rate)")
        .in("campaign_id", campaignIds)
        .lte("start_date", weekEnd!)
        .or(`end_date.is.null,end_date.gte.${weekStart!}`);
      if (aErr) throw aErr;

      // 3. Bucket by employee. A single employee may have multiple overlap
      //    windows (e.g. moved from campaign A to campaign B within the same
      //    client during the week — rare but possible).
      type Window = { start: string; end: string };
      const byEmployee = new Map<string, {
        id: string;
        full_name: string;
        employee_id: string;
        daily_bill_rate: number;
        windows: Window[];
      }>();
      for (const a of (assignments || []) as unknown as Array<{
        employee_id: string;
        start_date: string;
        end_date: string | null;
        employee: { id: string; full_name: string; employee_id: string; daily_bill_rate: number | null } | null;
      }>) {
        if (!a.employee) continue;
        const effStart = a.start_date > weekStart! ? a.start_date : weekStart!;
        const effEnd   = (a.end_date === null || a.end_date > weekEnd!) ? weekEnd! : a.end_date;
        const cur = byEmployee.get(a.employee.id);
        if (cur) {
          cur.windows.push({ start: effStart, end: effEnd });
        } else {
          byEmployee.set(a.employee.id, {
            id: a.employee.id,
            full_name: a.employee.full_name,
            employee_id: a.employee.employee_id,
            daily_bill_rate: Number(a.employee.daily_bill_rate) || 0,
            windows: [{ start: effStart, end: effEnd }],
          });
        }
      }

      const employeeIds = Array.from(byEmployee.keys());
      if (!employeeIds.length) return [];

      // 4. Pull punches for all relevant employees within the week.
      const { data: punches } = await supabase
        .from("time_clock")
        .select("employee_id, date")
        .in("employee_id", employeeIds)
        .gte("date", weekStart!)
        .lte("date", weekEnd!)
        .not("clock_in", "is", null);

      // 5. Count unique dates per employee that fall inside one of their
      //    windows for this client. Outside-window punches don't count
      //    (they're billable on a different client's invoice).
      const daysByEmp = new Map<string, Set<string>>();
      for (const p of (punches || []) as Array<{ employee_id: string; date: string }>) {
        const emp = byEmployee.get(p.employee_id);
        if (!emp) continue;
        const inWindow = emp.windows.some((w) => p.date >= w.start && p.date <= w.end);
        if (!inWindow) continue;
        if (!daysByEmp.has(p.employee_id)) daysByEmp.set(p.employee_id, new Set());
        daysByEmp.get(p.employee_id)!.add(p.date);
      }

      // 6. Build the response.
      return Array.from(byEmployee.values())
        .map((emp) => {
          const sorted = emp.windows.slice().sort((a, b) => a.start.localeCompare(b.start));
          const first = sorted[0];
          const last  = sorted[sorted.length - 1];
          return {
            id: emp.id,
            full_name: emp.full_name,
            employee_id: emp.employee_id,
            days_worked: daysByEmp.get(emp.id)?.size ?? 0,
            joined_mid_week_on: first.start > weekStart! ? first.start : null,
            left_mid_week_on:   last.end   < weekEnd!   ? last.end   : null,
            daily_bill_rate: emp.daily_bill_rate,
          };
        })
        // Alphabetical so the invoice line order is stable run-to-run.
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoice,
      lines,
    }: {
      invoice: {
        client_id: string;
        invoice_number: string;
        week_number: number;
        week_start: string;
        week_end: string;
        due_date: string;
        status: string;
      };
      lines: {
        agent_name: string;
        days_worked: number;
        unit_price: number;
        total: number;
        spiffs: number;
        total_price: number;
      }[];
    }) => {
      const { data: inv, error: invError } = await supabase
        .from("invoices")
        .insert(invoice)
        .select()
        .single();
      if (invError) throw invError;

      if (lines.length > 0) {
        const lineRows = lines.map((l) => ({ ...l, invoice_id: inv.id }));
        const { error: linesError } = await supabase
          .from("invoice_lines")
          .insert(lineRows);
        if (linesError) throw linesError;
      }

      return inv;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });
}

export const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
