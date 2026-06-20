/**
 * /admin/payroll/rates — Pay Rates Editor (Phase 4b)
 *
 * Lets owner / admin / manager edit per-employee pay rates:
 *   weekly_base_salary, daily_salary, daily_discount_rate,
 *   kpi_bonus_amount, overtime_day_pay, sunday_bonus_amount,
 *   vacation_premium_pct, monthly_base_salary.
 *
 * Two edit modes:
 *   - Inline cell edit (click value, type new, blur to save).
 *   - Bulk apply (select N rows, click Apply, set one field for all).
 *
 * Filter bar surfaces Client (resolved via campaign.client_id) + Department +
 * Shift. Campaign is intentionally NOT shown — D's mental model is
 * Client = customer, Department = title/position. The campaigns table sits
 * between them in the schema but doesn't need its own filter for the rates view.
 *
 * RLS scopes who can edit. Client-side filters only narrow the visible list.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useRateRoster,
  useUpdateEmployeeRates,
  useBulkApplyRate,
  type RateRosterRow,
  type EditableRateField,
} from "@/hooks/usePayroll";
import { formatMXN } from "@/lib/formatCurrency";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Does this shift type include Sunday work?
 *   L-J = Mon-Thu     → no Sunday
 *   L-V = Mon-Fri     → no Sunday
 *   V-D = Fri-Sun     → YES Sunday
 *   V-L = Fri-Mon     → YES Sunday
 * Null/unknown shifts default to YES so we don't accidentally lock the field.
 */
function shiftIncludesSunday(shiftType: string | null): boolean {
  if (!shiftType) return true; // unknown — leave editable
  return shiftType === "V-D" || shiftType === "V-L";
}

/* ------------------------------------------------------------------ */
/*  Editable cell — saves on blur if value changed                      */
/* ------------------------------------------------------------------ */

interface EditableCellProps {
  value: number | null;
  onSave: (v: number | null) => Promise<void>;
  minValue?: number;
  step?: string;
  format?: "money" | "percent";
}

