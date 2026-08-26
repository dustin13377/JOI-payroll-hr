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
  usePositions,
  useAddPosition,
  useUpdatePositionClient,
} from "@/hooks/useRecruiting";
import { useClients } from "@/hooks/useInvoices";

/**
 * Assigns each recruiting_positions row to a client. That mapping drives the
 * client portal — applicants whose applied_position matches a position with
 * client_id X become visible to that client automatically. NULL client_id
 * keeps a position internal (Recruiter, HR, etc.).
 *
 * Also lets recruiters add a new position from here, since /recruiting no
 * longer has an inline add flow now that positions carry meaning beyond a tag.
 */
const UNASSIGNED = "__unassigned__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManagePositionsDialog({ open, onOpenChange }: Props) {
  const { data: positions = [], isLoading: positionsLoading } = usePositions();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const updateClient = useUpdatePositionClient();
  const addPosition = useAddPosition();
  const [newName, setNewName] = useState("");

  const activeClients = useMemo(
    () => clients.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const isLoading = positionsLoading || clientsLoading;

  async function onAssign(positionId: string, value: string) {
    const clientId = value === UNASSIGNED ? null : value;
    try {
      await updateClient.mutateAsync({ positionId, clientId });
      toast.success("Position updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update position");
    }
  }

  async function onAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await addPosition.mutateAsync(trimmed);
      setNewName("");
      toast.success("Position added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add position");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage positions</DialogTitle>
          <DialogDescription>
            Assign each position to the client it recruits for. Applicants whose
            applied position matches will show up in that client's portal.
            Leave unassigned for internal roles.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2 pt-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground">Add position</label>
            <Input
              placeholder="e.g. Copper Rock — Bilingual CSR"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd();
                }
              }}
            />
          </div>
          <Button
            onClick={onAdd}
            disabled={!newName.trim() || addPosition.isPending}
            size="sm"
          >
            Add
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <LogoLoadingIndicator size="md" />
          </div>
        ) : positions.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No positions yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {positions.map((p) => {
              const currentValue = p.client_id ?? UNASSIGNED;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="text-sm font-medium truncate flex-1">{p.name}</div>
                  <Select
                    value={currentValue}
                    onValueChange={(v) => onAssign(p.id, v)}
                    disabled={updateClient.isPending}
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
