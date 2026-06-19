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
  useUpdateBillRate,
  fmtUSD,
  type ClientPreview,
} from "@/hooks/useInvoices";
import { supabase } from "@/integrations/supabase/client";
import { lastCompletedWeek, parseLocalDate, getWeekRange, todayLocal } from "@/lib/localDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, CalendarRange, AlertTriangle, CheckCircle2, Sparkles, Loader2, ChevronDown, ChevronRight, X, RotateCcw, RefreshCw,
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

  const { data: preview = [], isLoading, error, refetch, isFetching } = useWeeklyPreview(monday, sunday);
  const generate = useGenerateWeekly();

  // Employees the user has chosen to exclude from this week's invoices.
  // Lines get created by the RPC regardless (it doesn't take an exclusion list),
  // then we delete the skipped ones immediately after generation. If a client
  // ends up with zero lines, we also delete the now-empty invoice.
  const [skippedEmployeeIds, setSkippedEmployeeIds] = useState<Set<string>>(new Set());
  function toggleSkip(empId: string) {
    setSkippedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  }

  function shiftWeek(direction: -1 | 1) {
    if (skippedEmployeeIds.size > 0) setSkippedEmployeeIds(new Set());
    const m = parseLocalDate(monday);
    m.setDate(m.getDate() + 7 * direction);
    setMonday(getWeekRange(m).monday);
  }

  function jumpToToday() {
    if (skippedEmployeeIds.size > 0) setSkippedEmployeeIds(new Set());
    setMonday(lastCompletedWeek().monday);
  }

  function onPickDate(d: string) {
    if (!d) return;
    if (skippedEmployeeIds.size > 0) setSkippedEmployeeIds(new Set());
    setMonday(getWeekRange(d).monday);
  }

  const eligible = preview.filter((c) => !c.existing_invoice_id);
  const alreadyDone = preview.filter((c) => c.existing_invoice_id);
  // Subtract the projected value of any rows the user has skipped — so the
  // summary chip reflects what'll actually post.
  const skippedAmount = eligible.reduce((sum, c) => {
    return sum + c.lines.reduce((s, l) => {
      if (!skippedEmployeeIds.has(l.employee_id)) return s;
      if (l.is_flat_bill) return s + Number(l.flat_amount);
      return s + Number(l.days_worked) * Number(l.daily_bill_rate);
    }, 0);
  }, 0);
  const totalAcrossEligible = eligible.reduce((s, c) => s + c.total_amount, 0) - skippedAmount;
  const totalLines = eligible.reduce(
    (s, c) => s + c.lines.filter((l) => !skippedEmployeeIds.has(l.employee_id)).length,
    0,
  );

  async function handleGenerate() {
    try {
      const result = await generate.mutateAsync({ monday, sunday });

      // Delete any lines the user marked as Skip. The RPC creates lines for
      // every eligible employee — we post-delete the unwanted ones here, then
      // also delete any invoice that ended up with zero lines after the cleanup.
      let skippedDeleted = 0;
      let emptyInvoicesDeleted = 0;
      if (result.length > 0 && skippedEmployeeIds.size > 0) {
        const invoiceIds = result.map((r) => r.invoice_id);
        const { data: skippedLines, error: skipFindErr } = await supabase
          .from("invoice_lines")
          .select("id, invoice_id")
          .in("invoice_id", invoiceIds)
          .in("employee_id", Array.from(skippedEmployeeIds));
        if (skipFindErr) throw skipFindErr;
        const lineIdsToDelete = (skippedLines ?? []).map((l: any) => l.id);
        if (lineIdsToDelete.length > 0) {
          const { error: delErr } = await supabase.from("invoice_lines").delete().in("id", lineIdsToDelete);
          if (delErr) throw delErr;
          skippedDeleted = lineIdsToDelete.length;
        }
        // Drop any invoices left empty after the skip-delete pass.
        const { data: remainingByInvoice, error: countErr } = await supabase
          .from("invoice_lines")
          .select("invoice_id")
          .in("invoice_id", invoiceIds);
        if (countErr) throw countErr;
        const stillHasLines = new Set((remainingByInvoice ?? []).map((r: any) => r.invoice_id));
        const emptyInvoiceIds = invoiceIds.filter((id) => !stillHasLines.has(id));
        if (emptyInvoiceIds.length > 0) {
          const { error: emptyDelErr } = await supabase.from("invoices").delete().in("id", emptyInvoiceIds);
          if (emptyDelErr) throw emptyDelErr;
          emptyInvoicesDeleted = emptyInvoiceIds.length;
        }
      }

      const totalDollars = result.reduce((s, r) => s + Number(r.total_amount), 0) - skippedAmount;
      const draftsRemaining = result.length - emptyInvoicesDeleted;
      const extras: string[] = [];
      if (skippedDeleted > 0) extras.push(`${skippedDeleted} line${skippedDeleted === 1 ? "" : "s"} skipped`);
      if (emptyInvoicesDeleted > 0) extras.push(`${emptyInvoicesDeleted} empty draft${emptyInvoicesDeleted === 1 ? "" : "s"} removed`);
      const extrasStr = extras.length > 0 ? `, ${extras.join(", ")}` : "";
      toast.success(
        result.length === 0
          ? "Nothing to generate — all clients already have invoices for this week."
          : `Generated ${draftsRemaining} ${draftsRemaining === 1 ? "draft" : "drafts"} (${totalDollars.toLocaleString("en-US", { style: "currency", currency: "USD" })} total)${extrasStr}. Review and send.`
      );
      setSkippedEmployeeIds(new Set());
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

      <div>
        <h2 className="text-2xl font-bold">Generate week</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pulls days worked from the time clock and bill rates from each employee's profile.
          One draft per client. Edit anything before sending.
        </p>
      </div>

      {/* Week picker */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Period
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Pull fresh punch + rate data without reloading the page (handy after editing a profile in another tab)"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh data"}
          </Button>
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
              <Stat label="Projected total" value={fmtUSD(totalAcrossEligible)} accent />
              <Stat label="Skipped (already invoiced)" value={alreadyDone.length.toString()} />
            </CardContent>
          </Card>

          {/* Per-client cards */}
          <div className="space-y-3">
            {preview.map((c) => (
              <ClientPreviewCard
                key={c.client_id}
                preview={c}
                skippedEmployeeIds={skippedEmployeeIds}
                onToggleSkip={toggleSkip}
              />
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

function ClientPreviewCard({
  preview,
  skippedEmployeeIds,
  onToggleSkip,
}: {
  preview: ClientPreview;
  skippedEmployeeIds: Set<string>;
  onToggleSkip: (empId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const alreadyExists = !!preview.existing_invoice_id;

  // Per-client subtotal excluding skipped lines.
  const skippedAmountForClient = useMemo(() => {
    return preview.lines.reduce((sum, l) => {
      if (!skippedEmployeeIds.has(l.employee_id)) return sum;
      if (l.is_flat_bill) return sum + Number(l.flat_amount);
      return sum + Number(l.days_worked) * Number(l.daily_bill_rate);
    }, 0);
  }, [preview.lines, skippedEmployeeIds]);
  const projectedClientTotal = preview.total_amount - skippedAmountForClient;
  const skippedCount = preview.lines.filter((l) => skippedEmployeeIds.has(l.employee_id)).length;

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
                {skippedCount > 0 && !alreadyExists && (
                  <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">
                    <X className="h-3 w-3 mr-1" /> {skippedCount} skipped
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {preview.line_count} agent{preview.line_count === 1 ? "" : "s"} · {preview.total_days} day{preview.total_days === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-lg">{fmtUSD(projectedClientTotal)}</p>
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
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.lines.map((l) => {
                  const isSkipped = skippedEmployeeIds.has(l.employee_id);
                  const SkipButton = (
                    <button
                      type="button"
                      onClick={() => onToggleSkip(l.employee_id)}
                      title={isSkipped ? "Bring this line back" : "Skip this line — exclude from invoice"}
                      className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${
                        isSkipped
                          ? "text-muted-foreground hover:bg-muted"
                          : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      }`}
                    >
                      {isSkipped ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  );
                  if (l.is_flat_bill) {
                    return (
                      <TableRow key={l.employee_id} className={isSkipped ? "bg-muted/30 opacity-50 line-through" : "bg-blue-50/40"}>
                        <TableCell className="font-medium">
                          <Link
                            to={`/empleados/${l.employee_code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline decoration-dotted underline-offset-2"
                            title="Open profile in new tab (e.g. to fix time clock punches)"
                          >
                            {l.employee_name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{l.employee_code}</div>
                        </TableCell>
                        <TableCell><span className="text-xs italic text-muted-foreground">flat bill</span></TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right font-medium">{fmtUSD(l.flat_amount)}</TableCell>
                        <TableCell className="text-right no-underline">{SkipButton}</TableCell>
                      </TableRow>
                    );
                  }
                  const subtotal = l.days_worked * l.daily_bill_rate;
                  const isMissingRate = l.daily_bill_rate === 0;
                  const rowClass = isSkipped
                    ? "bg-muted/40 opacity-50 line-through"
                    : isMissingRate
                      ? "bg-amber-100 hover:bg-amber-200/80 border-l-4 border-amber-500"
                      : "";
                  return (
                    <TableRow key={l.employee_id} className={rowClass}>
                      <TableCell className={isSkipped ? "font-medium" : isMissingRate ? "font-semibold text-amber-900" : "font-medium"}>
                        <div className="flex items-center gap-1.5">
                          {!isSkipped && isMissingRate && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                          <Link
                            to={`/empleados/${l.employee_code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline decoration-dotted underline-offset-2"
                            title="Open profile in new tab (e.g. to fix time clock punches)"
                          >
                            {l.employee_name}
                          </Link>
                        </div>
                        <div className={`text-xs ${isSkipped ? "text-muted-foreground" : isMissingRate ? "text-amber-700" : "text-muted-foreground"}`}>
                          {l.employee_code}
                        </div>
                      </TableCell>
                      <TableCell className={isSkipped ? "text-muted-foreground" : isMissingRate ? "text-amber-800" : "text-muted-foreground"}>{l.campaign_name}</TableCell>
                      <TableCell className="text-right">{l.days_worked}</TableCell>
                      <TableCell className="text-right">
                        {/* Every rate is editable. Missing-rate rows show amber styling;
                            existing rates show as a plain editable number you can overwrite.
                            Changes persist to employees.daily_bill_rate. */}
                        <InlineRateEditor
                          employeeId={l.employee_id}
                          employeeName={l.employee_name}
                          currentRate={l.daily_bill_rate}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtUSD(subtotal)}
                      </TableCell>
                      <TableCell className="text-right no-underline">{SkipButton}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {preview.missing_rate_count > 0 && (
              <div className="px-4 py-2 bg-amber-50 border-t text-xs text-amber-900">
                {preview.missing_rate_count} agent{preview.missing_rate_count === 1 ? "" : "s"} on this invoice {preview.missing_rate_count === 1 ? "has" : "have"} no bill rate.
                Type the rate directly in the highlighted row{preview.missing_rate_count === 1 ? "" : "s"} above — it saves to
                the employee so future weeks auto-fill.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Click-to-edit inline rate editor for any rate cell in the weekly preview.
 * Saves directly to employees.daily_bill_rate on Enter or blur, then invalidates
 * the preview so all consumers see the new rate.
 *
 * Two visual modes:
 *   - Missing rate (currentRate === 0): amber-styled, empty by default, placeholder "0"
 *   - Existing rate: plain styling, current value prefilled, ready to overwrite
 *
 * Why inline rather than a separate /admin/bill-rates page: D's common case
 * is "I just hired this person" or "I want to bump their rate" — fewest clicks
 * wins. Worst-case typo is recoverable (just retype). Note: changes persist to
 * the employee, so next week's invoice auto-fills with the new rate.
 */
function InlineRateEditor({
  employeeId,
  employeeName,
  currentRate,
}: {
  employeeId: string;
  employeeName: string;
  currentRate: number;
}) {
  const isMissing = currentRate === 0;
  const [value, setValue] = useState(isMissing ? "" : String(currentRate));
  const update = useUpdateBillRate();

  const commit = async () => {
    const trimmed = value.trim();
    // Empty submit on a missing-rate row = no-op. On an existing rate, also no-op
    // (don't accidentally clear a rate). User must type Escape to cancel.
    if (!trimmed) {
      setValue(isMissing ? "" : String(currentRate));
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n) || n <= 0) {
      toast.error("Rate must be a positive number");
      setValue(isMissing ? "" : String(currentRate));
      return;
    }
    // Skip the network call if nothing changed (avoid spurious toasts).
    if (n === currentRate) return;
    try {
      await update.mutateAsync({ employeeId, rate: n });
      toast.success(`Set ${employeeName}'s rate to ${fmtUSD(n)}`);
    } catch (e) {
      toast.error(`Couldn't save rate: ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <span className={`text-sm font-medium ${isMissing ? "text-amber-700" : "text-muted-foreground"}`}>$</span>
      <Input
        type="number"
        min={1}
        step="any"
        placeholder="0"
        value={value}
        disabled={update.isPending}
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur(); // triggers commit via onBlur
          } else if (e.key === "Escape") {
            setValue(isMissing ? "" : String(currentRate));
            e.currentTarget.blur();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={`h-7 w-24 text-right text-sm ${
          isMissing ? "border-amber-400 focus-visible:ring-amber-500" : ""
        }`}
      />
      {update.isPending && (
        <Loader2 className={`h-3 w-3 animate-spin ${isMissing ? "text-amber-700" : "text-muted-foreground"}`} />
      )}
    </div>
  );
}

