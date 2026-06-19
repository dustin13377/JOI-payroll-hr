/**
 * /facturas/:id — Single invoice viewer + editor.
 *
 * Detail page IS the editing surface for invoices. The weekly batch screen
 * (FacturaNueva) only fixes things that block generation; everything else
 * — per-line rate / days / spiffs, adding agents, ad-hoc misc charges —
 * happens here. Locked once status = sent (with explicit "Unlock to edit")
 * and hard-locked once paid.
 */

import { useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useInvoice,
  useInvoicePunches,
  useUpdateInvoiceStatus,
  useUpdateInvoiceLine,
  useDeleteInvoiceLine,
  useAddInvoiceLine,
  fmtUSD,
  type InvoiceLine,
} from "@/hooks/useInvoices";
import { supabase } from "@/integrations/supabase/client";
import { formatDateUSLong } from "@/lib/localDate";
import { generateInvoiceWithTimesheetPdf } from "@/lib/pdf/generateInvoiceWithTimesheetPdf";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Printer, Send, CheckCircle, Trash2, Plus, Lock, Unlock, Loader2, Download, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";

const BILL_FROM = "JOI\n5965 S 900 E, #300\nMurray, UT 84121";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  paid_monthly: "Paid Monthly",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/15 text-primary",
  paid: "bg-green-100 text-green-700",
  paid_monthly: "bg-teal-100 text-teal-700",
};

