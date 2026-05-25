import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useAgentsForClientPeriod, useCreateInvoice, fmtUSD } from "@/hooks/useInvoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, UserPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { formatDateMX } from "@/lib/localDate";

interface LineItem {
  agent_name: string;
  days_worked: number;
  unit_price: number;
  spiffs: number;
  /** Set when the agent joined this client mid-period (assignment start > weekStart). In-app only — not on the PDF. */
  joined_mid_week_on?: string | null;
  /** Set when the agent left this client mid-period (assignment end < weekEnd). In-app only — not on the PDF. */
  left_mid_week_on?: string | null;
}

export default function FacturaNueva() {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState("");
  const [weekNumber, setWeekNumber] = useState<number>(getWeekNumber(new Date()));
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  // Historical-aware: joins through employee_campaign_assignments so people
  // who moved campaigns mid-period still appear on the correct client's
  // invoice for the days they were actually assigned here.
  const { data: agents = [], isLoading: agentsLoading } = useAgentsForClientPeriod(
    clientId || undefined,
    weekStart || undefined,
    weekEnd || undefined,
  );
  const createInvoice = useCreateInvoice();

  const [lines, setLines] = useState<LineItem[]>([]);

  // When agents change (client/dates change), reset lines and prefill
  // days_worked from actual punches within each agent's assignment window.
  // Unit price stays at 0 — explicit-rates-only rule. Operator must fill it.
  const agentSignature = agents.map((a) => `${a.id}:${a.days_worked}`).join(",");
  useEffect(() => {
    if (agents.length > 0) {
      setLines(
        agents.map((a) => ({
          agent_name: a.full_name,
          days_worked: a.days_worked,
          unit_price: 0,
          spiffs: 0,
          joined_mid_week_on: a.joined_mid_week_on,
          left_mid_week_on: a.left_mid_week_on,
        }))
      );
    } else {
      setLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSignature]);

  const selectedClient = clients.find((c) => c.id === clientId);

  const dueDate = weekEnd
    ? (() => {
        const d = new Date(weekEnd + "T12:00:00");
        d.setDate(d.getDate() + 4);
        return d.toISOString().split("T")[0];
      })()
    : "";

  const invoiceNumber = selectedClient
    ? `${selectedClient.prefix}-${weekNumber}`
    : "";

  const updateLine = (idx: number, field: keyof LineItem, value: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  };

  const grandTotal = lines.reduce(
    (sum, l) => sum + l.days_worked * l.unit_price + l.spiffs,
    0
  );

  const handleSave = (status: "draft" | "sent") => {
    if (!clientId || !weekStart || !weekEnd) {
      toast.error("Complete all header fields");
      return;
    }

    const invoiceLines = lines.map((l) => ({
      agent_name: l.agent_name,
      days_worked: l.days_worked,
      unit_price: l.unit_price,
      total: l.days_worked * l.unit_price,
      spiffs: l.spiffs,
      total_price: l.days_worked * l.unit_price + l.spiffs,
    }));

    createInvoice.mutate(
      {
        invoice: {
          client_id: clientId,
          invoice_number: invoiceNumber,
          week_number: weekNumber,
          week_start: weekStart,
          week_end: weekEnd,
          due_date: dueDate,
          status,
        },
        lines: invoiceLines,
      },
      {
        onSuccess: (inv) => {
          toast.success(
            status === "draft" ? "Draft saved" : "Invoice sent"
          );
          navigate(`/facturas/${inv.id}`);
        },
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Button variant="ghost" onClick={() => navigate("/facturas")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
      </Button>

      <h2 className="text-2xl font-bold">New Invoice</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Week #</Label>
            <Input
              type="number"
              min={1}
              max={53}
              value={weekNumber}
              onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>End Date</Label>
            <Input
              type="date"
              value={weekEnd}
              onChange={(e) => setWeekEnd(e.target.value)}
            />
          </div>
          {invoiceNumber && (
            <div className="grid gap-2">
              <Label>Invoice #</Label>
              <p className="text-lg font-bold text-primary">{invoiceNumber}</p>
            </div>
          )}
          {dueDate && (
            <div className="grid gap-2">
              <Label>Due Date</Label>
              <p className="text-sm text-muted-foreground">{dueDate}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {clientId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice Lines</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!weekStart || !weekEnd ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Set the week start + end dates above to load agents and their actual days worked.
              </div>
            ) : agentsLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading agents…</div>
            ) : lines.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No agents were assigned to this client during {formatDateMX(weekStart)} – {formatDateMX(weekEnd)}.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="w-28">Days Worked</TableHead>
                    <TableHead className="w-36">Unit Price (USD)</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    <TableHead className="w-32">Spiffs (USD)</TableHead>
                    <TableHead className="w-32 text-right">Total + Spiffs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const total = line.days_worked * line.unit_price;
                    const totalPrice = total + line.spiffs;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          <div>{line.agent_name}</div>
                          {(line.joined_mid_week_on || line.left_mid_week_on) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {line.joined_mid_week_on && (
                                <Badge variant="secondary" className="text-[10px] font-normal h-5 gap-1 bg-blue-50 text-blue-800 border-blue-200">
                                  <UserPlus className="h-3 w-3" />
                                  Joined {formatDateMX(line.joined_mid_week_on)}
                                </Badge>
                              )}
                              {line.left_mid_week_on && (
                                <Badge variant="secondary" className="text-[10px] font-normal h-5 gap-1 bg-amber-50 text-amber-800 border-amber-200">
                                  <UserMinus className="h-3 w-3" />
                                  Left {formatDateMX(line.left_mid_week_on)}
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={7}
                            step={0.5}
                            value={line.days_worked || ""}
                            onChange={(e) =>
                              updateLine(idx, "days_worked", parseFloat(e.target.value) || 0)
                            }
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={line.unit_price || ""}
                            onChange={(e) =>
                              updateLine(idx, "unit_price", parseFloat(e.target.value) || 0)
                            }
                            className="w-28"
                          />
                        </TableCell>
                        <TableCell className="text-right">{fmtUSD(total)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={line.spiffs || ""}
                            onChange={(e) =>
                              updateLine(idx, "spiffs", parseFloat(e.target.value) || 0)
                            }
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmtUSD(totalPrice)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={5} className="text-right font-bold">
                      Grand Total
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg text-primary">
                      {fmtUSD(grandTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {clientId && lines.length > 0 && (
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => handleSave("draft")}
            disabled={createInvoice.isPending}
          >
            Save Draft
          </Button>
          <Button
            onClick={() => handleSave("sent")}
            disabled={createInvoice.isPending}
          >
            Mark as Sent
          </Button>
        </div>
      )}
    </div>
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
