import { useState } from "react";
import { useEmployees, useActivePeriod, useClosePeriod, useCreatePeriod, useHistoryRecords, getCurrentPeriodDates, formatPeriodLabel, recordToConfig } from "@/hooks/useSupabasePayroll";
import { EMPTY_PAYROLL_RESULT } from "@/types/payroll";
import { formatDateMX } from "@/lib/localDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Download, Lock, Search } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "MXN" });

interface HistoryDisplayRecord {
  id: string;
  periodLabel: string;
  periodId: string;
  employeeName: string;
  employeeId: string;
  netPay: number;
  closedDate: string;
  sueldoBase: number;
  config: {
    diasFaltados: number;
    diasExtra: number;
    kpiAplicado: boolean;
    primaDominical: boolean;
    diaFestivo: boolean;
    bonosAdicionales: number;
  };
  result: any;
}

interface PeriodGroup {
  periodId: string;
  periodLabel: string;
  closedDate: string;
  records: HistoryDisplayRecord[];
  employeeCount: number;
  totalPayout: number;
}

function generatePDF(record: HistoryDisplayRecord) {
  const doc = new jsPDF();
  const r = record.result;

  doc.setFontSize(18);
  doc.text("Payroll Receipt", 20, 20);
  doc.setFontSize(11);
  doc.text(`Period: ${record.periodLabel}`, 20, 30);
  doc.text(`Closed Date: ${record.closedDate}`, 20, 37);
  doc.text(`Employee: ${record.employeeName} (${record.employeeId})`, 20, 47);
  doc.text(`Monthly Base Salary: ${fmt(record.sueldoBase)}`, 20, 57);

  let y = 70;
  doc.setFontSize(13);
  doc.text("Breakdown", 20, y); y += 10;
  doc.setFontSize(10);

  const lines = [
    ["Biweekly Salary (Base/2)", fmt(r.sueldoQuincenal)],
    ["", ""],
    ["DEDUCTIONS", ""],
    [`Absences (${record.config.diasFaltados} days)`, `-${fmt(r.descuentoFaltas)}`],
    ["", ""],
    ["EXTRAS", ""],
    ["KPI", `+${fmt(r.montoKpi)}`],
    [`Extra Days (${record.config.diasExtra})`, `+${fmt(r.montoDiasExtra)}`],
    ["Sunday Premium", `+${fmt(r.montoPrimaDominical)}`],
    ["Holiday Worked", `+${fmt(r.montoDiaFestivo)}`],
    ["Additional Bonuses", `+${fmt(r.bonosAdicionales)}`],
    ["", ""],
    ["Total Deductions", `-${fmt(r.totalRetenciones)}`],
    ["Total Extras", `+${fmt(r.totalExtras)}`],
  ];

  lines.forEach(([label, val]) => {
    if (label === "") { y += 3; return; }
    if (label === "DEDUCTIONS" || label === "EXTRAS") {
      doc.setFont("helvetica", "bold");
      doc.text(label, 20, y);
      doc.setFont("helvetica", "normal");
    } else {
      doc.text(label, 25, y);
      doc.text(val, 170, y, { align: "right" });
    }
    y += 7;
  });

  y += 5;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("NET PAY", 20, y);
  doc.text(fmt(r.netoAPagar), 170, y, { align: "right" });

  doc.save(`nomina_${record.employeeId}_${record.periodLabel.replace(/ /g, "_")}.pdf`);
}

