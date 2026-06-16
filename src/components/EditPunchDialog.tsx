import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEditTimeClock } from "@/hooks/useSupabasePayroll";
import { toast } from "sonner";

/**
 * Dialog for HR / TL / manager to fix a time_clock row.
 * Two entry modes:
 *   - Per-row pencil (employee + date prefilled, existing punch loaded)
 *   - "Add missing punch" (caller must supply employee + date)
 *
 * The edit-time-clock edge function does the heavy lifting (auth, audit log,
 * UPSERT). This component just collects fields and shows the result.
 *
 * `existing` should be the current time_clock row (if any) so the form
 * pre-populates with current values. Times are expected as ISO strings.
 */
export interface EditPunchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  date: string;                       // YYYY-MM-DD
  existing?: {
    clock_in: string | null;
    clock_out: string | null;
    lunch_start: string | null;
    lunch_end: string | null;
    break1_start: string | null;
    break1_end: string | null;
    break2_start: string | null;
    break2_end: string | null;
    lunch_late_reason?: string | null;
    break1_late_reason?: string | null;
    break2_late_reason?: string | null;
  };
}

// Convert an ISO timestamp to "HH:mm" for the <input type="time" /> control,
// using the browser's local timezone.
function toTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Combine a YYYY-MM-DD date with an HH:mm time in the user's local timezone
// and return a full ISO string (with offset). Empty time → null.
function fromDateAndTime(date: string, time: string): string | null {
  if (!time) return null;
  const [hh, mm] = time.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const local = new Date(y, m - 1, d, hh, mm, 0, 0);
  return local.toISOString();
}

export function EditPunchDialog({ open, onOpenChange, employeeId, employeeName, date, existing }: EditPunchDialogProps) {
  const editPunch = useEditTimeClock();
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [lunchStart, setLunchStart] = useState("");
  const [lunchEnd, setLunchEnd] = useState("");
  const [reason, setReason] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [break1Start, setBreak1Start] = useState("");
  const [break1End, setBreak1End] = useState("");
  const [break2Start, setBreak2Start] = useState("");
  const [break2End, setBreak2End] = useState("");

  // Re-prefill when the dialog reopens for a different row.
  useEffect(() => {
    if (open) {
      setClockIn(toTimeInput(existing?.clock_in));
      setClockOut(toTimeInput(existing?.clock_out));
      setLunchStart(toTimeInput(existing?.lunch_start));
      setLunchEnd(toTimeInput(existing?.lunch_end));
      setBreak1Start(toTimeInput(existing?.break1_start));
      setBreak1End(toTimeInput(existing?.break1_end));
      setBreak2Start(toTimeInput(existing?.break2_start));
      setBreak2End(toTimeInput(existing?.break2_end));
      setReason("");
      setShowAdvanced(false);
    }
  }, [open, existing]);

  const isUpdate = !!existing?.clock_in;

  const handleSubmit = () => {
    if (reason.trim().length < 3) {
      toast.error("Please write a short reason (min 3 chars)");
      return;
    }
    if (!isUpdate && !clockIn) {
      toast.error("Clock-in time is required when adding a new punch");
      return;
    }

    const payload = {
      employee_id: employeeId,
      date,
      reason: reason.trim(),
      clock_in: fromDateAndTime(date, clockIn),
      clock_out: fromDateAndTime(date, clockOut),
      ...(showAdvanced && {
        lunch_start: fromDateAndTime(date, lunchStart),
        lunch_end: fromDateAndTime(date, lunchEnd),
        break1_start: fromDateAndTime(date, break1Start),
        break1_end: fromDateAndTime(date, break1End),
        break2_start: fromDateAndTime(date, break2Start),
        break2_end: fromDateAndTime(date, break2End),
      }),
    };

    editPunch.mutate(payload, {
      onSuccess: (data) => {
        if (data.warning) {
          toast.warning(data.warning);
        } else {
          toast.success(data.action === "insert" ? "Punch added" : "Punch updated");
        }
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error((err as Error).message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isUpdate ? "Edit punch" : "Add missing punch"}</DialogTitle>
          <DialogDescription>
            {employeeName} — {date}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ci">Clock in</Label>
              <Input id="ci" type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="co">Clock out</Label>
              <Input id="co" type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              {showAdvanced ? "Hide" : "Show"} lunch + breaks
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ls">Lunch start</Label>
                  <Input id="ls" type="time" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="le">Lunch end</Label>
                  <Input id="le" type="time" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="b1s">Break 1 start</Label>
                  <Input id="b1s" type="time" value={break1Start} onChange={(e) => setBreak1Start(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="b1e">Break 1 end</Label>
                  <Input id="b1e" type="time" value={break1End} onChange={(e) => setBreak1End(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="b2s">Break 2 start</Label>
                  <Input id="b2s" type="time" value={break2Start} onChange={(e) => setBreak2Start(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="b2e">Break 2 end</Label>
                  <Input id="b2e" type="time" value={break2End} onChange={(e) => setBreak2End(e.target.value)} />
                </div>
              </div>

              {(existing?.lunch_late_reason || existing?.break1_late_reason || existing?.break2_late_reason) && (
                <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <p className="font-semibold">Late-return reasons given by the employee:</p>
                  {existing?.lunch_late_reason && <p>Lunch: {existing.lunch_late_reason}</p>}
                  {existing?.break1_late_reason && <p>Break 1: {existing.break1_late_reason}</p>}
                  {existing?.break2_late_reason && <p>Break 2: {existing.break2_late_reason}</p>}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Agent forgot to clock in, arrived on time at 8am per supervisor confirmation"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Required. This is logged in the audit trail.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={editPunch.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={editPunch.isPending}>
            {editPunch.isPending ? "Saving..." : isUpdate ? "Save changes" : "Add punch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
