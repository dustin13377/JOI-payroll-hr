import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { todayLocal } from "@/lib/localDate";
import { ScheduleBanner } from "@/components/ScheduleBanner";
import { formatMinutesVerbose } from "@/lib/formatDuration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import SignedHrDocumentsCard from "@/components/employee-profile/SignedHrDocumentsCard";
import UptrainingCard from "@/components/employee-profile/UptrainingCard";
import { ClockOutEODDialog, KPIField } from "@/components/ClockOutEODDialog";
import {
  Clock,
  Coffee,
  UtensilsCrossed,
  ClipboardCheck,
  CalendarDays,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Timer,
  FileText,
  Upload,
  Megaphone,
} from "lucide-react";
import { usePublishedPosts, useMyAcks } from "@/hooks/useBulletin";
import { useEmployeeDocuments, useUploadDocument } from "@/hooks/useEmployeeDocuments";
import { useMyGoal } from "@/hooks/useSupabasePayroll";
import { GoalPromptDialog } from "@/components/GoalPromptDialog";
import { DocumentStatusBadge } from "@/components/DocumentStatusBadge";
import { useComplianceStatus } from "@/hooks/useComplianceStatus";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ShieldX, ShieldAlert } from "lucide-react";
import { ACCEPTED_DOCUMENT_TYPES, ACCEPTED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE_BYTES } from "@/lib/documentUpload";
import { useAgentLogEntries } from "@/hooks/useAgentLog";
import { formatDateMX, formatDateMXLong, formatDateUSShort } from "@/lib/localDate";
import { useAgentIncidents, getIncidentDocSignedUrl, INCIDENT_TYPE_LABELS, type IncidentType } from "@/hooks/useAttendanceIncidents";
import { useMyApplicablePolicies, useMyPolicyAcks } from "@/hooks/usePolicies";
import { FileWarning, StickyNote, Eye, ScrollText } from "lucide-react";

interface TimeClockEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  date: string;
  total_hours: number | null;
  is_late: boolean;
  late_minutes: number | null;
  lunch_start: string | null;
  lunch_end: string | null;
  break1_start: string | null;
  break1_end: string | null;
  break2_start: string | null;
  break2_end: string | null;
  shift_end_expected: string | null;
  auto_clocked_out: boolean;
}

interface EodLog {
  id: string;
  date: string;
  metrics: Record<string, unknown>;
  notes: string | null;
}

interface TimeOffRequest {
  id: string;
  start_date: string;
  end_date: string;
  // Derived from vacation_requests.request_type (vacation/sick/personal/other).
  reason: string;
  // 'pending_tl' | 'pending_hr' | 'approved' | 'denied' | 'cancelled'
  status: string;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayLabels(weekStart: Date): { iso: string; label: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return {
      iso: todayLocal(d),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
    };
  });
}

function getActiveBreak(entry: TimeClockEntry | null) {
  if (!entry) return null;
  if (entry.lunch_start && !entry.lunch_end) return "lunch";
  if (entry.break1_start && !entry.break1_end) return "break1";
  if (entry.break2_start && !entry.break2_end) return "break2";
  return null;
}

function elapsedString(fromIso: string, now: Date) {
  const ms = now.getTime() - new Date(fromIso).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "YYYY-MM-DD" for today in the given IANA timezone. */
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Subtract `days` from a "YYYY-MM-DD" string. */
function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - days);
  return todayLocal(dt);
}

