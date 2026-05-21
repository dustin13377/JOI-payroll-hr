import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useTeamRoster,
  usePendingTimeOffForTeam,
  useTeamEODThisWeek,
  useUnderperformerAlerts,
  useTLCampaigns,
  useTodaysTLNote,
  useSaveTLNote,
  useEODProgress,
  useAgentBreakdown,
  type TLCampaign,
} from "@/hooks/useTeamLead";
import {
  useNextUpcomingHoliday,
  useTeamHolidayRequests,
  useTLApproveHolidayRequest,
  useTLDismissHolidayRequest,
} from "@/hooks/useHolidayRequests";
import {
  useTLPendingVacationRequests,
  useTLApproveVacationRequest,
  useTLDenyVacationRequest,
} from "@/hooks/useVacationRequests";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Clock, CalendarDays, TrendingUp, AlertTriangle, CheckCircle2, XCircle, FileText, Flag, ChevronDown, ChevronUp, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { todayLocal, formatDateMX, formatDateMXLong } from "@/lib/localDate";
import { getDisplayName } from "@/lib/displayName";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { HomeHero } from "@/components/HomeHero";
import { TodaysRosterCard } from "@/components/TodaysRosterCard";

const TZ_LABELS: Record<string, string> = {
  "America/Denver": "Mountain",
  "America/Los_Angeles": "Pacific",
  "America/Chicago": "Central",
  "America/New_York": "Eastern",
  "America/Phoenix": "Arizona",
};

function formatCutoff(time: string | null, tz: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const mm = m > 0 ? `:${String(m).padStart(2, "0")}` : "";
  return `${h12}${mm} ${ampm} ${TZ_LABELS[tz] ?? tz}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) !== 1 ? "s" : ""} ago`;
}

