import { useState, useEffect, useMemo } from "react";
import {
  useActivePeriod,
  useCreatePeriod,
  usePayrollRecords,
  useUpsertPayrollRecord,
  getCurrentPeriodDates,
  formatPeriodLabel,
  recordToConfig,
} from "@/hooks/useSupabasePayroll";
import { usePayrollComputed, type ComputedPayroll } from "@/hooks/usePayrollComputed";
import { EMPTY_PAYROLL_RESULT } from "@/types/payroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calculator, Pencil, X, Save } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useHolidayPayFlags, type HolidayPayFlag } from "@/hooks/useHolidayPayFlags";
import { useVacationPayFlags, type VacationPayFlag } from "@/hooks/useVacationPayFlags";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "MXN" });

interface RowState {
  // Manual inputs
  kpiAchieved: boolean;
  additionalBonuses: number;
  // Overrides (null = use computed)
  daysAbsentOverride: number | null;
  sundayPremiumOverride: boolean | null;
  holidayWorkedOverride: number | null;
  extraDaysOverride: number | null;
}

function defaultRowState(): RowState {
  return {
    kpiAchieved: false,
    additionalBonuses: 0,
    daysAbsentOverride: null,
    sundayPremiumOverride: null,
    holidayWorkedOverride: null,
    extraDaysOverride: null,
  };
}

/** Merge saved payroll_records data into row state */
function rowStateFromRecord(rec: any): RowState {
  const overrides = rec?.overrides_json || {};
  return {
    kpiAchieved: rec?.kpi_achieved ?? false,
    additionalBonuses: Number(rec?.additional_bonuses) || 0,
    daysAbsentOverride: overrides.days_absent ? (rec?.days_absent ?? null) : null,
    sundayPremiumOverride: overrides.sunday_premium ? (rec?.sunday_premium_applied ?? null) : null,
    holidayWorkedOverride: overrides.holiday_worked ? (rec?.holiday_worked === true ? 1 : (typeof rec?.holiday_worked === "number" ? rec.holiday_worked : null)) : null,
    extraDaysOverride: overrides.extra_days ? (rec?.extra_days_count ?? null) : null,
  };
}

