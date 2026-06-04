import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  FileText,
  ExternalLink,
  Play,
  XCircle,
  ArrowDownCircle,
} from "lucide-react";
import { formatDateMX } from "@/lib/localDate";
import {
  useHrDocumentRequestsQueue,
  useHrDocumentRequest,
  useUpdateHrDocumentRequestStatus,
  useHrDocumentRequestsForEmployee,
  issueHrDocumentSignedUrl,
} from "@/hooks/useHrDocumentRequests";
import type { HrDocumentRequestStatus, HrDocumentRequestType } from "@/types/hr-docs";

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  fulfilled: { label: "Fulfilled", variant: "outline" },
  canceled: { label: "Canceled", variant: "destructive" },
  downgraded: { label: "Downgraded", variant: "outline" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateMX(dateStr);
}

type TabValue = "pending" | "in_progress" | "fulfilled" | "all";

const TAB_CONFIG: { value: TabValue; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "all", label: "All" },
];

export default function HrDocumentQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabValue>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useHrDocumentRequestsQueue({
    status: tab as HrDocumentRequestStatus | "all",
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">HR Document Queue</h1>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as TabValue);
          setSelectedId(null);
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4">
          {TAB_CONFIG.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_CONFIG.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            {isLoading ? (
              <LogoLoadingIndicator size="sm" />
            ) : requests.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">
                {t.value === "pending" && "No pending requests."}
                {t.value === "in_progress" && "No requests in progress."}
                {t.value === "fulfilled" && "No fulfilled requests."}
                {t.value === "all" && "No requests."}
              </p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Incident Date</TableHead>
                      <TableHead>Filed By</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((req) => {
                      const si = STATUS_LABELS[req.status] ?? {
                        label: req.status,
                        variant: "outline" as const,
                      };
                      return (
                        <TableRow
                          key={req.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedId(req.id)}
                        >
                          <TableCell className="font-medium">
                            {req.employeeName ?? "—"}
                          </TableCell>
                          <TableCell>{req.campaignName ?? "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                req.requestType === "acta" ||
                                req.requestType === "rescision_prueba" ||
                                req.requestType === "rescision_desempeno"
                                  ? "destructive"
                                  : req.requestType === "renuncia"
                                    ? "secondary"
                                    : "outline"
                              }
                              className="text-xs"
                            >
                              {req.requestType === "acta"
                                ? "Disciplinary Act"
                                : req.requestType === "renuncia"
                                  ? "Resignation"
                                  : req.requestType === "rescision_prueba"
                                    ? "Probation Termination"
                                    : req.requestType === "rescision_desempeno"
                                      ? "Performance Termination"
                                      : "Commitment Letter"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={si.variant} className="text-xs">
                              {si.label}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateMX(req.incidentDate)}</TableCell>
                          <TableCell>{req.filerName ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {timeAgo(req.filedAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {selectedId && (
        <RequestDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

// ── Detail panel ────────────────────────────────────────────────────

function RequestDetail({
  id,
  onClose,
  navigate,
}: {
  id: string;
  onClose: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { data: req, isLoading } = useHrDocumentRequest(id);
  const updateStatus = useUpdateHrDocumentRequestStatus();

  // Cancel/downgrade dialog
  const [actionDialog, setActionDialog] = useState<
    "canceled" | "downgraded" | null
  >(null);
  const [actionReason, setActionReason] = useState("");

  // Prior history for this employee
  const { data: priorRequests = [] } = useHrDocumentRequestsForEmployee(
    req?.employeeId,
  );
  const otherRequests = priorRequests.filter((r) => r.id !== id);

  if (isLoading || !req) {
    return (
      <Card>
        <CardContent className="p-6">
          <LogoLoadingIndicator size="sm" />
        </CardContent>
      </Card>
    );
  }

  const si = STATUS_LABELS[req.status] ?? {
    label: req.status,
    variant: "outline" as const,
  };
  const isTerminal =
    req.status === "fulfilled" ||
    req.status === "canceled" ||
    req.status === "downgraded";

  function handleStartDrafting() {
    updateStatus.mutate(
      { id, employeeId: req!.employeeId, status: "in_progress" },
      {
        onSuccess: () => {
          toast.success("Request marked as in progress");
          navigate(`/hr/document-queue/${id}/edit`);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  function handleConfirmAction() {
    if (!actionDialog) return;
    updateStatus.mutate(
      {
        id,
        employeeId: req!.employeeId,
        status: actionDialog,
        canceledReason: actionReason.trim(),
      },
      {
        onSuccess: () => {
          toast.success(
            actionDialog === "canceled"
              ? "Request canceled"
              : "Request downgraded to verbal",
          );
          setActionDialog(null);
          setActionReason("");
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Request Detail
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to list
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Header info */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant={req.requestType === "acta" || req.requestType === "rescision_prueba" || req.requestType === "rescision_desempeno" ? "destructive" : req.requestType === "renuncia" ? "secondary" : "outline"}
            >
              {req.requestType === "acta"
                ? "Disciplinary Act"
                : req.requestType === "renuncia"
                  ? "Voluntary Resignation"
                  : req.requestType === "rescision_prueba"
                    ? "Probation Termination"
                    : req.requestType === "rescision_desempeno"
                      ? "Performance Termination"
                      : "Commitment Letter"}
            </Badge>
            <Badge variant={si.variant}>{si.label}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Agent:</span>{" "}
              <span className="font-medium">{req.employeeName ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Campaign:</span>{" "}
              {req.campaignName ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Incident Date:</span>{" "}
              {formatDateMX(req.incidentDate)}
            </div>
            <div>
              <span className="text-muted-foreground">Filed By:</span>{" "}
              {req.filerName ?? "—"} · {timeAgo(req.filedAt)}
            </div>
          </div>

          {req.reason && (
            <div className="text-sm">
              <span className="text-muted-foreground">Reason:</span>{" "}
              <span className="italic">{req.reason}</span>
            </div>
          )}

          {/* Full TL narrative */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              TL Narrative
            </p>
            <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap bg-muted/30">
              {req.tlNarrative}
            </div>
          </div>

          {/* Canceled reason */}
          {isTerminal && req.canceledReason && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                {req.status === "canceled" ? "Cancellation reason" : "Downgrade reason"}
              </p>
              <div className="rounded-lg border border-destructive/30 p-3 text-sm bg-destructive/5">
                {req.canceledReason}
              </div>
            </div>
          )}

          {/* Fulfilled doc links */}
          {req.status === "fulfilled" &&
            (req.fulfilledCartaId || req.fulfilledActaId || req.fulfilledRenunciaId || req.fulfilledRescisionId) && (
              <QueueFulfilledLinks
                finalizationId={(req.fulfilledCartaId ?? req.fulfilledActaId ?? req.fulfilledRenunciaId ?? req.fulfilledRescisionId)!}
                type={req.requestType}
              />
            )}

          {/* Actions */}
          {!isTerminal && (
            <div className="flex items-center gap-2 pt-2 border-t">
              {req.status === "pending" && (
                <Button
                  size="sm"
                  onClick={handleStartDrafting}
                  disabled={updateStatus.isPending}
                >
                  <Play className="mr-1 h-4 w-4" />
                  {updateStatus.isPending
                    ? "Updating..."
                    : "Start drafting"}
                </Button>
              )}
              {req.status === "in_progress" && (
                <Button
                  size="sm"
                  onClick={() => navigate(`/hr/document-queue/${id}/edit`)}
                >
                  <Play className="mr-1 h-4 w-4" />
                  Open draft
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionReason("");
                  setActionDialog("canceled");
                }}
              >
                <XCircle className="mr-1 h-4 w-4" /> Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionReason("");
                  setActionDialog("downgraded");
                }}
              >
                <ArrowDownCircle className="mr-1 h-4 w-4" /> Downgrade to verbal
              </Button>
            </div>
          )}

          {/* Link to profile */}
          <Button
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => navigate(`/empleados/${req.employeeId}`)}
          >
            <ExternalLink className="mr-1 h-3 w-3" /> View employee profile
          </Button>

          {/* Prior requests for this employee */}
          {otherRequests.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-muted-foreground">
                Other requests for this employee
              </p>
              <ul className="space-y-1">
                {otherRequests.map((r) => {
                  const s = STATUS_LABELS[r.status] ?? {
                    label: r.status,
                    variant: "outline" as const,
                  };
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Badge
                        variant={
                          r.requestType === "acta" ? "destructive" : "outline"
                        }
                        className="text-[10px]"
                      >
                        {r.requestType === "acta" ? "Disciplinary Act" : "Commitment Letter"}
                      </Badge>
                      <Badge variant={s.variant} className="text-[10px]">
                        {s.label}
                      </Badge>
                      <span>{formatDateMX(r.incidentDate)}</span>
                      <span>— {r.filerName ?? "—"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel / Downgrade confirmation dialog */}
      <Dialog
        open={!!actionDialog}
        onOpenChange={(o) => {
          if (!o) setActionDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog === "canceled"
                ? "Cancel request"
                : "Downgrade to verbal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="action-reason">
              {actionDialog === "canceled"
                ? "Cancellation reason"
                : "Downgrade reason"}
            </Label>
            <Textarea
              id="action-reason"
              autoFocus
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Enter the reason..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmAction}
              disabled={
                actionReason.trim().length < 5 || updateStatus.isPending
              }
            >
              {updateStatus.isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QueueFulfilledLinks({
  finalizationId,
  type,
}: {
  finalizationId: string;
  type: HrDocumentRequestType;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleView(fileType: "pdf" | "signed_scan") {
    setLoading(fileType);
    try {
      const url = await issueHrDocumentSignedUrl(finalizationId, type, fileType);
      window.open(url, "_blank");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={loading === "pdf"}
        onClick={() => handleView("pdf")}
      >
        <ExternalLink className="mr-1 h-3 w-3" />
        {loading === "pdf" ? "Opening..." : "View PDF"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={loading === "signed_scan"}
        onClick={() => handleView("signed_scan")}
      >
        <ExternalLink className="mr-1 h-3 w-3" />
        {loading === "signed_scan" ? "Opening..." : "View Signed Scan"}
      </Button>
    </div>
  );
}
