/**
 * /admin/payroll/prepay — Pre-Payroll (new quincenal screen).
 *
 * Per-employee net pay for the selected pay period, computed from the time
 * clock via usePayrollComputed + payrollEngine. Quincenal: Pay Period 1 = 1–15,
 * Pay Period 2 = 16–end. Toggle between them (PP2 viewable before it starts).
 *
 * Base = monthly/2; missed days docked; off-days worked split into makeup
 * (cover a miss) vs overtime ($1,000); Sunday +25%; vacation +25%; holiday 2×.
 * Coming next: spiff pull (USD→MXN) + click-to-override each day.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Wallet,
  CalendarMinus,
  Sun,
  Umbrella,
  Clock,
  Gift,
  Undo2,
  Lock,
} from "lucide-react";
import { useCurrentPayPeriod } from "@/hooks/usePayroll";
import { usePayrollComputed } from "@/hooks/usePayrollComputed";
import { usePrepayLock } from "@/hooks/usePrepayLock";
import { useToast } from "@/hooks/use-toast";
import { computeNetPay, classifyOffDays } from "@/lib/payrollEngine";
import { formatMXN } from "@/lib/formatCurrency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function cellClass(kind: string): string {
  switch (kind) {
    case "worked":
    case "makeup":
      return "bg-emerald-100 text-emerald-700";
    case "missed":
      return "bg-red-100 text-red-700";
    case "overtime":
      return "bg-amber-100 text-amber-700";
    case "vacation":
      return "bg-blue-100 text-blue-700";
    case "holiday":
    case "holiday_worked":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function netTotal(
  list?: {
    monthlyBaseSalary: number;
    daysAbsent: number;
    extraDaysWorked: number;
    sundaysWorked: number;
    timeOffDays: number;
    holidayDaysWorked: number;
  }[]
): number {
  return (list ?? []).reduce((s, c) => {
    const { makeupDays, overtimeDays } = classifyOffDays(c.daysAbsent, c.extraDaysWorked);
    return (
      s +
      computeNetPay({
        monthlyBase: c.monthlyBaseSalary,
        missedDays: c.daysAbsent,
        makeupDays,
        overtimeDays,
        sundaysWorked: c.sundaysWorked,
        vacationDays: c.timeOffDays,
        holidayDaysWorked: c.holidayDaysWorked,
      }).net
    );
  }, 0);
}

interface ChipProps {
  icon: ReactNode;
  label: string;
  value: number;
  sign?: "+" | "-" | "";
  sub?: string;
}
function Chip({ icon, label, value, sign = "", sub }: ChipProps) {
  const zero = value === 0;
  const color = zero
    ? "text-muted-foreground"
    : sign === "-"
    ? "text-red-600"
    : sign === "+"
    ? "text-emerald-600"
    : "text-foreground";
  const display = (sign && !zero ? sign : "") + formatMXN(value);
  return (
    <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-sm font-medium ${color}`}>{display}</div>
        {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

export default function PrePayroll() {
  const { data: period, isLoading: periodLoading, error: periodError } = useCurrentPayPeriod();
  const [half, setHalf] = useState<"pp1" | "pp2" | null>(null);

  const monthInfo = useMemo(() => {
    if (!period) return null;
    const [y, m] = period.start_date.split("-").map(Number);
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(y, m, 0).getDate();
    const monthName = new Date(y, m - 1, 1).toLocaleDateString("es-MX", {
      month: "long",
      year: "numeric",
    });
    return {
      monthName,
      defaultHalf: Number(period.start_date.split("-")[2]) >= 16 ? ("pp2" as const) : ("pp1" as const),
      pp1: { id: `${y}-${mm}-PP1`, start: `${y}-${mm}-01`, end: `${y}-${mm}-15`, label: "Pay Period 1", range: "1–15" },
      pp2: {
        id: `${y}-${mm}-PP2`,
        start: `${y}-${mm}-16`,
        end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
        label: "Pay Period 2",
        range: `16–${lastDay}`,
      },
    };
  }, [period]);

  const activeHalf = half ?? monthInfo?.defaultHalf ?? "pp1";
  const sel = monthInfo ? monthInfo[activeHalf] : null;

  const pp1q = usePayrollComputed(monthInfo?.pp1.id, monthInfo?.pp1.start, monthInfo?.pp1.end);
  const pp2q = usePayrollComputed(monthInfo?.pp2.id, monthInfo?.pp2.start, monthInfo?.pp2.end);
  const computed = (activeHalf === "pp1" ? pp1q.data : pp2q.data) ?? [];
  const computedLoading = activeHalf === "pp1" ? pp1q.isLoading : pp2q.isLoading;
  const monthTotal = netTotal(pp1q.data) + netTotal(pp2q.data);
  const lock = usePrepayLock();
  const { toast } = useToast();

  // Pull spiffs for the selected period (entered in the Spiffs page, in USD)
  const { data: spiffRows = [] } = useQuery({
    queryKey: ["prepay-spiffs", sel?.start, sel?.end],
    enabled: !!sel,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spiffs")
        .select("employee_id, amount_usd")
        .gte("spiff_date", sel!.start)
        .lte("spiff_date", sel!.end)
        .neq("status", "void");
      if (error) throw error;
      return (data ?? []) as { employee_id: string; amount_usd: number }[];
    },
  });
  const spiffUsdByEmp = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spiffRows) m.set(s.employee_id, (m.get(s.employee_id) ?? 0) + Number(s.amount_usd));
    return m;
  }, [spiffRows]);

  const rows = useMemo(() => {
    return computed
      .map((c) => {
        const { makeupDays, overtimeDays } = classifyOffDays(c.daysAbsent, c.extraDaysWorked);
        const spiffUsd = spiffUsdByEmp.get(c.employeeId) ?? 0;
        const r = computeNetPay({
          monthlyBase: c.monthlyBaseSalary,
          missedDays: c.daysAbsent,
          makeupDays,
          overtimeDays,
          sundaysWorked: c.sundaysWorked,
          vacationDays: c.timeOffDays,
          holidayDaysWorked: c.holidayDaysWorked,
          spiffUsd,
        });
        let mkLeft = makeupDays;
        const bar = c.days.map((d) => {
          let kind: string = d.status;
          if (d.status === "extra") {
            if (mkLeft > 0) { kind = "makeup"; mkLeft--; } else { kind = "overtime"; }
          }
          return { date: d.date, dow: d.dow, kind };
        });
        return { c, r, makeupDays, overtimeDays, bar, spiffUsd };
      })
      .sort((a, b) => a.c.fullName.localeCompare(b.c.fullName));
  }, [computed, spiffUsdByEmp]);

  const grand = rows.reduce((s, x) => s + x.r.net, 0);

  async function handleLock() {
    if (!period || !sel || !monthInfo) return;
    const ok = window.confirm(
      `Lock ${sel.label} (${monthInfo.monthName})? This freezes everyone's pay for this period and opens the next one.`
    );
    if (!ok) return;
    try {
      const lines = rows.map(({ c, r, makeupDays, overtimeDays }) => ({
        employee_id: c.employeeId,
        monthly_base: c.monthlyBaseSalary,
        missed_days: c.daysAbsent,
        makeup_days: makeupDays,
        overtime_days: overtimeDays,
        sundays_worked: c.sundaysWorked,
        vacation_days: c.timeOffDays,
        base: r.base,
        missed_deduction: r.missedDeduction,
        makeup_credit: r.makeupCredit,
        overtime_pay: r.overtimePay,
        sunday_pay: r.sundayPay,
        vacation_premium: r.vacationPremium,
        holiday_pay: r.holidayPay,
        spiff_mxn: r.spiffMxn,
        net: r.net,
      }));
      const [py, pm] = period.start_date.split("-").map(Number);
      const res = await lock.mutateAsync({
        period: { id: period.id, year: py, month: pm, half: period.half as "PP1" | "PP2" },
        lines,
      });
      toast({ title: "Period locked", description: `Froze ${lines.length} employees. Opened ${res.nextPeriodCode}.` });
    } catch (e) {
      toast({
        title: "Lock failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  if (periodLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (periodError) {
    return (
      <div className="p-6 flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>Failed to load pay period: {periodError.message}</span>
      </div>
    );
  }
  if (!period || !monthInfo || !sel) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Pre-Payroll</h1>
        <p className="text-muted-foreground">No active pay period. Open one from Periods first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Link to="/admin/payroll" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Payroll
          </Link>
          <span>/</span>
          <span>Pre-Payroll</span>
        </div>
        <Link to="/admin/payroll/prepay/history" className="hover:text-foreground underline">
          Previous periods
        </Link>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pre-Payroll</h1>
          <p className="text-muted-foreground text-sm capitalize">
            {monthInfo.monthName} · {sel.label} ({sel.range})
          </p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-lg bg-blue-50 px-4 py-2 text-right">
            <div className="text-[11px] uppercase tracking-wide text-blue-700">{sel.label} total</div>
            <div className="text-2xl font-semibold text-blue-700">{formatMXN(grand)}</div>
          </div>
          <div className="rounded-lg bg-blue-100 px-4 py-2 text-right">
            <div className="text-[11px] uppercase tracking-wide text-blue-800">Month total · both periods</div>
            <div className="text-2xl font-semibold text-blue-800">{formatMXN(monthTotal)}</div>
          </div>
        </div>
      </div>

      {/* Pay period toggle */}
      <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
        {(["pp1", "pp2"] as const).map((h) => (
          <button
            key={h}
            onClick={() => setHalf(h)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeHalf === h ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            {monthInfo[h].label} <span className="text-xs opacity-70">({monthInfo[h].range})</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {period.half === (activeHalf === "pp1" ? "PP1" : "PP2") ? (
          <button
            onClick={handleLock}
            disabled={lock.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {lock.isPending ? "Locking…" : `Close & Lock ${sel.label}`}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">
            Viewing {sel.label} — lock is available on the current open period
            ({period.half === "PP1" ? "Pay Period 1" : "Pay Period 2"}).
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground border rounded-lg px-3 py-2 bg-muted/40">
        <span className="font-medium text-foreground">Day colors:</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted border" /> off · already paid</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100" /> worked / makeup (↩)</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100" /> missed</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100" /> overtime +$1,000</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100" /> vacation</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-100" /> holiday</span>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Auto from the time clock · Base = monthly ÷ 2, daily = monthly ÷ 30, overtime $1,000/day, Sunday +25%.
        Spiffs (USD→MXN) and click-to-override land next.
      </p>

      {computedLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Computing from time clock…
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ c, r, makeupDays, overtimeDays, bar, spiffUsd }) => (
            <div key={c.employeeId} className="bg-card border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="font-medium">{c.fullName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.employeeDisplayId} · {c.campaignName ?? "—"} · {formatMXN(c.monthlyBaseSalary)}/mo
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-blue-700">Net pay</div>
                  <div className="text-lg font-semibold text-blue-700">{formatMXN(r.net)}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 mb-3">
                {bar.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date} · ${d.kind}`}
                    className={`w-[26px] h-9 rounded flex flex-col items-center justify-center text-[8px] leading-tight ${cellClass(d.kind)}`}
                  >
                    <span className="text-[10px] font-medium">{Number(d.date.split("-")[2])}</span>
                    <span>{d.kind === "makeup" ? "↩" : DOW[d.dow]}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Chip icon={<Wallet className="h-4 w-4" />} label="Base ½" value={r.base} />
                <Chip icon={<CalendarMinus className="h-4 w-4" />} label="Missed" value={r.missedDeduction} sign="-" sub={c.daysAbsent ? `${c.daysAbsent} days` : "none"} />
                <Chip icon={<Undo2 className="h-4 w-4" />} label="Makeup" value={r.makeupCredit} sign="+" sub={makeupDays ? `${makeupDays} made up` : "none"} />
                <Chip icon={<Sun className="h-4 w-4" />} label="Sunday" value={r.sundayPay} sign="+" sub={c.sundaysWorked ? `${c.sundaysWorked} Sun` : "none"} />
                <Chip icon={<Umbrella className="h-4 w-4" />} label="Vacation +25%" value={r.vacationPremium} sign="+" sub={c.timeOffDays ? `${c.timeOffDays} days` : "none"} />
                <Chip icon={<Clock className="h-4 w-4" />} label="Overtime" value={r.overtimePay} sign="+" sub={overtimeDays ? `${overtimeDays} × $1,000` : "none"} />
                <Chip icon={<Gift className="h-4 w-4" />} label="Spiff" value={r.spiffMxn} sign="+" sub={spiffUsd ? `$${spiffUsd} USD @17` : "none"} />
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="text-muted-foreground text-sm py-6 text-center border rounded-xl">
              No employees computed for this period.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