export default function PayrollRun() {
  const { data: activePeriod } = useActivePeriod();
  const createPeriod = useCreatePeriod();
  const { data: records = [] } = usePayrollRecords(activePeriod?.id);
  const upsertRecord = useUpsertPayrollRecord();

  // Auto-create period if none
  useEffect(() => {
    if (!activePeriod && !createPeriod.isPending) {
      createPeriod.mutate(getCurrentPeriodDates());
    }
  }, [activePeriod]);

  const { data: computed = [], isLoading } = usePayrollComputed(
    activePeriod?.id,
    activePeriod?.start_date,
    activePeriod?.end_date
  );

  const { data: holidayFlags = [] } = useHolidayPayFlags(
    activePeriod?.start_date,
    activePeriod?.end_date
  );

  const { data: vacationFlags = [] } = useVacationPayFlags(
    activePeriod?.start_date,
    activePeriod?.end_date
  );

  // Track dismissed flags (employeeId|holidayDate key)
  const [dismissedFlags, setDismissedFlags] = useState<Set<string>>(new Set());

  const visibleFlags = holidayFlags.filter(
    (f) => !dismissedFlags.has(`${f.employeeId}|${f.holidayDate}`)
  );

  const [dismissedVacationFlags, setDismissedVacationFlags] = useState<Set<string>>(new Set());

  const visibleVacationFlags = vacationFlags.filter(
    (f) => !dismissedVacationFlags.has(`${f.employeeId}|${f.startDate}`)
  );

  // Per-row local state, keyed by employee UUID
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  // Initialize row states from saved records when they load
  useEffect(() => {
    if (records.length === 0 && computed.length === 0) return;
    const next: Record<string, RowState> = {};
    computed.forEach((emp) => {
      const rec = records.find((r: any) => r.employee_id === emp.employeeId);
      next[emp.employeeId] = rec ? rowStateFromRecord(rec) : defaultRowState();
    });
    setRowStates(next);
  }, [records, computed]);

  const getRow = (empId: string): RowState =>
    rowStates[empId] || defaultRowState();

  const updateRow = (empId: string, patch: Partial<RowState>) => {
    setRowStates((prev) => ({
      ...prev,
      [empId]: { ...(prev[empId] || defaultRowState()), ...patch },
    }));
  };

  // Effective values: override or computed
  function effective(emp: ComputedPayroll, row: RowState) {
    return {
      daysAbsent: row.daysAbsentOverride ?? emp.daysAbsent,
      sundayPremium: row.sundayPremiumOverride ?? emp.sundayPremiumEarned,
      holidayDays: row.holidayWorkedOverride ?? emp.holidayDaysWorked,
      extraDays: row.extraDaysOverride ?? emp.extraDaysWorked,
      kpiAchieved: row.kpiAchieved,
      additionalBonuses: row.additionalBonuses,
    };
  }

  function computeNet(emp: ComputedPayroll, row: RowState) {
    const eff = effective(emp, row);
    const empObj = {
      id: emp.employeeDisplayId,
      nombre: emp.fullName,
      sueldoBase: emp.monthlyBaseSalary,
      descuentoPorDia: emp.dailyDiscountRate,
      kpiMonto: emp.kpiBonusAmount,
      turno: "Lunes-Viernes" as const,
    };
    const config = {
      empleadoId: emp.employeeDisplayId,
      diasFaltados: eff.daysAbsent,
      kpiAplicado: eff.kpiAchieved,
      diasExtra: eff.extraDays,
      primaDominical: eff.sundayPremium,
      diaFestivo: eff.holidayDays > 0,
      bonosAdicionales: eff.additionalBonuses,
    };
    // Phase 4b: calcularNomina() removed (throws). Placeholder zero-result.
    // This page (legacy PayrollRun) is being replaced by /admin/payroll in Phase 4c.
    return EMPTY_PAYROLL_RESULT;
  }

  function saveRow(emp: ComputedPayroll) {
    if (!activePeriod) return;
    const row = getRow(emp.employeeId);
    const eff = effective(emp, row);
    const result = computeNet(emp, row);
    const overrides: Record<string, boolean> = {};
    if (row.daysAbsentOverride !== null) overrides.days_absent = true;
    if (row.sundayPremiumOverride !== null) overrides.sunday_premium = true;
    if (row.holidayWorkedOverride !== null) overrides.holiday_worked = true;
    if (row.extraDaysOverride !== null) overrides.extra_days = true;

    upsertRecord.mutate(
      {
        employee_id: emp.employeeId,
        period_id: activePeriod.id,
        days_absent: eff.daysAbsent,
        extra_days_count: eff.extraDays,
        kpi_achieved: eff.kpiAchieved,
        sunday_premium_applied: eff.sundayPremium,
        holiday_worked: eff.holidayDays > 0,
        additional_bonuses: eff.additionalBonuses,
        calculated_net_pay: result.netoAPagar,
        overrides_json: overrides,
      },
      {
        onSuccess: () => toast.success(`Saved ${emp.fullName}`),
        onError: (err: any) => toast.error(err.message),
      }
    );
  }

  function holidayPremium(flag: HolidayPayFlag): number {
    const emp = computed.find((e) => e.employeeId === flag.employeeId);
    if (!emp) return 0;
    // MX law: triple pay = regular day + 200% premium = 2 × daily rate
    return 2 * (emp.monthlyBaseSalary / 30);
  }

  function applyHolidayFlag(flag: HolidayPayFlag) {
    updateRow(flag.employeeId, { holidayWorkedOverride: 1 });
    setDismissedFlags((prev) => new Set(prev).add(`${flag.employeeId}|${flag.holidayDate}`));
  }

  function dismissFlag(flag: HolidayPayFlag) {
    setDismissedFlags((prev) => new Set(prev).add(`${flag.employeeId}|${flag.holidayDate}`));
  }

  function primaVacacional(flag: VacationPayFlag): number {
    const emp = computed.find((e) => e.employeeId === flag.employeeId);
    if (!emp) return 0;
    const dailyRate = emp.monthlyBaseSalary / 30;
    return dailyRate * flag.daysInPeriod * 0.25;
  }

  function dismissVacationFlag(flag: VacationPayFlag) {
    setDismissedVacationFlags((prev) =>
      new Set(prev).add(`${flag.employeeId}|${flag.startDate}`)
    );
  }

  // Totals
  const totalPayroll = useMemo(() => {
    return computed.reduce((sum, emp) => {
      const row = getRow(emp.employeeId);
      return sum + computeNet(emp, row).netoAPagar;
    }, 0);
  }, [computed, rowStates]);

  const overrideCount = useMemo(() => {
    return Object.values(rowStates).filter(
      (r) =>
        r.daysAbsentOverride !== null ||
        r.sundayPremiumOverride !== null ||
        r.holidayWorkedOverride !== null ||
        r.extraDaysOverride !== null
    ).length;
  }, [rowStates]);

  if (isLoading || !activePeriod) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading payroll data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-7 w-7" />
            Payroll Run
          </h1>
          <p className="text-muted-foreground mt-1">
            {formatPeriodLabel(activePeriod)} · {computed.length} employees
          </p>
        </div>
        <Button variant="outline" disabled>
          Close Period (coming soon)
        </Button>
      </div>

      {visibleFlags.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-base">
              <AlertTriangle className="h-4 w-4" />
              Holiday Pay Flags ({visibleFlags.length})
            </CardTitle>
            <p className="text-sm text-amber-600 dark:text-amber-500">
              These agents clocked in on a statutory holiday this period. Mexican
              labor law requires 200% premium pay on top of their regular day rate.
              Confirm each one to apply triple pay.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Holiday</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Premium (+)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFlags.map((flag) => {
                  const emp = computed.find((e) => e.employeeId === flag.employeeId);
                  const premium = holidayPremium(flag);
                  return (
                    <TableRow key={`${flag.employeeId}|${flag.holidayDate}`}>
                      <TableCell className="font-medium">
                        {emp?.fullName ?? flag.employeeId}
                      </TableCell>
                      <TableCell>{flag.holidayName}</TableCell>
                      <TableCell>{flag.holidayDate}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                        {fmt(premium)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => applyHolidayFlag(flag)}
                          >
                            Apply Holiday Pay
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => dismissFlag(flag)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {visibleVacationFlags.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-base">
              <AlertTriangle className="h-4 w-4" />
              Prima Vacacional ({visibleVacationFlags.length})
            </CardTitle>
            <p className="text-sm text-amber-600 dark:text-amber-500">
              These agents have approved vacation overlapping this period. Mexican labor law
              requires a 25% vacation premium on top of regular pay for those days. Confirm
              each one to mark as noted.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Vacation Dates</TableHead>
                  <TableHead className="text-right">Days This Period</TableHead>
                  <TableHead className="text-right">Prima Vacacional (+)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleVacationFlags.map((flag) => {
                  const emp = computed.find((e) => e.employeeId === flag.employeeId);
                  return (
                    <TableRow key={`${flag.employeeId}|${flag.startDate}`}>
                      <TableCell className="font-medium">
                        {emp?.fullName ?? flag.employeeId}
                      </TableCell>
                      <TableCell>
                        {flag.startDate} – {flag.endDate}
                      </TableCell>
                      <TableCell className="text-right">{flag.daysInPeriod}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                        {fmt(primaVacacional(flag))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" onClick={() => dismissVacationFlag(flag)}>
                            Mark as Noted
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => dismissVacationFlag(flag)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10">Employee</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Daily Salary</TableHead>
                  <TableHead className="text-center">Days Absent</TableHead>
                  <TableHead className="text-center">Sun Premium</TableHead>
                  <TableHead className="text-center">Holiday Days</TableHead>
                  <TableHead className="text-center">Extra Days</TableHead>
                  <TableHead className="text-center">KPI</TableHead>
                  <TableHead className="text-right">Bonuses</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No active employees for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  computed.map((emp) => {
                    const row = getRow(emp.employeeId);
                    const eff = effective(emp, row);
                    const result = computeNet(emp, row);

                    return (
                      <TableRow key={emp.employeeId}>
                        {/* Employee */}
                        <TableCell className="sticky left-0 bg-background z-10">
                          <div>
                            <div className="font-medium text-sm">{emp.fullName}</div>
                            <div className="text-xs text-muted-foreground">{emp.employeeDisplayId}</div>
                          </div>
                        </TableCell>
                        {/* Campaign */}
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{emp.campaignName || "—"}</span>
                        </TableCell>
                        {/* Daily Salary */}
                        <TableCell className="text-right text-sm">
                          {fmt(emp.monthlyBaseSalary / 30)}
                        </TableCell>
                        {/* Days Absent — auto-computed with override */}
                        <TableCell className="text-center">
                          <OverrideCell
                            computedValue={emp.daysAbsent}
                            overrideValue={row.daysAbsentOverride}
                            type="number"
                            onOverride={(v) => updateRow(emp.employeeId, { daysAbsentOverride: v as number | null })}
                          />
                        </TableCell>
                        {/* Sunday Premium */}
                        <TableCell className="text-center">
                          <OverrideCell
                            computedValue={emp.sundayPremiumEarned}
                            overrideValue={row.sundayPremiumOverride}
                            type="boolean"
                            onOverride={(v) => updateRow(emp.employeeId, { sundayPremiumOverride: v as boolean | null })}
                          />
                        </TableCell>
                        {/* Holiday Days */}
                        <TableCell className="text-center">
                          <OverrideCell
                            computedValue={emp.holidayDaysWorked}
                            overrideValue={row.holidayWorkedOverride}
                            type="number"
                            onOverride={(v) => updateRow(emp.employeeId, { holidayWorkedOverride: v as number | null })}
                          />
                        </TableCell>
                        {/* Extra Days */}
                        <TableCell className="text-center">
                          <OverrideCell
                            computedValue={emp.extraDaysWorked}
                            overrideValue={row.extraDaysOverride}
                            type="number"
                            onOverride={(v) => updateRow(emp.employeeId, { extraDaysOverride: v as number | null })}
                          />
                        </TableCell>
                        {/* KPI — manual checkbox */}
                        <TableCell className="text-center">
                          <Checkbox
                            checked={row.kpiAchieved}
                            onCheckedChange={(v) =>
                              updateRow(emp.employeeId, { kpiAchieved: !!v })
                            }
                          />
                        </TableCell>
                        {/* Additional Bonuses — manual input */}
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            className="w-24 h-8 text-right text-sm"
                            value={row.additionalBonuses || ""}
                            onChange={(e) =>
                              updateRow(emp.employeeId, {
                                additionalBonuses: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </TableCell>
                        {/* Net Pay */}
                        <TableCell className="text-right font-semibold text-sm">
                          {fmt(result.netoAPagar)}
                        </TableCell>
                        {/* Save */}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => saveRow(emp)}
                            disabled={upsertRecord.isPending}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-4">
          <span className="text-muted-foreground">
            {overrideCount > 0 && (
              <Badge variant="outline" className="mr-2">
                {overrideCount} override{overrideCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {computed.length} employees
          </span>
        </div>
        <div className="text-lg font-bold">
          Total: {fmt(totalPayroll)}
        </div>
      </div>
    </div>
  );
}

/** Generic override cell — shows computed value with pencil to override */
function OverrideCell({
  computedValue,
  overrideValue,
  type,
  onOverride,
}: {
  computedValue: number | boolean;
  overrideValue: number | boolean | null;
  type: "number" | "boolean";
  onOverride: (value: number | boolean | null) => void;
}) {
  const isOverridden = overrideValue !== null;
  const displayValue = isOverridden ? overrideValue : computedValue;

  const displayStr =
    type === "boolean"
      ? (displayValue as boolean)
        ? "Yes"
        : "No"
      : String(displayValue);

  return (
    <div className="flex items-center justify-center gap-1">
      <span
        className={`text-sm ${isOverridden ? "font-semibold text-amber-700" : ""}`}
      >
        {displayStr}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={`h-5 w-5 flex items-center justify-center rounded hover:bg-muted ${
              isOverridden ? "text-amber-600" : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-3" align="center">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Computed: {type === "boolean" ? (computedValue ? "Yes" : "No") : String(computedValue)}
            </p>
            {type === "number" ? (
              <Input
                type="number"
                min="0"
                className="h-8 text-sm"
                value={isOverridden ? String(overrideValue) : ""}
                placeholder="Override..."
                onChange={(e) => {
                  const v = e.target.value;
                  onOverride(v === "" ? null : parseInt(v, 10));
                }}
              />
            ) : (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={isOverridden ? (overrideValue as boolean) : false}
                  onCheckedChange={(v) => onOverride(!!v)}
                />
                <span className="text-sm">Override to {isOverridden ? (overrideValue ? "Yes" : "No") : "..."}</span>
              </div>
            )}
            {isOverridden && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => onOverride(null)}
              >
                <X className="h-3 w-3 mr-1" /> Reset to computed
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
