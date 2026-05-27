import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface EditNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** employees.id (UUID), not the EMP-### text code */
  employeeUuid: string;
  /** Current employees.full_name — used to prefill the form */
  currentFullName: string;
  /** Current employees.work_name — used to prefill the form */
  currentWorkName: string | null;
}

/**
 * Edit the legal name + work name on an employee record. Calls the
 * `update_employee_name` RPC, which enforces permissions (owner/admin can
 * edit anyone, manager can edit only agents and team leads) and writes an
 * audit row to `employee_name_changes`.
 *
 * The button that opens this dialog should already be gated in the parent —
 * the RPC will reject unauthorized callers too, but we hide the UI for them
 * to keep the page clean.
 */
export function EditNameDialog({
  open,
  onOpenChange,
  employeeUuid,
  currentFullName,
  currentWorkName,
}: EditNameDialogProps) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(currentFullName);
  const [workName, setWorkName] = useState(currentWorkName ?? "");

  // Reset form whenever the dialog opens with fresh props.
  useEffect(() => {
    if (open) {
      setFullName(currentFullName);
      setWorkName(currentWorkName ?? "");
    }
  }, [open, currentFullName, currentWorkName]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("update_employee_name", {
        p_employee_id: employeeUuid,
        p_full_name: fullName.trim(),
        p_work_name: workName.trim() || null,
      });
      if (error) throw error;
      return data as {
        employee_id: string;
        full_name: string;
        work_name: string | null;
        changed: boolean;
      };
    },
    onSuccess: (data) => {
      if (data.changed) {
        toast.success("Name updated");
      } else {
        toast.info("No change — same name");
      }
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["tl-profile-fallback"] });
      queryClient.invalidateQueries({ queryKey: ["inactive-profile-fallback"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update name";
      toast.error(message);
    },
  });

  const trimmedFull = fullName.trim();
  const canSubmit = trimmedFull.length >= 2 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit name</DialogTitle>
          <DialogDescription>
            Legal name is what appears on payroll, contracts, and invoices.
            Work name is what shows up in the app for day-to-day use.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-name-legal">Legal name</Label>
            <Input
              id="edit-name-legal"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full legal name as on official documents"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-name-work">
              Work name <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="edit-name-work"
              value={workName}
              onChange={(e) => setWorkName(e.target.value)}
              placeholder="What they go by at work (e.g. Jacob, Sam)"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if the legal name is also the work name.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
