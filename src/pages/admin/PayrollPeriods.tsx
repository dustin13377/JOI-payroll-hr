/**
 * /admin/payroll/periods — Pay Periods Management (Phase 4b)
 *
 * Read-only historical browser of pay periods.
 *   - List open + locked periods with grand totals + agent counts.
 *   - Filter by status + year.
 *   - Click a period to jump to the landing page (which shows that period's weeks).
 *
 * Locking + creating periods happens elsewhere:
 *   - "Add Next Week" is on /admin/payroll (landing)
 *   - "Mark Period PAID" is in the week view
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarRange,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  useAllPeriodsWithSummaries,
  type PeriodWithSummary,
} from "@/hooks/usePayroll";
import { formatMXN } from "@/lib/formatCurrency";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function PeriodStatusBadge({ status }: { status: "OPEN" | "LOCKED" }) {
  if (status === "LOCKED") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
        ✅ LOCKED
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100">
      🟡 OPEN
    </Badge>
  );
}

function formatDateRange(start: string, end: string): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-");
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatLockedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

type StatusFilter = "__all__" | "OPEN" | "LOCKED";

export default function PayrollPeriods() {
  const currentYear = new Date().getFullYear();
  const { data: periods = [], isLoading, error } =
    useAllPeriodsWithSummaries(48); // up to ~4 years of bi-monthly periods

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("__all__");
  const [yearFilter, setYearFilter] = useState<string>("__all__");

  // Derived year options from the loaded data
  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    periods.forEach((p) => {
      if (p.year != null) set.add(p.year);
      else if (p.end_date) set.add(Number(p.end_date.slice(0, 4)));
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [periods]);

  const filtered = useMemo(() => {
    return periods.filter((p) => {
      if (statusFilter !== "__all__" && p.status !== statusFilter) return false;
      if (yearFilter !== "__all__") {
        const y = p.year ?? Number(p.end_date?.slice(0, 4) ?? 0);
        if (String(y) !== yearFilter) return false;
      }
      return true;
    });
  }, [periods, statusFilter, yearFilter]);

  const stats = useMemo(() => {
    let lockedYtd = 0;
    let openTotal = 0;
    let openCount = 0;
    let openPeriodCode: string | null = null;
    for (const p of periods) {
      const y = p.year ?? Number(p.end_date?.slice(0, 4) ?? 0);
      if (p.status === "LOCKED" && y === currentYear) lockedYtd += p.grand_total;
      if (p.status === "OPEN") {
        openCount++;
        openTotal += p.grand_total;
        if (!openPeriodCode) openPeriodCode = p.period_code;
      }
    }
    return {
      lockedYtd: Math.round(lockedYtd * 100) / 100,
      openTotal: Math.round(openTotal * 100) / 100,
      openCount,
      openPeriodCode,
    };
  }, [periods, currentYear]);

  return (
    <div className="p-6 max-w-5xl space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link to="/admin/payroll" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />
            Payroll
          </Link>
          <span>/</span>
          <span>Periods</span>
        </div>
        <h1 className="text-2xl font-bold">Pay Periods</h1>
        <p className="text-muted-foreground text-sm">
          Historical browser of all pay periods. Read-only. "Add Next Week" lives on the Payroll landing
          page; "Mark Period PAID" lives in the week view.
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Locked YTD ({currentYear})
            </p>
            <p className="text-2xl font-bold mt-1">{formatMXN(stats.lockedYtd)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Currently Open
            </p>
            <p className="text-2xl font-bold mt-1">
              {stats.openCount === 0 ? "—" : stats.openPeriodCode ?? `${stats.openCount} open`}
            </p>
            {stats.openCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatMXN(stats.openTotal)} accumulating
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Total Periods
            </p>
            <p className="text-2xl font-bold mt-1">{periods.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Showing last {periods.length} of all time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="LOCKED">Locked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Year</Label>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filtered.length}</span> shown
          </div>
        </CardContent>
      </Card>

      {/* Period list */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive p-4">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load: {error.message}</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarRange className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">
              No periods match the current filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Period</th>
                  <th className="p-3">Range</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Weeks</th>
                  <th className="p-3 text-right">Agents</th>
                  <th className="p-3 text-right">Grand Total</th>
                  <th className="p-3">Locked At</th>
                  <th className="p-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: PeriodWithSummary) => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs">
                      {p.period_code ?? `${p.year ?? "—"}/${p.half ?? "—"}`}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatDateRange(p.start_date, p.end_date)}
                    </td>
                    <td className="p-3">
                      <PeriodStatusBadge status={p.status} />
                    </td>
                    <td className="p-3 text-right">{p.week_count}</td>
                    <td className="p-3 text-right">{p.agent_count}</td>
                    <td className="p-3 text-right font-semibold">
                      {formatMXN(p.grand_total)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatLockedAt(p.locked_at)}
                    </td>
                    <td className="p-3">
                      <Link to={`/admin/payroll`} className="inline-flex" title="View weeks">
                        <ChevronRight className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Click any period to navigate to the Payroll landing page (currently shows the open period only;
        full historical drill-down arrives in Phase 4c).
      </p>
    </div>
  );
}
