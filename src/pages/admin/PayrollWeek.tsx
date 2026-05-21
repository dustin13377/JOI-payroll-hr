/**
 * /admin/payroll/week/:weekId — Per-week payroll table (Phase 4a)
 *
 * Shows all agents for this week with auto-derived inputs,
 * inline row editing, live total preview, and status workflow.
 *
 * Phase 4c: Re-derive diff dialog (button is a stub here).
 */

import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Lock,
  ArrowUpDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  useWeek,
  useWeekRecords,
  useUpdatePayrollRecord,
  useMarkWeekComplete,
  useMarkPeriodPaid,
  useCanEditExtraBonus,
  useCanLockToPaid,
  previewTotalPay,
  type PayrollRecord,
  type PayrollRecordInputs,
} from "@/hooks/usePayroll";
import { formatMXN } from "@/lib/formatCurrency";
import { getDisplayName } from "@/lib/displayName";

/* ------------------------------------------------------------------ */
/*  Status badge                                                        */
/* ------------------------------------------------------------------ */

function WeekStatusBadge({ status }: { status: PayrollRecord["status"] }) {
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
/*  Auto-derived tag                                                    */
/* ------------------------------------------------------------------ */

function DerivedTag({
  fieldName,
  currentValue,
  autoderived,
}: {
  fieldName: string;
  currentValue: number | boolean | null;
  autoderived: Record<string, unknown> | null;
}) {
  if (!autoderived) return null;

  const derivedValue = autoderived[fieldName];
  if (derivedValue === undefined) return null;

  const isOverridden = currentValue !== derivedValue;

  if (isOverridden) {
    return (
      <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 whitespace-nowrap">
        manual (was: {String(derivedValue)})
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded px-1 py-0.5 whitespace-nowrap">
      auto-derived
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline number input for an editable field                          */
/* ------------------------------------------------------------------ */

function FieldInput({
  label,
  fieldName,
  value,
  autoderived,
  disabled,
  min = 0,
  step = 1,
  onChange,
}: {
  label: string;
  fieldName: string;
  value: number;
  autoderived: Record<string, unknown> | null;
  disabled: boolean;
  min?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 flex-wrap">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <DerivedTag
          fieldName={fieldName}
          currentValue={value}
          autoderived={autoderived}
        />
      </div>
      <Input
        type="number"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-8 w-20 text-sm"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expanded edit row                                                   */
/* ------------------------------------------------------------------ */

function ExpandedRow({
  record,
  onSave,
  onCancel,
  saving,
}: {
  record: PayrollRecord;
  onSave: (inputs: Partial<PayrollRecordInputs>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const canEditBonus = useCanEditExtraBonus(record);

  const [values, setValues] = useState<PayrollRecordInputs>({
    missed_days: record.missed_days,
    overtime_days: record.overtime_days,
    sundays_worked: record.sundays_worked,
    vacation_days: record.vacation_days,
    holiday_days: record.holiday_days,
    kpi_achieved: record.kpi_achieved,
    extra_bonus: record.extra_bonus,
    partial_week_days: record.partial_week_days,
    custom_deduction: record.custom_deduction ?? 0,
  });

  const ad = record.auto_derived;

  // Live pay preview using client-side formula
  const liveTotalPreview = useMemo(
    () => previewTotalPay(values, record.employees ?? null),
    [values, record.employees]
  );

  function update<K extends keyof PayrollRecordInputs>(
    key: K,
    val: PayrollRecordInputs[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  // Fields are editable unless week is PAID
  const isPaid = record.status === "PAID";
  const inputsDisabled = isPaid || saving;

  // Only input columns changed from the original record are sent to DB
  function handleSave() {
    const changed: Partial<PayrollRecordInputs> = {};
    (Object.keys(values) as (keyof PayrollRecordInputs)[]).forEach((k) => {
      if (values[k] !== (record[k as keyof PayrollRecord] as unknown)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (changed as any)[k] = values[k];
      }
    });
    onSave(changed);
  }

  return (
    <tr>
      <td colSpan={9} className="px-4 pb-4 pt-1 bg-muted/30 border-b">
        <div className="rounded-lg border bg-background p-4 space-y-4">
          {/* Auto-derive timestamp info */}
          {ad && (
            <p className="text-xs text-muted-foreground">
              Auto-derived from time_clock on{" "}
              {ad.derived_at
                ? new Date(String(ad.derived_at)).toLocaleString("es-MX")
                : "unknown date"}
              .
            </p>
          )}

          {/* Input grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <FieldInput
              label="Missed days"
              fieldName="missed_days"
              value={values.missed_days}
              autoderived={ad}
              disabled={inputsDisabled}
              onChange={(v) => update("missed_days", Math.round(v))}
            />
            {/* Overtime days hidden per D 2026-05-20 — Phase 3 still auto-counts
                long days (>9hr net) but Phase 2 calc doesn't pay them.
                Use Extra Bonus to compensate for long days manually.
                Field stays in payroll_records, just not surfaced in UI. */}
            <FieldInput
              label="Sundays worked"
              fieldName="sundays_worked"
              value={values.sundays_worked}
              autoderived={ad}
              disabled={inputsDisabled}
              onChange={(v) => update("sundays_worked", Math.round(v))}
            />
            <FieldInput
              label="Vacation days"
              fieldName="vacation_days"
              value={values.vacation_days}
              autoderived={ad}
              disabled={inputsDisabled}
              onChange={(v) => update("vacation_days", Math.round(v))}
            />
            <FieldInput
              label="Holiday days"
              fieldName="holiday_days"
              value={values.holiday_days}
              autoderived={ad}
              disabled={inputsDisabled}
              onChange={(v) => update("holiday_days", Math.round(v))}
            />
            <FieldInput
              label="Partial week days"
              fieldName="partial_week_days"
              value={values.partial_week_days ?? 0}
              autoderived={ad}
              disabled={inputsDisabled}
              onChange={(v) =>
                update("partial_week_days", v > 0 ? Math.round(v) : null)
              }
            />

            {/* KPI achieved — toggle */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 flex-wrap">
                <Label className="text-xs font-medium text-muted-foreground">
                  KPI achieved
                </Label>
                <DerivedTag
                  fieldName="kpi_achieved"
                  currentValue={values.kpi_achieved}
                  autoderived={ad}
                />
              </div>
              <div className="flex items-center gap-2 h-8">
                <Switch
                  checked={values.kpi_achieved}
                  disabled={inputsDisabled}
                  onCheckedChange={(checked) => update("kpi_achieved", checked)}
                />
                <span className="text-sm font-medium">
                  {values.kpi_achieved ? "✓ Achieved" : "✗ Not achieved"}
                </span>
              </div>
            </div>

            {/* Extra bonus — permission-gated */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-muted-foreground">
                Extra bonus (spiffs / OT){" "}
                {!canEditBonus && (
                  <span className="text-[10px] text-muted-foreground/60">
                    (locked)
                  </span>
                )}
              </Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={values.extra_bonus}
                disabled={inputsDisabled || !canEditBonus}
                onChange={(e) =>
                  update("extra_bonus", parseFloat(e.target.value) || 0)
                }
                className="h-8 w-28 text-sm"
              />
            </div>

            {/* Custom deduction — permission-gated like extra_bonus */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-muted-foreground">
                Custom deduction{" "}
                {!canEditBonus && (
                  <span className="text-[10px] text-muted-foreground/60">
                    (locked)
                  </span>
                )}
              </Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={values.custom_deduction}
                disabled={inputsDisabled || !canEditBonus}
                onChange={(e) =>
                  update("custom_deduction", parseFloat(e.target.value) || 0)
                }
                className="h-8 w-28 text-sm"
                title="Manager-entered deduction (partial-day miss, advance repayment, fine, etc.). Subtracted from total pay."
              />
            </div>
          </div>

          {/* Live total preview */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <span className="text-sm text-muted-foreground">Live total:</span>
            <span className="text-lg font-bold text-primary">
              {liveTotalPreview != null
                ? formatMXN(liveTotalPreview)
                : formatMXN(record.total_pay)}
            </span>
            {liveTotalPreview != null &&
              liveTotalPreview !== record.total_pay && (
                <span className="text-xs text-muted-foreground">
                  (saved: {formatMXN(record.total_pay)})
                </span>
              )}
            <span className="text-xs text-muted-foreground/60">
              — server is canonical; recalculates on save
            </span>
          </div>

          {/* Save / Cancel */}
          {!isPaid && (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Single agent row                                                    */
/* ------------------------------------------------------------------ */

type SortKey = "name" | "campaign" | "total";

function AgentRow({
  record,
  isExpanded,
  onToggle,
  saving,
  onSave,
}: {
  record: PayrollRecord;
  isExpanded: boolean;
  onToggle: () => void;
  saving: boolean;
  onSave: (inputs: Partial<PayrollRecordInputs>) => void;
}) {
  const isPaid = record.status === "PAID";
  const displayName = getDisplayName({
    work_name: record.employees?.work_name ?? null,
    full_name: record.employees?.full_name ?? "Unknown agent",
  });

  return (
    <>
      <tr
        className={[
          "border-b transition-colors",
          isPaid
            ? "bg-muted/50 text-muted-foreground cursor-not-allowed"
            : "hover:bg-muted/30 cursor-pointer",
          isExpanded ? "bg-muted/20" : "",
        ].join(" ")}
        onClick={isPaid ? undefined : onToggle}
        aria-expanded={isExpanded}
        title={
          isPaid
            ? "Locked — this record was marked PAID. Edits are disabled until an owner unlocks the period."
            : undefined
        }
      >
        {/* Expand chevron */}
        <td className="px-3 py-3 w-8">
          {isPaid ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex"
                  aria-label="Record locked — period marked PAID"
                >
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium">Locked — record is PAID</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Edits are disabled until an owner unlocks the period.
                </p>
              </TooltipContent>
            </Tooltip>
          ) : isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>

        {/* Agent name + employee_id */}
        <td className="px-3 py-3">
          <div className="font-medium text-sm">{displayName}</div>
          {record.employees?.employee_id && (
            <div className="text-[11px] text-muted-foreground">
              {record.employees.employee_id}
            </div>
          )}
        </td>

        {/* Campaign */}
        <td className="px-3 py-3 text-sm text-muted-foreground">
          {record.campaigns?.name ?? "—"}
        </td>

        {/* Missed */}
        <td className="px-3 py-3 text-sm text-center">
          {record.missed_days > 0 ? (
            <span className="text-destructive font-medium">
              {record.missed_days}
            </span>
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
        </td>

        {/* OT column hidden per D 2026-05-20 — see expanded-row comment. */}

        {/* Sundays */}
        <td className="px-3 py-3 text-sm text-center">
          <span className={record.sundays_worked > 0 ? "font-medium" : "text-muted-foreground"}>
            {record.sundays_worked}
          </span>
        </td>

        {/* KPI */}
        <td className="px-3 py-3 text-sm text-center">
          {record.kpi_achieved ? (
            <span className="text-green-600 font-medium">✓</span>
          ) : (
            <span className="text-muted-foreground">✗</span>
          )}
        </td>

        {/* Extra bonus */}
        <td className="px-3 py-3 text-sm text-right">
          {record.extra_bonus > 0 ? (
            <span className="font-medium">{formatMXN(record.extra_bonus)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>

        {/* Total pay */}
        <td className="px-3 py-3 text-sm text-right font-semibold">
          {formatMXN(record.total_pay)}
        </td>
      </tr>

      {/* Inline expand */}
      {isExpanded && !isPaid && (
        <ExpandedRow
          record={record}
          onSave={onSave}
          onCancel={onToggle}
          saving={saving}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function PayrollWeek() {
  const { weekId } = useParams<{ weekId: string }>();
  const { toast } = useToast();
  const { isOwner } = useAuth();
  const canLock = useCanLockToPaid();

  const { data: week, isLoading: weekLoading, error: weekError } = useWeek(weekId ?? null);
  const { data: records = [], isLoading: recordsLoading } = useWeekRecords(weekId ?? null);

  const updateRecord = useUpdatePayrollRecord();
  const markWeekComplete = useMarkWeekComplete();
  const markPeriodPaid = useMarkPeriodPaid();

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Confirm dialogs
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showPaidDialog, setShowPaidDialog] = useState(false);
  const [showRederiveDialog, setShowRederiveDialog] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  /* -- sorting -- */
  const sortedRecords = useMemo(() => {
    const sorted = [...records].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        const an = getDisplayName({ work_name: a.employees?.work_name ?? null, full_name: a.employees?.full_name ?? "" });
        const bn = getDisplayName({ work_name: b.employees?.work_name ?? null, full_name: b.employees?.full_name ?? "" });
        cmp = an.localeCompare(bn, "es");
      } else if (sortKey === "campaign") {
        cmp = (a.campaigns?.name ?? "").localeCompare(b.campaigns?.name ?? "", "es");
      } else {
        cmp = (a.total_pay ?? 0) - (b.total_pay ?? 0);
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [records, sortKey, sortAsc]);

  const grandTotal = records.reduce((sum, r) => sum + (r.total_pay ?? 0), 0);

  /* -- sort header helper -- */
  function SortHeader({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => {
          if (active) setSortAsc((p) => !p);
          else { setSortKey(k); setSortAsc(true); }
        }}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
      </button>
    );
  }

  /* -- row actions -- */
  function toggleRow(id: string) {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }

  async function handleSaveRow(record: PayrollRecord, inputs: Partial<PayrollRecordInputs>) {
    if (!week) return;
    setSavingRowId(record.id);
    try {
      await updateRecord.mutateAsync({
        recordId: record.id,
        weekId: week.id,
        inputs,
      });
      toast({ title: "Saved", description: "Record updated. Totals recalculated." });
      setExpandedRowId(null);
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingRowId(null);
    }
  }

  /* -- mark week complete -- */
  async function handleMarkComplete() {
    if (!week) return;
    setActionPending(true);
    try {
      await markWeekComplete.mutateAsync({
        weekId: week.id,
        periodId: week.period_id,
      });
      toast({ title: "Week marked COMPLETE", description: "All records updated." });
      setShowCompleteDialog(false);
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionPending(false);
    }
  }

  /* -- mark period paid -- */
  async function handleMarkPaid() {
    if (!week) return;
    setActionPending(true);
    try {
      await markPeriodPaid.mutateAsync({ periodId: week.period_id });
      toast({
        title: "Period locked to PAID",
        description: "All weeks and records in this pay period are now immutable.",
      });
      setShowPaidDialog(false);
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionPending(false);
    }
  }

  /* -- loading states -- */
  if (weekLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (weekError || !week) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>{weekError?.message ?? "Week not found."}</span>
        </div>
        <Link to="/admin/payroll" className="text-sm text-primary mt-3 block">
          ← Back to Payroll
        </Link>
      </div>
    );
  }

  const isPeriodPaid = week.status === "PAID";
  const isWeekComplete = week.status === "COMPLETE";
  const isUnpaid = week.status === "UNPAID";

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="p-6 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/payroll" className="hover:text-foreground transition-colors">
          Payroll
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <span className="text-foreground font-medium">
          Week {week.week_number}
        </span>
      </div>

      {/* Header card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl">
                Week {week.week_number}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {new Date(week.week_start + "T12:00:00").toLocaleDateString("es-MX", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
                {" – "}
                {new Date(week.week_end + "T12:00:00").toLocaleDateString("es-MX", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <WeekStatusBadge status={week.status} />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3 pt-3 border-t text-sm">
            <div>
              <p className="text-muted-foreground">Agents</p>
              <p className="font-semibold">{records.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Grand total</p>
              <p className="font-semibold text-primary">{formatMXN(grandTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Period ID</p>
              <p className="font-mono text-xs text-muted-foreground truncate">{week.period_id.slice(0, 8)}…</p>
            </div>
          </div>
        </CardHeader>

        {/* Action buttons */}
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {/* Re-derive — stub for Phase 4c */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRederiveDialog(true)}
              disabled={isPeriodPaid}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Re-derive
            </Button>

            {/* Mark Week Complete */}
            {(isUnpaid) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCompleteDialog(true)}
                disabled={actionPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Mark Week Complete
              </Button>
            )}

            {/* Mark Period PAID — owner only */}
            {canLock && !isPeriodPaid && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowPaidDialog(true)}
                disabled={actionPending}
              >
                <Lock className="h-4 w-4 mr-1.5" />
                Mark Period PAID
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Agent table — no overflow-x-auto here, would break sticky thead.
          If horizontal scroll ever becomes needed, wrap in a separate container
          that sticky's parent chain doesn't pass through. */}
      <Card>
        <CardContent className="p-0">
          {recordsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                No records in this week. Run "Re-derive" or click "Add Next Week" from the Payroll landing page.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted shadow-sm">
                <tr className="border-b text-muted-foreground text-xs font-medium">
                  <th className="px-3 py-2 w-8 bg-muted" />
                  <th className="px-3 py-2 text-left bg-muted">
                    <SortHeader k="name" label="Agent" />
                  </th>
                  <th className="px-3 py-2 text-left bg-muted">
                    <SortHeader k="campaign" label="Campaign" />
                  </th>
                  <th className="px-3 py-2 text-center bg-muted">Missed</th>
                  {/* OT column hidden — Phase 2 doesn't pay OT (use Extra Bonus instead) */}
                  <th className="px-3 py-2 text-center bg-muted">Sun</th>
                  <th className="px-3 py-2 text-center bg-muted">KPI</th>
                  <th className="px-3 py-2 text-right bg-muted">Bonus</th>
                  <th className="px-3 py-2 text-right bg-muted">
                    <SortHeader k="total" label="Total" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((record) => (
                  <AgentRow
                    key={record.id}
                    record={record}
                    isExpanded={expandedRowId === record.id}
                    onToggle={() => toggleRow(record.id)}
                    saving={savingRowId === record.id}
                    onSave={(inputs) => handleSaveRow(record, inputs)}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold text-sm">
                  <td className="px-3 py-3" colSpan={8} />
                  <td className="px-3 py-3 text-right text-base text-primary">
                    {formatMXN(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* PAID period notice */}
      {isPeriodPaid && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded p-3 bg-muted/30">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            This pay period is <strong>PAID and locked</strong>. All records are immutable. Only an owner-initiated unlock (coming in Phase 4c) can reopen them.
          </span>
        </div>
      )}

      {/* ---- Dialogs ---- */}

      {/* Mark Week Complete */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Week {week.week_number} as Complete?</DialogTitle>
            <DialogDescription>
              This updates the week status to COMPLETE and cascades to all agent records.
              You can still edit records while the week is COMPLETE — the status isn't locked
              until you mark the entire pay period as PAID.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCompleteDialog(false)}
              disabled={actionPending}
            >
              Cancel
            </Button>
            <Button onClick={handleMarkComplete} disabled={actionPending}>
              {actionPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Period PAID — strong warning copy */}
      <Dialog open={showPaidDialog} onOpenChange={setShowPaidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Lock pay period as PAID?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  <strong>This action is irreversible through the normal UI.</strong>
                </p>
                <p>
                  Marking this pay period PAID will:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Lock <strong>all weeks</strong> in this pay period to PAID status</li>
                  <li>Lock <strong>all {records.length} agent records</strong> in this week (and all other weeks) — they become immutable at the database level</li>
                  <li>Prevent any further edits — even by the owner — without a manual DB override</li>
                </ul>
                <p className="font-semibold text-foreground">
                  Grand total being locked: {formatMXN(grandTotal)} MXN
                </p>
                <p className="text-amber-600 font-medium">
                  Only proceed if you have confirmed all figures with Joe and payroll is ready to process.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowPaidDialog(false)}
              disabled={actionPending}
            >
              Cancel — go back
            </Button>
            <Button
              variant="destructive"
              onClick={handleMarkPaid}
              disabled={actionPending}
            >
              {actionPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Yes, lock pay period as PAID
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-derive stub — Phase 4c */}
      <Dialog open={showRederiveDialog} onOpenChange={setShowRederiveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-derive from time_clock</DialogTitle>
            <DialogDescription>
              The re-derive diff dialog is coming in Phase 4c. It will show you exactly what
              changed between the current values and fresh auto-derived values, and let you
              choose which fields to accept before committing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowRederiveDialog(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
