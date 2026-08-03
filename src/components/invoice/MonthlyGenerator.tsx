/**
 * Monthly invoice generator — the "Monthly" half of /facturas/nueva.
 *
 * Monthly clients (currently HFB Tech) are billed once per calendar month:
 * a FLAT fee per agent active in the month, billed up front, with the PRIOR
 * month reconciled on the same invoice (missed-day credits + prior-month
 * pending spiffs). This mirrors the weekly generator's preview→generate flow,
 * but keyed on a month instead of a Mon–Sun week.
 *
 * All the math lives in the monthly_invoice_preview / generate_monthly_invoice
 * RPCs — this component just renders the preview and fires the generate call
 * for each monthly client that doesn't already have an invoice for the month.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useMonthlyPreview,
  useGenerateMonthly,
  fmtUSD,
  type MonthlyClientPreview,
} from "@/hooks/useInvoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CalendarRange, AlertTriangle, CheckCircle2, Sparkles, Loader2,
  ChevronDown, ChevronRight, RefreshCw,
} from "lucide-react";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { toast } from "sonner";

/** Current month as "YYYY-MM" in local time (for the <input type="month">). */
function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" → first-of-month "YYYY-MM-01" (what the RPCs expect). */
function monthValueToStart(v: string): string {
  return `${v}-01`;
}

/** "YYYY-MM" → "August 2026" for display. */
function monthLabel(v: string): string {
  const [y, m] = v.split("-").map(Number);
  const names = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${names[m - 1]} ${y}`;
}

/** Prior-month name, e.g. "July", for the reconciliation copy. */
function priorMonthName(v: string): string {
  const [y, m] = v.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  const names = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return names[d.getMonth()];
}

export default function MonthlyGenerator() {
  const navigate = useNavigate();
  const [month, setMonth] = useState<string>(currentMonthValue());
  const monthStart = monthValueToStart(month);

  const { data: preview = [], isLoading, error, refetch, isFetching } = useMonthlyPreview(monthStart);
  const generate = useGenerateMonthly();

  const eligible = preview.filter((c) => !c.existing_invoice_id && c.rows.length > 0);
  const alreadyDone = preview.filter((c) => c.existing_invoice_id);
  const totalAcrossEligible = eligible.reduce((s, c) => s + c.total_amount, 0);

  async function handleGenerate() {
    try {
      const targets = eligible;
      if (targets.length === 0) return;
      let created = 0;
      let total = 0;
      for (const c of targets) {
        const result = await generate.mutateAsync({ clientId: c.client_id, monthStart });
        created += result.length;
        total += result.reduce((s, r) => s + Number(r.total_amount), 0);
      }
      toast.success(
        `Generated ${created} monthly draft${created === 1 ? "" : "s"} for ${monthLabel(month)} ` +
        `(${fmtUSD(total)} total). Review and send.`,
      );
      navigate("/facturas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generate failed");
    }
  }

  return (
    <>
      {/* Month picker */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Month
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Pull fresh data without reloading the page"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh data"}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Billing month</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="w-44"
            />
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            Bills {monthLabel(month)} up front (flat fee per active agent), then reconciles{" "}
            {priorMonthName(month)} on the same invoice — missed-day credits and any pending
            {" "}{priorMonthName(month)} spiffs.
          </p>
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
            No monthly-billed clients configured. (Set a client's billing frequency to “monthly”
            and a flat per-agent rate to use this.)
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <Card>
            <CardContent className="py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Clients ready" value={eligible.length.toString()} />
              <Stat label="Projected total" value={fmtUSD(totalAcrossEligible)} accent />
              <Stat label="Already invoiced" value={alreadyDone.length.toString()} />
            </CardContent>
          </Card>

          {/* Per-client cards */}
          <div className="space-y-3">
            {preview.map((c) => (
              <MonthlyClientCard key={c.client_id} preview={c} priorLabel={priorMonthName(month)} />
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
                    <><Sparkles className="mr-2 h-4 w-4" /> Generate monthly drafts</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
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

function MonthlyClientCard({ preview, priorLabel }: { preview: MonthlyClientPreview; priorLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const alreadyExists = !!preview.existing_invoice_id;

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
                <Badge variant="secondary" className="text-xs">
                  {fmtUSD(preview.monthly_flat_per_agent)}/agent
                </Badge>
                {alreadyExists && (
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Already invoiced
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {preview.agent_count} agent{preview.agent_count === 1 ? "" : "s"} this month
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-lg">{fmtUSD(preview.total_amount)}</p>
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
                  <TableHead className="text-right">Flat fee</TableHead>
                  <TableHead className="text-right">{priorLabel} credit</TableHead>
                  <TableHead className="text-right">{priorLabel} spiffs</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow key={r.employee_id}>
                    <TableCell className="font-medium">{r.agent_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.campaign_name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.flat_fee > 0 ? fmtUSD(r.flat_fee) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.credit_amount < 0
                        ? <span className="text-destructive">{fmtUSD(r.credit_amount)}</span>
                        : <span className="text-muted-foreground">—</span>}
                      {r.prior_missed_days > 0 && (
                        <div className="text-xs text-muted-foreground">{r.prior_missed_days}d missed</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.prior_spiff_amount > 0 ? fmtUSD(r.prior_spiff_amount) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmtUSD(r.net_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
