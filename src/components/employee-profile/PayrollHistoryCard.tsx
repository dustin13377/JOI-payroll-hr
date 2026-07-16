import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatMXN } from "@/lib/formatCurrency";
import { formatDateUSShort } from "@/lib/localDate";

/**
 * Per-employee payroll history on EmpleadoPerfil.
 *
 * Visible to owner + admin (HR) ONLY — payroll numbers. Managers are excluded
 * here and by RLS on prepay_lines (is_owner_or_admin()).
 *
 * Source of truth = prepay_lines (the locked quincenal / half-month snapshots
 * written when the owner locks a period on the Pre-Payroll screen), joined to
 * payroll_periods for the period window. One row per locked period.
 *
 * IMPORTANT — history only exists from ~May 2026, when the app started locking
 * periods. Anyone hired before that has earlier pay only in the legacy payroll
 * sheets (Joe's Google Sheets), NOT in this app. We surface that as a note so
 * the gap doesn't read as missing data.
 *
 * "Hours worked" is not stored on prepay_lines — we derive it per period by
 * summing net punch time from time_clock (clock_out − clock_in − breaks),
 * matching how the rest of the app computes worked hours.
 */

interface Props {
  employeeUuid: string;   // employees.id (UUID)
  employeeCode: string;   // human code, e.g. EMP-035 (for the CSV filename)
  employeeName: string;   // for the CSV header
}

type PeriodEmbed = {
  period_code: string;
  start_date: string;   // YYYY-MM-DD
  end_date: string;     // YYYY-MM-DD
  status: string;
};

type PrepayRow = {
  period_id: string;
  monthly_base: number | null;
  base: number | null;
  kpi_bonus: number | null;
  spiff_mxn: number | null;
  overtime_pay: number | null;
  sunday_pay: number | null;
  vacation_premium: number | null;
  holiday_pay: number | null;
  missed_days: number | null;
  missed_deduction: number | null;
  partial_day_deduction: number | null;
  net: number | null;
  payroll_periods: PeriodEmbed | null;
};

type PunchRow = {
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  break1_start: string | null;
  break1_end: string | null;
  break2_start: string | null;
  break2_end: string | null;
};

// One assembled, display-ready history row.
type HistoryRow = {
  periodCode: string;
  start: string;
  end: string;
  base: number;
  kpi: number;
  spiff: number;
  overtime: number;
  sundayPay: number;
  vacationPremium: number;
  holidayPay: number;
  missedDays: number;
  missedDeduction: number;
  partialDeduction: number;
  hoursWorked: number;
  net: number;
};

const n = (v: number | null | undefined): number => Number(v ?? 0) || 0;

// Net worked hours for a single punch row: elapsed minus lunch + both breaks.
// Returns 0 for incomplete punches (no clock-out) — same treatment as pay calc.
function punchNetHours(r: PunchRow): number {
  if (!r.clock_in || !r.clock_out) return 0;
  let ms = new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime();
  const subtract = (a: string | null, b: string | null) => {
    if (a && b) ms -= new Date(b).getTime() - new Date(a).getTime();
  };
  subtract(r.lunch_start, r.lunch_end);
  subtract(r.break1_start, r.break1_end);
  subtract(r.break2_start, r.break2_end);
  const hours = ms / 3_600_000;
  return hours > 0 ? hours : 0;
}

