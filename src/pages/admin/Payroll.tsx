/**
 * /admin/payroll — Payroll landing page (Phase 4a)
 *
 * Shows the current open pay period, its weeks with status badges,
 * and an owner-only "Add Next Week" button.
 *
 * Phase 4b will add: period management, past-periods list, rates editor.
 * Phase 4c will add: CSV export, re-derive diff UI.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  PlusCircle,
  AlertCircle,
  Loader2,
  DollarSign,
  CalendarCheck,
  CalendarRange,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCurrentPayPeriod,
  useWeeksInPeriod,
  useCreateNextWeek,
  useCanCreateWeek,
  type PayrollWeek,
} from "@/hooks/usePayroll";
import { formatMXN } from "@/lib/formatCurrency";

/* ------------------------------------------------------------------ */
/*  Status badge                                                        */
/* ------------------------------------------------------------------ */

function WeekStatusBadge({ status }: { status: PayrollWeek["status"] }) {
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
/*  Period status badge                                                 */
/* ------------------------------------------------------------------ */

function PeriodStatusBadge({ status }: { status: "OPEN" | "LOCKED" }) {
  if (status === "LOCKED") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
        ✅ PAID / LOCKED
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100">
      🟡 OPEN
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Date formatting helper                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function Payroll() {
  const { toast } = useToast();
  const canCreateWeek = useCanCreateWeek();

  const {
    data: period,
    isLoading: periodLoading,
    error: periodError,
  } = useCurrentPayPeriod();

  const {
    data: weeks = [],
    isLoading: weeksLoading,
  } = useWeeksInPeriod(period?.id ?? null);

  const createNextWeek = useCreateNextWeek();

  const [creating, setCreating] = useState(false);

  const totalPay = weeks.reduce((_sum, _w) => _sum, 0); // placeholder — week-level totals come in 4b

  async function handleAddNextWeek() {
    if (!period) return;
    setCreating(true);
    try {
      await createNextWeek.mutateAsync({
        periodId: period.id,
        existingWeeks: weeks,
        period,
      });
      toast({ title: "Week added", description: "Auto-derived records from time_clock." });
    } catch (err: unknown) {
      toast({
        title: "Failed to add week",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  /* -- loading state -- */
  if (periodLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* -- error state -- */
  if (periodError) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load pay period: {periodError.message}</span>
        </div>
      </div>
    );
  }

  /* -- no active period -- */
  if (!period) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Payroll</h1>
        <p className="text-muted-foreground mb-6">Weekly pay period management</p>

        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
            <div>
              <p className="font-semibold text-lg">No active pay period</p>
              <p className="text-muted-foreground text-sm mt-1">
                Pay period management (create / close periods) is coming in Phase 4b.
              </p>
            </div>
            {canCreateWeek && (
              <p className="text-xs text-muted-foreground border rounded px-3 py-2 bg-muted">
                As owner, you'll be able to create a new period from the Periods screen in Phase 4b.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  /* -- normal state: period exists -- */
  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-muted-foreground">Weekly pay period management</p>
        </div>
        {canCreateWeek && (
          <Button
            onClick={handleAddNextWeek}
            disabled={creating || createNextWeek.isPending || period.status === "LOCKED"}
            size="sm"
          >
            {creating || createNextWeek.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4 mr-2" />
            )}
            Add Next Week
          </Button>
        )}
      </div>

      {/* Current period summary card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {period.period_code ?? `Period ${period.year}/${period.half}`}
              </CardTitle>
              <CardDescription>
                {formatDateRange(period.start_date, period.end_date)}
              </CardDescription>
            </div>
            <PeriodStatusBadge status={period.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Weeks</p>
              <p className="font-semibold text-base">{weeks.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Period half</p>
              <p className="font-semibold text-base">{period.half ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total pay (all weeks)</p>
              <p className="font-semibold text-base text-primary">
                {weeks.length === 0 ? "—" : "See week view"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weeks list */}
      <div>
        <h2 className="text-base font-semibold mb-3">Weeks in this period</h2>

        {weeksLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading weeks…</span>
          </div>
        ) : weeks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground text-sm">
                No weeks yet.{" "}
                {canCreateWeek
                  ? 'Click "Add Next Week" to create the first one.'
                  : "Ask the owner to create the first week."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {weeks.map((week) => (
              <Link
                key={week.id}
                to={`/admin/payroll/week/${week.id}`}
                className="block"
              >
                <Card className="hover:shadow-sm transition-shadow cursor-pointer hover:border-primary/40">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                          {week.week_number}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm">
                            Week {week.week_number}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {formatDateRange(week.week_start, week.week_end)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <WeekStatusBadge status={week.status} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Phase 4b — quick-link cards */}
      <div className="pt-4 border-t">
        <h2 className="text-base font-semibold mb-3">More</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link to="/admin/payroll/rates" className="block">
            <Card className="hover:shadow-sm transition-shadow cursor-pointer hover:border-primary/40 h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                  <DollarSign className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Pay Rates</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Edit weekly base, KPI bonus, daily rates. Bulk-apply raises.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/admin/payroll/holidays" className="block">
            <Card className="hover:shadow-sm transition-shadow cursor-pointer hover:border-primary/40 h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                  <CalendarCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Holidays</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    LFT Article 74 calendar. Drives holiday-pay auto-derive.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/admin/payroll/periods" className="block">
            <Card className="hover:shadow-sm transition-shadow cursor-pointer hover:border-primary/40 h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                  <CalendarRange className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Periods</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Historical browser of open + locked pay periods.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground pt-2">
        Per-agent breakdown is reachable by clicking an employee name in any week view.
        Re-derive diff dialog + CSV export are coming in Phase 4c.
      </p>
    </div>
  );
}
