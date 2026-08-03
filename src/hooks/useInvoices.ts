import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Client {
  id: string;
  name: string;
  prefix: string;
  bill_to_name: string | null;
  bill_to_address: string | null;
  // "weekly" (default) or "monthly". Monthly clients (e.g. HFB) are billed a
  // full month ahead against a flat per-agent rate, so their invoices have no
  // day-level punch backing — the PDF skips the timesheet section for them.
  billing_frequency?: string | null;
  monthly_flat_per_agent?: number | null;
}

export interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  week_number: number;
  week_start: string;
  week_end: string;
  due_date: string;
  submitted_on: string | null;
  project_name: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  client?: Client;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  employee_id: string | null;
  agent_name: string;
  campaign_name: string | null;
  days_worked: number;
  holiday_days: number;
  unit_price: number;
  total: number;
  spiffs: number;
  total_price: number;
  is_flat_total: boolean;
}

/* ----------------------------------------------------------------- */
/*  Read hooks                                                         */
/* ----------------------------------------------------------------- */

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

/**
 * Invoices list. statusGroup="active" → drafts + sent. "archive" → paid.
 */
export function useInvoices(opts: { statusGroup?: "active" | "archive"; clientId?: string } = {}) {
  const { statusGroup, clientId } = opts;
  return useQuery({
    queryKey: ["invoices", statusGroup ?? "all", clientId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, clients(*)")
        .order("created_at", { ascending: false });
      if (statusGroup === "active") {
        query = query.in("status", ["draft", "sent"]);
      } else if (statusGroup === "archive") {
        query = query.eq("status", "paid");
      }
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

export interface InvoicePunch {
  employee_id: string;
  date: string;          // YYYY-MM-DD
  clock_in: string;      // ISO timestamp
  clock_out: string | null;
  total_hours: number | null;
}

/**
 * Fetch all time-clock punches for the given employees within the invoice's
 * billing week. Returns a Map keyed by employee_id with the punches sorted
 * by date (then clock_in). Used to render the per-agent timesheet pages on
 * the invoice PDF and to detect days-worked vs punch-count mismatches.
 */
export function useInvoicePunches(
  invoiceId: string | undefined,
  employeeIds: string[],
  weekStart: string | undefined,
  weekEnd: string | undefined,
) {
  return useQuery({
    queryKey: ["invoice-punches", invoiceId, [...employeeIds].sort().join(","), weekStart, weekEnd],
    enabled: !!invoiceId && !!weekStart && !!weekEnd && employeeIds.length > 0,
    queryFn: async (): Promise<Map<string, InvoicePunch[]>> => {
      const { data, error } = await supabase
        .from("time_clock")
        .select("employee_id, date, clock_in, clock_out, total_hours")
        .in("employee_id", employeeIds)
        .gte("date", weekStart!)
        .lte("date", weekEnd!)
        .order("date", { ascending: true })
        .order("clock_in", { ascending: true });
      if (error) throw error;
      const byEmp = new Map<string, InvoicePunch[]>();
      for (const row of (data || []) as InvoicePunch[]) {
        const list = byEmp.get(row.employee_id) ?? [];
        list.push(row);
        byEmp.set(row.employee_id, list);
      }
      return byEmp;
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

      // Sort: agent (punch-billed) rows first, then flat-bill agent rows,
      // then misc adjustments (no employee_id) at the bottom. Within each
      // group, keep alphabetical by agent_name. This matches accounting
      // convention — adjustments live below the line items.
      const sortedLines = ((lines || []) as InvoiceLine[]).slice().sort((a, b) => {
        const rank = (l: InvoiceLine) =>
          l.employee_id === null ? 2 : l.is_flat_total ? 1 : 0;
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return a.agent_name.localeCompare(b.agent_name);
      });

      return {
        ...invoice,
        client: (invoice as any).clients,
        lines: sortedLines,
      } as Invoice & { lines: InvoiceLine[] };
    },
  });
}

/* ----------------------------------------------------------------- */
/*  Weekly preview + bulk generate                                     */
/* ----------------------------------------------------------------- */

export interface WeeklyPreviewRow {
  client_id: string;
  client_prefix: string;
  client_name: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  campaign_id: string | null;
  campaign_name: string;
  daily_bill_rate: number;
  days_worked: number;
  existing_invoice_id: string | null;
  is_flat_bill: boolean;
  flat_amount: number;
  is_gap_warning: boolean;
  gap_dates: string[] | null;
}

export interface GapWarning {
  employee_id: string;
  employee_name: string;
  gap_dates: string[];
}

export interface ClientPreview {
  client_id: string;
  client_name: string;
  client_prefix: string;
  existing_invoice_id: string | null;
  lines: WeeklyPreviewRow[];
  line_count: number;
  total_days: number;
  total_amount: number;
  missing_rate_count: number;
  gap_warnings: GapWarning[];
}

export function useWeeklyPreview(monday: string | null, sunday: string | null) {
  return useQuery({
    queryKey: ["weekly-preview", monday, sunday],
    enabled: !!monday && !!sunday,
    queryFn: async (): Promise<ClientPreview[]> => {
      const { data, error } = await supabase.rpc("weekly_invoice_preview", {
        p_monday: monday!,
        p_sunday: sunday!,
      });
      if (error) throw error;
      // Filter out test / mock campaigns — they shouldn't appear in real invoice
      // generation. Filter is on campaign_name with the DEV_MOCK_ prefix; keep
      // it client-side so the RPC stays general-purpose (other consumers may
      // want to see all campaigns).
      const allRows = (data as WeeklyPreviewRow[] || []).filter(
        (r) => !(r.campaign_name ?? "").toUpperCase().startsWith("DEV_MOCK"),
      );
      const gapRows = allRows.filter((r) => r.is_gap_warning);
      const rows = allRows.filter((r) => !r.is_gap_warning);
      const byClient = new Map<string, ClientPreview>();
      for (const r of rows) {
        let bucket = byClient.get(r.client_id);
        if (!bucket) {
          bucket = {
            client_id: r.client_id,
            client_name: r.client_name,
            client_prefix: r.client_prefix,
            existing_invoice_id: r.existing_invoice_id,
            lines: [],
            line_count: 0,
            total_days: 0,
            total_amount: 0,
            missing_rate_count: 0,
            gap_warnings: gapRows
              .filter((g) => g.client_id === r.client_id)
              .map((g) => ({
                employee_id: g.employee_id,
                employee_name: g.employee_name,
                gap_dates: g.gap_dates ?? [],
              })),
          };
          byClient.set(r.client_id, bucket);
        }
        bucket.lines.push({
          ...r,
          daily_bill_rate: Number(r.daily_bill_rate),
          days_worked: Number(r.days_worked),
          flat_amount: Number(r.flat_amount),
        });
        bucket.line_count += 1;
        if (r.is_flat_bill) {
          // Flat-billed lines contribute their fixed amount, no days/rate math
          bucket.total_amount += Number(r.flat_amount);
        } else {
          bucket.total_days += Number(r.days_worked);
          bucket.total_amount += Number(r.days_worked) * Number(r.daily_bill_rate);
          if (Number(r.daily_bill_rate) === 0) bucket.missing_rate_count += 1;
        }
      }
      return Array.from(byClient.values()).sort((a, b) =>
        a.client_name.localeCompare(b.client_name)
      );
    },
  });
}

export interface GenerateResult {
  invoice_id: string;
  client_id: string;
  invoice_number: string;
  line_count: number;
  total_amount: number;
}

export function useGenerateWeekly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ monday, sunday }: { monday: string; sunday: string }) => {
      const { data, error } = await supabase.rpc("generate_weekly_invoices", {
        p_monday: monday,
        p_sunday: sunday,
      });
      if (error) throw error;
      return (data || []) as GenerateResult[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["weekly-preview"] });
    },
  });
}

