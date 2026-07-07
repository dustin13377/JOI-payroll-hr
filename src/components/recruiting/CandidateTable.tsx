import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StageBadge } from "./StageBadge";
import { format } from "date-fns";
import type { Candidate } from "@/hooks/useRecruiting";
import { AlertTriangle } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  b2b_setter: "B2B Setter",
  funding_activation: "Funding",
  customer_reactivation: "Reactivation",
  ai_automation: "AI Automation",
  ai_operations: "AI Operations",
};

/**
 * The role a candidate applied for. Prefers applied_position (verbatim form
 * value, works for any role); falls back to the legacy role_interest label for
 * older rows that predate applied_position.
 */
function appliedRoleLabel(c: Candidate): string {
  if (c.applied_position) return c.applied_position;
  if (c.role_interest) return ROLE_LABELS[c.role_interest] ?? c.role_interest;
  return "—";
}

interface Props {
  candidates: Candidate[];
  onRowClick: (id: string) => void;
}

export function CandidateTable({ candidates, onRowClick }: Props) {
  if (candidates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No candidates yet. New form submissions will appear here automatically.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Position fit</TableHead>
          <TableHead>English</TableHead>
          <TableHead>City</TableHead>
          <TableHead>Applied</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidates.map((c) => (
          <TableRow
            key={c.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onRowClick(c.id)}
          >
            <TableCell className="font-medium">{c.full_name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
            <TableCell>{appliedRoleLabel(c)}</TableCell>
            <TableCell>
              {c.position_fits?.length ? (
                <div className="flex flex-wrap gap-1">
                  {c.position_fits.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{c.english_level_self}</TableCell>
            <TableCell>{c.city ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {format(new Date(c.created_at), "MMM d, HH:mm")}
            </TableCell>
            <TableCell>
              <StageBadge stage={c.stage} />
              {c.stage === "offer" && c.offer_start_date && (
                <div
                  className={`mt-1 text-xs ${
                    c.offer_start_date < new Date().toISOString().slice(0, 10)
                      ? "text-destructive font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  Starts {format(new Date(`${c.offer_start_date}T00:00:00`), "MMM d")}
                </div>
              )}
            </TableCell>
            <TableCell>
              {c.needs_manual_review && (
                <AlertTriangle className="h-4 w-4 text-yellow-500" aria-label="Needs review" />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