export default function Historial() {
  const { data: employees = [] } = useEmployees();
  const { data: activePeriod } = useActivePeriod();
  const { data: historyData = [], isLoading } = useHistoryRecords();
  const closePeriod = useClosePeriod();
  const createPeriod = useCreatePeriod();
  const [search, setSearch] = useState("");
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

  const periodLabel = formatPeriodLabel(activePeriod);

  const handleCerrarQuincena = () => {
    if (!activePeriod) return;

    closePeriod.mutate(activePeriod.id, {
      onSuccess: () => {
        createPeriod.mutate(getCurrentPeriodDates());
        toast.success(`Period "${periodLabel}" closed with ${employees.length} records`);
      },
      onError: (err: any) => toast.error(err.message || "Error closing period"),
    });
  };

  // Transform history data for display
  const historyRecords: HistoryDisplayRecord[] = historyData.map((rec: any) => {
    const emp = {
      id: rec.employees.employee_id,
      nombre: rec.employees.full_name,
      sueldoBase: Number(rec.employees.monthly_base_salary) || 0,
      descuentoPorDia: Number(rec.employees.daily_discount_rate) || 0,
      kpiMonto: Number(rec.employees.kpi_bonus_amount) || 0,
      turno: "Monday-Friday" as const,
    };
    // Phase 4b: calcularNomina() removed (throws). Placeholder net = 0.
    // Real per-period history will be rebuilt in Phase 4c against new schema.
    const result = EMPTY_PAYROLL_RESULT;

    return {
      id: rec.id,
      periodId: rec.payroll_periods.id,
      periodLabel: formatPeriodLabel(rec.payroll_periods),
      employeeName: rec.employees.full_name,
      employeeId: rec.employees.employee_id,
      netPay: result.netoAPagar,
      closedDate: formatDateMX(rec.updated_at),
      sueldoBase: emp.sueldoBase,
      config: {
        diasFaltados: rec.days_absent || 0,
        diasExtra: rec.extra_days_count || 0,
        kpiAplicado: rec.kpi_achieved || false,
        primaDominical: rec.sunday_premium_applied || false,
        diaFestivo: rec.holiday_worked || false,
        bonosAdicionales: Number(rec.additional_bonuses) || 0,
      },
      result,
    };
  });

  // Filter records by search
  const filtered = historyRecords.filter(
    (r) =>
      r.periodLabel.toLowerCase().includes(search.toLowerCase()) ||
      r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      r.employeeId.toLowerCase().includes(search.toLowerCase())
  );

  // Group by period
  const periodMap = new Map<string, PeriodGroup>();
  filtered.forEach((record) => {
    if (!periodMap.has(record.periodId)) {
      periodMap.set(record.periodId, {
        periodId: record.periodId,
        periodLabel: record.periodLabel,
        closedDate: record.closedDate,
        records: [],
        employeeCount: 0,
        totalPayout: 0,
      });
    }
    const group = periodMap.get(record.periodId)!;
    group.records.push(record);
    group.employeeCount = new Set(group.records.map(r => r.employeeId)).size;
    group.totalPayout = group.records.reduce((sum, r) => sum + r.netPay, 0);
  });

  const periods = Array.from(periodMap.values()).sort(
    (a, b) => new Date(b.closedDate).getTime() - new Date(a.closedDate).getTime()
  );

  const togglePeriod = (periodId: string) => {
    const newSet = new Set(expandedPeriods);
    if (newSet.has(periodId)) {
      newSet.delete(periodId);
    } else {
      newSet.add(periodId);
    }
    setExpandedPeriods(newSet);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Payroll History</h2>
        {activePeriod && (
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={employees.length === 0 || !activePeriod || closePeriod.isPending}>
                <Lock className="mr-2 h-4 w-4" /> Close Period
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you sure?</DialogTitle>
                <DialogDescription>
                  This will move the current period to history and it cannot be modified.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button onClick={handleCerrarQuincena} disabled={closePeriod.isPending}>
                  {closePeriod.isPending ? "Closing..." : "Close Period"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by period, name, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <LogoLoadingIndicator />
          </CardContent>
        </Card>
      ) : periods.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No records in history
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {periods.map((period) => (
            <Card key={period.periodId} className="overflow-hidden">
              <Collapsible open={expandedPeriods.has(period.periodId)} onOpenChange={() => togglePeriod(period.periodId)}>
                <CollapsibleTrigger asChild>
                  <div className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{period.periodLabel}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Closed: {period.closedDate}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 mr-4">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Employees</p>
                          <Badge variant="secondary">{period.employeeCount}</Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Total Pay</p>
                          <p className="font-semibold">{fmt(period.totalPayout)}</p>
                        </div>
                        {expandedPeriods.has(period.periodId) ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </CardHeader>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Absences</TableHead>
                          <TableHead className="text-right">KPI</TableHead>
                          <TableHead className="text-right">Extra Days</TableHead>
                          <TableHead className="text-right">Bonuses</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {period.records.map((rec) => (
                          <TableRow key={rec.id}>
                            <TableCell className="font-medium text-sm">{rec.employeeId}</TableCell>
                            <TableCell>{rec.employeeName}</TableCell>
                            <TableCell className="text-right text-sm">{rec.config.diasFaltados}</TableCell>
                            <TableCell className="text-right text-sm">
                              {rec.config.kpiAplicado ? "✓" : "-"}
                            </TableCell>
                            <TableCell className="text-right text-sm">{rec.config.diasExtra}</TableCell>
                            <TableCell className="text-right text-sm">{fmt(rec.config.bonosAdicionales)}</TableCell>
                            <TableCell className="text-right font-semibold">{fmt(rec.netPay)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => generatePDF(rec)}
                                title="Download payroll"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell colSpan={6}>Period Total Net</TableCell>
                          <TableCell className="text-right">{fmt(period.totalPayout)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