/* ----------------------------------------------------------------- */
/*  Monthly preview + generate  (monthly-billed clients, e.g. HFB)     */
/* ----------------------------------------------------------------- */

/**
 * One agent row from monthly_invoice_preview. A monthly client bills a FLAT
 * fee per agent active in the month (flat_fee), then reconciles the prior
 * month: missed-day credit (negative) + still-pending prior-month spiffs.
 * net_amount = flat_fee + credit_amount + prior_spiff_amount.
 */
export interface MonthlyPreviewRow {
  employee_id: string;
  agent_name: string;
  campaign_name: string | null;
  daily_bill_rate: number;
  active_weekdays: number;
  flat_fee: number;
  prior_missed_days: number;
  credit_amount: number;
  prior_spiff_amount: number;
  net_amount: number;
  existing_invoice_id: string | null;
}

export interface MonthlyClientPreview {
  client_id: string;
  client_name: string;
  client_prefix: string;
  monthly_flat_per_agent: number;
  existing_invoice_id: string | null;
  rows: MonthlyPreviewRow[];
  agent_count: number;   // agents actually charged the flat fee this month
  total_amount: number;  // sum of net_amount across all rows
}

/** Clients billed once a month rather than weekly. */
export function useMonthlyClients() {
  return useQuery({
    queryKey: ["monthly-clients"],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("billing_frequency", "monthly")
        .order("name");
      if (error) throw error;
      return (data || []) as Client[];
    },
  });
}

