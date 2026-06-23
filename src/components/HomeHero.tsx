/**
 * HomeHero
 *
 * Shared "My Day" hero used by both EmployeeHome and TeamLeadHome.
 *
 * Renders:
 *   1. Header — greeting + subtitle + clock-in status badge
 *   2. Today panel + Quick Actions grid (2/3 + 1/3 on lg)
 *   3. Stat row — Hours This Week / Days Worked / Minutes Late
 *
 * Self-contained: handles its own time_clock, shift_settings, week-entries,
 * and bulletin queries plus the clock-in mutation + confirm dialog.
 *
 * Why a shared component:
 *   - TLs are working agents too (calls / packages / credit pulls), so they
 *     need the same daily flow agents have. Putting this logic in one place
 *     keeps the two roles consistent and means fixes only happen once.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayLocal, formatDateUSShort } from "@/lib/localDate";
import { formatMinutesVerbose } from "@/lib/formatDuration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Clock,
  Timer,
  ClipboardCheck,
  CalendarDays,
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Coffee,
  UtensilsCrossed,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { usePublishedPosts, useMyAcks } from "@/hooks/useBulletin";
import { ScheduleBanner } from "@/components/ScheduleBanner";
import { AnnouncementAckBanner } from "@/components/AnnouncementAckBanner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ShiftSettings {
  start_time: string;
  end_time: string;
  grace_minutes: number;
}

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
  auto_clocked_out: boolean;
}

interface HomeHeroProps {
  employeeId: string;
  /** First name (or display name) used in greeting + toast */
  firstName: string;
  /** Sub-line under the greeting. Parent formats this. */
  subtitle: string;
  /** Used for shift_settings lookup (grace period, expected end) */
  campaignId: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getActiveBreak(entry: TimeClockEntry | null): "lunch" | "break1" | "break2" | null {
  if (!entry) return null;
  if (entry.lunch_start && !entry.lunch_end) return "lunch";
  if (entry.break1_start && !entry.break1_end) return "break1";
  if (entry.break2_start && !entry.break2_end) return "break2";
  return null;
}

