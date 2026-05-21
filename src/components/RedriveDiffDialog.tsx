/**
 * RedriveDiffDialog — Phase 4c
 *
 * Two-step dialog for re-deriving a payroll week from time_clock:
 *   1. Preview: calls pay_redrive_week(weekId, false) — read-only diff.
 *   2. Apply:   calls pay_redrive_week(weekId, true)  — writes changes.
 *
 * Behavior the DB function guarantees (we just surface it here):
 *   - PAID rows are skipped entirely (never appear in `diff`).
 *   - Fields manually changed since last derive are PRESERVED — they show up
 *     in `preserved` so the user can see what's being kept.
 *   - Fields that match the previous snapshot get refreshed — shown in `changes`.
 *
 * The diff returned can include rows where both `changes` and `preserved` are
 * empty (record is fully in sync). Those are filtered out of the visible list
 * — but still counted in "no changes" so the user can sanity-check totals.
 */

import { useMemo } from "react";
import { Loader2, AlertCircle, RefreshCw, ArrowRight, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  RedriveDiffRow,
  RedriveResult,
  PayrollRecord,
} from "@/hooks/usePayroll";
import { getDisplayName } from "@/lib/displayName";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const FIELD_LABELS: Record<string, string> = {
  missed_days: "Missed days",
  overtime_days: "Overtime days",
  sundays_worked: "Sundays",
  holiday_days: "Holiday days",
  partial_week_days: "Partial week days",
};

