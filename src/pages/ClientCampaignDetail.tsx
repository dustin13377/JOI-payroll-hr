import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Users, BarChart3, CalendarCheck, MessageSquarePlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SendAgentFeedbackDialog } from "@/components/client/SendAgentFeedbackDialog";
import { useMyAgentFeedback } from "@/hooks/useClientPortal";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { formatDateMX, formatDateMXLong } from "@/lib/localDate";
import {
  useClientCampaigns,
  useClientEmployees,
  useClientEodLogsThisWeek,
  useClientHolidaySummary,
  type ClientEodLog,
} from "@/hooks/useClientPortal";

export default function ClientCampaignDetail() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [feedbackTarget, setFeedbackTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: campaigns = [], isLoading: campaignsLoading } = useClientCampaigns();
  const { data: employees = [], isLoading: employeesLoading } = useClientEmployees();
  const { data: eodLogs = [], isLoading: eodLoading } = useClientEodLogsThisWeek(campaignId);
  const { data: holidaySummary } = useClientHolidaySummary(campaignId);
  const { data: myFeedback = [] } = useMyAgentFeedback();

  // "Do I already have open feedback in flight for this agent?" — shows a
  // small check next to the Send button so the client doesn't wonder if
  // JOI got the previous one.
  const openByEmployee = new Set(
    myFeedback.filter((f) => f.status !== "resolved").map((f) => f.employee_id),
  );

  const isLoading = campaignsLoading || employeesLoading || eodLoading;

  const campaign = campaigns.find((c) => c.id === campaignId);
  const campaignEmployees = employees.filter((e) => e.campaign_id === campaignId);

  // Derive KPI column headers from the union of all metrics keys across this week's logs.
  // Order is stable (insertion order of first log that introduces each key).
  const kpiKeys = (() => {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const log of eodLogs) {
      if (!log.metrics) continue;
      for (const key of Object.keys(log.metrics)) {
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    }
    return keys;
  })();

  // Build a map: employeeId → date → log (for the KPI table)
  const logsByEmployee = new Map<string, Map<string, ClientEodLog>>();
  for (const log of eodLogs) {
    if (!log.employee_id || !log.date) continue;
    if (!logsByEmployee.has(log.employee_id)) {
      logsByEmployee.set(log.employee_id, new Map());
    }
    logsByEmployee.get(log.employee_id)!.set(log.date, log);
  }

  // Get sorted unique dates present in this week's logs
  const logDates = [...new Set(eodLogs.map((l) => l.date).filter(Boolean) as string[])].sort(
    (a, b) => a.localeCompare(b),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LogoLoadingIndicator size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/client/team"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Team
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">
          {campaign?.name ?? "Campaign"}
        </h2>
      </div>

      {/* Section 1 — This-week KPIs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            This Week's Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eodLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No EOD submissions logged this week yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">Agent</TableHead>
                    {logDates.map((date) => (
                      <TableHead key={date} className="text-center" colSpan={kpiKeys.length || 1}>
                        {formatDateMX(date)}
                      </TableHead>
                    ))}
                  </TableRow>
                  {kpiKeys.length > 0 && (
                    <TableRow className="text-xs text-muted-foreground">
                      <TableHead className="sticky left-0 bg-background" />
                      {logDates.flatMap((date) =>
                        kpiKeys.map((key) => (
                          <TableHead key={`${date}-${key}`} className="text-center font-normal">
                            {key}
                          </TableHead>
                        )),
                      )}
                    </TableRow>
                  )}
                </TableHeader>
                <TableBody>
                  {campaignEmployees
                    .filter((emp) => logsByEmployee.has(emp.id ?? ""))
                    .map((emp) => {
                      const empLogs = logsByEmployee.get(emp.id ?? "") ?? new Map();
                      return (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium sticky left-0 bg-background">
                            {emp.display_name ?? "—"}
                          </TableCell>
                          {logDates.flatMap((date) => {
                            const log = empLogs.get(date);
                            if (!log) {
                              return kpiKeys.map((key) => (
                                <TableCell
                                  key={`${date}-${key}`}
                                  className="text-center text-muted-foreground"
                                >
                                  —
                                </TableCell>
                              ));
                            }
                            return kpiKeys.map((key) => {
                              const val = log.metrics?.[key];
                              return (
                                <TableCell key={`${date}-${key}`} className="text-center">
                                  {val != null ? String(val) : "—"}
                                </TableCell>
                              );
                            });
                          })}
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Agent roster */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Agent Roster
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campaignEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents on this campaign.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Send message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignEmployees.map((emp) => {
                  const hasOpen = emp.id ? openByEmployee.has(emp.id) : false;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">
                        {emp.display_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {emp.title?.replace(/_/g, " ") ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={emp.is_active ? "outline" : "secondary"}
                          className="text-xs"
                        >
                          {emp.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          {hasOpen && (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                              title="You have a message in progress about this agent."
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Sent
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              emp.id &&
                              setFeedbackTarget({
                                id: emp.id,
                                name: emp.display_name ?? "this agent",
                              })
                            }
                            disabled={!emp.id}
                            className="gap-1"
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                            Send
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Feedback dialog (portal-scoped, one at a time) */}
      {feedbackTarget && (
        <SendAgentFeedbackDialog
          open={!!feedbackTarget}
          onOpenChange={(o) => !o && setFeedbackTarget(null)}
          employeeId={feedbackTarget.id}
          employeeName={feedbackTarget.name}
        />
      )}

      {/* Section 3 — Upcoming holiday */}
      {holidaySummary && (
        holidaySummary.requires_coverage ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                  {holidaySummary.holiday_name}
                </CardTitle>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {formatDateMX(holidaySummary.holiday_date)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {holidaySummary.approved_off} of {holidaySummary.total_headcount} agents have
                requested this day off.
              </p>
              <p className="text-xs text-muted-foreground italic">
                Coverage details will be confirmed closer to the date.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                <CalendarCheck className="h-4 w-4" />
                Mexican Federal Holiday — {holidaySummary.holiday_name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your campaign will be offline on{" "}
                {formatDateMXLong(holidaySummary.holiday_date)}.
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
