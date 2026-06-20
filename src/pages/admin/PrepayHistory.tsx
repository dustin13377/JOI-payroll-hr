/**
 * /admin/payroll/prepay/history — Previous (locked) pre-payroll periods.
 *
 * Lists LOCKED payroll periods and shows each one's frozen snapshot from
 * prepay_lines (read-only history).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Lock, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatMXN } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_OPTIONS = [15, 50, 100];

interface LockedPeriod {
  id: string;
  period_code: string;
  start_date: string;
  end_date: string;
  locked_at: string | null;
}

interface LineRow {
  employee_id: string;
  net: number;
  base: number;
  missed_deduction: number;
  makeup_credit: number;
  overtime_pay: number;
  sunday_pay: number;
  vacation_premium: number;
  spiff_mxn: number;
  employees: { full_name: string; employee_id: string } | null;
}

export default function PrepayHistory() {
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  async function sendPaystubs(periodId: string) {
    setSending(periodId);
    try {
      const { data, error } = await supabase.functions.invoke("send-paystubs", {
        body: { period_id: periodId },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      toast({
        title: "Paystubs sent",
        description: `Sent ${data.sent}. Skipped ${data.skipped_count} (no personal email).`,
      });
    } catch (e) {
      toast({
        title: "Send failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(null);
    }
  }

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["prepay-locked-periods"],
    queryFn: async (): Promise<LockedPeriod[]> => {
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("id, period_code, start_date, end_date, locked_at")
        .eq("status", "LOCKED")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LockedPeriod[];
    },
  });

  const { data: lines = [], isLoading: linesLoading } = useQuery({
    queryKey: ["prepay-lines", selected],
    enabled: !!selected,
    queryFn: async (): Promise<LineRow[]> => {
      const { data, error } = await supabase
        .from("prepay_lines")
        .select(
          "employee_id, net, base, missed_deduction, makeup_credit, overtime_pay, sunday_pay, vacation_premium, spiff_mxn, employees(full_name, employee_id)"
        )
        .eq("period_id", selected as string);
      if (error) throw error;
      return (data ?? []) as unknown as LineRow[];
    },
  });

  const periodTotal = lines.reduce((s, l) => s + Number(l.net), 0);

  // TODO: switch to server-side .range() if this exceeds ~2k rows
  const totalPages = Math.max(1, Math.ceil(periods.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPeriods = periods.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/payroll/prepay" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Pre-Payroll
        </Link>
        <span>/</span>
        <span>Previous periods</span>
      </div>

      <h1 className="text-2xl font-bold">Previous periods</h1>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : periods.length === 0 ? (
        <div className="text-muted-foreground text-sm py-6 text-center border rounded-xl">
          No locked periods yet. Lock a period on the Pre-Payroll screen and it'll show here.
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedPeriods.map((p) => (
            <div key={p.id} className="border rounded-xl overflow-hidden">
              <button
                onClick={() => setSelected(selected === p.id ? null : p.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Lock className="h-4 w-4 text-muted-foreground" /> {p.period_code}
                  <span className="text-xs text-muted-foreground font-normal">
                    {p.start_date} – {p.end_date}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.locked_at ? `locked ${new Date(p.locked_at).toLocaleDateString("es-MX")}` : ""}
                </span>
              </button>

              {selected === p.id && (
                <div className="border-t px-4 py-3">
                  {linesLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading snapshot…
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                        <span className="text-sm text-muted-foreground">{lines.length} employees</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => sendPaystubs(p.id)}
                            disabled={sending === p.id}
                            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                          >
                            <Mail className="h-4 w-4" />
                            {sending === p.id ? "Sending…" : "Send paystubs"}
                          </button>
                          <span className="font-semibold text-blue-700">{formatMXN(periodTotal)}</span>
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase text-muted-foreground">
                            <th className="py-1">Employee</th>
                            <th className="py-1 text-right">Base</th>
                            <th className="py-1 text-right">Missed</th>
                            <th className="py-1 text-right">OT</th>
                            <th className="py-1 text-right">Spiff</th>
                            <th className="py-1 text-right">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((l) => (
                            <tr key={l.employee_id} className="border-t">
                              <td className="py-1">
                                {l.employees?.full_name ?? "—"}{" "}
                                <span className="text-xs text-muted-foreground">{l.employees?.employee_id}</span>
                              </td>
                              <td className="py-1 text-right">{formatMXN(Number(l.base))}</td>
                              <td className="py-1 text-right text-red-600">{formatMXN(Number(l.missed_deduction))}</td>
                              <td className="py-1 text-right text-emerald-600">{formatMXN(Number(l.overtime_pay))}</td>
                              <td className="py-1 text-right text-emerald-600">{formatMXN(Number(l.spiff_mxn))}</td>
                              <td className="py-1 text-right font-medium text-blue-700">{formatMXN(Number(l.net))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && periods.length > pageSize && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, periods.length)} of {periods.length}
            </span>
            <span className="mx-2">|</span>
            <span>Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Button key={p} variant={p === safePage ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p)}>
                {p}
              </Button>
            ))}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
