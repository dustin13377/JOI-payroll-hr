import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useChangeEmployeeRole } from "@/hooks/useSupabasePayroll";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Title = "agent" | "team_lead" | "manager" | "admin" | "owner";

const TITLE_LABELS: Record<Title, string> = {
  agent: "Agent",
  team_lead: "Team Lead",
  manager: "Manager",
  admin: "Admin / HR",
  owner: "Owner",
};

export interface ChangeRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  currentTitle: Title;
}

export function ChangeRoleDialog({ open, onOpenChange, employeeId, employeeName, currentTitle }: ChangeRoleDialogProps) {
  const { isOwner } = useAuth();
  const changeRole = useChangeEmployeeRole();
  const [newTitle, setNewTitle] = useState<Title>(currentTitle);

  useEffect(() => {
    if (open) setNewTitle(currentTitle);
  }, [open, currentTitle]);

  // Owners can promote up to owner; everyone else can only manage up to admin.
  const titleOptions: Title[] = isOwner
    ? ["agent", "team_lead", "manager", "admin", "owner"]
    : ["agent", "team_lead", "manager", "admin"];

  const handleSubmit = () => {
    if (newTitle === currentTitle) {
      toast.info("No change — already that role");
      return;
    }
    changeRole.mutate(
      { employee_id: employeeId, new_title: newTitle },
      {
        onSuccess: (data) => {
          toast.success(
            `${employeeName}: ${TITLE_LABELS[data.old_title as Title]} → ${TITLE_LABELS[data.new_title as Title]}`,
          );
          if (!data.auth_user_synced) {
            toast.warning("Role updated on employee record, but they have no login account yet.");
          }
          onOpenChange(false);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const isDowngrade =
    (currentTitle === "team_lead" && newTitle === "agent") ||
    (currentTitle === "manager" && (newTitle === "team_lead" || newTitle === "agent")) ||
    (currentTitle === "admin" && (newTitle === "team_lead" || newTitle === "agent" || newTitle === "manager"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            {employeeName} is currently <strong>{TITLE_LABELS[currentTitle]}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-role">New role</Label>
            <Select value={newTitle} onValueChange={(v) => setNewTitle(v as Title)}>
              <SelectTrigger id="new-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {titleOptions.map((t) => (
                  <SelectItem key={t} value={t}>{TITLE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isDowngrade && (
            <p className="text-xs text-orange-600">
              Heads up: this is a downgrade. Their app access will be reduced immediately after they next sign in.
            </p>
          )}

          {newTitle === "owner" && (
            <p className="text-xs text-orange-600">
              Promoting to Owner grants full control of the organization. Only do this if you mean it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={changeRole.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={changeRole.isPending || newTitle === currentTitle}
          >
            {changeRole.isPending ? "Saving..." : "Apply change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
