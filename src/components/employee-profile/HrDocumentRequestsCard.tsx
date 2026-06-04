import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Plus, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { formatDateMX, todayLocal } from "@/lib/localDate";
import {
  useHrDocumentRequestsForEmployee,
  useCreateHrDocumentRequest,
  issueHrDocumentSignedUrl,
} from "@/hooks/useHrDocumentRequests";
import type { HrDocumentRequestType } from "@/types/hr-docs";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
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
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateMX(dateStr);
}

export default function HrDocumentRequestsCard({
  employeeId,
  authEmployeeId,
}: {
  employeeId: string;
  authEmployeeId: string;
}) {
  const { data: requests = [], isLoading } =
    useHrDocumentRequestsForEmployee(employeeId);
  const createRequest = useCreateHrDocumentRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestType, setRequestType] = useState<HrDocumentRequestType>("carta");
  const [incidentDate, setIncidentDate] = useState(
    () => todayLocal(),
  );
  const [reason, setReason] = useState("");
  const [narrative, setNarrative] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const today = todayLocal();
  const isValid =
    narrative.trim().length > 0 && incidentDate && incidentDate <= today;

  function resetForm() {
    setRequestType("carta");
    setIncidentDate(todayLocal());
    setReason("");
    setNarrative("");
  }

  function handleSubmit() {
    createRequest.mutate(
      {
        employeeId,
        requestType,
        incidentDate,
        tlNarrative: narrative.trim(),
        reason: reason.trim() || null,
        filedBy: authEmployeeId,
      },
      {
        onSuccess: () => {
          toast.success("Request sent to HR");
          setDialogOpen(false);
          resetForm();
        },
        onError: (err) => {
          toast.error((err as Error).message);
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cartas y Actas
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> Solicitar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <LogoLoadingIndicator size="sm" />
        )}

        {!isLoading && requests.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay solicitudes filadas para este agente aún.
          </p>
        )}

        {requests.length > 0 && (
          <ul className="space-y-3">
            {requests.map((req) => {
              const statusInfo = STATUS_LABELS[req.status] ?? {
                label: req.status,
                variant: "outline" as const,
              };
              const isExpanded = expandedId === req.id;
              const preview =
                req.tlNarrative.length > 100
                  ? req.tlNarrative.slice(0, 100) + "…"
                  : req.tlNarrative;

              return (
                <li
                  key={req.id}
                  className="border-l-2 border-muted pl-3 space-y-1"
                >
                  <div className="flex items-center gap-2 flex-wrap">
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
                        ? "Acta administrativa"
                        : req.requestType === "renuncia"
                          ? "Renuncia"
                          : req.requestType === "rescision_prueba"
                            ? "Rescisión periodo de prueba 30 Días"
                            : req.requestType === "rescision_desempeno"
                              ? "Rescisión por bajo desempeño Contrato de Capacitación Inicial"
                              : "Carta de compromiso"}
                    </Badge>
                    <Badge variant={statusInfo.variant} className="text-xs">
                      {statusInfo.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateMX(req.incidentDate)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      — {req.filerName ?? "Desconocido"} · {timeAgo(req.filedAt)}
                    </span>
                  </div>

                  {req.reason && (
                    <p className="text-xs text-muted-foreground italic">
                      {req.reason}
                    </p>
                  )}

                  <p className="text-sm">
                    {isExpanded ? req.tlNarrative : preview}
                  </p>

                  {req.tlNarrative.length > 100 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : req.id)
                      }
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="mr-1 h-3 w-3" /> Menos
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1 h-3 w-3" /> Más
                        </>
                      )}
                    </Button>
                  )}

                  {req.status === "fulfilled" &&
                    (req.fulfilledCartaId || req.fulfilledActaId || req.fulfilledRenunciaId || req.fulfilledRescisionId || req.fulfilledRescisionDesempenoId) && (
                      <FulfilledDocLinks
                        finalizationId={
                          (req.fulfilledCartaId ?? req.fulfilledActaId ?? req.fulfilledRenunciaId ?? req.fulfilledRescisionId ?? req.fulfilledRescisionDesempenoId)!
                        }
                        type={req.requestType}
                      />
                    )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* ── File request dialog ────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar carta o acta</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Type selector */}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40">
                  <input
                    type="radio"
                    name="request-type"
                    checked={requestType === "carta"}
                    onChange={() => setRequestType("carta")}
                    className="accent-primary shrink-0"
                  />
                  <span className="text-sm leading-tight">Carta de compromiso</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40">
                  <input
                    type="radio"
                    name="request-type"
                    checked={requestType === "acta"}
                    onChange={() => setRequestType("acta")}
                    className="accent-primary shrink-0"
                  />
                  <span className="text-sm leading-tight">Acta administrativa</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40">
                  <input
                    type="radio"
                    name="request-type"
                    checked={requestType === "renuncia"}
                    onChange={() => setRequestType("renuncia")}
                    className="accent-primary shrink-0"
                  />
                  <span className="text-sm leading-tight">Renuncia voluntaria</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40">
                  <input
                    type="radio"
                    name="request-type"
                    checked={requestType === "rescision_prueba"}
                    onChange={() => setRequestType("rescision_prueba")}
                    className="accent-primary shrink-0"
                  />
                  <span className="text-sm leading-tight">Rescisión periodo de prueba 30 Días</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40">
                  <input
                    type="radio"
                    name="request-type"
                    checked={requestType === "rescision_desempeno"}
                    onChange={() => setRequestType("rescision_desempeno")}
                    className="accent-primary shrink-0"
                  />
                  <span className="text-sm leading-tight">Rescisión por bajo desempeño Contrato de Capacitación Inicial</span>
                </label>
              </div>
            </div>

            {/* Incident date */}
            <div className="space-y-2">
              <Label htmlFor="incident-date">Fecha del incidente</Label>
              <Input
                id="incident-date"
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                max={today}
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="request-reason">Motivo (opcional)</Label>
              <Input
                id="request-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: tardanza reiterada, incumplimiento de KPI..."
              />
            </div>

            {/* TL narrative */}
            <div className="space-y-2">
              <Label htmlFor="tl-narrative">Descripción del incidente</Label>
              <Textarea
                id="tl-narrative"
                autoFocus
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="Where, When and Why — Ej: Agent is aware that the minimum CP is 6 a day, but only got 1 on Friday May 30. HR usará esto para redactar la versión formal."
                rows={5}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || createRequest.isPending}
            >
              {createRequest.isPending
                ? "Enviando..."
                : requestType === "acta"
                  ? "Request Act"
                  : requestType === "renuncia"
                    ? "Request Resignation"
                    : requestType === "rescision_prueba" ||
                        requestType === "rescision_desempeno"
                      ? "Request Rescisión"
                      : "Request Letter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function FulfilledDocLinks({
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
        variant="link"
        size="sm"
        className="h-6 px-0 text-xs"
        disabled={loading === "pdf"}
        onClick={() => handleView("pdf")}
      >
        <ExternalLink className="mr-1 h-3 w-3" />
        {loading === "pdf" ? "Opening..." : "View PDF"}
      </Button>
      <Button
        variant="link"
        size="sm"
        className="h-6 px-0 text-xs"
        disabled={loading === "signed_scan"}
        onClick={() => handleView("signed_scan")}
      >
        <ExternalLink className="mr-1 h-3 w-3" />
        {loading === "signed_scan" ? "Opening..." : "View Signed Scan"}
      </Button>
    </div>
  );
}