function fmtVal(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

/** A row is "displayable" if it has at least one change or one preserved field. */
function hasAnything(row: RedriveDiffRow): boolean {
  return (
    Object.keys(row.changes ?? {}).length > 0 ||
    Object.keys(row.preserved ?? {}).length > 0
  );
}

/* ------------------------------------------------------------------ */
/*  Per-row diff card                                                   */
/* ------------------------------------------------------------------ */

function DiffRowCard({
  row,
  agentName,
}: {
  row: RedriveDiffRow;
  agentName: string;
}) {
  const changeKeys = Object.keys(row.changes ?? {}) as Array<keyof typeof FIELD_LABELS>;
  const preservedKeys = Object.keys(row.preserved ?? {}) as Array<keyof typeof FIELD_LABELS>;
  const noData = row.derive_status === "NO_DATA";
  const noShift = row.derive_status === "NO_SHIFT_TYPE";

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-medium text-sm">{agentName}</div>
        <div className="flex items-center gap-1.5">
          {noData && (
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
            >
              NO_DATA
            </Badge>
          )}
          {noShift && (
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
            >
              NO_SHIFT_TYPE
            </Badge>
          )}
        </div>
      </div>

      {/* Changes — will be applied */}
      {changeKeys.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Will update
          </div>
          {changeKeys.map((k) => {
            const c = row.changes[k]!;
            return (
              <div
                key={k}
                className="flex items-center gap-2 text-xs pl-1"
              >
                <span className="text-muted-foreground w-32 shrink-0">
                  {FIELD_LABELS[k] ?? k}
                </span>
                <span className="font-mono">{fmtVal(c.from)}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono font-semibold text-primary">
                  {fmtVal(c.to)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Preserved — manual overrides kept as-is */}
      {preservedKeys.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Manual override — kept
          </div>
          {preservedKeys.map((k) => {
            const p = row.preserved[k]!;
            return (
              <div
                key={k}
                className="flex items-center gap-2 text-xs pl-1"
              >
                <span className="text-muted-foreground w-32 shrink-0">
                  {FIELD_LABELS[k] ?? k}
                </span>
                <span className="font-mono font-semibold">
                  {fmtVal(p.manual)}
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  (fresh would be {fmtVal(p.fresh_would_be)})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main dialog                                                         */
/* ------------------------------------------------------------------ */

export interface RedriveDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Used to look up agent names from the diff rows by employee_id. */
  records: PayrollRecord[];

  /** Preview state. */
  previewLoading: boolean;
  previewError: Error | null;
  preview: RedriveResult | null;

  /** Apply state. */
  applying: boolean;

  /** Triggered when user clicks "Apply changes". */
  onConfirm: () => void;
}

export function RedriveDiffDialog({
  open,
  onOpenChange,
  records,
  previewLoading,
  previewError,
  preview,
  applying,
  onConfirm,
}: RedriveDiffDialogProps) {
  // Build employee_id -> display name lookup once
  const nameByEmpId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of records) {
      const name = getDisplayName({
        work_name: r.employees?.work_name ?? null,
        full_name: r.employees?.full_name ?? "Unknown agent",
      });
      m.set(r.employee_id, name);
    }
    return m;
  }, [records]);

  // Split the diff into "will update" vs "no change" buckets
  const { displayRows, noChangeCount } = useMemo(() => {
    if (!preview) return { displayRows: [], noChangeCount: 0 };
    const display: RedriveDiffRow[] = [];
    let noChange = 0;
    for (const row of preview.diff ?? []) {
      if (hasAnything(row)) {
        display.push(row);
      } else {
        noChange += 1;
      }
    }
    // Sort: rows with changes first, then preserved-only, then alphabetical
    display.sort((a, b) => {
      const ac = Object.keys(a.changes ?? {}).length;
      const bc = Object.keys(b.changes ?? {}).length;
      if (ac !== bc) return bc - ac;
      const an = nameByEmpId.get(a.employee_id) ?? "";
      const bn = nameByEmpId.get(b.employee_id) ?? "";
      return an.localeCompare(bn, "es");
    });
    return { displayRows: display, noChangeCount: noChange };
  }, [preview, nameByEmpId]);

  const willUpdateCount = useMemo(() => {
    if (!preview) return 0;
    return (preview.diff ?? []).filter(
      (r) => Object.keys(r.changes ?? {}).length > 0
    ).length;
  }, [preview]);

  const canConfirm =
    !!preview && !previewError && !previewLoading && !applying;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Re-derive from time_clock
          </DialogTitle>
          <DialogDescription>
            Refreshes auto-derived fields (missed days, Sundays, holidays, etc.)
            from the current time_clock data.{" "}
            <strong>Manual edits and PAID rows are protected</strong> —
            you'll see exactly what changes before anything is written.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-3">
          {previewLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Calculating diff…</span>
            </div>
          )}

          {previewError && !previewLoading && (
            <div className="flex items-start gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded p-3 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Couldn't load the preview</p>
                <p className="text-xs mt-1 text-destructive/80">
                  {previewError.message}
                </p>
              </div>
            </div>
          )}

          {!previewLoading && !previewError && preview && (
            <>
              {/* Summary chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded border bg-muted/30 p-2">
                  <div className="text-muted-foreground">Will update</div>
                  <div className="text-lg font-semibold">
                    {willUpdateCount}
                  </div>
                </div>
                <div className="rounded border bg-muted/30 p-2">
                  <div className="text-muted-foreground">
                    Manual — kept
                  </div>
                  <div className="text-lg font-semibold">
                    {preview.preserved_overrides}
                  </div>
                </div>
                <div className="rounded border bg-muted/30 p-2">
                  <div className="text-muted-foreground">
                    PAID — skipped
                  </div>
                  <div className="text-lg font-semibold">
                    {preview.skipped_paid}
                  </div>
                </div>
                <div className="rounded border bg-muted/30 p-2">
                  <div className="text-muted-foreground">
                    Already in sync
                  </div>
                  <div className="text-lg font-semibold">
                    {noChangeCount}
                  </div>
                </div>
              </div>

              {/* Per-row diff */}
              {displayRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground border rounded">
                  Everything is already in sync. Nothing to update.
                </div>
              ) : (
                <div className="space-y-2">
                  {displayRows.map((row) => (
                    <DiffRowCard
                      key={row.record_id}
                      row={row}
                      agentName={
                        nameByEmpId.get(row.employee_id) ?? "Unknown agent"
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="pt-3 border-t">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canConfirm || willUpdateCount === 0}
            title={
              willUpdateCount === 0
                ? "No changes to apply"
                : `Apply ${willUpdateCount} update${willUpdateCount === 1 ? "" : "s"}`
            }
          >
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {applying
              ? "Applying…"
              : willUpdateCount === 0
                ? "Nothing to apply"
                : `Apply ${willUpdateCount} update${willUpdateCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
