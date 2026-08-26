import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import {
  useRoles,
  useAssignRoleClient,
  useUnassignRole,
} from "@/hooks/useRecruiting";
import { useClients } from "@/hooks/useInvoices";

/**
 * Maps each applied_position role (the exact string the ad URL sends) to a
 * client. Drives the client portal — applicants whose applied_position
 * matches an assigned role become visible to that client automatically.
 *
 * Data source is the union of:
 *   - distinct applied_position values across all candidates (auto-listed)
 *   - any role name that's been mapped to a client (recruiting_role_clients)
 *
 * The union means pre-launch clients like Copper Rock can pre-register roles
 * before any applicant lands, and known roles ("Funding Application Activation
 * Specialist", "General Application", …) can be assigned in one place.
 */
const UNASSIGNED = "__unassigned__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageRolesDialog({ open, onOpenChange }: Props) {
  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const assign = useAssignRoleClient();
  const unassign = useUnassignRole();

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleClient, setNewRoleClient] = useState<string>("");

  const activeClients = useMemo(
    () => clients.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const isLoading = rolesLoading || clientsLoading;

  async function onAssignChange(roleName: string, value: string) {
    try {
      if (value === UNASSIGNED) {
        await unassign.mutateAsync(roleName);
        toast.success("Role unassigned");
      } else {
        await assign.mutateAsync({ roleName, clientId: value });
        toast.success("Role assigned");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    }
  }

  async function onAdd() {
    const trimmed = newRoleName.trim();
    if (!trimmed) return;
    if (!newRoleClient) {
      toast.error("Pick a client for the new role");
      return;
    }
    try {
      await assign.mutateAsync({ roleName: trimmed, clientId: newRoleClient });
      setNewRoleName("");
      setNewRoleClient("");
      toast.success("Role added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add role");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage roles</DialogTitle>
          <DialogDescription>
            Assign each role (from the "Role" column) to the client it's for.
            Applicants whose applied role matches will show up in that client's
            portal. Leave unassigned for internal roles.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Add role (for a client you haven't started running ads for yet)
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                placeholder="e.g. Copper Rock — Bilingual CSR"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAdd();
                  }
                }}
              />
            </div>
            <Select value={newRoleClient} onValueChange={setNewRoleClient}>
              <SelectTrigger className="h-9 w-[220px] text-sm">
                <SelectValue placeholder="Pick client…" />
              </SelectTrigger>
              <SelectContent>
                {activeClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={onAdd}
              disabled={!newRoleName.trim() || !newRoleClient || assign.isPending}
              size="sm"
            >
              Add
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <LogoLoadingIndicator size="md" />
          </div>
        ) : roles.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No roles yet. Add one above, or wait for the first applicant.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {roles.map((r) => {
              const currentValue = r.client_id ?? UNASSIGNED;
              const pending = assign.isPending || unassign.isPending;
              return (
                <div
                  key={r.role_name}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="text-sm font-medium truncate flex-1">
                    {r.role_name}
                  </div>
                  <Select
                    value={currentValue}
                    onValueChange={(v) => onAssignChange(r.role_name, v)}
                    disabled={pending}
                  >
                    <SelectTrigger className="h-8 w-[220px] text-sm">
                      <SelectValue placeholder="Assign client…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>
                        <span className="text-muted-foreground">Internal / unassigned</span>
                      </SelectItem>
                      {activeClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
