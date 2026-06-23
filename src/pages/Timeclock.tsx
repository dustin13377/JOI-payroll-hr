import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMinutesVerbose } from "@/lib/formatDuration";
import { formatDateMX, formatDateMXLong } from "@/lib/localDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Clock,
  LogIn,
  LogOut,
  AlertCircle,
  Coffee,
  UtensilsCrossed,
  CheckCircle2,
} from "lucide-react";
import { ClockOutEODDialog, type KPIField } from "@/components/ClockOutEODDialog";
import { ScheduleBanner } from "@/components/ScheduleBanner";
import { todayLocal, parseLocalDate } from "@/lib/localDate";
import { useComplianceStatus } from "@/hooks/useComplianceStatus";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TimeClockEntry {
  id: string;
  employee_id: string;
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
  lunch_late_reason: string | null;
  break1_late_reason: string | null;
  break2_late_reason: string | null;
  shift_end_expected: string | null;
  auto_clocked_out: boolean;
  eod_completed: boolean;
  created_at: string;
}

interface ShiftSettings {
  id: string;
  campaign_id: string;
  shift_name: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;   // "HH:MM:SS"
  grace_minutes: number;
  break_grace_minutes: number | null; // minutes over cap before a late-return reason is required (0 = any minute over)
  days_of_week: number[];
}

interface Employee {
  id: string;
  campaign_id: string;
  employee_id: string;
}

// Cap durations (in minutes)
const LUNCH_CAP_MIN = 60;
const SHORT_BREAK_CAP_MIN = 15;

type BreakKind = "lunch" | "break1" | "break2";

function getActiveBreak(entry: TimeClockEntry | null): BreakKind | null {
  if (!entry) return null;
  if (entry.lunch_start && !entry.lunch_end) return "lunch";
  if (entry.break1_start && !entry.break1_end) return "break1";
  if (entry.break2_start && !entry.break2_end) return "break2";
  return null;
}

function diffMinutes(startIso: string, end: Date): number {
  return (end.getTime() - new Date(startIso).getTime()) / 60000;
}

function durationMinutes(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 0;
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
}

