import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { Inbox, MessageSquare, HelpCircle, AlertOctagon } from "lucide-react";
import { toast } from "sonner";
import {
  useClientMessages,
  useUpdateClientFeedback,
  type ClientMessage,
  type ClientMessageType,
} from "@/hooks/useClientMessages";
import { formatDateMX } from "@/lib/localDate";

// ─────────────────────────────────────────────────────────────────────────────
// Type badge — three flavors, color-coded so the eye can skim.
// ─────────────────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ClientMessageType }) {
  if (type === "note") {
    return (
      <Badge variant="outline" className="border-blue-300 text-blue-700 gap-1">
        <MessageSquare className="h-3 w-3" />
        Note
      </Badge>
    );
  }
  if (type === "question") {
    return (
      <Badge variant="outline" className="border-amber-300 text-amber-700 gap-1">
        <HelpCircle className="h-3 w-3" />
        Question
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-red-300 text-red-700 gap-1">
      <AlertOctagon className="h-3 w-3" />
      Write-up request
    </Badge>
  );
}

function StatusBadge({ status }: { status: ClientMessage["status"] }) {
  if (status === "open") return <Badge className="bg-emerald-600 text-white">Open</Badge>;
  if (status === "acknowledged")
    return <Badge className="bg-sky-600 text-white">Acknowledged</Badge>;
  return <Badge variant="secondary">Resolved</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp: short date + hh:mm — feedback often lands within a workday so
// having the time visible tells you which "yesterday" you're looking at.
// ─────────────────────────────────────────────────────────────────────────────

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDateMX(d)} ${hh}:${mm}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────────

interface RowProps {
  msg: ClientMessage;
  highlighted: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
  isBusy: boolean;
  rowRef?: (el: HTMLLIElement | null) => void;
}

