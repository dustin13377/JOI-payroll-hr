import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge } from "./StageBadge";
import { fullName, type SalesLead } from "@/hooks/useSalesLeads";
import { CheckCircle2, Loader2, AlertCircle, Globe } from "lucide-react";

function ProfileIndicator({ lead }: { lead: SalesLead }) {
  switch (lead.profile_status) {
    case "ready":
      return <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Profile ready" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-amber-500" aria-label="Couldn't read site" />;
    case "manual":
      return <Globe className="h-4 w-4 text-muted-foreground" aria-label="Profile edited by hand" />;
    default:
      return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" aria-label="Reading site…" />;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function LeadTable({
  leads,
  onRowClick,
}: {
  leads: SalesLead[];
  onRowClick: (id: string) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No leads here yet.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Interested in</TableHead>
            <TableHead>Budget</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="text-right">Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow
              key={lead.id}
              className="cursor-pointer"
              onClick={() => onRowClick(lead.id)}
            >
              <TableCell><ProfileIndicator lead={lead} /></TableCell>
              <TableCell className="font-medium">
                {lead.company || <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <div className="text-sm">{fullName(lead) || "—"}</div>
                {lead.email && (
                  <div className="text-xs text-muted-foreground">{lead.email}</div>
                )}
              </TableCell>
              <TableCell className="max-w-[220px]">
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {(lead.services ?? []).join(", ") || "—"}
                </span>
              </TableCell>
              <TableCell className="text-sm">{lead.budget || "—"}</TableCell>
              <TableCell><StageBadge stage={lead.stage} /></TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {fmtDate(lead.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