/**
 * Preview every monthly client's invoice for the given month. monthStart is
 * any day in the target month (we pass the 1st). Runs monthly_invoice_preview
 * once per monthly client and rolls the rows up into per-client cards.
 */
export function useMonthlyPreview(monthStart: string | null) {
  return useQuery({
    queryKey: ["monthly-preview", monthStart],
    enabled: !!monthStart,
    queryFn: async (): Promise<MonthlyClientPreview[]> => {
      const { data: clients, error: cErr } = await supabase
        .from("clients")
        .select("*")
        .eq("billing_frequency", "monthly")
        .order("name");
      if (cErr) throw cErr;

      const results = await Promise.all(
        ((clients || []) as Client[]).map(async (c) => {
          const { data, error } = await supabase.rpc("monthly_invoice_preview", {
            p_client_id: c.id,
            p_month_start: monthStart!,
          });
          if (error) throw error;
          const rows = ((data as MonthlyPreviewRow[]) || []).map((r) => ({
            ...r,
            daily_bill_rate: Number(r.daily_bill_rate),
            active_weekdays: Number(r.active_weekdays),
            flat_fee: Number(r.flat_fee),
            prior_missed_days: Number(r.prior_missed_days),
            credit_amount: Number(r.credit_amount),
            prior_spiff_amount: Number(r.prior_spiff_amount),
            net_amount: Number(r.net_amount),
          }));
          const existing = rows.find((r) => r.existing_invoice_id)?.existing_invoice_id ?? null;
          return {
            client_id: c.id,
            client_name: c.name,
            client_prefix: c.prefix,
            monthly_flat_per_agent: Number(c.monthly_flat_per_agent ?? 0),
            existing_invoice_id: existing,
            rows,
            agent_count: rows.filter((r) => r.flat_fee > 0).length,
            total_amount: rows.reduce((s, r) => s + r.net_amount, 0),
          } as MonthlyClientPreview;
        }),
      );
      return results.sort((a, b) => a.client_name.localeCompare(b.client_name));
    },
  });
}

/**
 * Generate one monthly client's draft invoice. Server rejects if a month
 * invoice already exists for that client, and marks prior-month pending
 * spiffs as billed. Returns the created invoice id/number/totals.
 */
export function useGenerateMonthly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, monthStart }: { clientId: string; monthStart: string }) => {
      const { data, error } = await supabase.rpc("generate_monthly_invoice", {
        p_client_id: clientId,
        p_month_start: monthStart,
      });
      if (error) throw error;
      return (data || []) as GenerateResult[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["monthly-preview"] });
      qc.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}

/* ----------------------------------------------------------------- */
/*  Edit single invoice / lines                                        */
/* ----------------------------------------------------------------- */

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

export function useUpdateInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<InvoiceLine, "days_worked" | "holiday_days" | "unit_price" | "total" | "spiffs" | "is_flat_total" | "total_price">>;
    }) => {
      const { error } = await supabase
        .from("invoice_lines")
        .update(patch as Record<string, unknown>)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });
}

export function useDeleteInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoice_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });
}

export function useAddInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (line: {
      invoice_id: string;
      employee_id?: string | null;
      agent_name: string;
      campaign_name?: string | null;
      days_worked: number;
      holiday_days?: number;
      unit_price: number;
      spiffs?: number;
      is_flat_total?: boolean;
      total_price?: number;
    }) => {
      const days = line.days_worked ?? 0;
      const holiday = line.holiday_days ?? 0;
      const unit = line.unit_price ?? 0;
      const spiffs = line.spiffs ?? 0;
      // `days` already includes holiday days. Holiday adds 2× premium ON TOP.
      // Net effect = 3× rate per worked holiday (1× already in days + 2× premium). Matches D's formula.
      const total = (days * unit) + (holiday * unit * 2);
      const total_price = line.is_flat_total
        ? (line.total_price ?? 0)
        : total + spiffs;

      const { error } = await supabase.from("invoice_lines").insert({
        invoice_id: line.invoice_id,
        employee_id: line.employee_id ?? null,
        agent_name: line.agent_name,
        campaign_name: line.campaign_name ?? null,
        days_worked: days,
        holiday_days: line.holiday_days ?? 0,
        unit_price: unit,
        total,
        spiffs,
        total_price,
        is_flat_total: !!line.is_flat_total,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: linesErr } = await supabase
        .from("invoice_lines")
        .delete()
        .eq("invoice_id", id);
      if (linesErr) throw linesErr;
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

/**
 * Set an employee's daily bill rate. Used by the inline editor on "No rate"
 * cells in the weekly invoice preview — the rate persists to employees table
 * so subsequent weeks auto-fill, and the preview query is invalidated so the
 * UI refreshes immediately.
 *
 * employeeId is the UUID (employees.id), not the EMP-XXX code.
 */
export function useUpdateBillRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { employeeId: string; rate: number }) => {
      const { error } = await supabase
        .from("employees")
        .update({ daily_bill_rate: params.rate })
        .eq("id", params.employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-preview"] });
    },
  });
}

