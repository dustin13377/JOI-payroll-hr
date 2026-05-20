/**
 * /admin/payroll/agent/[id] — Per-Agent YTD Breakdown (Phase 4b)
 *
 * Shows one employee's full payroll history:
 *   - YTD totals at top (current calendar year)
 *   - Sections grouped by pay period, most recent first
 *   - Each section: table of weeks with status, key inputs, and totals
 *   - Click any row to jump to the week view at that week
 *
 * Read-only (no editing here — that lives in the week view).
 * RLS-scoped (manager only sees their campaigns).
 */

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Edit3,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useAgentPayHistory,
  useEmployeeForPayroll,
  useEmployeeVacationBalance,
  type AgentHistoryRow,
  type WeekStatus,
} from "@/hooks/usePayroll";
import { formatMXN } from "@/lib/formatCurrency";

/* ------------------------------------------------------------------ */
/*  Status badge (matches Phase 4a)                                     */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: WeekStatus }) {
  if (status === "PAID") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
        ✅ PAID
      </Badge>
    );
  }
  if (status === "COMPLETE") {
    return (
      <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100">
        🔵 COMPLETE
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100">
      🟡 UNPAID
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Date helpers                                                        */
/* ------------------------------------------------------------------ */

function formatDateRange(start: string, end: string): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-");
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function yearOf(dateStr: string): number {
  return Number(dateStr.split("-")[0]);
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function PayrollAgent() {
  const { id } = useParams<{ id: string }>();
  const { data: emp, isLoading: empLoading, error: empError } =
    useEmployeeForPayroll(id ?? null);
  const { data: history = [], isLoading: histLoading, error: histError } =
    useAgentPayHistory(id ?? null);
  const { data: vacation } = useEmployeeVacationBalance(id ?? null);

  const currentYear = new Date().getFullYear();

  // YTD totals + per-period grouping
  const { ytdTotal, paidYtd, byPeriod } = useMemo(() => {
    let ytd = 0;
    let paid = 0;
    const groups = new Map<
      string,
      { period_id: string; period_code: string | null; rows: AgentHistoryRow[]; total: number; paid: number }
    >();

    for (const r of history) {
      if (yearOf(r.week_end) === currentYear) {
        ytd += r.total_pay;
        if (r.status === "PAID") paid += r.total_pay;
      }
      const key = r.period_id;
      if (!groups.has(key)) {
        groups.set(key, {
          period_id: r.period_id,
          period_code: r.period_code,
          rows: [],
          total: 0,
          paid: 0,
        });
      }
      const g = groups.get(key)!;
      g.rows.push(r);
      g.total += r.total_pay;
      if (r.status === "PAID") g.paid += r.total_pay;
    }

    // Sort each period's rows by week_end desc
    for (const g of groups.values()) {
      g.rows.sort((a, b) => (a.week_end < b.week_end ? 1 : -1));
    }

    // Sort periods by first row's week_end desc
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const aEnd = a.rows[0]?.week_end ?? "";
      const bEnd = b.rows[0]?.week_end ?? "";
      return aEnd < bEnd ? 1 : -1;
    });

    return {
      ytdTotal: Math.round(ytd * 100) / 100,
      paidYtd: Math.round(paid * 100) / 100,
      byPeriod: sortedGroups,
    };
  }, [history, currentYear]);

  if (empLoading || histLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const error = empError ?? histError;
  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load: {error.message}</span>
        </div>
      </div>
    );
  }

  if (!emp) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Employee not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link to="/admin/payroll" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />
            Payroll
          </Link>
          <span>/</span>
          <span>{emp.work_name || emp.full_name}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{emp.work_name || emp.full_name}</h1>
            <p className="text-muted-foreground text-sm">
              {emp.employee_id}
              {emp.campaign_name && <> · {emp.campaign_name}</>}
              {emp.department_name && <> · {emp.department_name}</>}
            </p>
          </div>
          <Link to={`/admin/payroll/rates?focus=${emp.id}`}>
            <Button variant="outline" size="sm">
              <Edit3 className="h-3.5 w-3.5 mr-2" />
              Edit rates
            </Button>
          </Link>
        </div>
      </div>

      {/* YTD + current rate summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              YTD Total ({currentYear})
            </p>
            <p className="text-2xl font-bold mt-1">{formatMXN(ytdTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatMXN(paidYtd)} paid
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Weekly Base
            </p>
            <p className="text-2xl font-bold mt-1">
              {emp.weekly_base_salary == null ? "—" : formatMXN(emp.weekly_base_salary)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Daily
            </p>
            <p className="text-2xl font-bold mt-1">
              {emp.daily_salary == null ? "—" : formatMXN(emp.daily_salary)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              KPI Bonus
            </p>
            <p className="text-2xl font-bold mt-1">
              {emp.kpi_bonus_amount == null ? "—" : formatMXN(emp.kpi_bonus_amount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Vacation balance — ADMIN-ONLY card. Never expose this on agent screens
          until D explicitly confirms. LFT Art. 76 entitlement vs. days used. */}
      {vacation && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span>Vacation balance</span>
              <Badge className="bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-100 text-[10px] font-normal">
                Admin-only — not visible to agents
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {vacation.entitled === 0 ? (
              <p className="text-sm text-muted-foreground">
                {vacation.hire_date == null
                  ? "Hire date not set — set it on the employee profile to compute entitlement."
                  : "Less than 1 year of service — not eligible yet under LFT Art. 76."}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Entitled (LFT)</p>
                  <p className="text-xl font-bold mt-0.5">{vacation.entitled} days</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Used</p>
                  <p className="text-xl font-bold mt-0.5">{vacation.used} days</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className={`text-xl font-bold mt-0.5 ${vacation.remaining === 0 ? "text-red-700" : "text-green-700"}`}>
                    {vacation.remaining} days
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Per-period sections */}
      {byPeriod.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">
              No payroll history yet for this employee.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {byPeriod.map((g) => (
            <Card key={g.period_id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {g.period_code ?? "Untitled period"}
                  </CardTitle>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Period total</p>
                    <p className="font-semibold">{formatMXN(g.total)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-y">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="p-2">Week</th>
                      <th className="p-2">Range</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Missed</th>
                      <th className="p-2 text-right">OT</th>
                      <th className="p-2 text-right">Sun</th>
                      <th className="p-2 text-right">Vac</th>
                      <th className="p-2 text-right">Hol</th>
                      <th className="p-2 text-right">KPI</th>
                      <th className="p-2 text-right">Spiff</th>
                      <th className="p-2 text-right">Total</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr
                        key={r.record_id}
                        className={`border-b last:border-b-0 hover:bg-muted/30 ${
                          !r.include_in_payroll ? "opacity-60" : ""
                        }`}
                      >
                        <td className="p-2 font-mono text-xs">W{r.week_number}</td>
                        <td className="p-2 text-xs">
                          {formatDateRange(r.week_start, r.week_end)}
                        </td>
                        <td className="p-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="p-2 text-right text-xs">{r.missed_days || ""}</td>
                        <td className="p-2 text-right text-xs">{r.overtime_days || ""}</td>
                        <td className="p-2 text-right text-xs">{r.sundays_worked || ""}</td>
                        <td className="p-2 text-right text-xs">{r.vacation_days || ""}</td>
                        <td className="p-2 text-right text-xs">{r.holiday_days || ""}</td>
                        <td className="p-2 text-right text-xs">
                          {r.kpi_achieved ? "✓" : ""}
                        </td>
                        <td className="p-2 text-right text-xs">
                          {r.extra_bonus > 0 ? formatMXN(r.extra_bonus) : ""}
                        </td>
                        <td className="p-2 text-right font-semibold">
                          {formatMXN(r.total_pay)}
                        </td>
                        <td className="p-2">
                          <Link
                            to={`/admin/payroll/week/${r.week_id}`}
                            className="inline-flex"
                          >
                            <ChevronRight className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