function MessageRow({ msg, highlighted, onAcknowledge, onResolve, isBusy, rowRef }: RowProps) {
  const employeeDisplayName =
    msg.employee?.work_name || msg.employee?.full_name || "Unknown agent";
  const employeeCode = msg.employee?.employee_id; // TEXT code for the URL
  const canAcknowledge = msg.status === "open";
  const canResolve = msg.status !== "resolved";

  return (
    <li
      ref={rowRef}
      className={
        "rounded-md border px-4 py-3 space-y-2 transition-colors duration-500 " +
        (highlighted ? "border-amber-400 bg-amber-50 shadow-sm" : "")
      }
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={msg.type} />
            <StatusBadge status={msg.status} />
            <span className="text-xs text-muted-foreground">
              {formatWhen(msg.created_at)}
            </span>
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">Agent: </span>
            {employeeCode ? (
              <Link
                to={`/empleados/${employeeCode}`}
                className="font-medium text-primary hover:underline"
              >
                {employeeDisplayName}
              </Link>
            ) : (
              <span className="font-medium">{employeeDisplayName}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canAcknowledge && (
            <Button size="sm" variant="outline" disabled={isBusy} onClick={onAcknowledge}>
              Acknowledge
            </Button>
          )}
          {canResolve && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isBusy}
              onClick={onResolve}
            >
              Resolve
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
      {msg.resolution_note && msg.status === "resolved" && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
          Resolution: {msg.resolution_note}
        </p>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve dialog — resolution_note is optional per spec.
// ─────────────────────────────────────────────────────────────────────────────

function ResolveDialog({
  msg,
  onCancel,
  onConfirm,
  isPending,
}: {
  msg: ClientMessage;
  onCancel: () => void;
  onConfirm: (note: string) => void;
  isPending: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve message</DialogTitle>
          <DialogDescription>
            Mark this client message as resolved. Add an optional internal note
            about how you handled it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="resolve-note">Resolution note (optional)</Label>
          <Textarea
            id="resolve-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Spoke with TL, coached the agent, closed."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={isPending}
            onClick={() => onConfirm(note)}
          >
            {isPending ? "Resolving…" : "Mark resolved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

interface ClientGroup {
  clientId: string;
  clientName: string;
  messages: ClientMessage[];
  openCount: number;
}

export default function ClientMessages() {
  const [showResolved, setShowResolved] = useState(false);
  const { data: messages = [], isLoading } = useClientMessages(showResolved);
  const updateMut = useUpdateClientFeedback();
  const [resolveTarget, setResolveTarget] = useState<ClientMessage | null>(null);

  // Deep-link support: `?open=<id>` scrolls the row into view and highlights it
  // for a moment. Emails from the notify-HR edge fn will use this.
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("open");
  const [highlightId, setHighlightId] = useState<string | null>(openId);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  // Reset the highlight state whenever a new deep-link id shows up.
  useEffect(() => {
    setHighlightId(openId);
  }, [openId]);

  // Once the rows are on screen AND the target row exists in the current
  // dataset, scroll + start the 1s highlight fade.
  useEffect(() => {
    if (!highlightId || isLoading) return;
    const el = rowRefs.current[highlightId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => setHighlightId(null), 1200);
    return () => window.clearTimeout(t);
  }, [highlightId, isLoading, messages.length]);

  const groups = useMemo<ClientGroup[]>(() => {
    const byClient = new Map<string, ClientGroup>();
    for (const m of messages) {
      const clientId = m.client_id;
      const clientName = m.client?.name ?? "Unknown client";
      let g = byClient.get(clientId);
      if (!g) {
        g = { clientId, clientName, messages: [], openCount: 0 };
        byClient.set(clientId, g);
      }
      g.messages.push(m);
      if (m.status === "open") g.openCount += 1;
    }
    // Sort clients by open count desc (most-pressing first), then by name.
    return Array.from(byClient.values()).sort((a, b) => {
      if (a.openCount !== b.openCount) return b.openCount - a.openCount;
      return a.clientName.localeCompare(b.clientName);
    });
  }, [messages]);

  function handleAcknowledge(msg: ClientMessage) {
    updateMut.mutate(
      { id: msg.id, action: "acknowledge" },
      {
        onSuccess: () => toast.success("Message acknowledged"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to acknowledge"),
      },
    );
  }

  function handleResolveConfirm(note: string) {
    if (!resolveTarget) return;
    const id = resolveTarget.id;
    updateMut.mutate(
      { id, action: "resolve", resolutionNote: note },
      {
        onSuccess: () => {
          toast.success("Message resolved");
          setResolveTarget(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to resolve"),
      },
    );
  }

  const busyId =
    updateMut.isPending && (updateMut.variables as { id?: string } | undefined)?.id;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" /> Client Messages
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notes, questions, and write-up requests clients have submitted about
            specific agents from their portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-resolved"
            checked={showResolved}
            onCheckedChange={setShowResolved}
          />
          <Label htmlFor="show-resolved" className="text-sm cursor-pointer">
            Show resolved
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <LogoLoadingIndicator />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {showResolved
              ? "No client messages yet."
              : "Inbox zero — no open or acknowledged messages from clients."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g.clientId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{g.clientName}</span>
                  {g.openCount > 0 && (
                    <Badge className="bg-emerald-600 text-white">
                      {g.openCount} open
                    </Badge>
                  )}
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    {g.messages.length}{" "}
                    {g.messages.length === 1 ? "message" : "messages"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {g.messages.map((m) => (
                    <MessageRow
                      key={m.id}
                      msg={m}
                      highlighted={highlightId === m.id}
                      onAcknowledge={() => handleAcknowledge(m)}
                      onResolve={() => setResolveTarget(m)}
                      isBusy={busyId === m.id}
                      rowRef={(el) => {
                        rowRefs.current[m.id] = el;
                      }}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resolveTarget && (
        <ResolveDialog
          msg={resolveTarget}
          onCancel={() => setResolveTarget(null)}
          onConfirm={handleResolveConfirm}
          isPending={updateMut.isPending}
        />
      )}
    </div>
  );
}
