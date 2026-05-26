import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoices, useClients, fmtUSD } from "@/hooks/useInvoices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText } from "lucide-react";
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

export default function Facturas() {
  const navigate = useNavigate();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const { data: clients = [] } = useClients();
  const { data: invoices = [], isLoading } = useInvoices({
    clientId: clientFilter !== "all" ? clientFilter : undefined,
  });

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

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><LogoLoadingIndicator /></div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <p>No invoices recorded</p>
            </div>
          ) : (
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
                    onClick={() => navigate(`/facturas/${inv.id}`)}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
