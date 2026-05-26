/**
 * /facturas/nueva — Weekly batch generator.
 *
 * Pick a week (defaults to last completed Mon-Sun), preview what each client's
 * invoice would look like, and generate all the drafts with one click. Clients
 * that already have an invoice for the chosen week are skipped automatically.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useWeeklyPreview,
  useGenerateWeekly,
  fmtUSD,
  type ClientPreview,
} from "@/hooks/useInvoices";
import { supabase } from "@/integrations/supabase/client";
import { lastCompletedWeek, parseLocalDate, getWeekRange, todayLocal } from "@/lib/localDate";
import { PreviewSpiffUploadDialog } from "@/components/PreviewSpiffUploadDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, CalendarRange, AlertTriangle, CheckCircle2, Sparkles, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { toast } from "sonner";

export default function FacturaNueva() {
  const navigate = useNavigate();
  const initialWeek = lastCompletedWeek();
  const [monday, setMonday] = useState<string>(initialWeek.monday);
  const sunday = useMemo(() => {
    const m = parseLocalDate(monday);
    const s = new Date(m);
    s.setDate(m.getDate() + 6);
    return todayLocal(s);
  }, [monday]);

  const { data: preview = [], isLoading, error } = useWeeklyPreview(monday, sunday);
  const generate = useGenerateWeekly();

  // Spiffs staged in memory before generation. Keyed by employees.id (UUID).
  // Applied to invoice lines AFTER the generate RPC creates them.
  const [stagedSpiffs, setStagedSpiffs] = useState<Map<string, number>>(new Map());

  // When the week changes, the staged spiffs no longer apply.
  function clearSpiffsOnWeekChange() {
    if (stagedSpiffs.size > 0) {
      setStagedSpiffs(new Map());
      toast.info("Cleared staged spiffs (week changed).");
    }
  }

  function shiftWeek(direction: -1 | 1) {
    clearSpiffsOnWeekChange();
    const m = parseLocalDate(monday);
    m.setDate(m.getDate() + 7 * direction);
    setMonday(getWeekRange(m).monday);
  }

  function jumpToToday() {
    clearSpiffsOnWeekChange();
    setMonday(lastCompletedWeek().monday);
  }

  function onPickDate(d: string) {
    if (!d) return;
    clearSpiffsOnWeekChange();
    setMonday(getWeekRange(d).monday);
  }

  const eligible = preview.filter((c) => !c.existing_invoice_id);
  const alreadyDone = preview.filter((c) => c.existing_invoice_id);
  const stagedSpiffsTotal = Array.from(stagedSpiffs.values()).reduce((s, v) => s + v, 0);
  const totalAcrossEligible = eligible.reduce((s, c) => s + c.total_amount, 0) + stagedSpiffsTotal;
  const totalLines = eligible.reduce((s, c) => s + c.line_count, 0);

  async function handleGenerate() {
    try {
      const result = await generate.mutateAsync({ monday, sunday });

      // Apply any staged spiffs to the newly-created invoice lines.
      let spiffsApplied = 0;
      if (result.length > 0 && stagedSpiffs.size > 0) {
        const invoiceIds = result.map((r) => r.invoice_id);
        const { data: lines, error: linesErr } = await supabase
          .from("invoice_lines")
          .select("id, employee_id, days_worked, holiday_days, unit_price, is_flat_total, total_price")
          .in("invoice_id", invoiceIds);
        if (linesErr) throw linesErr;

        for (const line of lines || []) {
          const spiff = line.employee_id ? stagedSpiffs.get(line.employee_id) : undefined;
          if (!spiff || spiff <= 0) continue;
          const days = Number(line.days_worked);
          const holiday = Number(line.holiday_days);
          const unit = Number(line.unit_price);
          // `days` already includes holiday days; holiday adds 2× premium on top.
          const total = (days * unit) + (holiday * unit * 2);
          const total_price = line.is_flat_total
            ? Number(line.total_price)
            : total + spiff;
          const { error: updErr } = await supabase
            .from("invoice_lines")
            .update({ spiffs: spiff, total, total_price })
            .eq("id", line.id);
          if (updErr) throw updErr;
          spiffsApplied++;
        }
      }

      const totalDollars = result.reduce((s, r) => s + Number(r.total_amount), 0) + stagedSpiffsTotal;
      toast.success(
        result.length === 0
          ? "Nothing to generate — all clients already have invoices for this week."
          : `Generated ${result.length} ${result.length === 1 ? "draft" : "drafts"} (${totalDollars.toLocaleString("en-US", { style: "currency", currency: "USD" })} total)${spiffsApplied > 0 ? `, ${spiffsApplied} with spiffs` : ""}. Review and send.`
      );
      setStagedSpiffs(new Map());
      navigate("/facturas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generate failed");
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <Button variant="ghost" onClick={() => navigate("/facturas")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
      </Button>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Generate week</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pulls days worked from the time clock and bill rates from each employee's profile.
            One draft per client. Edit anything before sending.
          </p>
        </div>
        {preview.length > 0 && eligible.length > 0 && (
          <PreviewSpiffUploadDialog
            preview={preview}
            weekStart={monday}
            weekEnd={sunday}
            stagedSpiffs={stagedSpiffs}
            onApply={setStagedSpiffs}
          />
        )}
      </div>

      {/* Week picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Period
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)}>← Previous</Button>
          <div className="flex items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Monday</Label>
              <Input
                type="date"
                value={monday}
                onChange={(e) => onPickDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Sunday</Label>
              <Input
                type="date"
                value={sunday}
                disabled
                className="w-44"
              />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => shiftWeek(1)}>Next →</Button>
          <Button variant="ghost" size="sm" onClick={jumpToToday}>Last completed week</Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><LogoLoadingIndicator /></div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 flex items-center gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>Couldn't load the preview: {(error as Error).message}</p>
          </CardContent>
        </Card>
      ) : preview.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No employees on any client campaigns for this period.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <Card>
            <CardContent className="py-4 grid grid-cols-2 md:grid-cols-5 gap-4">
              <Stat label="Clients ready" value={eligible.length.toString()} />
              <Stat label="Total lines" value={totalLines.toString()} />
              <Stat
                label="Staged spiffs"
                value={stagedSpiffs.size > 0 ? `${stagedSpiffs.size} · ${fmtUSD(stagedSpiffsTotal)}` : "—"}
              />
              <Stat label="Projected total" value={fmtUSD(totalAcrossEligible)} accent />
              <Stat label="Skipped (already invoiced)" value={alreadyDone.length.toString()} />
            </CardContent>
          </Card>

          {/* Per-client cards */}
          <div className="space-y-3">
            {preview.map((c) => (
              <ClientPreviewCard key={c.client_id} preview={c} stagedSpiffs={stagedSpiffs} />
            ))}
          </div>

          {/* Action */}
          <div className="sticky bottom-2 z-10 flex justify-end">
            <Card className="border-primary shadow-lg">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="text-sm">
                  <p className="font-medium">
                    Generate {eligible.length} draft{eligible.length === 1 ? "" : "s"} totaling {fmtUSD(totalAcrossEligible)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Drafts only — review and mark sent on each invoice.
                  </p>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={eligible.length === 0 || generate.isPending}
                  size="lg"
                >
                  {generate.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="mr-2 h-4 w-4" /> Generate all drafts</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function ClientPreviewCard({ preview, stagedSpiffs }: { preview: ClientPreview; stagedSpiffs: Map<string, number> }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const alreadyExists = !!preview.existing_invoice_id;

  // Spiffs that match an employee on this client's lines
  const clientSpiffs = useMemo(() => {
    const out = new Map<string, number>();
    for (const l of preview.lines) {
      const s = stagedSpiffs.get(l.employee_id);
      if (s && s > 0) out.set(l.employee_id, s);
    }
    return out;
  }, [preview.lines, stagedSpiffs]);
  const clientSpiffsTotal = Array.from(clientSpiffs.values()).reduce((s, v) => s + v, 0);
  const projectedClientTotal = preview.total_amount + clientSpiffsTotal;

  return (
    <Card className={alreadyExists ? "opacity-60" : ""}>
      <CardContent className="p-0">
        <button
          type="button"
          className="w-full p-4 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{preview.client_name}</span>
                <Badge variant="outline" className="text-xs">{preview.client_prefix}</Badge>
                {alreadyExists && (
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Already invoiced
                  </Badge>
                )}
                {preview.missing_rate_count > 0 && !alreadyExists && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" /> {preview.missing_rate_count} missing rate{preview.missing_rate_count === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {preview.line_count} agent{preview.line_count === 1 ? "" : "s"} · {preview.total_days} day{preview.total_days === 1 ? "" : "s"}
                {clientSpiffsTotal > 0 && (
                  <> · <span className="text-green-700">+{fmtUSD(clientSpiffsTotal)} spiffs</span></>
                )}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-lg">{fmtUSD(projectedClientTotal)}</p>
            {clientSpiffsTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                {fmtUSD(preview.total_amount)} + {fmtUSD(clientSpiffsTotal)}
              </p>
            )}
            {alreadyExists && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/facturas/${preview.existing_invoice_id}`);
                }}
              >
                Open existing draft →
              </button>
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Spiff</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.lines.map((l) => {
                  const spiff = clientSpiffs.get(l.employee_id) ?? 0;
                  if (l.is_flat_bill) {
                    return (
                      <TableRow key={l.employee_id} className="bg-blue-50/40">
                        <TableCell className="font-medium">
                          {l.employee_name}
                          <div className="text-xs text-muted-foreground">{l.employee_code}</div>
                        </TableCell>
                        <TableCell><span className="text-xs italic text-muted-foreground">flat bill</span></TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right font-medium">{fmtUSD(l.flat_amount)}</TableCell>
                      </TableRow>
                    );
                  }
                  const base = l.days_worked * l.daily_bill_rate;
                  const subtotal = base + spiff;
                  const isMissingRate = l.daily_bill_rate === 0;
                  return (
                    <TableRow
                      key={l.employee_id}
                      className={
                        isMissingRate
                          ? "bg-amber-100 hover:bg-amber-200/80 border-l-4 border-amber-500"
                          : spiff > 0
                            ? "bg-green-50/40"
                            : ""
                      }
                    >
                      <TableCell className={isMissingRate ? "font-semibold text-amber-900" : "font-medium"}>
                        <div className="flex items-center gap-1.5">
                          {isMissingRate && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                          <span>{l.employee_name}</span>
                        </div>
                        <div className={`text-xs ${isMissingRate ? "text-amber-700" : "text-muted-foreground"}`}>
                          {l.employee_code}
                        </div>
                      </TableCell>
                      <TableCell className={isMissingRate ? "text-amber-800" : "text-muted-foreground"}>{l.campaign_name}</TableCell>
                      <TableCell className="text-right">{l.days_worked}</TableCell>
                      <TableCell className="text-right">
                        {isMissingRate ? (
                          <span className="font-semibold text-amber-800">No rate</span>
                        ) : (
                          fmtUSD(l.daily_bill_rate)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {spiff > 0 ? <span className="text-green-700">{fmtUSD(spiff)}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtUSD(subtotal)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {preview.missing_rate_count > 0 && (
              <div className="px-4 py-2 bg-amber-50 border-t text-xs text-amber-900">
                {preview.missing_rate_count} agent{preview.missing_rate_count === 1 ? "" : "s"} on this invoice {preview.missing_rate_count === 1 ? "has" : "have"} no bill rate.
                You can still generate the draft, but{" "}
                <Link to="/admin/bill-rates" className="underline font-medium">set their rates</Link>{" "}
                before downloading the PDF.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
