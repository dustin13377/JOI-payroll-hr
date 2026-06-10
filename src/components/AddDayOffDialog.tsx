import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateUSShort } from "@/lib/localDate";
import type { TimeOffRequestType } from "@/hooks/useVacationRequests";

/**
 * Manager+ dialog to add (or remove) a single day off for an agent, opened
 * from the Clock-in History calendar on EmpleadoPerfil.
 *
 * Inserts a vacation_requests row that is born approved — no TL/HR review
 * loop, because the person adding it IS the approver. Both reviewed_by
 * columns are stamped with the creator (audit trail = "manager added this
 * directly"). RLS: vacation_requests_leadership_all already allows
 * owner/admin/manager to insert/update rows for any org employee.
 *
 * Payroll picks these up automatically: usePayrollComputed excludes approved
 * time-off days from absence math, and paid days surface on the PayrollRun
 * vacation-pay flag card.
 */

export interface ExistingDayOff {
  id: string;
  request_type: TimeOffRequestType;
  is_paid: boolean;
  start_date: string;
  end_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeUuid: string; // employees.id (UUID — not the text employee_id code)
  employeeName: string;
  campaignId: string | null; // vacation_requests.campaign_id is NOT NULL
  date: string; // YYYY-MM-DD (the clicked calendar cell)
  /** Approved request already covering this date — switches dialog to remove mode. */
  existing?: ExistingDayOff;
}

const TYPE_LABELS: Record<TimeOffRequestType, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  other: "Other",
};

export function AddDayOffDialog({
  open,
  onOpenChange,
  employeeUuid,
  employeeName,
  campaignId,
  date,
  existing,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [requestType, setRequestType] = useState<TimeOffRequestType>("vacation");
  // LFT default: vacation is paid, everything else unpaid — but the manager
  // can flip it either way.
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState("");

  // Reset form each time the dialog opens for a fresh date
  useEffect(() => {
    if (open) {
      setRequestType("vacation");
      setIsPaid(true);
      setNotes("");
    }
  }, [open, date]);

  function handleTypeChange(t: TimeOffRequestType) {
    setRequestType(t);
    setIsPaid(t === "vacation");
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["clock-in-history-timeoff", employeeUuid] });
    qc.invalidateQueries({ queryKey: ["vacationRequests", employeeUuid] });
    qc.invalidateQueries({ queryKey: ["vacationBalance", employeeUuid] });
    qc.invalidateQueries({ queryKey: ["hrAllVacationRequests"] });
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) {
        throw new Error("This agent has no campaign assigned — assign a campaign first.");
      }
      const now = new Date().toISOString();
      const { error } = await supabase.from("vacation_requests").insert({
        employee_id: employeeUuid,
        campaign_id: campaignId,
        start_date: date,
        end_date: date,
        days_requested: 1,
        status: "approved",
        request_type: requestType,
        is_paid: isPaid,
        notes: notes.trim() || null,
        tl_reviewed_by: user?.id ?? null,
        tl_reviewed_at: now,
        hr_reviewed_by: user?.id ?? null,
        hr_reviewed_at: now,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        `Day off added for ${employeeName} — ${formatDateUSShort(date)} (${TYPE_LABELS[requestType]}, ${isPaid ? "paid" : "unpaid"})`
      );
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to add day off");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!existing) return;
      const { error } = await supabase
        .from("vacation_requests")
        .update({ status: "cancelled" })
        .eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Day off removed for ${employeeName} — ${formatDateUSShort(date)}`);
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to remove day off");
    },
  });

  // ── Remove mode ────────────────────────────────────────────────────────────
  if (existing) {
    const multiDay = existing.start_date !== existing.end_date;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove day off</DialogTitle>
            <DialogDescription>
              {employeeName} has an approved {TYPE_LABELS[existing.request_type].toLowerCase()} day
              ({existing.is_paid ? "paid" : "unpaid"}) on {formatDateUSShort(date)}.
            </DialogDescription>
          </DialogHeader>
          {multiDay && (
            <p className="text-sm text-amber-600">
              Heads up: this is part of a {formatDateUSShort(existing.start_date)} –{" "}
              {formatDateUSShort(existing.end_date)} request. Removing it cancels the{" "}
              <span className="font-medium">entire range</span>, not just this day.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing…" : "Remove day off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Add mode ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add day off</DialogTitle>
          <DialogDescription>
            {employeeName} — {formatDateUSShort(date)}. This is approved immediately, no
            review needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={requestType} onValueChange={(v) => handleTypeChange(v as TimeOffRequestType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as TimeOffRequestType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="dayoff-paid">Paid</Label>
              <p className="text-xs text-muted-foreground">
                {isPaid
                  ? "Counts as a paid day — shows on the payroll vacation-pay card."
                  : "Unpaid — agent just isn't marked absent for this day."}
              </p>
            </div>
            <Switch id="dayoff-paid" checked={isPaid} onCheckedChange={setIsPaid} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dayoff-notes">Note (optional)</Label>
            <Textarea
              id="dayoff-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason / context"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
            {addMutation.isPending ? "Saving…" : "Add day off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