function EditableCell({
  value,
  onSave,
  minValue,
  step = "0.01",
  format = "money",
}: EditableCellProps) {
  const display = value == null ? "" : String(value);
  const [local, setLocal] = useState(display);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setError(null);
    if (local === display) return; // no change

    const parsed = local === "" ? null : Number(local);
    if (parsed != null && Number.isNaN(parsed)) {
      setError("Not a number");
      return;
    }
    if (parsed != null && minValue != null && parsed < minValue) {
      setError(`Min ${minValue}`);
      return;
    }

    setSaving(true);
    try {
      await onSave(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setLocal(display); // revert
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative">
        <Input
          type="number"
          step={step}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setLocal(display);
              setError(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={saving}
          className={`h-8 text-right text-sm font-mono w-28 ${
            error ? "border-destructive" : ""
          }`}
        />
        {saving && (
          <Loader2 className="h-3 w-3 animate-spin absolute right-2 top-2.5 text-muted-foreground" />
        )}
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
      {!error && format === "money" && value != null && (
        <p className="text-[10px] text-muted-foreground text-right">
          {formatMXN(value)}
        </p>
      )}
      {!error && format === "percent" && value != null && (
        <p className="text-[10px] text-muted-foreground text-right">
          {(value * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bulk-apply dialog                                                   */
/* ------------------------------------------------------------------ */

// Phase 4b simplification: only kpi_bonus_amount is editable here.
// monthly_base_salary lives on the employee profile (HR sets it on hire).
// Everything else is derived: quincena = monthly/2, daily = monthly/30,
// sunday-bonus-per-day = daily × 0.25.
const BULK_FIELDS: { value: EditableRateField; label: string; step: string; min?: number; isPct?: boolean }[] = [
  { value: "kpi_bonus_amount", label: "KPI bonus", step: "1" },
];

interface BulkDialogProps {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  onApply: (field: EditableRateField, value: number) => Promise<void>;
}

function BulkDialog({ open, onClose, selectedCount, onApply }: BulkDialogProps) {
  // Default to the first option in BULK_FIELDS (currently only kpi_bonus_amount
  // after Phase 4b simplification). Using a literal default would crash if
  // BULK_FIELDS changes again.
  const [field, setField] = useState<EditableRateField>(BULK_FIELDS[0].value);
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fieldDef = BULK_FIELDS.find((f) => f.value === field) ?? BULK_FIELDS[0];

  async function handleApply() {
    setErr(null);
    const num = Number(value);
    if (value === "" || Number.isNaN(num)) {
      setErr("Enter a number");
      return;
    }
    if (fieldDef.min != null && num < fieldDef.min) {
      setErr(`Minimum is ${fieldDef.min}`);
      return;
    }
    setApplying(true);
    try {
      await onApply(field, num);
      setValue("");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk apply rate</DialogTitle>
          <DialogDescription>
            Set the same value on{" "}
            <span className="font-semibold">{selectedCount}</span> selected{" "}
            {selectedCount === 1 ? "employee" : "employees"}. This overwrites their current value.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Field to update</Label>
            <Select value={field} onValueChange={(v) => setField(v as EditableRateField)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BULK_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              New value{" "}
              {fieldDef.isPct && <span className="text-muted-foreground text-xs">(decimal, e.g. 0.25 = 25%)</span>}
            </Label>
            <Input
              type="number"
              step={fieldDef.step}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={fieldDef.isPct ? "0.25" : "3000"}
              autoFocus
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={applying}>
            {applying ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Apply to {selectedCount}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function PayrollRates() {
  const { toast } = useToast();
  const { data: roster = [], isLoading, error } = useRateRoster();
  const updateRates = useUpdateEmployeeRates();
  const bulkApply = useBulkApplyRate();

  const [clientFilter, setClientFilter] = useState<string>("__all__");
  const [departmentFilter, setDepartmentFilter] = useState<string>("__all__");
  const [shiftFilter, setShiftFilter] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // Derived filter options from current roster
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    roster.forEach((r) => {
      if (r.client_id && r.client_name) map.set(r.client_id, r.client_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [roster]);

  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    roster.forEach((r) => {
      if (r.department_id && r.department_name) map.set(r.department_id, r.department_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [roster]);

  const shiftOptions = useMemo(() => {
    const set = new Set<string>();
    roster.forEach((r) => r.shift_type && set.add(r.shift_type));
    return Array.from(set).sort();
  }, [roster]);

  // Apply filters
  const filtered = useMemo(() => {
    return roster.filter((r) => {
      if (clientFilter !== "__all__" && r.client_id !== clientFilter) return false;
      if (departmentFilter !== "__all__" && r.department_id !== departmentFilter) return false;
      if (shiftFilter !== "__all__" && r.shift_type !== shiftFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${r.full_name} ${r.work_name ?? ""} ${r.employee_id}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [roster, clientFilter, departmentFilter, shiftFilter, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      // Deselect all visible
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      // Select all visible
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setClientFilter("__all__");
    setDepartmentFilter("__all__");
    setShiftFilter("__all__");
    setSearch("");
  }

  async function saveCell(employeeId: string, field: EditableRateField, value: number | null) {
    await updateRates.mutateAsync({ employeeId, updates: { [field]: value } });
  }

  async function handleBulkApply(field: EditableRateField, value: number) {
    const ids = Array.from(selected);
    await bulkApply.mutateAsync({ employeeIds: ids, field, value });
    toast({
      title: "Rates updated",
      description: `Applied to ${ids.length} ${ids.length === 1 ? "employee" : "employees"}.`,
    });
    setSelected(new Set());
  }

  // (recompute helper removed — weekly is now derived live, no stored value to sync)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load rates: {error.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link to="/admin/payroll" className="hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />
              Payroll
            </Link>
            <span>/</span>
            <span>Rates</span>
          </div>
          <h1 className="text-2xl font-bold">Pay Rates</h1>
          <p className="text-muted-foreground text-sm">
            Monthly salary is set on the employee profile. Edit KPI bonus here. Everything else
            (quincena, daily, Sunday premium, holiday pay) is derived automatically.
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {filtered.length} of {roster.length}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or ID…"
                  className="pl-8 h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Client</Label>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All clients</SelectItem>
                  {clientOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Department</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All departments</SelectItem>
                  {departmentOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Shift</Label>
                <Select value={shiftFilter} onValueChange={setShiftFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All shifts</SelectItem>
                    {shiftOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                disabled={
                  clientFilter === "__all__" &&
                  departmentFilter === "__all__" &&
                  shiftFilter === "__all__" &&
                  !search
                }
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
          <p className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "employee" : "employees"} selected
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              Apply rate to selected
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr className="text-left">
                <th className="p-2 w-10">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all visible"
                  />
                </th>
                <th className="p-2 text-xs uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="p-2 text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="p-2 text-xs uppercase tracking-wider text-muted-foreground">Client</th>
                <th className="p-2 text-xs uppercase tracking-wider text-muted-foreground">Dept</th>
                <th className="p-2 text-xs uppercase tracking-wider text-muted-foreground">Shift</th>
                <th className="p-2 text-xs uppercase tracking-wider text-muted-foreground text-right">Monthly</th>
                <th className="p-2 text-xs uppercase tracking-wider text-muted-foreground text-right">KPI</th>
                <th className="p-2 text-xs uppercase tracking-wider text-muted-foreground">Derived</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground text-sm">
                    No employees match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <RateRow
                  key={r.id}
                  row={r}
                  selected={selected.has(r.id)}
                  onToggle={() => toggleRow(r.id)}
                  onSave={(field, value) => saveCell(r.id, field, value)}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: click the KPI cell to edit. Press <kbd className="border rounded px-1">Enter</kbd> to save,{" "}
        <kbd className="border rounded px-1">Esc</kbd> to cancel. Monthly salary is set on the employee
        profile page — it's read-only here. Quincena / Daily / Sunday Premium / Holiday Pay are derived
        automatically from monthly (quincena = monthly/2, daily = monthly/30, Sunday premium = daily × 25%,
        holiday = daily × 2 per LFT Art. 75).
      </p>

      <BulkDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        selectedCount={selected.size}
        onApply={handleBulkApply}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single row                                                          */
/* ------------------------------------------------------------------ */

interface RateRowProps {
  row: RateRosterRow;
  selected: boolean;
  onToggle: () => void;
  onSave: (field: EditableRateField, value: number | null) => Promise<void>;
}

function RateRow({ row, selected, onToggle, onSave }: RateRowProps) {
  const monthly = row.monthly_base_salary ?? 0;
  const missingRate = monthly <= 0;

  // Derived values for display
  const weekly = monthly / 2; // quincena base (Task 1: cadence fix)
  const daily = monthly / 30;
  const sundayPerDay = daily * 0.25;
  const showsSunday = shiftIncludesSunday(row.shift_type);

  return (
    <tr className={`border-b hover:bg-muted/30 ${selected ? "bg-primary/5" : ""} ${missingRate ? "bg-red-50/50" : ""}`}>
      <td className="p-2">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </td>
      <td className="p-2 font-mono text-xs">{row.employee_id}</td>
      <td className="p-2">
        <div className="font-medium flex items-center gap-2">
          {row.work_name || row.full_name}
          {missingRate && (
            <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100 text-[10px] font-normal">
              Missing rate
            </Badge>
          )}
        </div>
        {row.work_name && row.work_name !== row.full_name && (
          <div className="text-xs text-muted-foreground">{row.full_name}</div>
        )}
      </td>
      <td className="p-2">
        {row.client_name ? (
          <Badge variant="outline" className="text-xs font-normal">
            {row.client_name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-2 text-xs text-muted-foreground">
        {row.department_name ?? "—"}
      </td>
      <td className="p-2">
        {row.shift_type ? (
          <Badge variant="secondary" className="text-xs font-normal">
            {row.shift_type}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-2 text-right font-mono text-sm">
        {/* Monthly is read-only — source of truth lives on employee profile */}
        {missingRate ? (
          <span className="text-red-600 font-semibold">—</span>
        ) : (
          formatMXN(monthly)
        )}
      </td>
      <td className="p-2">
        <EditableCell
          value={row.kpi_bonus_amount}
          onSave={(v) => onSave("kpi_bonus_amount", v)}
          step="1"
        />
      </td>
      <td className="p-2 text-xs text-muted-foreground">
        {missingRate ? (
          <span className="italic">set monthly first</span>
        ) : (
          <div className="space-y-0.5 font-mono">
            <div>Qna: <span className="text-foreground">{formatMXN(weekly)}</span></div>
            <div>Day: <span className="text-foreground">{formatMXN(daily)}</span></div>
            {showsSunday ? (
              <div>Sun/day: <span className="text-foreground">{formatMXN(sundayPerDay)}</span></div>
            ) : (
              <div className="opacity-50">no Sun (shift {row.shift_type ?? "?"})</div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