export default function EmployeeHome() {
  const { user, employeeId } = useAuth();
  const [now, setNow] = useState(new Date());
  const [backfillDate, setBackfillDate] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Fetch employee record (for display name)
  const { data: employee } = useQuery({
    queryKey: ["home-employee", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, campaign_id, title, work_name, employee_id")
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return data as { id: string; full_name: string; campaign_id: string; title: string; work_name: string | null; employee_id: string };
    },
    enabled: !!employeeId,
  });

  // Campaign name + timezone
  const { data: campaign } = useQuery({
    queryKey: ["home-campaign", employee?.campaign_id],
    queryFn: async () => {
      if (!employee?.campaign_id) return null;
      const { data, error } = await supabase
        .from("campaigns")
        .select("name, eod_digest_timezone")
        .eq("id", employee.campaign_id)
        .maybeSingle();
      if (error) return null;
      return data as { name: string; eod_digest_timezone: string } | null;
    },
    enabled: !!employee?.campaign_id,
  });
  const campaignName = campaign?.name ?? null;
  const campaignTz = campaign?.eod_digest_timezone || "America/Denver";

  // Today's entry
  const { data: todayEntry } = useQuery({
    queryKey: ["home-today", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const today = todayLocal();
      const { data, error } = await supabase
        .from("time_clock")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as TimeClockEntry | null;
    },
    enabled: !!employeeId,
    refetchInterval: 30000,
  });

  // Shift settings (for grace-period warning + auto-late on clock-in)
  const { data: shiftSettings } = useQuery({
    queryKey: ["home-shift-settings", employee?.campaign_id],
    queryFn: async () => {
      if (!employee?.campaign_id) return null;
      const { data, error } = await supabase
        .from("shift_settings")
        .select("start_time, end_time, grace_minutes")
        .eq("campaign_id", employee.campaign_id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data || null) as { start_time: string; end_time: string; grace_minutes: number } | null;
    },
    enabled: !!employee?.campaign_id,
  });

  // Confirm dialog + direct clock-in mutation (so user doesn't have to navigate
  // to the timeclock page and click clock-in again).
  const [confirmClockInOpen, setConfirmClockInOpen] = useState(false);
  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId || !employee?.campaign_id) throw new Error("Missing employee/campaign");
      const nowDate = new Date();
      const today = todayLocal(nowDate);

      const { data: existing } = await supabase
        .from("time_clock")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("date", today)
        .maybeSingle();
      if (existing) throw new Error("Already clocked in today");

      let isLate = false;
      let lateMinutes = 0;
      let shiftEndExpected: string | null = null;
      if (shiftSettings?.start_time) {
        const [sh, sm] = shiftSettings.start_time.split(":").map(Number);
        const shiftStart = new Date(nowDate);
        shiftStart.setHours(sh, sm, 0, 0);
        const lateTime = new Date(shiftStart.getTime() + (shiftSettings.grace_minutes || 0) * 60000);
        if (nowDate > lateTime) {
          isLate = true;
          lateMinutes = Math.floor((nowDate.getTime() - lateTime.getTime()) / 60000);
        }
        if (shiftSettings.end_time) {
          const [eh, em] = shiftSettings.end_time.split(":").map(Number);
          const end = new Date(nowDate);
          end.setHours(eh, em, 0, 0);
          // If end_time is before start_time, treat shift as crossing midnight.
          if (end <= shiftStart) end.setDate(end.getDate() + 1);
          shiftEndExpected = end.toISOString();
        }
      }

      const { data, error } = await supabase
        .from("time_clock")
        .insert({
          employee_id: employeeId,
          clock_in: nowDate.toISOString(),
          date: today,
          is_late: isLate,
          late_minutes: isLate ? lateMinutes : null,
          shift_end_expected: shiftEndExpected,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-today", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["home-week", employeeId] });
      toast({ title: "Clocked in", description: `Welcome, ${firstName} — have a great day.` });
    },
    onError: (err) => {
      toast({ title: "Clock-in failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  // Personal goal: shows first-login prompt if not set + not dismissed.
  const { data: myGoal } = useMyGoal(employeeId);
  const [goalPromptOpen, setGoalPromptOpen] = useState(false);
  useEffect(() => {
    // Open the prompt once on first render where they qualify, then leave it
    // alone. If they dismiss, goal_prompt_dismissed gets set server-side so
    // we never re-open on subsequent visits.
    if (myGoal && !myGoal.personal_goal && !myGoal.goal_prompt_dismissed) {
      setGoalPromptOpen(true);
    }
  }, [myGoal?.personal_goal, myGoal?.goal_prompt_dismissed]);

  // Grace-period status (used on the dashboard pre-clock-in)
  let pastGracePeriod = false;
  let minutesPastGrace = 0;
  if (!todayEntry && shiftSettings?.start_time) {
    const [sh, sm] = shiftSettings.start_time.split(":").map(Number);
    const grace = shiftSettings.grace_minutes || 0;
    const lateBoundary = new Date(now);
    lateBoundary.setHours(sh, sm, 0, 0);
    lateBoundary.setMinutes(lateBoundary.getMinutes() + grace);
    if (now > lateBoundary) {
      pastGracePeriod = true;
      minutesPastGrace = Math.floor((now.getTime() - lateBoundary.getTime()) / 60000);
    }
  }

  // Week's entries
  const weekStart = startOfWeek(now);
  const { data: weekEntries = [] } = useQuery({
    queryKey: ["home-week", employeeId, todayLocal(weekStart)],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("time_clock")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("date", todayLocal(weekStart))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as TimeClockEntry[];
    },
    enabled: !!employeeId,
  });

  // Recent EOD logs (last 5)
  const { data: recentEod = [] } = useQuery({
    queryKey: ["home-eod", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("eod_logs")
        .select("*")
        .eq("employee_id", employeeId)
        .order("date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as EodLog[];
    },
    enabled: !!employeeId,
  });

  // Pending time-off. Reads the unified vacation_requests table — covers
  // both pending (pending_tl or pending_hr) AND approved requests, mapped
  // to the same TimeOffRequest shape the existing widget consumes.
  // status badge below treats anything not 'approved' as "pending" coloring.
  const { data: pendingTimeOff = [] } = useQuery({
    queryKey: ["home-timeoff", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("id, start_date, end_date, request_type, status")
        .eq("employee_id", employeeId)
        .in("status", ["pending_tl", "pending_hr", "approved"])
        .gte("start_date", todayLocal())
        .order("start_date", { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id as string,
        start_date: r.start_date as string,
        end_date: r.end_date as string,
        reason: r.request_type as string,
        status: r.status as string,
      })) as TimeOffRequest[];
    },
    enabled: !!employeeId,
  });

  // Missing EODs: auto-clocked-out shifts without EOD submission
  const twoDaysAgo = subtractDays(todayInTz(campaignTz), 2);
  const { data: missingEods = [] } = useQuery({
    queryKey: ["home-missing-eods", employeeId, twoDaysAgo],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("time_clock")
        .select("id, date, auto_clocked_out, eod_completed")
        .eq("employee_id", employeeId)
        .eq("auto_clocked_out", true)
        .eq("eod_completed", false)
        .order("date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as { id: string; date: string; auto_clocked_out: boolean; eod_completed: boolean }[];
    },
    enabled: !!employeeId,
  });

  // KPI fields for the backfill dialog
  const { data: kpiFields = [] } = useQuery({
    queryKey: ["home-kpi-config", employee?.campaign_id],
    queryFn: async () => {
      if (!employee?.campaign_id) return [];
      const { data, error } = await supabase
        .from("campaign_kpi_config")
        .select("*")
        .eq("campaign_id", employee.campaign_id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as KPIField[];
    },
    enabled: !!employee?.campaign_id,
  });

  const compliance = useComplianceStatus(employeeId);

  // Bulletin: unread announcements + unanswered surveys
  const { data: publishedPosts = [] } = usePublishedPosts();
  const { data: myAcks = new Set<string>() } = useMyAcks();
  const unreadBulletinCount = publishedPosts.filter(
    (p) =>
      p.type !== "recognition" &&
      ((p.type === "announcement" && p.requires_ack && !myAcks.has(p.id)) ||
        p.type === "questionnaire")
  ).length;

  // C2: Policies to review count
  const { data: myPolicies = [] } = useMyApplicablePolicies(
    employee?.campaign_id ?? null,
    employee?.title
  );
  const { data: myPolicyAcks = [] } = useMyPolicyAcks();
  const ackedVersionIds = new Set(myPolicyAcks.map((a) => a.policy_document_version_id));
  const unackedPolicyCount = myPolicies.filter(
    (p) => p.current_version && !ackedVersionIds.has(p.current_version.id)
  ).length;

  // ---------- Derived ----------
  const firstName = (employee?.work_name?.trim() || employee?.full_name || user?.email || "there").split(" ")[0];
  const isClockedIn = !!todayEntry && !todayEntry.clock_out;
  const activeBreak = getActiveBreak(todayEntry || null);

  // Build per-day chart data, even if employee has no entries (shows zeroes)
  const days = dayLabels(weekStart);
  const chartData = days.map((d) => {
    const entry = weekEntries.find((e) => e.date === d.iso);
    return {
      day: d.label,
      hours: entry?.total_hours ? Number(entry.total_hours.toFixed(2)) : 0,
    };
  });

  const weekHours = weekEntries.reduce((s, e) => s + (e.total_hours || 0), 0);
  const daysWorked = weekEntries.filter((e) => !!e.clock_out).length;
  const minutesLate = weekEntries.reduce((s, e) => s + (e.late_minutes || 0), 0);

  // Status badge text/color
  let statusBadge: { label: string; tone: string } = {
    label: "Not clocked in",
    tone: "bg-muted text-muted-foreground",
  };
  if (todayEntry?.clock_out) {
    statusBadge = {
      label: "Shift complete",
      tone: "bg-emerald-100 text-emerald-800",
    };
  } else if (activeBreak === "lunch") {
    statusBadge = { label: "On lunch", tone: "bg-amber-100 text-amber-800" };
  } else if (activeBreak === "break1" || activeBreak === "break2") {
    statusBadge = { label: "On break", tone: "bg-amber-100 text-amber-800" };
  } else if (isClockedIn) {
    statusBadge = { label: "Clocked in", tone: "bg-emerald-100 text-emerald-800" };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Hi, {firstName}</h2>
          <p className="text-sm text-muted-foreground">
            {now.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            {campaignName && (
              <>
                {" · "}
                <span className="font-medium text-foreground">{campaignName}</span>
              </>
            )}
          </p>
        </div>
        <Badge className={`${statusBadge.tone} text-sm px-3 py-1`} variant="outline">
          {statusBadge.label}
        </Badge>
      </div>

      {/* Personal goal reminder — shows only once the agent has set one.
          Small, subtle, encouraging. NOT shown every clock-in (that's the
          design call). Clickable to edit. */}
      {myGoal?.personal_goal && (
        <Card
          className="border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={() => setGoalPromptOpen(true)}
          title="Tap to update your goal"
        >
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Working toward
              </p>
              <p className="text-sm font-medium truncate">{myGoal.personal_goal}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* C2: Policies to review */}
      {unackedPolicyCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                {unackedPolicyCount} polic{unackedPolicyCount === 1 ? "y" : "ies"} to review
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/policies">Review now</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* A3a: Compliance banner */}
      {compliance.isLocked && (
        <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-800 [&>svg]:text-red-600">
          <ShieldX className="h-5 w-5" />
          <AlertTitle>Clock-in disabled</AlertTitle>
          <AlertDescription>
            Your clock-in is disabled because required documents are missing. Submit the following and contact HR:{" "}
            <strong>{compliance.missingTypes.map((t) => t.name).join(", ")}</strong>.
          </AlertDescription>
        </Alert>
      )}
      {!compliance.isLocked && compliance.isInGrace && compliance.missingTypes.length > 0 && (
        <Alert variant="warning">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Missing required documents</AlertTitle>
          <AlertDescription>
            You're missing required documents. Submit them by{" "}
            <strong>
              {formatDateMXLong(compliance.graceUntil)}
            </strong>{" "}
            or your clock-in will be disabled. Missing:{" "}
            <strong>{compliance.missingTypes.map((t) => t.name).join(", ")}</strong>.
          </AlertDescription>
        </Alert>
      )}

      {/* Missing EOD banner */}
      {missingEods.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="h-5 w-5" />
              Missing EOD Submissions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {missingEods.map((row) => {
              const isActionable = row.date >= twoDaysAgo;
              const dateLabel = formatDateMX(row.date);
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-4 py-2"
                >
                  <span className="text-sm font-medium">{dateLabel}</span>
                  {isActionable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBackfillDate(row.date)}
                    >
                      Submit EOD for {dateLabel}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Contact your TL to submit EODs older than 2 days.
                    </span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Backfill EOD dialog */}
      {backfillDate && employee?.campaign_id && (
        <ClockOutEODDialog
          open={!!backfillDate}
          onOpenChange={(o) => { if (!o) setBackfillDate(null); }}
          employeeId={employeeId!}
          campaignId={employee.campaign_id}
          campaignName={campaignName ?? undefined}
          kpiFields={kpiFields}
          backfillDate={backfillDate}
          onSubmitted={() => {
            const dateLabel = formatDateMX(backfillDate);
            setBackfillDate(null);
            toast({ title: `EOD submitted for ${dateLabel}` });
            queryClient.invalidateQueries({ queryKey: ["home-missing-eods"] });
            queryClient.invalidateQueries({ queryKey: ["home-eod"] });
          }}
        />
      )}

      {/* Today panel + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!todayEntry && (
              <div className="text-center py-6">
                <div
                  className={`text-5xl font-bold font-mono mb-1 ${
                    pastGracePeriod ? "text-destructive" : ""
                  }`}
                >
                  {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {formatDateUSShort(now)}
                </p>
                {pastGracePeriod && (
                  <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
                    <AlertCircle className="h-4 w-4" />
                    {formatMinutesVerbose(minutesPastGrace)} past grace — clock in now
                  </div>
                )}
                <div>
                  <Button
                    size="lg"
                    onClick={() => setConfirmClockInOpen(true)}
                    disabled={clockInMutation.isPending}
                  >
                    {clockInMutation.isPending ? "Clocking in..." : "Clock In"}
                  </Button>
                </div>
                {/* Small one-line schedule reminder under the Clock In button */}
                <div className="mt-4">
                  <ScheduleBanner employeeId={employee?.employee_id} variant="compact" />
                </div>
              </div>
            )}

            {todayEntry && !todayEntry.clock_out && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Clock In
                  </div>
                  <div className="text-2xl font-bold">
                    {new Date(todayEntry.clock_in).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Elapsed
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {elapsedString(todayEntry.clock_in, now)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Status
                  </div>
                  <div className="text-2xl font-bold flex items-center gap-1">
                    {activeBreak === "lunch" ? (
                      <>
                        <UtensilsCrossed className="h-5 w-5 text-amber-700" />
                        Lunch
                      </>
                    ) : activeBreak ? (
                      <>
                        <Coffee className="h-5 w-5 text-amber-700" />
                        Break
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        Working
                      </>
                    )}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <Button asChild className="w-full">
                    <Link to="/reloj">Open Timeclock</Link>
                  </Button>
                </div>
              </div>
            )}

            {todayEntry?.clock_out && (
              <div className="text-center py-6">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600 mb-2" />
                <p className="font-semibold">Shift complete — nice work.</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(todayEntry.clock_in).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  →{" "}
                  {new Date(todayEntry.clock_out).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {todayEntry.total_hours?.toFixed(2)} hrs
                  {todayEntry.auto_clocked_out && " · auto-closed"}
                </p>
                {todayEntry.is_late && (
                  <Badge variant="destructive" className="mt-2">
                    Late {formatMinutesVerbose(todayEntry.late_minutes)}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start h-11">
              <Link to="/reloj">
                <Timer className="mr-2 h-4 w-4" /> Timeclock
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start h-11">
              <Link to="/eod">
                <ClipboardCheck className="mr-2 h-4 w-4" /> Submit EOD
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start h-11">
              <Link to="/vacation">
                <CalendarDays className="mr-2 h-4 w-4" /> Request Time Off
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className={`w-full justify-start h-11 ${
                unreadBulletinCount > 0
                  ? "border-orange-300 bg-orange-50 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
                  : ""
              }`}
            >
              <Link to="/comunicados">
                <Megaphone
                  className={`mr-2 h-4 w-4 ${
                    unreadBulletinCount > 0 ? "text-orange-500" : ""
                  }`}
                />
                Announcements
                {unreadBulletinCount > 0 && (
                  <Badge className="ml-auto h-5 min-w-5 rounded-full bg-orange-500 px-1.5 text-[11px] text-white">
                    {unreadBulletinCount}
                  </Badge>
                )}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Hours This Week"
          value={weekHours.toFixed(1)}
          suffix="hrs"
          icon={<Clock className="h-5 w-5 text-primary" />}
        />
        <StatCard
          label="Days Worked"
          value={String(daysWorked)}
          suffix="/ 7"
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
        />
        <StatCard
          label="Minutes Late This Week"
          value={String(minutesLate)}
          suffix="min"
          icon={
            <AlertCircle
              className={`h-5 w-5 ${minutesLate > 0 ? "text-red-600" : "text-emerald-600"}`}
            />
          }
          accent={minutesLate > 0 ? "text-red-600" : undefined}
        />
      </div>

      {/* A2b: My Documents — agent read-only */}
      <MyDocumentsCard employeeId={employeeId} />

      {/* B1: HR Log — agent-visible entries only */}
      <AgentHRLogCard employeeId={employeeId} />

      {/* B4: Attendance History — agent read-only */}
      <AgentAttendanceCard employeeId={employeeId} />

      {/* B2/B3: Signed cartas + actas — agent read-only */}
      <SignedHrDocumentsCard employeeId={employeeId} />

      {/* Uptraining constancias — agent read-only (hidden when none) */}
      {employeeId && (
        <UptrainingCard
          employeeId={employeeId}
          authEmployeeId={employeeId}
          mode="agent"
        />
      )}

      {/* Weekly chart */}
      <Card>
        <CardHeader>
          <CardTitle>Hours This Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="day"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  formatter={(value: number) => [`${value} hrs`, "Worked"]}
                />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent EOD + upcoming PTO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Recent EOD Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentEod.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No EOD reports yet. They'll show here after you submit one.
              </p>
            ) : (
              <ul className="divide-y">
                {recentEod.map((log) => (
                  <li key={log.id} className="py-2 flex justify-between text-sm">
                    <span>{formatDateMX(log.date)}</span>
                    <span className="text-muted-foreground truncate max-w-[60%]">
                      {log.notes || "Submitted"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Upcoming Time Off
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingTimeOff.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No upcoming time-off requests.
              </p>
            ) : (
              <ul className="divide-y">
                {pendingTimeOff.map((req) => (
                  <li
                    key={req.id}
                    className="py-2 flex justify-between items-center text-sm"
                  >
                    <span>
                      {formatDateMX(req.start_date)}
                      {req.start_date !== req.end_date && (
                        <>
                          {" – "}
                          {formatDateMX(req.end_date)}
                        </>
                      )}{" "}
                      <span className="text-muted-foreground capitalize">
                        ({req.reason})
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        req.status === "approved"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-800"
                      }
                    >
                      {req.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {!employeeId && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <p className="text-yellow-800">
              Your account isn't linked to an employee record yet. Contact HR.
            </p>
          </CardContent>
        </Card>
      )}

      {/* First-login goal prompt. Once set or dismissed, won't reopen. */}
      {employeeId && (
        <GoalPromptDialog
          open={goalPromptOpen}
          onOpenChange={setGoalPromptOpen}
          employeeId={employeeId}
          firstName={firstName}
        />
      )}

      {/* Clock-in confirm dialog. Brief prompt so users don't fat-finger their day open. */}
      <AlertDialog open={confirmClockInOpen} onOpenChange={setConfirmClockInOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clock in now?</AlertDialogTitle>
            <AlertDialogDescription>
              {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              {pastGracePeriod && ` · ${formatMinutesVerbose(minutesPastGrace)} past grace (this will be marked late)`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clockInMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                clockInMutation.mutate(undefined, {
                  onSuccess: () => setConfirmClockInOpen(false),
                });
              }}
              disabled={clockInMutation.isPending}
            >
              {clockInMutation.isPending ? "Clocking in..." : "Clock in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold ${accent || ""}`}>{value}</span>
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── A2c: My Documents (agent self-serve upload) ───────────────────────

function MyDocumentsCard({ employeeId }: { employeeId: string | null }) {
  const { data: rows = [], isLoading } = useEmployeeDocuments(employeeId ?? undefined);
  const uploadDoc = useUploadDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadTarget || !employeeId) return;

    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      toast({ title: "Unsupported file type", description: "Please upload PDF, JPG, or PNG.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      toast({ title: "File too large", description: "Maximum size is 10 MB.", variant: "destructive" });
      return;
    }

    uploadDoc.mutate(
      { employeeId, documentTypeId: uploadTarget, file },
      {
        onSuccess: () => {
          toast({ title: "Document uploaded", description: "Waiting for HR review." });
          setUploadTarget(null);
        },
        onError: () => {
          toast({ title: "Unable to upload", description: "Contact HR.", variant: "destructive" });
          setUploadTarget(null);
        },
      }
    );
  };

  const triggerUpload = (typeId: string) => {
    setUploadTarget(typeId);
    fileInputRef.current?.click();
  };

  if (isLoading || rows.length === 0) return null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        className="hidden"
        aria-label="Upload document"
        onChange={handleFileSelect}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            My Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {rows.map(({ type, document: doc }) => (
              <li key={type.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{type.name}</p>
                  {type.description && (
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  )}
                  {!doc && (
                    <p className="text-xs text-muted-foreground mt-1">Not submitted yet</p>
                  )}
                  {doc?.status === "approved" && doc.reviewed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Approved {formatDateMX(doc.reviewed_at)}
                    </p>
                  )}
                  {doc?.status === "pending_review" && (
                    <p className="text-xs text-muted-foreground mt-1">Waiting for HR review</p>
                  )}
                  {doc?.status === "rejected" && (
                    <div className="mt-1">
                      {doc.rejection_reason && (
                        <p className="text-xs text-destructive">Reason: {doc.rejection_reason}</p>
                      )}
                    </div>
                  )}
                  {/* Upload / Re-upload buttons */}
                  {!doc && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => triggerUpload(type.id)}
                      disabled={uploadDoc.isPending}
                    >
                      <Upload className="mr-1 h-3 w-3" />
                      {uploadDoc.isPending && uploadTarget === type.id ? "Uploading..." : "Upload"}
                    </Button>
                  )}
                  {doc?.status === "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => triggerUpload(type.id)}
                      disabled={uploadDoc.isPending}
                    >
                      <Upload className="mr-1 h-3 w-3" />
                      {uploadDoc.isPending && uploadTarget === type.id ? "Uploading..." : "Re-upload"}
                    </Button>
                  )}
                </div>
                <DocumentStatusBadge document={doc} missingLabel="Not submitted" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

// ── B1: HR Log (agent-visible entries only) ───────────────────────────

function AgentHRLogCard({ employeeId }: { employeeId: string | null }) {
  const { data: entries = [], isLoading } = useAgentLogEntries(employeeId);

  // Only render if there's at least one visible entry
  if (isLoading || entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" />
          HR Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="border-l-2 border-muted pl-3 space-y-1">
              <div className="flex items-center gap-2">
                {entry.entry_type === "verbal_warning" ? (
                  <Badge variant="destructive" className="text-xs"><FileWarning className="mr-1 h-3 w-3" />Verbal Warning</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs"><StickyNote className="mr-1 h-3 w-3" />Note</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDateMX(entry.created_at)}
                </span>
              </div>
              <p className="text-sm">{entry.note}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── B4: My Attendance History (agent read-only) ───────────────────────

const INCIDENT_BADGE_COLORS: Record<IncidentType, string> = {
  no_call_no_show: "bg-red-100 text-red-800",
  late: "bg-amber-100 text-amber-800",
  sick: "bg-amber-100 text-amber-800",
  medical_leave: "bg-amber-100 text-amber-800",
  personal: "bg-blue-100 text-blue-800",
  bereavement: "bg-blue-100 text-blue-800",
  other: "bg-gray-100 text-gray-800",
};

function AgentAttendanceCard({ employeeId }: { employeeId: string | null }) {
  const { data: incidents = [], isLoading } = useAgentIncidents(employeeId);
  const { toast } = useToast();
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 5;

  if (isLoading || incidents.length === 0) return null;

  const visible = showAll ? incidents : incidents.slice(0, LIMIT);
  const hiddenCount = incidents.length - LIMIT;

  const handleViewDoc = async (filePath: string) => {
    try {
      const url = await getIncidentDocSignedUrl(filePath);
      window.open(url, "_blank");
    } catch {
      toast({ title: "Failed to generate view link", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5" />
          My Attendance History
          <Badge variant="secondary" className="text-xs">{incidents.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {visible.map((incident) => (
            <li key={incident.id} className="border-l-2 border-muted pl-3 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${INCIDENT_BADGE_COLORS[incident.incident_type]}`}>
                  {INCIDENT_TYPE_LABELS[incident.incident_type]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateMX(incident.date)}
                </span>
              </div>
              {incident.notes && <p className="text-sm">{incident.notes}</p>}
              {incident.supporting_doc_path && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleViewDoc(incident.supporting_doc_path!)}>
                  <Eye className="mr-1 h-3 w-3" /> View document
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!showAll && hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-xs text-muted-foreground"
            onClick={() => setShowAll(true)}
          >
            Ver {hiddenCount} más
          </Button>
        )}
        {showAll && incidents.length > LIMIT && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-xs text-muted-foreground"
            onClick={() => setShowAll(false)}
          >
            Mostrar menos
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
