import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  useTerminateEmployee,
  type EmploymentStatus,
  type TerminateEmployeeInput,
} from "@/hooks/useSupabasePayroll";
import { toast } from "sonner";

// Local helper — keep timeclock-style local date so we don't shift the day in UTC.
function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type TerminationStatus = Exclude<EmploymentStatus, "active">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; nombre: string };  // id is the readable employee_id
  onSuccess?: () => void;
}

export function TerminateEmployeeDialog({ open, onOpenChange, employee, onSuccess }: Props) {
  const terminate = useTerminateEmployee();
  const [status, setStatus] = useState<TerminationStatus>("terminated");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [rehireChoice, setRehireChoice] = useState<"yes" | "no" | "review">("review");
  const [lastWorkedDay, setLastWorkedDay] = useState<string>(todayLocal());

  const reset = () => {
    setStatus("terminated");
    setReason("");
    setNotes("");
    setRehireChoice("review");
    setLastWorkedDay(todayLocal());
  };

  const close = () => {
    onOpenChange(false);
    // Reset *after* close animation so the user doesn't see fields flicker.
    setTimeout(reset, 200);
  };

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error("Reason is required — pick a short label so HR can scan it later.");
      return;
    }
    const rehireEligible: boolean | null =
      rehireChoice === "yes" ? true : rehireChoice === "no" ? false : null;

    const input: TerminateEmployeeInput = {
      employeeId: employee.id,
      status,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
      rehireEligible,
      lastWorkedDay,
    };
    terminate.mutate(input, {
      onSuccess: () => {
        toast.success(`${employee.nombre} marked ${statusLabel(status).toLowerCase()}`);
        close();
        onSuccess?.();
      },
      onError: (err: any) => toast.error(err?.message || "Failed to offboard employee"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Offboard {employee.nombre}</DialogTitle>
          <DialogDescription>
            We keep the record on file — payroll history, EOD logs, and personal info all
            stay. They just won't appear in active rosters and their login is blocked.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TerminationStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="terminated">Terminated — we let them go</SelectItem>
                <SelectItem value="resigned">Resigned — they quit</SelectItem>
                <SelectItem value="on_leave">On Leave — temporary</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Reason (short)</Label>
            <Input
              placeholder='e.g. "No call no show", "Found a new job", "Maternity leave"'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={120}
              autoComplete="off"
              name="terminate-reason"
            />
          </div>

          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Anything HR or a future hiring manager should know."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              autoComplete="off"
              name="terminate-notes"
            />
          </div>

          <div className="grid gap-2">
            <Label>Last worked day</Label>
            <Input
              type="date"
              value={lastWorkedDay}
              onChange={(e) => setLastWorkedDay(e.target.value)}
              autoComplete="off"
              name="terminate-last-day"
            />
          </div>

          {status !== "on_leave" && (
            <div className="grid gap-2">
              <Label>Eligible for rehire?</Label>
              <RadioGroup
                value={rehireChoice}
                onValueChange={(v) => setRehireChoice(v as typeof rehireChoice)}
                className="flex flex-col gap-2"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="yes" /> Yes — we'd take them back
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="no" /> No — Do Not Rehire
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="review" /> Needs review (decide later)
                </label>
              </RadioGroup>
              {rehireChoice === "no" && (
                <Alert variant="destructive" className="mt-1">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    If this person tries to come back under a different name, the system
                    will warn whoever tries to hire them — provided their CURP or DOB
                    matches what's on file.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={terminate.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={terminate.isPending || !reason.trim()}
          >
            {terminate.isPending ? "Saving..." : "Offboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function statusLabel(s: TerminationStatus): string {
  switch (s) {
    case "terminated": return "Terminated";
    case "resigned":   return "Resigned";
    case "on_leave":   return "On Leave";
  }
}
