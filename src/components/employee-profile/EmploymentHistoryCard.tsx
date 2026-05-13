import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText, ArrowRight } from "lucide-react";
import { useEmploymentHistory, type EmploymentHistoryRow } from "@/hooks/useEmploymentHistory";

interface Props {
  /** employees.id (UUID), NOT the readable employee_id */
  employeeUuid: string;
}

const statusVariant: Record<
  EmploymentHistoryRow["to_status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "outline",
  terminated: "destructive",
  resigned: "secondary",
  on_leave: "outline",
};

const statusLabel: Record<EmploymentHistoryRow["to_status"], string> = {
  active: "Active",
  terminated: "Terminated",
  resigned: "Resigned",
  on_leave: "On Leave",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function EmploymentHistoryCard({ employeeUuid }: Props) {
  const { data: rows = [], isLoading } = useEmploymentHistory(employeeUuid);

  if (isLoading) return null;
  if (rows.length === 0) return null;

  // Count terminations to surface a flight-risk hint
  const terminationCount = rows.filter(
    (r) => r.from_status === "active" && r.to_status !== "active"
  ).length;
  const hireCount = rows.filter((r) => r.from_status === null).length;
  const isFlightRisk = terminationCount > 1 || hireCount > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ScrollText className="h-4 w-4" />
          Employment History
          {isFlightRisk && (
            <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700">
              {hireCount}× hired, {terminationCount}× left
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="relative border-l border-border pl-5 space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-background border-2 border-border" />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {r.from_status === null ? (
                  <Badge variant="outline">Hired</Badge>
                ) : (
                  <>
                    <Badge variant={statusVariant[r.from_status]}>{statusLabel[r.from_status]}</Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant={statusVariant[r.to_status]}>{statusLabel[r.to_status]}</Badge>
                  </>
                )}
                <span className="text-muted-foreground text-xs ml-auto">{fmtDate(r.changed_at)}</span>
              </div>
              {r.reason && (
                <div className="text-sm mt-1">
                  <span className="text-muted-foreground">Reason: </span>
                  {r.reason}
                </div>
              )}
              {r.notes && (
                <div className="text-sm mt-1 italic text-muted-foreground">"{r.notes}"</div>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {r.actor_name && <span>by {r.actor_name}</span>}
                {r.rehire_eligible === false && r.to_status !== "active" && (
                  <Badge variant="destructive" className="text-[10px]">Marked Do Not Rehire</Badge>
                )}
                {r.last_worked_day && r.to_status !== "active" && (
                  <span>Last day: {r.last_worked_day}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
