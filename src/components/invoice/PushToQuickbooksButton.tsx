import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookText, CheckCircle2, AlertCircle, Link2, ExternalLink } from "lucide-react";
import type { Invoice, InvoiceLine, InvoicePunch, Client } from "@/hooks/useInvoices";
import { buildInvoiceWithTimesheetPdfBase64 } from "@/lib/pdf/generateInvoiceWithTimesheetPdf";
import {
  useQuickbooksConnection,
  useConnectQuickbooks,
  usePushInvoiceToQuickbooks,
} from "@/hooks/useQuickbooks";

// The invoice detail object also carries the QB sync columns at runtime
// (useInvoice selects "*"), even though the base Invoice type predates them.
type DetailInvoice = Invoice & {
  lines: InvoiceLine[];
  client?: Client;
  quickbooks_invoice_id?: string | null;
  quickbooks_sync_status?: string | null;
};

/**
 * "Push to QuickBooks" control for the invoice detail page. Shows a Connect
 * button until QuickBooks is linked, then a Push button plus a small status
 * badge (synced / error). Books-only phase 1: this mirrors the invoice into
 * QuickBooks as one summary line with the timesheet PDF attached; it does not
 * change how the invoice is emailed to the client.
 */
export function PushToQuickbooksButton({
  invoice,
  punchesByEmployee,
}: {
  invoice: DetailInvoice;
  punchesByEmployee: Map<string, InvoicePunch[]>;
}) {
  const { data: status, isLoading: statusLoading } = useQuickbooksConnection();
  const connect = useConnectQuickbooks();
  const push = usePushInvoiceToQuickbooks();
  const [building, setBuilding] = useState(false);
  const [qbUrl, setQbUrl] = useState<string | null>(null);

  const syncState = invoice.quickbooks_sync_status ?? null;

  const handleConnect = () => {
    // Open the tab synchronously (inside the click) so it isn't popup-blocked,
    // then point it at the authorize URL once we have it.
    const tab = window.open("", "_blank");
    connect.mutate(undefined, {
      onSuccess: ({ url }) => {
        if (tab) tab.location.href = url;
        else window.location.href = url;
      },
      onError: (e: any) => {
        if (tab) tab.close();
        toast.error(e.message ?? "Couldn't start the QuickBooks connection");
      },
    });
  };

  const handlePush = () => {
    setBuilding(true);
    let pdf: { base64: string; filename: string };
    try {
      pdf = buildInvoiceWithTimesheetPdfBase64(invoice, punchesByEmployee);
    } catch (e: any) {
      setBuilding(false);
      toast.error(`Couldn't build the PDF: ${e.message}`);
      return;
    }
    push.mutate(
      { invoice_id: invoice.id, pdf_base64: pdf.base64, pdf_filename: pdf.filename },
      {
        onSuccess: (r) => {
          setQbUrl(r.qbo_url);
          const title = r.action === "updated" ? "Updated in QuickBooks" : "Added to QuickBooks";
          const description =
            r.action === "updated"
              ? "Same invoice updated — no duplicate created."
              : r.pdf_attached
                ? "Timesheet PDF attached. Pushing again just updates this invoice — it won't duplicate."
                : "Invoice is in QuickBooks, but the PDF didn't attach. Open it in QuickBooks to add the PDF.";
          toast.success(title, {
            description,
            duration: 8000,
            action: { label: "View in QuickBooks", onClick: () => window.open(r.qbo_url, "_blank") },
          });
        },
        onError: (e: any) => toast.error(e.message ?? "Push to QuickBooks failed"),
        onSettled: () => setBuilding(false),
      },
    );
  };

  // Don't render for non-leadership (RPC returns not-connected/undefined) until
  // we know the status. While loading, show nothing to avoid a flash.
  if (statusLoading) return null;

  const busy = building || push.isPending;

  return (
    <div className="flex items-center gap-2">
      {syncState === "synced" && (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle2 className="mr-1 h-3 w-3" /> In QuickBooks
        </Badge>
      )}
      {syncState === "error" && (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <AlertCircle className="mr-1 h-3 w-3" /> QB sync failed
        </Badge>
      )}
      {qbUrl && (
        <a
          href={qbUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-xs text-blue-600 hover:underline"
        >
          <ExternalLink className="mr-1 h-3 w-3" /> View in QuickBooks
        </a>
      )}

      {status?.connected ? (
        <Button variant="outline" onClick={handlePush} disabled={busy}>
          {busy ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pushing…</>
          ) : (
            <><BookText className="mr-2 h-4 w-4" /> {syncState === "synced" ? "Re-push to QuickBooks" : "Push to QuickBooks"}</>
          )}
        </Button>
      ) : (
        <Button variant="outline" onClick={handleConnect} disabled={connect.isPending}>
          {connect.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting…</>
          ) : (
            <><Link2 className="mr-2 h-4 w-4" /> Connect QuickBooks</>
          )}
        </Button>
      )}
    </div>
  );
}
