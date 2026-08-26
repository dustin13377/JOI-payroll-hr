import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateAgentFeedback,
  type ClientAgentFeedbackType,
} from "@/hooks/useClientPortal";

/**
 * One dialog for all three flavors of client-to-JOI agent feedback:
 * a note, a question about the agent, or a formal write-up request.
 * Type dropdown drives the enum on the row. Body is required and trimmed.
 * On success, we close and toast — the internal HR queue picks it up.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
}

const TYPE_OPTIONS: Array<{ value: ClientAgentFeedbackType; label: string; hint: string }> = [
  { value: "note", label: "Leave a note", hint: "General context for JOI's team — praise, feedback, or anything else." },
  { value: "question", label: "Ask a question", hint: "Something you'd like JOI to look into (attendance, performance, etc.)." },
  { value: "write_up_request", label: "Request a write-up", hint: "Ask JOI HR to formally address a performance or conduct issue." },
];

export function SendAgentFeedbackDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
}: Props) {
  const [type, setType] = useState<ClientAgentFeedbackType>("note");
  const [body, setBody] = useState("");
  const createFeedback = useCreateAgentFeedback();

  // Reset the form each time the dialog opens for a fresh agent.
  useEffect(() => {
    if (open) {
      setType("note");
      setBody("");
    }
  }, [open]);

  const selected = TYPE_OPTIONS.find((o) => o.value === type)!;

  async function onSubmit() {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Please add a message.");
      return;
    }
    try {
      await createFeedback.mutateAsync({ employeeId, type, body: trimmed });
      toast.success("Sent to JOI HR");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send message about {employeeName}</DialogTitle>
          <DialogDescription>
            Goes straight to JOI HR. You'll get a reply from your JOI contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={type} onValueChange={(v) => setType(v as ClientAgentFeedbackType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selected.hint}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <Textarea
              rows={5}
              placeholder="Type your message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createFeedback.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!body.trim() || createFeedback.isPending}
          >
            {createFeedback.isPending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
