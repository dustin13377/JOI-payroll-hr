/**
 * SpiffCsvBatchesDialog — review past CSV uploads after the upload dialog closed.
 *
 * Lists each upload (when + count + live/parked breakdown). Click one to see its
 * rows as a spot-check table with each row's current status. Manager+ only
 * (gated by the caller).
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, ChevronRight, ChevronLeft } from "lucide-react";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import {
  useCsvSpiffBatches,
  type CsvSpiffBatch,
  type SpiffRow,
} from "@/hooks/useSpiffs";

function StatusPill({ status }: { status: SpiffRow["status"] }) {
  const map: Record<SpiffRow["status"], string> = {
    unverified: "border-orange-400 text-orange-700 bg-orange-50",
    pending: "border-amber-400 text-amber-700",
    billed: "border-blue-400 text-blue-700",
    void: "border-muted-foreground text-muted-foreground",
  };
  const label =
    status === "unverified"
      ? "Unverified"
      : status === "pending"
      ? "Pending"
      : status === "billed"
      ? "Billed"
      : "Void";
  return (
    <Badge variant="outline" className={map[status]}>
      {label}
    </Badge>
  );
}

function fmtUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SpiffCsvBatchesDialog() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CsvSpiffBatch | null>(null);

  const batchesQuery = useCsvSpiffBatches(open);
  const batches = batchesQuery.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSelected(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-1" />
          View uploads
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle>
            {selected ? "Upload details" : "CSV uploads"}
          </DialogTitle>
          <DialogDescription>
            {selected
              ? `Uploaded ${fmtUploadedAt(selected.uploaded_at)} — spot-check against your sheet.`
              : "Each CSV upload you've made. Open one to review its rows."}
          </DialogDescription>
        </DialogHeader>

        {batchesQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <LogoLoadingIndicator size="md" />
          </div>
        ) : selected ? (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 -ml-2 text-xs"
              onClick={() => setSelected(null)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              All uploads
            </Button>
            <div className="max-h-[55vh] overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left font-medium p-2">Agent</th>
                    <th className="text-left font-medium p-2">Date</th>
                    <th className="text-right font-medium p-2">Amount</th>
                    <th className="text-left font-medium p-2">Reason</th>
                    <th className="text-left font-medium p-2">Client</th>
                    <th className="text-left font-medium p-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selected.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="p-2 font-medium">{r.name}</td>
                      <td className="p-2">
                        {new Date(r.spiff_date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="p-2 text-right">
                        ${r.amount_usd.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="p-2">{r.reason}</td>
                      <td className="p-2">{r.client}</td>
                      <td className="p-2">
                        <StatusPill status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-background border-t">
                  <tr className="font-medium">
                    <td className="p-2" colSpan={2}>
                      Total ({selected.rows.length})
                    </td>
                    <td className="p-2 text-right">
                      ${selected.rows
                        .reduce((s, r) => s + r.amount_usd, 0)
                        .toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No CSV uploads yet.
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto border rounded-md divide-y">
            {batches.map((b) => (
              <button
                key={b.key}
                onClick={() => setSelected(b)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{fmtUploadedAt(b.uploaded_at)}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.count} spiff{b.count !== 1 ? "s" : ""}
                  </div>
                </div>
                {b.liveCount > 0 && (
                  <Badge variant="outline" className="border-green-500 text-green-700">
                    {b.liveCount} live
                  </Badge>
                )}
                {b.parkedCount > 0 && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700">
                    {b.parkedCount} parked
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
