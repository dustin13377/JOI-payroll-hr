import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { todayLocal } from "@/lib/localDate";
import { toast } from "sonner";

/**
 * Dialog for moving an employee from one campaign to another.
 * Required so we don't lose history of where someone was assigned —
 * past invoices and payroll need to know "what campaign was this agent
 * on during week X" not just "what campaign are they on right now."
 *
 * Writes 2 rows to employee_campaign_assignments + updates employees.campaign_id.
 */
export interface ChangeCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  employeeUuid: string;          // employees.id (UUID, not text)
  employeeTextId: string;        // employees.employee_id (e.g. "EMP-006") — for the .update().eq()
  employeeName: string;

  currentCampaignId: string | null;     // before the change
  currentCampaignName: string | null;
  newCampaignId: string;                // chosen by the picker
  newCampaignName: string;

  /** Called on success so the picker / surrounding UI can re-sync */
  onChanged?: () => void;
}

export function ChangeCampaignDialog({
  open, onOpenChange,
  employeeUuid, employeeTextId, employeeName,
  currentCampaignId, currentCampaignName,
  newCampaignId, newCampaignName,
  onChanged,
}: ChangeCampaignDialogProps) {
  const queryClient = useQueryClient();
  const [effectiveDate, setEffectiveDate] = useState<string>(todayLocal());
  const [reason, setReason] = useState<string>("");

  // Reset fields when dialog reopens
  useEffect(() => {
    if (open) {
      setEffectiveDate(todayLocal());
      setReason("");
    }
  }, [open]);

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveDate) {
        throw new Error("Effective date is required");
      }

      // 1. Look up the new campaign's organization_id (required NOT NULL field)
      const { data: campaign, error: cErr } = await supabase
        .from("campaigns")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("organization_id" as any)
        .eq("id", newCampaignId)
        .single();
      if (cErr) throw cErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgId = (campaign as any).organization_id as string;

      // 2. Fetch any currently-open (end_date IS NULL) assignment rows.
      const { data: openRows, error: openErr } = await supabase
        .from("employee_campaign_assignments")
        .select("id, start_date")
        .eq("employee_id", employeeUuid)
        .is("end_date", null);
      if (openErr) throw openErr;

      // If an open assignment already starts on the effective date, this is a
      // same-day *replacement*, not a transition. Closing it (end = day before)
      // would set end_date < start_date and violate the check constraint, so we
      // update that row in place instead of closing + inserting a duplicate.
      const sameDay = (openRows ?? []).find((r) => r.start_date === effectiveDate);

      if (sameDay) {
        const { error: repErr } = await supabase
          .from("employee_campaign_assignments")
          .update({
            campaign_id: newCampaignId,
            reason: reason.trim() || null,
            organization_id: orgId,
          })
          .eq("id", sameDay.id);
        if (repErr) throw repErr;
      } else {
        // 3a. Close any open assignment that started BEFORE the effective date.
        //     end_date = effectiveDate - 1 day. The start_date guard prevents
        //     ever ending a (future-dated) assignment before it began.
        const endOfOld = new Date(effectiveDate);
        endOfOld.setDate(endOfOld.getDate() - 1);
        const endOfOldStr =
          `${endOfOld.getFullYear()}-${String(endOfOld.getMonth() + 1).padStart(2, "0")}-${String(endOfOld.getDate()).padStart(2, "0")}`;

        const { error: closeErr } = await supabase
          .from("employee_campaign_assignments")
          .update({ end_date: endOfOldStr })
          .eq("employee_id", employeeUuid)
          .is("end_date", null)
          .lt("start_date", effectiveDate);
        if (closeErr) throw closeErr;

        // 3b. Insert the new open assignment row.
        const { error: insErr } = await supabase
          .from("employee_campaign_assignments")
          .insert({
            employee_id: employeeUuid,
            campaign_id: newCampaignId,
            start_date: effectiveDate,
            end_date: null,
            reason: reason.trim() || null,
            organization_id: orgId,
          });
        if (insErr) throw insErr;
      }

      // 4. Update the employees.campaign_id pointer so all current-state UI stays correct.
      const { error: updErr } = await supabase
        .from("employees")
        .update({ campaign_id: newCampaignId })
        .eq("employee_id", employeeTextId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success(`Moved ${employeeName} to ${newCampaignName}`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee-campaign-history", employeeUuid] });
      onChanged?.();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error((err as Error).message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change campaign</DialogTitle>
          <DialogDescription>
            {employeeName} · {currentCampaignName ?? "—"} → <strong>{newCampaignName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="effective-date">Effective date</Label>
            <Input
              id="effective-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              max={(() => {
                // Allow up to ~1 year in the future. Avoid letting people pick year 9999 etc.
                const d = new Date();
                d.setFullYear(d.getFullYear() + 1);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              })()}
            />
            <p className="text-xs text-muted-foreground">
              First day on {newCampaignName}. The old assignment ends the day before.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. BTC client lost, moving to HFB"
            />
          </div>

          {currentCampaignId === null && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              No prior assignment to close. This will be the agent's first recorded campaign.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={moveMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => moveMutation.mutate()} disabled={!effectiveDate || moveMutation.isPending}>
            {moveMutation.isPending ? "Moving…" : "Confirm move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
