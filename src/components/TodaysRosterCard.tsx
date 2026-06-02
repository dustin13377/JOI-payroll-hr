/**
 * TodaysRosterCard
 *
 * Replaces the old "Today's Attendance" card on TeamLeadHome.
 *
 * Adds:
 *   1. "Missing yesterday's EOD" amber strip at the top — one row per agent
 *      who clocked in yesterday but never submitted an EOD. Each has a
 *      "Submit for [name]" button that opens SubmitEODForAgentDialog with
 *      defaultDate = yesterday. (Folded in from the now-deleted TLDashboard.)
 *   2. Per-row Nudge button (light version): inserts a tl_nudges row so the
 *      TL has a record that they reached out. Button changes to
 *      "Nudged X min ago" so they don't double-tap.
 *
 * The actual notification (call/WhatsApp/email) still happens out-of-band —
 * this is just the audit trail.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, Send, Pencil } from "lucide-react";
import { todayLocal } from "@/lib/localDate";
import { getDisplayName } from "@/lib/displayName";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { toast } from "sonner";
import {
  useTodayTimeclockStatus,
  useMissingYesterdayEod,
  useTodayNudges,
  useCreateNudge,
  type TimeclockStatus,
} from "@/hooks/useTeamLead";
import {
  SubmitEODForAgentDialog,
  type SubmitEODKPIField,
} from "@/components/SubmitEODForAgentDialog";
import { EditPunchDialog } from "@/components/EditPunchDialog";

interface Props {
  tlEmployeeId: string;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relativeMinutes(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function statusBadge(status: TimeclockStatus) {
  switch (status) {
    case "present":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">On time</Badge>;
    case "late":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Late</Badge>;
    case "absent":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Absent</Badge>;
    case "completed":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Done</Badge>;
    case "day_off":
      return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Day off</Badge>;
    case "expected":
      return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Expected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function TodaysRosterCard({ tlEmployeeId }: Props) {
  const timeclock = useTodayTimeclockStatus(tlEmployeeId);
  const missingYesterday = useMissingYesterdayEod(tlEmployeeId);
  const nudges = useTodayNudges(tlEmployeeId);
  const createNudge = useCreateNudge();

  // Which agent is currently in the SubmitEODForAgentDialog (if any).
  // Shared between the "missing yesterday" strip (defaultDate = yesterday) and
  // the per-row "Submit EOD" button on no-login agents (defaultDate = today).
  const [submitTarget, setSubmitTarget] = useState<{
    employeeId: string;
    fullName: string;
    workName: string | null;
    campaignId: string | null;
    defaultDate: string;
  } | null>(null);

  // Which agent is currently in the EditPunchDialog (for clocking in/out on
  // behalf of a no-email agent or fixing a missed punch). null = closed.
  const [punchTarget, setPunchTarget] = useState<{
    employeeId: string;
    employeeName: string;
    clockIn: string | null;
  } | null>(null);

  // Yesterday's date (for the dialog's defaultDate)
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return todayLocal(d);
  }, []);

  // Lazy-fetch KPI fields for the target agent's campaign when the dialog opens.
  // Different campaigns have different KPIs so we can't preload them all.
  const submitCampaignId = submitTarget?.campaignId ?? null;
  const { data: dialogKpiFields = [] } = useQuery({
    queryKey: ["roster-submit-eod-kpis", submitCampaignId],
    queryFn: async () => {
      if (!submitCampaignId) return [];
      const { data, error } = await supabase
        .from("campaign_kpi_config")
        .select("field_name, field_label, field_type, is_required, dropdown_options, display_order")
        .eq("campaign_id", submitCampaignId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []).map<SubmitEODKPIField>((k) => ({
        field_name: k.field_name,
        field_label: k.field_label,
        field_type: k.field_type as SubmitEODKPIField["field_type"],
        is_required: k.is_required ?? false,
        dropdown_options: k.dropdown_options,
      }));
    },
    enabled: !!submitCampaignId,
  });

  function handleNudge(employeeId: string, name: string) {
    createNudge.mutate(
      { employeeId, tlEmployeeId },
      {
        onSuccess: () => toast.success(`Marked ${name} as nudged`),
        onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
      }
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg flex-1">Today's roster</CardTitle>
          <Link to="/asistencia" className="text-xs text-muted-foreground hover:text-foreground">
            Open my team →
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Missing yesterday's EOD — amber strip at top */}
          {(missingYesterday.data?.length ?? 0) > 0 && (
            <div className="space-y-2">
              {missingYesterday.data!.map((agent) => {
                const displayName = getDisplayName({
                  work_name: agent.workName,
                  full_name: agent.fullName,
                });
                return (
                  <div
                    key={`missing-${agent.employeeId}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        Missing yesterday's EOD:{" "}
                        <span className="font-medium">{displayName}</span>
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-300 hover:bg-amber-100"
                      disabled={!agent.campaignId}
                      onClick={() =>
                        setSubmitTarget({
                          employeeId: agent.employeeId,
                          fullName: agent.fullName,
                          workName: agent.workName,
                          campaignId: agent.campaignId,
                          defaultDate: yesterday,
                        })
                      }
                    >
                      <Send className="mr-1 h-3 w-3" />
                      Submit for {displayName.split(" ")[0]}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Roster rows */}
          {timeclock.isLoading && <LogoLoadingIndicator size="sm" />}
          {!timeclock.isLoading && (timeclock.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No team members assigned yet.</p>
          )}
          {timeclock.data?.map((entry) => {
            const name = getDisplayName({
              work_name: entry.workName,
              full_name: entry.fullName,
            });
            const nudge = nudges.data?.get(entry.employeeId);
            const showNudgeButton = entry.status === "late" || entry.status === "absent";
            // Show the "Clock in for them" pencil on actionable rows.
            // No-email agents will never clock themselves in via the app, so
            // this is the TL's only path. Login agents may also need a fix
            // when the app failed or they forgot.
            const showPunchButton =
              entry.status === "absent" ||
              entry.status === "late" ||
              entry.status === "expected";
            return (
              <div
                key={entry.employeeId}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{name}</span>
                  {statusBadge(entry.status)}
                </div>
                <div className="flex items-center gap-2">
                  {(entry.status === "present" || entry.status === "completed") && (
                    <span className="text-xs text-muted-foreground">
                      In: {formatTime(entry.clockInTime)}
                    </span>
                  )}
                  {entry.status === "late" && (
                    <span className="text-xs text-muted-foreground">
                      {entry.clockInTime ? `In: ${formatTime(entry.clockInTime)}` : "Not in yet"}
                    </span>
                  )}
                  {showPunchButton && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      title={entry.clockInTime ? "Edit punch" : "Clock in for them"}
                      onClick={() =>
                        setPunchTarget({
                          employeeId: entry.employeeId,
                          employeeName: name,
                          clockIn: entry.clockInTime,
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {/* Same-day "Submit EOD" — only for agents without a login.
                      The submit-eod-for-agent edge fn refuses logged-in agents,
                      so hide the button rather than let them click and fail. */}
                  {!entry.hasLogin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!entry.campaignId}
                      title={
                        entry.campaignId
                          ? "Submit today's EOD for this agent"
                          : "Agent needs a campaign assigned first"
                      }
                      onClick={() =>
                        setSubmitTarget({
                          employeeId: entry.employeeId,
                          fullName: entry.fullName,
                          workName: entry.workName,
                          campaignId: entry.campaignId,
                          defaultDate: todayLocal(),
                        })
                      }
                    >
                      <Send className="mr-1 h-3 w-3" />
                      EOD
                    </Button>
                  )}
                  {showNudgeButton && (
                    nudge ? (
                      <Badge
                        variant="outline"
                        className="h-7 text-xs px-2 bg-muted/40 text-muted-foreground font-normal"
                        title={`Nudged at ${new Date(nudge.nudged_at).toLocaleTimeString()}`}
                      >
                        Nudged {relativeMinutes(nudge.nudged_at)}
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={createNudge.isPending}
                        onClick={() => handleNudge(entry.employeeId, name)}
                      >
                        Nudge
                      </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Submit EOD on behalf of an agent. Opened from two places:
          - "Missing yesterday's EOD" amber strip (defaultDate = yesterday)
          - Per-row button on no-login agents (defaultDate = today) */}
      <SubmitEODForAgentDialog
        open={!!submitTarget}
        onOpenChange={(o) => { if (!o) setSubmitTarget(null); }}
        agent={
          submitTarget
            ? {
                id: submitTarget.employeeId,
                name: getDisplayName({
                  work_name: submitTarget.workName,
                  full_name: submitTarget.fullName,
                }),
              }
            : null
        }
        campaignId={submitTarget?.campaignId ?? null}
        kpiFields={dialogKpiFields}
        defaultDate={submitTarget?.defaultDate ?? yesterday}
        onSubmitted={() => {
          setSubmitTarget(null);
          missingYesterday.refetch();
        }}
      />

      {/* Clock-in / fix-punch on behalf of an agent (no-email or app failure).
          Dialog auto-upserts (existing row OR new), audits via edit-time-clock. */}
      {punchTarget && (
        <EditPunchDialog
          open={!!punchTarget}
          onOpenChange={(o) => { if (!o) { setPunchTarget(null); timeclock.refetch(); } }}
          employeeId={punchTarget.employeeId}
          employeeName={punchTarget.employeeName}
          date={todayLocal()}
          existing={
            punchTarget.clockIn
              ? {
                  clock_in: punchTarget.clockIn,
                  clock_out: null,
                  lunch_start: null,
                  lunch_end: null,
                  break1_start: null,
                  break1_end: null,
                  break2_start: null,
                  break2_end: null,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
