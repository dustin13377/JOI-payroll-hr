import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoices, useClients } from "@/hooks/useInvoices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, History as HistoryIcon } from "lucide-react";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/15 text-primary",
  paid: "bg-green-100 text-green-700",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};

type InvoiceRow = ReturnType<typeof useInvoices>["data"] extends (infer T)[] | undefined
  ? T
  : never;

function InvoiceTable({
  invoices,
  isLoading,
  emptyMessage,
  onRowClick,
}: {
  invoices: InvoiceRow[];
  isLoading: boolean;
  emptyMessage: string;
  onRowClick: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LogoLoadingIndicator />
      </div>
    );
  }
  if (invoices.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
        <FileText className="h-10 w-10 text-muted-foreground/40" />
        <p>{emptyMessage}</p>
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice #</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Week</TableHead>
          <TableHead>Start Date</TableHead>
          <TableHead>End Date</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => (
          <TableRow
            key={inv.id}
            className="cursor-pointer"
            onClick={() => onRowClick(inv.id)}
          >
            <TableCell className="font-medium">{inv.invoice_number}</TableCell>
            <TableCell>{inv.client?.name || "—"}</TableCell>
            <TableCell>W{inv.week_number}</TableCell>
            <TableCell>{inv.week_start}</TableCell>
            <TableCell>{inv.week_end}</TableCell>
            <TableCell>{inv.due_date}</TableCell>
            <TableCell>
              <Badge variant="secondary" className={statusColors[inv.status] || ""}>
                {statusLabels[inv.status] || inv.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Facturas() {
  const navigate = useNavigate();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [tab, setTab] = useState<"active" | "history">("active");
  const { data: clients = [] } = useClients();
  const { data: invoices = [], isLoading } = useInvoices({
    clientId: clientFilter !== "all" ? clientFilter : undefined,
  });

  // Active = draft + sent (still in motion). History = paid (closed out).
  const { active, history } = useMemo(() => {
    const active: InvoiceRow[] = [];
    const history: InvoiceRow[] = [];
    for (const inv of invoices) {
      if (inv.status === "paid") history.push(inv);
      else active.push(inv);
    }
    return { active, history };
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Invoices (USD)</h2>
        <Button onClick={() => navigate("/facturas/nueva")}>
          <Plus className="mr-2 h-4 w-4" /> New Invoice
        </Button>
      </div>

      <div className="flex gap-3 items-center">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "history")}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <FileText className="h-4 w-4" />
            Active
            <Badge variant="secondary" className="ml-1">{active.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <HistoryIcon className="h-4 w-4" />
            History
            <Badge variant="secondary" className="ml-1">{history.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card>
            <CardContent className="p-0">
              <InvoiceTable
                invoices={active}
                isLoading={isLoading}
                emptyMessage="No active invoices"
                onRowClick={(id) => navigate(`/facturas/${id}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <InvoiceTable
                invoices={history}
                isLoading={isLoading}
                emptyMessage="No paid invoices yet"
                onRowClick={(id) => navigate(`/facturas/${id}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