function fmtMinSec(totalMs: number): string {
  if (totalMs < 0) totalMs = 0;
  const totalSec = Math.floor(totalMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function buildShiftEndExpected(now: Date, shift: ShiftSettings | null): string | null {
  if (!shift?.end_time || !shift?.start_time) return null;
  const [endH, endM] = shift.end_time.split(":").map(Number);
  const [startH, startM] = shift.start_time.split(":").map(Number);
  const end = new Date(now);
  end.setHours(endH, endM, 0, 0);
  // Overnight shift: if end <= start, push end to next day
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if (endMinutes <= startMinutes) {
    end.setDate(end.getDate() + 1);
  }
  return end.toISOString();
}

export default function Timeclock() {
  const { employeeId, loading: authLoading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [eodDialogOpen, setEodDialogOpen] = useState(false);
  // When ending a break that ran over its cap, we collect a reason first.
  const [lateDialog, setLateDialog] = useState<BreakKind | null>(null);
  const [lateReason, setLateReason] = useState("");
  // Confirmation dialog for Clock In. Added 2026-06-03 after Julia Nuñez
  // double-tapped: the Clock In button rendered into a red Clock Out button
  // ~300ms later, and her second tap fired the clock-out flow. A modal
  // breaks that fast-path so the second tap lands on Cancel/Confirm, not
  // the (now hidden) clock-out button. HomeHero already worked this way.
  const [confirmClockInOpen, setConfirmClockInOpen] = useState(false);
  const queryClient = useQueryClient();
  const compliance = useComplianceStatus(employeeId);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: employee } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("id, campaign_id, employee_id")
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return data as Employee;
    },
    enabled: !!employeeId,
  });

  const { data: todayEntry } = useQuery({
    queryKey: ["timeclock-today", employeeId],
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
      return data as TimeClockEntry | null;
    },
    enabled: !!employeeId,
    refetchInterval: 30000,
  });

  const { data: shiftSettings } = useQuery({
    queryKey: ["shift-settings", employee?.campaign_id],
    queryFn: async () => {
      if (!employee?.campaign_id) return null;
      const { data, error } = await supabase
        .from("shift_settings")
        .select("*")
        .eq("campaign_id", employee.campaign_id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data || null) as ShiftSettings | null;
    },
    enabled: !!employee?.campaign_id,
  });

  // Campaign info for the dialog header + early-release settings
  const { data: campaign } = useQuery({
    queryKey: ["campaign-name", employee?.campaign_id],
    queryFn: async () => {
      if (!employee?.campaign_id) return null;
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, early_release_enabled, early_release_criteria")
        .eq("id", employee.campaign_id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        early_release_enabled: boolean;
        early_release_criteria: string | null;
      } | null;
    },
    enabled: !!employee?.campaign_id,
  });

  // KPI fields for this agent's campaign — drives the pre-clock-out EOD dialog
  const { data: kpiFields = [] } = useQuery({
    queryKey: ["kpi-config", employee?.campaign_id],
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

  // Whether agent already submitted today's EOD (via old /eod page or a prior attempt)
  const { data: todayEodLog } = useQuery({
    queryKey: ["eod-today", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const today = todayLocal();
      const { data, error } = await supabase
        .from("eod_logs")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });

  const { data: weekEntries = [] } = useQuery({
    queryKey: ["timeclock-week", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("time_clock")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("date", todayLocal(startOfWeek))
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []) as TimeClockEntry[];
    },
    enabled: !!employeeId,
    refetchInterval: 30000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["timeclock-today"] });
    queryClient.invalidateQueries({ queryKey: ["timeclock-week"] });
    queryClient.invalidateQueries({ queryKey: ["eod-today", employeeId] });
    // HomeHero stat cards (Hours/Days Worked/Minutes Late) live in a
    // separate query namespace. Without these invalidations, clock-out
    // here leaves the dashboard stat stuck at the previously-cached value
    // until the week rolls over or the user hard-refreshes — that's why
    // Adrian saw "1 day worked" after actually working 2.
    queryClient.invalidateQueries({ queryKey: ["home-hero-today", employeeId] });
    queryClient.invalidateQueries({ queryKey: ["home-hero-week", employeeId] });
  };

  // Clock In
  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId || !employee?.campaign_id) throw new Error("Missing employee/campaign");
      const now = new Date();
      const today = todayLocal(now);

      const { data: existing } = await supabase
        .from("time_clock")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("date", today)
        .maybeSingle();
      if (existing) throw new Error("Already clocked in today");

      // is_late / late_minutes are NOT set here anymore. The
      // tg_time_clock_set_lateness BEFORE trigger (migration
      // h3_server_side_lateness, 2026-05-27) computes them server-side
      // from shift_settings — authoritative, so devtools can't falsify.
      // The lateness banner UI below still uses shiftSettings directly,
      // which is fine because it's read-only / ephemeral. Closes H-3.

      const shiftEndExpected = buildShiftEndExpected(now, shiftSettings || null);

      const { data, error } = await supabase
        .from("time_clock")
        .insert({
          employee_id: employeeId,
          clock_in: now.toISOString(),
          date: today,
          shift_end_expected: shiftEndExpected,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  // Generic break start/end mutations
  const updateEntry = async (patch: Record<string, unknown>) => {
    if (!todayEntry?.id) throw new Error("No active entry");
    const { data, error } = await supabase
      .from("time_clock")
      .update(patch)
      .eq("id", todayEntry.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const startBreakMutation = useMutation({
    mutationFn: async (kind: BreakKind) => {
      if (!todayEntry) throw new Error("Not clocked in");
      if (todayEntry.clock_out) throw new Error("Already clocked out");
      if (getActiveBreak(todayEntry)) throw new Error("Already on a break");
      const now = new Date().toISOString();
      const col = kind === "lunch" ? "lunch_start" : kind === "break1" ? "break1_start" : "break2_start";
      const startedCol = kind === "lunch" ? todayEntry.lunch_start : kind === "break1" ? todayEntry.break1_start : todayEntry.break2_start;
      if (startedCol) throw new Error(`${kind} was already taken today`);
      return updateEntry({ [col]: now });
    },
    onSuccess: invalidate,
  });

  const endBreakMutation = useMutation({
    mutationFn: async ({ kind, reason }: { kind: BreakKind; reason?: string }) => {
      if (!todayEntry) throw new Error("Not clocked in");
      const endCol = kind === "lunch" ? "lunch_end" : kind === "break1" ? "break1_end" : "break2_end";
      const reasonCol =
        kind === "lunch" ? "lunch_late_reason" : kind === "break1" ? "break1_late_reason" : "break2_late_reason";
      const patch: Record<string, unknown> = { [endCol]: new Date().toISOString() };
      if (reason && reason.trim()) patch[reasonCol] = reason.trim();
      return updateEntry(patch);
    },
    onSuccess: () => {
      setLateDialog(null);
      setLateReason("");
      invalidate();
    },
  });

  // Clock Out — accepts optional early_release flag (set from the EOD dialog
  // when agent self-reports they hit metrics and is leaving early).
  const clockOutMutation = useMutation({
    mutationFn: async (opts?: { earlyRelease?: boolean }) => {
      if (!todayEntry) throw new Error("Not clocked in");
      if (getActiveBreak(todayEntry)) throw new Error("End your current break before clocking out");
      // Phase C will gate on eod_completed; for now we let it through.

      const now = new Date();
      const clockIn = new Date(todayEntry.clock_in);
      const grossMinutes = (now.getTime() - clockIn.getTime()) / 60000;

      // Deduct lunch (unpaid). Paid breaks 1 & 2 are NOT deducted.
      const lunchMinutes = durationMinutes(todayEntry.lunch_start, todayEntry.lunch_end);
      const netMinutes = Math.max(0, grossMinutes - lunchMinutes);
      const totalHours = parseFloat((netMinutes / 60).toFixed(2));

      const patch: Record<string, unknown> = {
        clock_out: now.toISOString(),
        total_hours: totalHours,
      };
      if (opts?.earlyRelease) {
        patch.early_release = true;
      }
      return updateEntry(patch);
    },
    onSuccess: invalidate,
  });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  const formatDate = (date: Date) => formatDateMXLong(date);

  const formatTimeFromString = (timeStr: string) =>
    new Date(timeStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  const calculateElapsedTime = (clockInStr: string) => {
    const elapsed = currentTime.getTime() - new Date(clockInStr).getTime();
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const weekTotalHours = weekEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LogoLoadingIndicator />
      </div>
    );
  }

  if (!employeeId) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Timeclock</h2>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <p className="text-yellow-800">
              Your account is not linked to an employee. Contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isClockedIn = !!todayEntry && !todayEntry.clock_out;
  const activeBreak = getActiveBreak(todayEntry || null);

  // Past grace period and not yet clocked in?
  // Compares "now" to today's shift_settings.start_time + grace_minutes.
  let pastGracePeriod = false;
  let minutesPastGrace = 0;
  if (!todayEntry && shiftSettings?.start_time) {
    const [sh, sm] = shiftSettings.start_time.split(":").map(Number);
    const grace = shiftSettings.grace_minutes || 0;
    const lateBoundary = new Date(currentTime);
    lateBoundary.setHours(sh, sm, 0, 0);
    lateBoundary.setMinutes(lateBoundary.getMinutes() + grace);
    if (currentTime > lateBoundary) {
      pastGracePeriod = true;
      minutesPastGrace = Math.floor((currentTime.getTime() - lateBoundary.getTime()) / 60000);
    }
  }

  // Active-break live counter
  const activeBreakStartIso =
    activeBreak === "lunch"
      ? todayEntry?.lunch_start
      : activeBreak === "break1"
      ? todayEntry?.break1_start
      : activeBreak === "break2"
      ? todayEntry?.break2_start
      : null;

  const activeBreakCapMin = activeBreak === "lunch" ? LUNCH_CAP_MIN : SHORT_BREAK_CAP_MIN;
  const activeBreakElapsedMin = activeBreakStartIso ? diffMinutes(activeBreakStartIso, currentTime) : 0;
  const activeBreakRemainingMs =
    activeBreakStartIso
      ? new Date(activeBreakStartIso).getTime() + activeBreakCapMin * 60000 - currentTime.getTime()
      : 0;
  const overCap = activeBreakRemainingMs < 0;

  // Grace (minutes over cap) before a late-return reason is required. Defaults
  // to 0 = any minute over. Configurable per campaign via shift_settings so it
  // can be loosened later without a code change.
  const breakGraceMin = shiftSettings?.break_grace_minutes ?? 0;
  const lateNeedsReason = !!activeBreakStartIso && activeBreakElapsedMin > activeBreakCapMin + breakGraceMin;

  // Past breaks summary (when clocked in but not on break)
  const lunchTaken = !!(todayEntry?.lunch_start && todayEntry?.lunch_end);
  const lunchInProgress = !!(todayEntry?.lunch_start && !todayEntry?.lunch_end);
  const lunchUsedMin = todayEntry?.lunch_start
    ? lunchInProgress
      ? diffMinutes(todayEntry.lunch_start, currentTime)
      : durationMinutes(todayEntry.lunch_start, todayEntry.lunch_end)
    : 0;

  const break1Taken = !!(todayEntry?.break1_start && todayEntry?.break1_end);
  const break1InProgress = !!(todayEntry?.break1_start && !todayEntry?.break1_end);
  const break1UsedMin = todayEntry?.break1_start
    ? break1InProgress
      ? diffMinutes(todayEntry.break1_start, currentTime)
      : durationMinutes(todayEntry.break1_start, todayEntry.break1_end)
    : 0;

  const break2Taken = !!(todayEntry?.break2_start && todayEntry?.break2_end);
  const break2InProgress = !!(todayEntry?.break2_start && !todayEntry?.break2_end);
  const break2UsedMin = todayEntry?.break2_start
    ? break2InProgress
      ? diffMinutes(todayEntry.break2_start, currentTime)
      : durationMinutes(todayEntry.break2_start, todayEntry.break2_end)
    : 0;

  // Breaks are mandatory: lunch + both 15-min breaks must be taken AND ended
  // before an employee can clock out. Auto-clock-out (server cron at shift end)
  // and the admin "edit punch" dialog are the safety nets for forgotten breaks.
  const allBreaksDone = lunchTaken && break1Taken && break2Taken;
  const pendingBreaks: string[] = [];
  if (!lunchTaken) pendingBreaks.push("Lunch");
  if (!break1Taken) pendingBreaks.push("Break 1");
  if (!break2Taken) pendingBreaks.push("Break 2");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Timeclock</h2>

      <Card>
        <CardHeader>
          <CardTitle>Current Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Big clock — turns red if past grace period and not yet clocked in */}
          <div className="text-center">
            <div
              className={`text-5xl font-bold font-mono mb-2 ${
                pastGracePeriod ? "text-red-600" : "text-primary"
              }`}
            >
              {formatTime(currentTime)}
            </div>
            <div className="text-lg text-muted-foreground capitalize">
              {formatDate(currentTime)}
            </div>
            {pastGracePeriod && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
                <AlertCircle className="h-4 w-4" />
                {formatMinutesVerbose(minutesPastGrace)} past grace — clock in now
              </div>
            )}
          </div>

          {/* NOT CLOCKED IN */}
          {!isClockedIn && !todayEntry?.clock_out && (
            compliance.isLocked ? (
              <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-800 [&>svg]:text-red-600">
                <ShieldX className="h-5 w-5" />
                <AlertDescription className="ml-2">
                  Clock-in disabled — required documents are missing. Talk to HR.
                </AlertDescription>
              </Alert>
            ) : (
              <Button
                size="lg"
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-lg"
                onClick={() => setConfirmClockInOpen(true)}
                disabled={clockInMutation.isPending}
              >
                <LogIn className="mr-2 h-5 w-5" />
                {clockInMutation.isPending ? "Processing..." : "Clock In"}
              </Button>
            )
          )}

          {/* ALREADY CLOCKED OUT FOR THE DAY */}
          {todayEntry?.clock_out && (
            <div className="rounded-lg bg-muted p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 mb-2" />
              <p className="font-semibold">You've completed your shift today.</p>
              <p className="text-sm text-muted-foreground mt-1">
                {formatTimeFromString(todayEntry.clock_in)} → {formatTimeFromString(todayEntry.clock_out)} ·{" "}
                {todayEntry.total_hours?.toFixed(2)} hours
                {todayEntry.auto_clocked_out && " · auto-closed"}
              </p>
            </div>
          )}

          {/* CLOCKED IN */}
          {isClockedIn && todayEntry && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Clock In</div>
                  <div className="text-2xl font-bold">
                    {formatTimeFromString(todayEntry.clock_in)}
                  </div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Elapsed</div>
                  <div className="text-2xl font-bold text-primary">
                    {calculateElapsedTime(todayEntry.clock_in)}
                  </div>
                </div>
              </div>

              {todayEntry.is_late && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-semibold">
                      Late Entry: {formatMinutesVerbose(todayEntry.late_minutes)}
                    </span>
                  </div>
                </div>
              )}

              {/* ON BREAK */}
              {activeBreak && activeBreakStartIso && (
                <div
                  className={`rounded-lg p-5 border ${
                    overCap
                      ? "bg-red-50 border-red-200"
                      : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {activeBreak === "lunch" ? (
                      <UtensilsCrossed className="h-5 w-5 text-amber-700" />
                    ) : (
                      <Coffee className="h-5 w-5 text-amber-700" />
                    )}
                    <div>
                      <div className="font-semibold text-amber-900">
                        {activeBreak === "lunch"
                          ? "On Lunch (60 min cap)"
                          : `On ${activeBreak === "break1" ? "Break 1" : "Break 2"} (15 min cap)`}
                      </div>
                      <div className="text-sm text-amber-800">
                        Started at {formatTimeFromString(activeBreakStartIso)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Elapsed
                      </div>
                      <div className="text-xl font-bold font-mono">
                        {fmtMinSec(currentTime.getTime() - new Date(activeBreakStartIso).getTime())}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {overCap ? "Over Cap" : "Remaining"}
                      </div>
                      <div
                        className={`text-xl font-bold font-mono ${
                          overCap ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {fmtMinSec(Math.abs(activeBreakRemainingMs))}
                      </div>
                    </div>
                  </div>
                  {overCap && (
                    <div className="text-sm text-red-700 mb-3">
                      You've exceeded the {activeBreakCapMin}-min cap by {Math.floor((activeBreakElapsedMin - activeBreakCapMin))}m.
                      {lateNeedsReason
                        ? " You'll need to give a reason for coming back late."
                        : " End the break now — extra time may be deducted."}
                    </div>
                  )}
                  <Button
                    size="lg"
                    className="w-full h-11"
                    onClick={() => {
                      if (lateNeedsReason) {
                        setLateReason("");
                        setLateDialog(activeBreak);
                      } else {
                        endBreakMutation.mutate({ kind: activeBreak });
                      }
                    }}
                    disabled={endBreakMutation.isPending}
                  >
                    End {activeBreak === "lunch" ? "Lunch" : activeBreak === "break1" ? "Break 1" : "Break 2"}
                  </Button>
                </div>
              )}

              {/* WORKING (NOT ON BREAK) — break + clock-out actions */}
              {!activeBreak && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button
                      variant="outline"
                      className="h-12"
                      onClick={() => startBreakMutation.mutate("lunch")}
                      disabled={lunchTaken || startBreakMutation.isPending}
                    >
                      <UtensilsCrossed className="mr-2 h-4 w-4" />
                      {lunchTaken ? `Lunch ${lunchUsedMin.toFixed(0)}m` : "Start Lunch"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12"
                      onClick={() => startBreakMutation.mutate("break1")}
                      disabled={break1Taken || startBreakMutation.isPending}
                    >
                      <Coffee className="mr-2 h-4 w-4" />
                      {break1Taken ? `Break 1 ${break1UsedMin.toFixed(0)}m` : "Start Break 1"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12"
                      onClick={() => startBreakMutation.mutate("break2")}
                      disabled={break2Taken || startBreakMutation.isPending}
                    >
                      <Coffee className="mr-2 h-4 w-4" />
                      {break2Taken ? `Break 2 ${break2UsedMin.toFixed(0)}m` : "Start Break 2"}
                    </Button>
                  </div>

                  {!allBreaksDone && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-900 font-semibold mb-1">
                        <Coffee className="h-4 w-4" />
                        Finish your breaks before clocking out
                      </div>
                      <p className="text-sm text-amber-800">
                        Still required: {pendingBreaks.join(", ")}. Each must be started and ended.
                      </p>
                    </div>
                  )}

                  {/* Anti-double-tap guard: hide the red Clock Out button
                      for the first 10 seconds after clock-in so a second
                      stray tap on the now-empty position can't fire it.
                      Julia hit this exact path on 2026-06-03 — her clock
                      in/out were 7 seconds apart. */}
                  {(() => {
                    const secondsSinceClockIn =
                      (currentTime.getTime() - new Date(todayEntry.clock_in).getTime()) / 1000;
                    const guardActive = secondsSinceClockIn < 10;
                    if (guardActive) {
                      return (
                        <div className="w-full h-12 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center text-sm text-muted-foreground">
                          Clock Out available in {Math.ceil(10 - secondsSinceClockIn)}s
                        </div>
                      );
                    }
                    return (
                      <Button
                        size="lg"
                        className="w-full h-12 bg-red-600 hover:bg-red-700 text-white text-lg"
                        onClick={() => {
                          if (!allBreaksDone) return;
                          // Need EOD first? Open the dialog. It calls back to clock out on submit.
                          // Skip (silent) if no KPI fields configured or already submitted today.
                          if (kpiFields.length > 0 && !todayEodLog && employee?.campaign_id) {
                            setEodDialogOpen(true);
                          } else {
                            clockOutMutation.mutate();
                          }
                        }}
                        disabled={clockOutMutation.isPending || !allBreaksDone}
                      >
                        <LogOut className="mr-2 h-5 w-5" />
                        {clockOutMutation.isPending ? "Processing..." : "Clock Out"}
                      </Button>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Error surfacing */}
          {clockInMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {(clockInMutation.error as Error).message}
            </div>
          )}
          {clockOutMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {(clockOutMutation.error as Error).message}
            </div>
          )}
          {startBreakMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {(startBreakMutation.error as Error).message}
            </div>
          )}
          {endBreakMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {(endBreakMutation.error as Error).message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full schedule banner — sits between the clock-in card and weekly history.
          Read-only; data from src/lib/breakSchedules.ts. */}
      <ScheduleBanner employeeId={employee?.employee_id} />

      {/* Weekly History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            This Week's History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Lunch</TableHead>
                  <TableHead>Breaks</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weekEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                      No records this week
                    </TableCell>
                  </TableRow>
                ) : (
                  weekEntries.map((entry) => {
                    const lunchMin = durationMinutes(entry.lunch_start, entry.lunch_end);
                    const b1 = durationMinutes(entry.break1_start, entry.break1_end);
                    const b2 = durationMinutes(entry.break2_start, entry.break2_end);
                    return (
                      <TableRow key={entry.id} className={entry.is_late ? "bg-red-50" : ""}>
                        <TableCell>
                          {formatDateMX(entry.date)}
                        </TableCell>
                        <TableCell>{formatTimeFromString(entry.clock_in)}</TableCell>
                        <TableCell>
                          {entry.clock_out ? formatTimeFromString(entry.clock_out) : "-"}
                        </TableCell>
                        <TableCell>
                          {lunchMin > 0 ? (
                            <span
                              className={lunchMin > LUNCH_CAP_MIN ? "text-red-600 font-semibold" : ""}
                              title={entry.lunch_late_reason ? `Late reason: ${entry.lunch_late_reason}` : undefined}
                            >
                              {lunchMin.toFixed(0)}m{entry.lunch_late_reason ? " *" : ""}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {b1 > 0 || b2 > 0 ? (
                            <span
                              title={
                                [
                                  entry.break1_late_reason ? `Break 1: ${entry.break1_late_reason}` : null,
                                  entry.break2_late_reason ? `Break 2: ${entry.break2_late_reason}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" | ") || undefined
                              }
                            >
                              {b1 > 0 ? `${b1.toFixed(0)}m${entry.break1_late_reason ? " *" : ""}` : "-"} /{" "}
                              {b2 > 0 ? `${b2.toFixed(0)}m${entry.break2_late_reason ? " *" : ""}` : "-"}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.total_hours ? entry.total_hours.toFixed(2) : "-"}
                        </TableCell>
                        <TableCell>
                          {entry.auto_clocked_out ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800">
                              Auto
                            </Badge>
                          ) : entry.is_late ? (
                            <Badge variant="destructive">Late {formatMinutesVerbose(entry.late_minutes)}</Badge>
                          ) : entry.clock_out ? (
                            <Badge variant="outline" className="bg-emerald-50">
                              On Time
                            </Badge>
                          ) : (
                            <Badge variant="outline">Open</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {weekEntries.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Weekly Total Hours:</span>
                <span className="text-lg font-bold">{weekTotalHours.toFixed(2)} hours</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clock-in confirmation modal — anti-accidental-double-tap. */}
      <AlertDialog open={confirmClockInOpen} onOpenChange={setConfirmClockInOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clock in now?</AlertDialogTitle>
            <AlertDialogDescription>
              {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              {pastGracePeriod &&
                ` · ${formatMinutesVerbose(minutesPastGrace)} past grace — will be marked late`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clockInMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clockInMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                clockInMutation.mutate(undefined, {
                  onSuccess: () => setConfirmClockInOpen(false),
                });
              }}
            >
              {clockInMutation.isPending ? "Clocking in..." : "Clock in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* EOD required before clock-out */}
      {employee?.campaign_id && (
        <ClockOutEODDialog
          open={eodDialogOpen}
          onOpenChange={setEodDialogOpen}
          employeeId={employeeId!}
          campaignId={employee.campaign_id}
          campaignName={campaign?.name}
          kpiFields={kpiFields}
          earlyReleaseAvailable={
            !!campaign?.early_release_enabled &&
            // Only "early" if clocking out before today's scheduled shift end.
            // shift_end_expected is set at clock-in; fall back to false if missing.
            !!todayEntry?.shift_end_expected &&
            currentTime < new Date(todayEntry.shift_end_expected)
          }
          earlyReleaseCriteria={campaign?.early_release_criteria}
          onSubmitted={(opts) => {
            setEodDialogOpen(false);
            clockOutMutation.mutate(opts);
          }}
        />
      )}

      {/* Late-return reason — required to end a break that went over its cap */}
      <Dialog open={lateDialog !== null} onOpenChange={(o) => { if (!o) setLateDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              You're back late from {lateDialog === "lunch" ? "lunch" : lateDialog === "break1" ? "break 1" : "break 2"}
            </DialogTitle>
            <DialogDescription>
              Tell us why so we can end your break. This is recorded for your supervisor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="late-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="late-reason"
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              placeholder="e.g. Long line at the cafeteria"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Required — at least 3 characters.</p>
          </div>
          {endBreakMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {(endBreakMutation.error as Error).message}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLateDialog(null)} disabled={endBreakMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => lateDialog && endBreakMutation.mutate({ kind: lateDialog, reason: lateReason })}
              disabled={endBreakMutation.isPending || lateReason.trim().length < 3}
            >
              {endBreakMutation.isPending ? "Saving..." : "End break"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