function elapsedString(fromIso: string, now: Date): string {
  const ms = now.getTime() - new Date(fromIso).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function HomeHero({ employeeId, firstName, subtitle, campaignId }: HomeHeroProps) {
  const [now, setNow] = useState(new Date());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  // Tick once a second so the big clock animates. The actual queries refetch
  // on their own interval — this is just for the displayed time string.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---------- Today's time-clock entry ----------
  const { data: todayEntry } = useQuery({
    queryKey: ["home-hero-today", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_clock")
        .select(
          "id, clock_in, clock_out, date, total_hours, is_late, late_minutes, lunch_start, lunch_end, break1_start, break1_end, break2_start, break2_end, auto_clocked_out"
        )
        .eq("employee_id", employeeId)
        .eq("date", todayLocal())
        .maybeSingle();
      if (error) throw error;
      return (data || null) as TimeClockEntry | null;
    },
    enabled: !!employeeId,
    refetchInterval: 30_000,
  });

  // ---------- Text employee_id (e.g. "EMP-003") for the schedule banner ----------
  // The employeeId prop is the UUID (employees.id); the break-schedule lookup
  // is keyed by the human-facing employees.employee_id, so fetch that here.
  const { data: employeeCode } = useQuery({
    queryKey: ["home-hero-employee-code", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("employee_id")
        .eq("id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return data?.employee_id ?? null;
    },
    enabled: !!employeeId,
  });

  // ---------- Shift settings (grace period, expected end) ----------
  const { data: shiftSettings } = useQuery({
    queryKey: ["home-hero-shift", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const { data, error } = await supabase
        .from("shift_settings")
        .select("start_time, end_time, grace_minutes")
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data || null) as ShiftSettings | null;
    },
    enabled: !!campaignId,
  });

  // ---------- Week entries (for stat row) ----------
  const weekStart = startOfWeek(now);
  const { data: weekEntries = [] } = useQuery({
    queryKey: ["home-hero-week", employeeId, todayLocal(weekStart)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_clock")
        .select("clock_out, total_hours, late_minutes")
        .eq("employee_id", employeeId)
        .gte("date", todayLocal(weekStart))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as Pick<TimeClockEntry, "clock_out" | "total_hours" | "late_minutes">[];
    },
    enabled: !!employeeId,
  });

  // ---------- Bulletin unread count (Announcements badge) ----------
  // useMyAcks returns a Set<string> directly (not an array of rows), so no
  // .map() — just use it as-is for O(1) `.has()` lookups.
  const { data: posts = [] } = usePublishedPosts();
  const { data: myAcks = new Set<string>() } = useMyAcks();
  const unreadBulletinCount = posts.filter(
    (p) =>
      p.type !== "recognition" &&
      ((p.type === "announcement" && p.requires_ack && !myAcks.has(p.id)) || p.type === "questionnaire")
  ).length;

  // ---------- Clock-in mutation ----------
  const clockInMutation = useMutation({
    mutationFn: async () => {
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
        const lateTime = new Date(shiftStart.getTime() + (shiftSettings.grace_minutes || 0) * 60_000);
        if (nowDate > lateTime) {
          isLate = true;
          lateMinutes = Math.floor((nowDate.getTime() - lateTime.getTime()) / 60_000);
        }
        if (shiftSettings.end_time) {
          const [eh, em] = shiftSettings.end_time.split(":").map(Number);
          const end = new Date(nowDate);
          end.setHours(eh, em, 0, 0);
          // If end_time is before start_time, treat the shift as crossing midnight.
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
      queryClient.invalidateQueries({ queryKey: ["home-hero-today", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["home-hero-week", employeeId] });
      toast.success(`Clocked in — have a great day, ${firstName}.`);
    },
    onError: (err) => {
      toast.error(`Clock-in failed: ${(err as Error).message}`);
    },
  });

  // ---------- Derived ----------
  const isClockedIn = !!todayEntry && !todayEntry.clock_out;
  const isComplete = !!todayEntry?.clock_out;
  const activeBreak = getActiveBreak(todayEntry || null);

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
      minutesPastGrace = Math.floor((now.getTime() - lateBoundary.getTime()) / 60_000);
    }
  }

  const weekHours = weekEntries.reduce((s, e) => s + (e.total_hours || 0), 0);
  // Count every day with a punch — including today's in-progress shift.
  // Old logic required clock_out, so anyone viewing mid-shift saw the
  // current day excluded (Deysi saw "1" all of Thursday until she
  // clocked out at night). time_clock.clock_in is NOT NULL so row
  // count == days with a punch.
  const daysWorked = weekEntries.length;
  const minutesLate = weekEntries.reduce((s, e) => s + (e.late_minutes || 0), 0);

  // ---------- Status badge ----------
  let statusBadge: { label: string; tone: string } = {
    label: "Not clocked in",
    tone: "bg-muted text-muted-foreground",
  };
  if (isComplete) {
    statusBadge = { label: "Shift complete", tone: "bg-emerald-100 text-emerald-800" };
  } else if (activeBreak === "lunch") {
    statusBadge = { label: "On lunch", tone: "bg-amber-100 text-amber-800" };
  } else if (activeBreak) {
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
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        <Badge className={`${statusBadge.tone} text-sm px-3 py-1`} variant="outline">
          {statusBadge.label}
        </Badge>
      </div>

      {/* Announcements needing acknowledgment — clears as each is acknowledged. */}
      <AnnouncementAckBanner employeeId={employeeId} campaignId={campaignId} />

      {/* Today + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today panel — spans 2/3 on lg */}
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
                  {now.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
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
                    onClick={() => setConfirmOpen(true)}
                    disabled={clockInMutation.isPending}
                  >
                    {clockInMutation.isPending ? "Clocking in..." : "Clock In"}
                  </Button>
                </div>
                {/* Small one-line schedule reminder under the Clock In button */}
                <div className="mt-4">
                  <ScheduleBanner employeeId={employeeCode} variant="compact" />
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

        {/* Quick Actions */}
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
                  className={`mr-2 h-4 w-4 ${unreadBulletinCount > 0 ? "text-orange-500" : ""}`}
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

      {/* Stat row */}
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

      {/* Confirm clock-in dialog (especially important when past grace) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clock in now?</AlertDialogTitle>
            <AlertDialogDescription>
              {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
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
                  onSuccess: () => setConfirmOpen(false),
                });
              }}
            >
              {clockInMutation.isPending ? "Clocking in..." : "Clock in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StatCard — small helper, identical to the one in EmployeeHome.    */
/*  Kept local so HomeHero is fully self-contained.                    */
/* ------------------------------------------------------------------ */

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