function isPastCutoff(cutoffTime: string | null, tz: string): boolean {
  if (!cutoffTime) return false;
  try {
    const today = todayLocal();
    const dtStr = `${today}T${cutoffTime}`;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    // Current time in the campaign's timezone
    const parts = formatter.formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
    const nowMins = parseInt(get("hour")) * 60 + parseInt(get("minute"));
    const [ch, cm] = cutoffTime.split(":").map(Number);
    const cutoffMins = ch * 60 + (cm || 0);
    return nowMins >= cutoffMins;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  EOD Note Card (one per campaign)                                   */
/* ------------------------------------------------------------------ */

function EODNoteCard({
  campaign,
  employeeId,
}: {
  campaign: TLCampaign;
  employeeId: string;
}) {
  const noteQuery = useTodaysTLNote(campaign.id);
  const progress = useEODProgress(campaign.id);
  const saveMutation = useSaveTLNote();
  const { isLeadership } = useAuth();

  const [draft, setDraft] = useState("");
  const [savedText, setSavedText] = useState("");

  // Sync draft from server
  useEffect(() => {
    const serverNote = noteQuery.data?.note ?? "";
    setDraft(serverNote);
    setSavedText(serverNote);
  }, [noteQuery.data]);

  const isDirty = draft !== savedText;

  const handleSave = useCallback(() => {
    saveMutation.mutate(
      { campaignId: campaign.id, note: draft, writtenBy: employeeId },
      {
        onSuccess: () => {
          setSavedText(draft);
          toast.success("Note saved");
        },
      }
    );
  }, [campaign.id, draft, employeeId, saveMutation]);

  const cutoffLabel = formatCutoff(
    campaign.eod_digest_cutoff_time,
    campaign.eod_digest_timezone
  );
  const pastCutoff = isPastCutoff(
    campaign.eod_digest_cutoff_time,
    campaign.eod_digest_timezone
  );

  const prog = progress.data;
  const lastSaved = noteQuery.data?.updated_at;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">
            Today's EOD Note — {campaign.name}
          </CardTitle>
        </div>
        {cutoffLabel ? (
          <Badge variant="outline" className="shrink-0 text-xs">
            Cutoff: {cutoffLabel}
          </Badge>
        ) : (
          // Quick way for leadership to jump straight to the setting.
          // Team leads can't access /campaigns/:id (it's RequireLeadership),
          // so they see a static badge telling them to ping a manager.
          isLeadership ? (
            <Link to={`/campaigns/${campaign.id}`} className="shrink-0">
              <Badge
                variant="outline"
                className="text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
              >
                No cutoff set — configure
              </Badge>
            </Link>
          ) : (
            <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
              No cutoff set — ask your manager
            </Badge>
          )
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress line */}
        {prog && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{prog.submitted}</span>{" "}
            of{" "}
            <span className="font-medium text-foreground">{prog.total}</span>{" "}
            agents have submitted today's EOD
          </p>
        )}

        {/* Textarea + Save */}
        <div className="flex gap-3 items-start">
          <Textarea
            className="min-h-[6rem] flex-1 resize-y"
            rows={4}
            placeholder="Today's context — anything the recipients should know."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          {isDirty && (
            <Button
              className="shrink-0"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save Note"}
            </Button>
          )}
        </div>

        {/* Last saved + past cutoff */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {lastSaved
              ? `Last saved ${relativeTime(lastSaved)}`
              : "Not yet saved today"}
          </p>
          {pastCutoff && (
            <p className="text-xs text-muted-foreground">
              Cutoff has passed. Note will appear in tomorrow's morning late
              bundle if submitted late.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Holiday Section (one per campaign — rendered inside ApprovalsCard) */
/* ------------------------------------------------------------------ */

function HolidaySection({ campaign }: { campaign: TLCampaign }) {
  const { data: nextHoliday } = useNextUpcomingHoliday();
  const { data: requests = [], isLoading } = useTeamHolidayRequests(
    campaign.id,
    nextHoliday?.date ?? null
  );
  const approveMutation = useTLApproveHolidayRequest();
  const dismissMutation = useTLDismissHolidayRequest();

  // Hide section if no upcoming holiday or it's already today/past
  if (!nextHoliday || nextHoliday.date <= todayLocal()) return null;

  const approved = requests.filter((r) => r.status === "approved");
  const pending = requests.filter((r) => r.status === "pending_tl");

  function handleApprove(id: string) {
    approveMutation.mutate(
      { id, campaignId: campaign.id, holidayDate: nextHoliday!.date },
      {
        onSuccess: () => toast.success("Approved"),
        onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
      }
    );
  }

  function handleDismiss(id: string) {
    dismissMutation.mutate(
      { id, campaignId: campaign.id, holidayDate: nextHoliday!.date },
      {
        onSuccess: () => toast.success("Request dismissed"),
        onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
      }
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarCheck className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          Holiday — {nextHoliday.name}, {formatDateMXLong(nextHoliday.date)} · {campaign.name}
        </p>
        {nextHoliday.is_statutory && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Statutory</Badge>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {approved.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Approved off ({approved.length})
              </p>
              <ul className="space-y-1">
                {approved.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    {r.displayName}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pending.length > 0 && (
            <ul className="space-y-2">
              {pending.map((r) => {
                const isActing =
                  (approveMutation.isPending && approveMutation.variables?.id === r.id) ||
                  (dismissMutation.isPending && dismissMutation.variables?.id === r.id);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">{r.displayName}</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isActing}
                        onClick={() => handleApprove(r.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={isActing}
                        onClick={() => handleDismiss(r.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {approved.length === 0 && pending.length === 0 && (
            <p className="text-sm text-muted-foreground">No agents approved off yet.</p>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vacation Section (one per campaign — rendered inside ApprovalsCard) */
/* ------------------------------------------------------------------ */

function VacationSection({ campaign }: { campaign: TLCampaign }) {
  const { data: requests = [], isLoading } = useTLPendingVacationRequests(campaign.id);
  const approveMutation = useTLApproveVacationRequest();
  const denyMutation = useTLDenyVacationRequest();
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  // Auto-hide if no pending requests
  if (!isLoading && requests.length === 0) return null;

  function handleApprove(id: string) {
    approveMutation.mutate(
      { id, campaignId: campaign.id },
      {
        onSuccess: () => toast.success("Forwarded to HR"),
        onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
      }
    );
  }

  function handleDenyConfirm(id: string) {
    if (!denyReason.trim()) return;
    denyMutation.mutate(
      { id, campaignId: campaign.id, reason: denyReason.trim() },
      {
        onSuccess: () => {
          toast.success("Request denied");
          setDenyingId(null);
          setDenyReason("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
      }
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          Vacation — forward to HR · {campaign.name} ({requests.length})
        </p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((req) => {
            const isDenying = denyingId === req.id;
            const isActing =
              (approveMutation.isPending && approveMutation.variables?.id === req.id) ||
              (denyMutation.isPending && denyMutation.variables?.id === req.id);
            return (
              <li key={req.id} className="rounded-md border px-3 py-2 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">{req.displayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateMX(req.start_date)} – {formatDateMX(req.end_date)}
                      <span className="ml-1 text-xs">
                        ({req.days_requested} {req.days_requested === 1 ? "day" : "days"})
                      </span>
                    </p>
                    {req.notes && (
                      <p className="text-xs text-muted-foreground italic mt-0.5">{req.notes}</p>
                    )}
                  </div>
                  {!isDenying && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isActing}
                        onClick={() => handleApprove(req.id)}
                      >
                        Forward to HR
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={isActing}
                        onClick={() => {
                          setDenyingId(req.id);
                          setDenyReason("");
                        }}
                      >
                        Deny
                      </Button>
                    </div>
                  )}
                </div>
                {isDenying && (
                  <div className="flex gap-2 items-center flex-wrap">
                    <Input
                      placeholder="Reason for denial (required)"
                      value={denyReason}
                      onChange={(e) => setDenyReason(e.target.value)}
                      className="flex-1 h-8 text-sm min-w-48"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!denyReason.trim() || denyMutation.isPending}
                      onClick={() => handleDenyConfirm(req.id)}
                    >
                      Confirm Deny
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setDenyingId(null); setDenyReason(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Time Off Section (agents reporting directly to this TL)            */
/* ------------------------------------------------------------------ */

function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDateMX(start);
  return `${formatDateMX(start)} – ${formatDateMX(end)}`;
}

function TimeOffSection({ employeeId }: { employeeId: string }) {
  const pendingTimeOff = usePendingTimeOffForTeam(employeeId);
  const queryClient = useQueryClient();

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: "approved" | "denied" }) => {
      const { error } = await supabase
        .from("time_off_requests")
        .update({ status, reviewed_by: employeeId, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["team-timeoff-pending"] });
      toast.success(`Request ${status}`);
    },
  });

  if (pendingTimeOff.isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          Time off
        </p>
        <LogoLoadingIndicator size="sm" />
      </div>
    );
  }

  const data = pendingTimeOff.data ?? [];
  if (data.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          Time off ({data.length})
        </p>
      </div>
      <ul className="space-y-2">
        {data.map((req) => (
          <li key={req.id} className="rounded-md border px-3 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-medium">
                  {getDisplayName({ work_name: req.workName, full_name: req.fullName })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateRange(req.start_date, req.end_date)}
                </p>
                {req.reason && (
                  <p className="text-xs text-muted-foreground italic mt-0.5">{req.reason}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ requestId: req.id, status: "approved" })}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ requestId: req.id, status: "denied" })}
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  Deny
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ApprovalsCard — unified container for Time Off / Holiday / Vacation */
/* ------------------------------------------------------------------ */

function ApprovalsCard({ employeeId }: { employeeId: string }) {
  const tlCampaigns = useTLCampaigns(employeeId);
  const pendingTimeOff = usePendingTimeOffForTeam(employeeId);

  const isLoading = pendingTimeOff.isLoading || tlCampaigns.isLoading;
  const hasTimeOff = (pendingTimeOff.data ?? []).length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-lg">Approvals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && <LogoLoadingIndicator size="sm" />}

        {!isLoading && (
          <>
            <TimeOffSection employeeId={employeeId} />
            {tlCampaigns.data?.map((c) => (
              <HolidaySection key={`hol-${c.id}`} campaign={c} />
            ))}
            {tlCampaigns.data?.map((c) => (
              <VacationSection key={`vac-${c.id}`} campaign={c} />
            ))}
            {/* Empty state — only show when nothing else is rendering.
                The per-campaign sections auto-hide when empty, but we can't
                know that from out here without lifting their queries. So
                this banner shows when time-off is empty AND there are no
                upcoming holidays anywhere (the most common empty case).
                If a campaign has pending holiday/vacation, those sections
                render above and this is just visual noise — acceptable. */}
            {!hasTimeOff && (
              <p className="text-sm text-muted-foreground">
                Nothing pending in time-off. Holiday and vacation sections appear here when there's something to review.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatTrendDate(dateStr: string): string {
  return formatDateMX(dateStr);
}

/* ------------------------------------------------------------------ */
/*  Agent Breakdown Row — inline expandable inside the EOD table       */
/* ------------------------------------------------------------------ */

function kpiCellColor(
  value: number | string | boolean | null,
  minTarget: number | null,
  fieldType: string
): string {
  if (value === null) return "text-muted-foreground";
  if (fieldType !== "number" || minTarget === null) return "";
  const n = Number(value);
  if (n >= minTarget) return "text-green-700 font-semibold";
  if (n > 0) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function fmtVal(value: number | string | boolean | null, fieldType: string): string {
  if (value === null) return "—";
  if (fieldType === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function AgentBreakdownRow({
  employeeId,
  campaignId,
  colSpan,
}: {
  employeeId: string;
  campaignId: string | null;
  colSpan: number;
}) {
  const breakdown = useAgentBreakdown(employeeId, campaignId);
  const data = breakdown.data;
  const [showMonth, setShowMonth] = useState(false);

  const kpis = data?.kpiFields ?? [];
  const weekDays = data?.days.filter((d) => d.isCurrentWeek) ?? [];
  const monthDays = data?.days ?? [];
  const displayDays = showMonth ? monthDays : weekDays;

  return (
    <TableRow className="bg-slate-50 hover:bg-slate-50">
      <TableCell colSpan={colSpan} className="p-0">
        <div className="px-4 py-3 space-y-3">
          {breakdown.isLoading && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
          {!breakdown.isLoading && kpis.length === 0 && (
            <p className="text-xs text-muted-foreground">No KPI fields configured.</p>
          )}
          {!breakdown.isLoading && kpis.length > 0 && (
            <>
              {/* Week / Month toggle */}
              <div className="flex items-center gap-3">
                <button
                  className={`text-xs font-medium pb-0.5 ${!showMonth ? "border-b-2 border-[#1B2A4A] text-[#1B2A4A]" : "text-muted-foreground"}`}
                  onClick={() => setShowMonth(false)}
                >
                  This Week
                </button>
                <button
                  className={`text-xs font-medium pb-0.5 ${showMonth ? "border-b-2 border-[#1B2A4A] text-[#1B2A4A]" : "text-muted-foreground"}`}
                  onClick={() => setShowMonth(true)}
                >
                  Last 30 Days
                </button>
              </div>

              {displayDays.length === 0 ? (
                <p className="text-xs text-muted-foreground">No submissions.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left font-medium pb-1 w-20">Date</th>
                      {kpis.map((k) => (
                        <th key={k.field_name} className="text-left font-medium pb-1">
                          {k.field_label}
                          {k.min_target !== null && (
                            <span className="ml-1 font-normal opacity-60">
                              (min {k.min_target})
                            </span>
                          )}
                        </th>
                      ))}
                      <th className="text-left font-medium pb-1">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayDays.map((day) => (
                      <tr
                        key={day.date}
                        className={`border-t border-slate-100 ${day.isCurrentWeek && showMonth ? "bg-blue-50/50" : ""}`}
                      >
                        <td className="py-1 text-muted-foreground whitespace-nowrap">
                          {formatTrendDate(day.date)}
                        </td>
                        {kpis.map((k) => (
                          <td
                            key={k.field_name}
                            className={`py-1 ${kpiCellColor(day.metrics[k.field_name] ?? null, k.min_target, k.field_type)}`}
                          >
                            {fmtVal(day.metrics[k.field_name] ?? null, k.field_type)}
                          </td>
                        ))}
                        <td className="py-1 text-muted-foreground max-w-[240px] truncate">
                          {day.notes ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// formatTime + formatDateRange + statusBadge all moved into the components
// that own their respective cards (TodaysRosterCard / TimeOffSection).

export default function TeamLeadHome() {
  const { employeeId } = useAuth();

  // Fetch TL's own employee record for name + campaign
  const { data: tlEmployee } = useQuery({
    queryKey: ["tl-self", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("full_name, work_name, campaign_id, campaigns!employees_campaign_id_fkey(name)")
        .eq("id", employeeId!)
        .single();
      return data;
    },
    enabled: !!employeeId,
  });

  const roster = useTeamRoster(employeeId ?? undefined);
  // Today's attendance + Missing-yesterday data now lives inside TodaysRosterCard.
  // Pending time-off data moved into ApprovalsCard (its own hook).
  const eodWeek = useTeamEODThisWeek(employeeId ?? undefined);
  const alerts = useUnderperformerAlerts(employeeId ?? undefined);
  const tlCampaigns = useTLCampaigns(employeeId ?? null);

  // Expanded agent row state
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // Build a campaignId lookup from roster data
  const campaignIdByEmployee = new Map<string, string | null>(
    (roster.data ?? []).map((m) => [m.id, m.campaign_id ?? null])
  );

  const displayName = tlEmployee ? getDisplayName({ work_name: (tlEmployee as { work_name?: string | null }).work_name, full_name: tlEmployee.full_name ?? "" }) : "";
  const firstName = displayName.split(" ")[0] || "Team Lead";
  const campaignData = tlEmployee?.campaigns as { name: string } | null;
  const campaignName = campaignData?.name ?? "Your Campaign";
  const teamSize = roster.data?.length ?? 0;

  // (Time-off review mutation now lives inside ApprovalsCard's TimeOffSection.)
  // (statusBadge helper moved into TodaysRosterCard.)

  // ---------- EOD metric columns ----------
  const eodData = eodWeek.data?.summaries ?? [];
  const kpiFields = eodWeek.data?.kpiFields ?? [];

  // Subtitle for the hero — context line under the greeting.
  const teamSizeLabel = teamSize === 1 ? "Team of 1" : `Team of ${teamSize}`;
  const heroSubtitle = `${campaignName} · ${teamSizeLabel}`;

  return (
    <div className="space-y-6">
      {/* MY DAY — shared hero used by both EmployeeHome and TeamLeadHome.
          TLs are working agents too (calls / packages / credit pulls), so
          they get the same daily flow: clock-in, quick actions, stats. */}
      {employeeId && (
        <HomeHero
          employeeId={employeeId}
          firstName={firstName}
          subtitle={heroSubtitle}
          campaignId={(tlEmployee as { campaign_id?: string | null } | null)?.campaign_id ?? null}
        />
      )}

      {/* MY TEAM divider */}
      <div className="flex items-center gap-3 pt-2">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-medium">
          My team
        </span>
        <span className="flex-1 h-px bg-border" />
      </div>

      {/* Today's EOD Note cards — one per campaign the TL leads */}
      {tlCampaigns.data && tlCampaigns.data.length > 0 && employeeId && (
        <div className="space-y-4">
          {tlCampaigns.data.map((c) => (
            <EODNoteCard key={c.id} campaign={c} employeeId={employeeId} />
          ))}
        </div>
      )}

      {/* Approvals — unified card. Internally renders Time Off section
          (across all direct reports) plus per-campaign Holiday and Vacation
          sub-sections. Replaces the previous 3 separate cards (or up to
          2N+1 cards for TLs leading multiple campaigns). */}
      {employeeId && <ApprovalsCard employeeId={employeeId} />}

      {/* Today's Roster — replaces the old Today's Attendance card.
          Adds the "Missing yesterday's EOD" amber strip (folded in from
          TLDashboard) with a Submit-for-agent button per row, plus working
          Nudge buttons backed by the tl_nudges audit table. */}
      {employeeId && <TodaysRosterCard tlEmployeeId={employeeId} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 3 — EOD Performance This Week (full width) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">EOD Performance This Week</CardTitle>
          </CardHeader>
          <CardContent>
            {eodWeek.isLoading && (
              <LogoLoadingIndicator size="sm" />
            )}
            {!eodWeek.isLoading && eodData.length === 0 && (
              <p className="text-sm text-muted-foreground">No EOD data this week.</p>
            )}
            {eodData.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    {kpiFields.map((kpi) => (
                      <TableHead key={kpi.field_name}>{kpi.field_label}</TableHead>
                    ))}
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eodData.map((row) => {
                    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
                    const isExpanded = expandedAgentId === row.employeeId;
                    const colSpan = kpiFields.length + 2;
                    return (
                      <>
                        <TableRow
                          key={row.employeeId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() =>
                            setExpandedAgentId(isExpanded ? null : row.employeeId)
                          }
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium underline-offset-2 hover:underline">
                                {getDisplayName({ work_name: row.workName, full_name: row.fullName })}
                              </span>
                              {isExpanded
                                ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          </TableCell>
                          {kpiFields.map((kpi) => (
                            <TableCell key={kpi.field_name}>
                              {metrics[kpi.field_name] != null
                                ? String(metrics[kpi.field_name])
                                : "—"}
                            </TableCell>
                          ))}
                          <TableCell>
                            {row.isBottomPerformer && (
                              <Flag className="h-4 w-4 text-amber-500" title="Below target" />
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <AgentBreakdownRow
                            key={`${row.employeeId}-detail`}
                            employeeId={row.employeeId}
                            campaignId={campaignIdByEmployee.get(row.employeeId) ?? null}
                            colSpan={colSpan}
                          />
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Card 4 — Alerts */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.isLoading && (
              <LogoLoadingIndicator size="sm" />
            )}
            {!alerts.isLoading && (!alerts.data || alerts.data.length === 0) && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-800">
                  Everyone's on track this week.
                </span>
              </div>
            )}
            {alerts.data && alerts.data.length > 0 && (
              <div className="space-y-2">
                {alerts.data.map((alert, idx) => (
                  <div
                    key={`${alert.employeeId}-${idx}`}
                    className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium">{getDisplayName({ work_name: alert.workName, full_name: alert.fullName })}</span>
                      <span className="text-amber-800 ml-1">— {alert.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