export default function FacturaDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: invoice, isLoading } = useInvoice(id);
  const updateStatus = useUpdateInvoiceStatus();

  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [showAddMisc, setShowAddMisc] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [downloadMismatches, setDownloadMismatches] = useState<MismatchInfo[] | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Collect punch-billed employee IDs for the punch lookup. Misc lines have
  // null employee_id; flat-billed agents (is_flat_total=true) still have one
  // but won't have day-level punches to reconcile against.
  const punchEmployeeIds = useMemo(() => {
    if (!invoice?.lines) return [];
    return invoice.lines
      .filter((l) => l.employee_id !== null && !l.is_flat_total)
      .map((l) => l.employee_id as string);
  }, [invoice?.lines]);

  const { data: punchesByEmployee = new Map(), isLoading: punchesLoading } = useInvoicePunches(
    invoice?.id,
    punchEmployeeIds,
    invoice?.week_start,
    invoice?.week_end,
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LogoLoadingIndicator /></div>;
  }

  if (!invoice) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground mb-4">Invoice not found</p>
        <Button variant="outline" onClick={() => navigate("/facturas")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  const lines = invoice.lines || [];
  const grandTotal = lines.reduce((sum, l) => sum + Number(l.total_price), 0);

  // Lock state — drives whether editors render or just show values.
  // "sent" can be unlocked back to draft; "paid" is hard-locked.
  const isPaid = invoice.status === "paid";
  const isPaidMonthly = invoice.status === "paid_monthly";
  const isTerminal = isPaid || isPaidMonthly; // closed out — hard-locked, no unlock
  const isSent = invoice.status === "sent";
  const isLocked = isTerminal || isSent;

  // Compute invoice-days vs punch-days mismatches across all punch-billed
  // lines. Used by the download flow.
  const computeMismatches = (): MismatchInfo[] => {
    const out: MismatchInfo[] = [];
    for (const line of lines) {
      if (!line.employee_id || line.is_flat_total) continue;
      const punches = punchesByEmployee.get(line.employee_id) ?? [];
      const distinctDays = new Set(punches.map((p) => p.date)).size;
      const billed = Number(line.days_worked);
      if (distinctDays !== billed) {
        out.push({
          agent_name: line.agent_name,
          billed_days: billed,
          punch_days: distinctDays,
        });
      }
    }
    return out;
  };

  const runPdfDownload = () => {
    setDownloading(true);
    try {
      // invoice is guaranteed non-null inside the render branch — but TS
      // doesn't know that, so re-assert.
      generateInvoiceWithTimesheetPdf(invoice!, punchesByEmployee);
    } catch (e: any) {
      toast.error(`Couldn't generate PDF: ${e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadClick = () => {
    if (punchesLoading) {
      toast.info("Still loading punches — try again in a moment.");
      return;
    }
    const mismatches = computeMismatches();
    if (mismatches.length === 0) {
      runPdfDownload();
    } else {
      setDownloadMismatches(mismatches);
    }
  };

  const handleStatusChange = (status: string) => {
    updateStatus.mutate(
      { id: invoice.id, status },
      {
        onSuccess: () => {
          if (status === "sent") toast.success("Invoice marked as sent");
          else if (status === "paid") toast.success("Invoice marked as paid");
          else if (status === "paid_monthly") toast.success("Invoice marked as paid (monthly)");
          else if (status === "draft") toast.success("Invoice unlocked for editing");
        },
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" onClick={() => navigate("/facturas")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
        </Button>
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <Button
              variant="outline"
              onClick={() => handleStatusChange("sent")}
              disabled={updateStatus.isPending}
            >
              <Send className="mr-2 h-4 w-4" /> Mark Sent
            </Button>
          )}
          {invoice.status === "sent" && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowUnlockConfirm(true)}
                disabled={updateStatus.isPending}
              >
                <Unlock className="mr-2 h-4 w-4" /> Unlock to Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusChange("paid")}
                disabled={updateStatus.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" /> Mark Paid
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusChange("paid_monthly")}
                disabled={updateStatus.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" /> Mark Paid (Monthly)
              </Button>
            </>
          )}
          <Button
            onClick={handleDownloadClick}
            disabled={downloading || punchesLoading}
          >
            {downloading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building PDF…</>
            ) : (
              <><Download className="mr-2 h-4 w-4" /> Download Invoice + Timesheet</>
            )}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Lock banner */}
      {isLocked && (
        <div
          className={`flex items-center gap-2 rounded-md border p-3 text-sm print:hidden ${
            isTerminal
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <Lock className="h-4 w-4 shrink-0" />
          {isTerminal ? (
            <span>This invoice is marked <strong>{isPaidMonthly ? "paid (monthly)" : "paid"}</strong> and can no longer be edited.</span>
          ) : (
            <span>
              This invoice has been <strong>sent</strong> to the client. Click{" "}
              <em>Unlock to Edit</em> above to make changes (it'll move back to Draft).
            </span>
          )}
        </div>
      )}

      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-primary mb-1">INVOICE</h1>
              <p className="text-xl font-semibold">{invoice.invoice_number}</p>
              <Badge
                variant="secondary"
                className={`mt-2 ${statusColors[invoice.status] || ""} print:hidden`}
              >
                {statusLabels[invoice.status] || invoice.status}
              </Badge>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>Week {invoice.week_number}</p>
              <p>{formatDateUSLong(invoice.week_start)} — {formatDateUSLong(invoice.week_end)}</p>
              <p className="font-medium mt-1">Due: {formatDateUSLong(invoice.due_date)}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Bill From</p>
              <p className="text-sm whitespace-pre-line">{BILL_FROM}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Bill To</p>
              <p className="text-sm font-medium">{invoice.client?.bill_to_name || invoice.client?.name}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {invoice.client?.bill_to_address || ""}
              </p>
            </div>
          </div>

          <Separator className="mb-6" />

          {/* Lines */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Days Worked</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Spiffs</TableHead>
                <TableHead className="text-right">Total Price</TableHead>
                <TableHead className="w-10 print:hidden"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <LineRow key={line.id} line={line} locked={isLocked} />
              ))}
            </TableBody>
          </Table>

          {/* Add line buttons */}
          {!isLocked && (
            <div className="flex gap-2 mt-3 print:hidden">
              <Button variant="outline" size="sm" onClick={() => setShowAddAgent(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add agent line
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAddMisc(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add misc line
              </Button>
            </div>
          )}

          <Separator className="my-6" />

          <div className="flex justify-end">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Grand Total</p>
              <p className="text-3xl font-bold text-primary">{fmtUSD(grandTotal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unlock confirm */}
      <AlertDialog open={showUnlockConfirm} onOpenChange={setShowUnlockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock this invoice for editing?</AlertDialogTitle>
            <AlertDialogDescription>
              This invoice was marked sent. Unlocking moves it back to <strong>Draft</strong> so
              you can change lines. You'll need to mark it sent again afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleStatusChange("draft");
                setShowUnlockConfirm(false);
              }}
            >
              Unlock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add misc line */}
      <AddMiscDialog
        open={showAddMisc}
        onOpenChange={setShowAddMisc}
        invoiceId={invoice.id}
      />

      {/* Add agent line */}
      <AddAgentDialog
        open={showAddAgent}
        onOpenChange={setShowAddAgent}
        invoiceId={invoice.id}
        weekStart={invoice.week_start}
        weekEnd={invoice.week_end}
        existingEmployeeIds={lines.map((l) => l.employee_id).filter(Boolean) as string[]}
      />

      {/* Download mismatch warning */}
      <AlertDialog
        open={downloadMismatches !== null}
        onOpenChange={(v) => { if (!v) setDownloadMismatches(null); }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Days on invoice don't match time-clock punches
            </AlertDialogTitle>
            <AlertDialogDescription>
              The following agents have a different number of billed days vs. days
              they actually punched in. The mismatch will be noted on the timesheet
              page in the PDF — you can still download if these are expected (PTO,
              backfill, etc.).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-auto rounded-md border bg-muted/30">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left">Agent</th>
                  <th className="px-3 py-1.5 text-right">Billed</th>
                  <th className="px-3 py-1.5 text-right">Punched</th>
                  <th className="px-3 py-1.5 text-right">Diff</th>
                </tr>
              </thead>
              <tbody>
                {(downloadMismatches ?? []).map((m) => {
                  const diff = m.billed_days - m.punch_days;
                  return (
                    <tr key={m.agent_name} className="border-t">
                      <td className="px-3 py-1.5">{m.agent_name}</td>
                      <td className="px-3 py-1.5 text-right">{m.billed_days}</td>
                      <td className="px-3 py-1.5 text-right">{m.punch_days}</td>
                      <td className={`px-3 py-1.5 text-right font-medium ${diff > 0 ? "text-amber-700" : "text-red-700"}`}>
                        {diff > 0 ? "+" : ""}{diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDownloadMismatches(null);
                runPdfDownload();
              }}
            >
              Download anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface MismatchInfo {
  agent_name: string;
  billed_days: number;
  punch_days: number;
}

/* ------------------------------------------------------------------ */
/*  Line row — switches between inline-editable / read-only displays  */
/* ------------------------------------------------------------------ */

function LineRow({ line, locked }: { line: InvoiceLine; locked: boolean }) {
  const update = useUpdateInvoiceLine();
  const del = useDeleteInvoiceLine();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // is_flat_total covers misc lines AND flat-bill agent lines — both store the
  // billed amount in total_price directly with days/unit/spiffs = 0.
  const isFlat = line.is_flat_total;
  // Misc adjustments (loans, credits, discounts) have no employee_id; flat-bill
  // agents are still tied to an employee.
  const isMisc = isFlat && line.employee_id === null;

  const handleDelete = () => {
    del.mutate(line.id, {
      onSuccess: () => {
        toast.success(`Removed ${line.agent_name}`);
        setConfirmDelete(false);
      },
      onError: (e: any) => toast.error(`Couldn't delete: ${e.message}`),
    });
  };

  // Recompute total + total_price when days/unit/spiffs change. We store all
  // three because invoice_lines holds them as columns (not derived).
  const patchNumericField = async (
    field: "days_worked" | "unit_price" | "spiffs",
    value: number,
  ) => {
    const next = {
      days_worked: Number(line.days_worked),
      unit_price: Number(line.unit_price),
      spiffs: Number(line.spiffs),
      [field]: value,
    };
    const total = next.days_worked * next.unit_price;
    const total_price = total + next.spiffs;
    await update.mutateAsync({
      id: line.id,
      patch: { [field]: value, total, total_price },
    });
  };

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          {line.agent_name}
          {isFlat && (
            <span className="ml-2 text-xs italic text-muted-foreground print:hidden">
              {isMisc ? "adjustment" : "flat"}
            </span>
          )}
        </TableCell>

        {/* Days */}
        <TableCell className="text-right">
          {isFlat ? (
            <span className="text-muted-foreground">—</span>
          ) : locked ? (
            Number(line.days_worked)
          ) : (
            <InlineNumberEditor
              value={Number(line.days_worked)}
              min={0}
              onCommit={(n) => patchNumericField("days_worked", n)}
              ariaLabel={`Days worked for ${line.agent_name}`}
              pending={update.isPending}
            />
          )}
        </TableCell>

        {/* Unit Price */}
        <TableCell className="text-right">
          {isFlat ? (
            <span className="text-muted-foreground">—</span>
          ) : locked ? (
            fmtUSD(Number(line.unit_price))
          ) : (
            <InlineNumberEditor
              value={Number(line.unit_price)}
              min={0}
              prefix="$"
              onCommit={(n) => patchNumericField("unit_price", n)}
              ariaLabel={`Unit price for ${line.agent_name}`}
              pending={update.isPending}
            />
          )}
        </TableCell>

        {/* Total — derived */}
        <TableCell className="text-right">
          {isFlat ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            fmtUSD(Number(line.total))
          )}
        </TableCell>

        {/* Spiffs */}
        <TableCell className="text-right">
          {isFlat ? (
            <span className="text-muted-foreground">—</span>
          ) : locked ? (
            fmtUSD(Number(line.spiffs))
          ) : (
            <InlineNumberEditor
              value={Number(line.spiffs)}
              min={0}
              prefix="$"
              onCommit={(n) => patchNumericField("spiffs", n)}
              ariaLabel={`Spiffs for ${line.agent_name}`}
              pending={update.isPending}
            />
          )}
        </TableCell>

        {/* Total Price — derived for normal lines, editable for flat lines */}
        <TableCell className="text-right font-semibold">
          {isFlat && !locked ? (
            <InlineNumberEditor
              value={Number(line.total_price)}
              min={Number.NEGATIVE_INFINITY}
              prefix="$"
              onCommit={async (n) => {
                await update.mutateAsync({
                  id: line.id,
                  patch: { total_price: n },
                });
              }}
              ariaLabel={`Total for ${line.agent_name}`}
              pending={update.isPending}
            />
          ) : (
            fmtUSD(Number(line.total_price))
          )}
        </TableCell>

        {/* Delete */}
        <TableCell className="text-right print:hidden">
          {!locked && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title={`Remove ${line.agent_name}`}
              aria-label={`Remove ${line.agent_name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </TableCell>
      </TableRow>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this line?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{line.agent_name}</strong> ({fmtUSD(Number(line.total_price))})
              from this invoice. You can re-add the line later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={del.isPending}>
              {del.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline number editor — type, blur or Enter to save, Esc to cancel */
/* ------------------------------------------------------------------ */

function InlineNumberEditor({
  value,
  min = 0,
  prefix,
  onCommit,
  ariaLabel,
  pending,
}: {
  value: number;
  min?: number;
  prefix?: string;
  onCommit: (n: number) => Promise<void> | void;
  ariaLabel: string;
  pending?: boolean;
}) {
  const [text, setText] = useState(String(value));

  // Sync if the underlying value changes from elsewhere (refetch, etc).
  const lastSeen = useRef(value);
  if (lastSeen.current !== value) {
    lastSeen.current = value;
    const synced = String(value);
    if (synced !== text) setText(synced);
  }

  const commit = async () => {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed === String(value)) {
      setText(String(value));
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < min) {
      toast.error(`Must be a number ${min === 0 ? "0 or higher" : `≥ ${min}`}`);
      setText(String(value));
      return;
    }
    try {
      await onCommit(n);
    } catch (e: any) {
      toast.error(`Couldn't save: ${e.message}`);
      setText(String(value));
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
      <Input
        type="number"
        {...(Number.isFinite(min) ? { min } : {})}
        step="any"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            setText(String(value));
            e.currentTarget.blur();
          }
        }}
        disabled={pending}
        aria-label={ariaLabel}
        className="h-7 w-24 text-right text-sm"
      />
      {pending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add misc line dialog — flat amount only                            */
/* ------------------------------------------------------------------ */

function AddMiscDialog({
  open,
  onOpenChange,
  invoiceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string;
}) {
  const add = useAddInvoiceLine();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const reset = () => {
    setDescription("");
    setAmount("");
  };

  const handleSubmit = async () => {
    const desc = description.trim();
    const amt = Number(amount);
    if (!desc) {
      toast.error("Description is required");
      return;
    }
    if (Number.isNaN(amt) || amt === 0) {
      toast.error("Amount must be a non-zero number (use a negative for credits / discounts / loans)");
      return;
    }
    try {
      await add.mutateAsync({
        invoice_id: invoiceId,
        employee_id: null,
        agent_name: desc, // misc lines reuse the agent_name slot for their description
        campaign_name: null,
        days_worked: 0,
        unit_price: 0,
        spiffs: 0,
        is_flat_total: true,
        total_price: amt,
      });
      toast.success(`Added misc line: ${desc}`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Couldn't add line: ${e.message}`);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add misc line</DialogTitle>
          <DialogDescription>
            Ad-hoc charge — equipment, reimbursement, one-off services, etc.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="misc-description">Description</Label>
            <Textarea
              id="misc-description"
              placeholder="e.g. Headset replacement — 2 units"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="misc-amount">Amount (USD)</Label>
            <Input
              id="misc-amount"
              type="number"
              step="any"
              placeholder="0.00 — use negative for credit / loan / discount"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={add.isPending}>
            {add.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…</>) : "Add line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Add agent line dialog — picker + punch-prefill                     */
/* ------------------------------------------------------------------ */

interface AgentOption {
  id: string; // employees.id (UUID)
  employee_code: string; // employees.employee_id ("EMP-XXX")
  full_name: string;
  daily_bill_rate: number;
  campaign_name: string | null;
}

function AddAgentDialog({
  open,
  onOpenChange,
  invoiceId,
  weekStart,
  weekEnd,
  existingEmployeeIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string;
  weekStart: string;
  weekEnd: string;
  existingEmployeeIds: string[];
}) {
  const add = useAddInvoiceLine();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AgentOption | null>(null);
  const [days, setDays] = useState("");
  const [rate, setRate] = useState("");
  const [employees, setEmployees] = useState<AgentOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [lookingUpPunches, setLookingUpPunches] = useState(false);

  const reset = () => {
    setQuery("");
    setSelected(null);
    setDays("");
    setRate("");
  };

  // Load active employees once when the dialog opens. Cheap query and small
  // payload — no need for paging.
  const openRef = useRef(false);
  if (open && !openRef.current) {
    openRef.current = true;
    setLoadingEmployees(true);
    (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_id, full_name, daily_bill_rate, campaigns!employees_campaign_id_fkey(name)")
        .eq("is_active", true)
        .eq("is_system_user", false)
        .order("full_name");
      if (error) {
        toast.error(`Couldn't load employees: ${error.message}`);
      } else {
        const mapped: AgentOption[] = (data || []).map((r: any) => ({
          id: r.id,
          employee_code: r.employee_id,
          full_name: r.full_name,
          daily_bill_rate: Number(r.daily_bill_rate ?? 0),
          campaign_name: r.campaigns?.name ?? null,
        }));
        // Hide agents already on this invoice — you can edit their existing line.
        setEmployees(mapped.filter((e) => !existingEmployeeIds.includes(e.id)));
      }
      setLoadingEmployees(false);
    })();
  } else if (!open && openRef.current) {
    openRef.current = false;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees.slice(0, 50);
    return employees
      .filter(
        (e) =>
          e.full_name.toLowerCase().includes(q) ||
          e.employee_code.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [employees, query]);

  // When an employee is picked, look up their punches for this invoice's week
  // and prefill days_worked + rate.
  const pickEmployee = async (emp: AgentOption) => {
    setSelected(emp);
    setRate(emp.daily_bill_rate > 0 ? String(emp.daily_bill_rate) : "");
    setLookingUpPunches(true);
    try {
      const { data, error } = await supabase
        .from("time_clock")
        .select("date")
        .eq("employee_id", emp.id)
        .gte("date", weekStart)
        .lte("date", weekEnd);
      if (error) throw error;
      const distinctDays = new Set((data || []).map((r: any) => r.date)).size;
      setDays(String(distinctDays));
      if (distinctDays === 0) {
        toast.info(`No punches found for ${emp.full_name} between ${weekStart} and ${weekEnd} — you can still type days manually.`);
      } else {
        toast.success(`Prefilled ${distinctDays} day${distinctDays === 1 ? "" : "s"} from time clock`);
      }
    } catch (e: any) {
      toast.error(`Couldn't look up punches: ${e.message}`);
      setDays("");
    } finally {
      setLookingUpPunches(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected) {
      toast.error("Pick an employee first");
      return;
    }
    const d = Number(days);
    const r = Number(rate);
    if (Number.isNaN(d) || d < 0) {
      toast.error("Days must be 0 or higher");
      return;
    }
    if (Number.isNaN(r) || r <= 0) {
      toast.error("Unit price must be a positive number");
      return;
    }
    try {
      await add.mutateAsync({
        invoice_id: invoiceId,
        employee_id: selected.id,
        agent_name: selected.full_name,
        campaign_name: selected.campaign_name,
        days_worked: d,
        unit_price: r,
        spiffs: 0,
        is_flat_total: false,
      });
      toast.success(`Added ${selected.full_name}`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Couldn't add line: ${e.message}`);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add agent line</DialogTitle>
          <DialogDescription>
            Add an agent who's missing from this invoice. Days will be prefilled from time-clock punches for {weekStart} → {weekEnd}.
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="agent-search">Find employee</Label>
              <Input
                id="agent-search"
                placeholder="Name or EMP code…"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            <div className="max-h-72 overflow-auto rounded-md border">
              {loadingEmployees ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading employees…
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {employees.length === 0
                    ? "No active employees available (all already on this invoice?)"
                    : "No matches"}
                </div>
              ) : (
                filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => pickEmployee(e)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <div>
                      <div className="font-medium">{e.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.employee_code}{e.campaign_name ? ` · ${e.campaign_name}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {e.daily_bill_rate > 0 ? `${fmtUSD(e.daily_bill_rate)}/day` : "no rate set"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <div className="font-medium">{selected.full_name}</div>
              <div className="text-xs text-muted-foreground">
                {selected.employee_code}{selected.campaign_name ? ` · ${selected.campaign_name}` : ""}
              </div>
              <button
                type="button"
                onClick={() => { setSelected(null); setDays(""); setRate(""); }}
                className="mt-1 text-xs text-primary hover:underline"
              >
                ← Pick a different employee
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="agent-days">
                  Days worked {lookingUpPunches && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                </Label>
                <Input
                  id="agent-days"
                  type="number"
                  min={0}
                  step="any"
                  value={days}
                  onChange={(e) => setDays(e.currentTarget.value)}
                />
              </div>
              <div>
                <Label htmlFor="agent-rate">Unit price ($/day)</Label>
                <Input
                  id="agent-rate"
                  type="number"
                  min={0}
                  step="any"
                  value={rate}
                  onChange={(e) => setRate(e.currentTarget.value)}
                />
              </div>
            </div>
            {Number(days) > 0 && Number(rate) > 0 && (
              <p className="text-xs text-muted-foreground">
                Subtotal: <strong>{fmtUSD(Number(days) * Number(rate))}</strong> (spiffs can be added after, on the line)
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!selected || add.isPending}>
            {add.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…</>) : "Add line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