export function PayrollHistoryCard({ employeeUuid, employeeCode, employeeName }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payroll-history", employeeUuid],
    queryFn: async (): Promise<HistoryRow[]> => {
      // 1) Locked-period snapshots for this employee.
      const { data: lines, error } = await supabase
        .from("prepay_lines")
        .select(
          "period_id, monthly_base, base, kpi_bonus, spiff_mxn, overtime_pay, sunday_pay, vacation_premium, holiday_pay, missed_days, missed_deduction, partial_day_deduction, net, payroll_periods!inner(period_code, start_date, end_date, status)"
        )
        .eq("employee_id", employeeUuid);
      if (error) throw error;

      const prepay = (lines || []) as unknown as PrepayRow[];
      if (prepay.length === 0) return [];

      // 2) Pull the punches spanning all periods once, then bucket by period.
      const starts = prepay.map((p) => p.payroll_periods?.start_date).filter(Boolean) as string[];
      const ends = prepay.map((p) => p.payroll_periods?.end_date).filter(Boolean) as string[];
      const spanStart = starts.sort()[0];
      const spanEnd = ends.sort()[ends.length - 1];

      let punches: PunchRow[] = [];
      if (spanStart && spanEnd) {
        const { data: tc, error: tcErr } = await supabase
          .from("time_clock")
          .select(
            "date, clock_in, clock_out, lunch_start, lunch_end, break1_start, break1_end, break2_start, break2_end"
          )
          .eq("employee_id", employeeUuid)
          .gte("date", spanStart)
          .lte("date", spanEnd);
        if (tcErr) throw tcErr;
        punches = (tc || []) as PunchRow[];
      }

      const assembled: HistoryRow[] = prepay
        .filter((p) => p.payroll_periods)
        .map((p) => {
          const pd = p.payroll_periods!;
          const hoursWorked = punches
            .filter((t) => t.date >= pd.start_date && t.date <= pd.end_date)
            .reduce((sum, t) => sum + punchNetHours(t), 0);
          return {
            periodCode: pd.period_code,
            start: pd.start_date,
            end: pd.end_date,
            base: n(p.base),
            kpi: n(p.kpi_bonus),
            spiff: n(p.spiff_mxn),
            overtime: n(p.overtime_pay),
            sundayPay: n(p.sunday_pay),
            vacationPremium: n(p.vacation_premium),
            holidayPay: n(p.holiday_pay),
            missedDays: n(p.missed_days),
            missedDeduction: n(p.missed_deduction),
            partialDeduction: n(p.partial_day_deduction),
            hoursWorked,
            net: n(p.net),
          };
        })
        // Newest period first.
        .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));

      return assembled;
    },
    enabled: !!employeeUuid,
  });

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        base: acc.base + r.base,
        kpi: acc.kpi + r.kpi,
        spiff: acc.spiff + r.spiff,
        missedDays: acc.missedDays + r.missedDays,
        hoursWorked: acc.hoursWorked + r.hoursWorked,
        net: acc.net + r.net,
      }),
      { base: 0, kpi: 0, spiff: 0, missedDays: 0, hoursWorked: 0, net: 0 }
    );
  }, [rows]);

  function downloadCsv() {
    const headers = [
      "Period",
      "Start",
      "End",
      "Base",
      "KPI Bonus",
      "Spiff (MXN)",
      "Overtime Pay",
      "Sunday Pay",
      "Vacation Premium",
      "Holiday Pay",
      "Days Missed",
      "Missed Deduction",
      "Partial-Day Deduction",
      "Hours Worked",
      "Net Pay",
    ];
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const money = (v: number) => v.toFixed(2);
    const body = rows.map((r) =>
      [
        r.periodCode,
        r.start,
        r.end,
        money(r.base),
        money(r.kpi),
        money(r.spiff),
        money(r.overtime),
        money(r.sundayPay),
        money(r.vacationPremium),
        money(r.holidayPay),
        r.missedDays,
        money(r.missedDeduction),
        money(r.partialDeduction),
        r.hoursWorked.toFixed(1),
        money(r.net),
      ]
        .map(esc)
        .join(",")
    );
    const meta = `# Payroll history — ${employeeName} (${employeeCode})`;
    const note =
      "# History begins May 2026 (first locked period in this app). Earlier pay is in the legacy payroll sheets.";
    const csv = [meta, note, headers.join(","), ...body].join("\n") + "\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll_history_${employeeCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">Payroll History</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadCsv}
          disabled={rows.length === 0}
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No locked payroll periods for this employee yet. Periods appear here once
            they're locked on the Pre-Payroll screen.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Period</th>
                  <th className="py-2 px-3 font-medium text-right">Base</th>
                  <th className="py-2 px-3 font-medium text-right">KPI</th>
                  <th className="py-2 px-3 font-medium text-right">Spiff</th>
                  <th className="py-2 px-3 font-medium text-right">Days Missed</th>
                  <th className="py-2 px-3 font-medium text-right">Hours Worked</th>
                  <th className="py-2 pl-3 font-medium text-right">Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.periodCode} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {formatDateUSShort(r.start)} – {formatDateUSShort(r.end)}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">{formatMXN(r.base)}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">{formatMXN(r.kpi)}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">{formatMXN(r.spiff)}</td>
                    <td className="py-2 px-3 text-right">{r.missedDays}</td>
                    <td className="py-2 px-3 text-right">{r.hoursWorked.toFixed(1)}</td>
                    <td className="py-2 pl-3 text-right font-medium whitespace-nowrap">{formatMXN(r.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">{formatMXN(totals.base)}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">{formatMXN(totals.kpi)}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">{formatMXN(totals.spiff)}</td>
                  <td className="py-2 px-3 text-right">{totals.missedDays}</td>
                  <td className="py-2 px-3 text-right">{totals.hoursWorked.toFixed(1)}</td>
                  <td className="py-2 pl-3 text-right whitespace-nowrap">{formatMXN(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3">
          History begins May 2026 — the first period locked in this app. Pay before then
          lives in the legacy payroll sheets, not here. Hours worked are derived from
          timeclock punches (elapsed time minus lunch and breaks).
        </p>
      </CardContent>
    </Card>
  );
}