/* ----------------------------------------------------------------- */
/*  Helpers                                                            */
/* ----------------------------------------------------------------- */

export const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/* ----------------------------------------------------------------- */
/*  Client contacts + invoice email send                               */
/* ----------------------------------------------------------------- */

export interface ClientContact {
  id: string;
  client_id: string;
  name: string | null;
  email: string;
  active: boolean;
}

/** Active default recipients for a client. Feeds the Send-to-Client dialog. */
export function useClientContacts(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-contacts", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientContact[]> => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("id, client_id, name, email, active")
        .eq("client_id", clientId!)
        .eq("active", true)
        .order("name", { nullsFirst: false });
      if (error) throw error;
      return (data || []) as ClientContact[];
    },
  });
}

/** Save (or upsert) a recipient for a client so it auto-fills next time. */
export function useAddClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { client_id: string; email: string; name?: string | null }): Promise<ClientContact> => {
      const { data, error } = await supabase
        .from("client_contacts")
        .upsert(
          { client_id: args.client_id, email: args.email, name: args.name ?? null, active: true },
          { onConflict: "client_id,email" },
        )
        .select("id, client_id, name, email, active")
        .single();
      if (error) throw error;
      return data as ClientContact;
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["client-contacts", args.client_id] });
    },
  });
}

/** Remove a saved recipient so it stops auto-filling. */
export function useDeleteClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; client_id: string }) => {
      const { error } = await supabase.from("client_contacts").delete().eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["client-contacts", args.client_id] });
    },
  });
}

export interface SendInvoiceEmailArgs {
  invoice_id: string;
  recipients: string[];
  cc?: string[];
  subject: string;
  body_text: string;
  pdf_base64: string;
  pdf_filename: string;
  bcc_self?: boolean;
}

export interface SendInvoiceEmailResult {
  status: string;
  message_id: string;
  recipients: string[];
  marked_sent: boolean;
}

/** Invoke the send-invoice-email edge function with the PDF attachment. */
export function useSendInvoiceEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SendInvoiceEmailArgs): Promise<SendInvoiceEmailResult> => {
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: args,
      });
      if (error) {
        // Surface the edge function's JSON { error } message when present.
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const j = await ctx.json();
            if (j?.error) msg = j.error;
          }
        } catch { /* fall back to error.message */ }
        throw new Error(msg);
      }
      return data as SendInvoiceEmailResult;
    },
    onSuccess: (_result, args) => {
      qc.invalidateQueries({ queryKey: ["invoice", args.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

/* ----------------------------------------------------------------- */
/*  Spiff attachment / detachment                                      */
/* ----------------------------------------------------------------- */

export interface AttachSpiffsResult {
  attached_count: number;
  attached_total_usd: number;
  orphan_count: number;
}

export interface DetachSpiffsResult {
  detached_count: number;
  detached_total_usd: number;
}

/**
 * Attach pending spiffs for a draft invoice's client + week to
 * the matching agent lines. Idempotent — safe to call any time.
 * Invalidates ["invoice", invoiceId] on success.
 */
export function useAttachSpiffs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string): Promise<AttachSpiffsResult> => {
      const { data, error } = await supabase.rpc("attach_pending_spiffs", {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      // RPC returns a set-returning function; result is an array with one row.
      return (data as AttachSpiffsResult[])[0] ?? { attached_count: 0, attached_total_usd: 0, orphan_count: 0 };
    },
    onSuccess: (_result, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
}

/**
 * Detach all billed spiffs from an invoice's lines, resetting them
 * to 'pending'. Called before unlocking a sent invoice to draft.
 * Guards server-side against paid invoices.
 */
export function useDetachSpiffs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string): Promise<DetachSpiffsResult> => {
      const { data, error } = await supabase.rpc("detach_invoice_spiffs", {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      return (data as DetachSpiffsResult[])[0] ?? { detached_count: 0, detached_total_usd: 0 };
    },
    onSuccess: (_result, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}
