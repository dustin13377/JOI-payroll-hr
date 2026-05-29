import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, AlertTriangle, UserCheck, UserX, Pencil, CalendarOff, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditPunchDialog } from "@/components/EditPunchDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { todayLocal } from "@/lib/localDate";
import { formatMinutesVerbose } from "@/lib/formatDuration";

interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  campaign_id: string;
  campaign_name: string;
  clock_in: string | null;
  clock_out: string | null;
  is_late: boolean;
  late_minutes: number | null;
  created_at: string;
}

type DayOffReason = "scheduled_off" | "vacation" | "sick" | "personal" | "time_off";

interface EmployeeWithAttendance {
  id: string;
  employee_id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
  // "day_off" = scheduled off today (campaign's shift days don't include today)
  // OR on an approved vacation/sick/personal/time-off request covering today.
  // Distinct from "ausente" which is "scheduled to work and didn't punch."
  status: "presente" | "ausente" | "completado" | "day_off";
  day_off_reason: DayOffReason | null;
  clock_in: string | null;
  clock_out: string | null;
  is_late: boolean;
  late_minutes: number | null;
  is_repeat_late: boolean;
}

interface OverviewStats {
  presentes: number;
  ausentes: number;
  day_off: number;
  tardanzas_hoy: number;
  tardanzas_repetidas: number;
}

export default function Attendance() {
  const { user, role, employeeId, isLeadership, isTeamLead } = useAuth();
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);

  // Edit-punch dialog state. Opened from the pencil button on each row.
  const [editPunchTarget, setEditPunchTarget] = useState<{
    employee_id: string;
    employee_name: string;
    clock_in: string | null;
    clock_out: string | null;
  } | null>(null);

  // Sortable column state. null column = default sort (present → absent → completed).
  // Clicking a header cycles: asc → desc → back to default.
  type SortKey = "name" | "campaign_name" | "status" | "clock_in" | "clock_out" | "hours" | "late_minutes";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${active ? "opacity-100" : "opacity-40"}`} />
        </button>
      </TableHead>
    );
  };

  // Check authorization
  if (role === "agent") {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">You don't have access to this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch campaigns (scoped for TLs).
  // For TLs we resolve campaigns via my_tl_campaign_ids() — that RPC
  // UNIONs both campaigns.team_lead_id (primary) and team_lead_campaigns
  // (cross-campaign join). The old `.eq("team_lead_id", employeeId)`
  // missed every cross-campaign TL.
  const { data: campaignsData } = useQuery({
    queryKey: ["attendance-campaigns", employeeId, isLeadership, isTeamLead],
    queryFn: async () => {
      if (isTeamLead && !isLeadership) {
        const { data: ids, error: idsErr } = await supabase.rpc("my_tl_campaign_ids");
        if (idsErr) throw idsErr;
        const list = (ids ?? []) as string[];
        if (list.length === 0) return [];
        const { data, error } = await supabase
          .from("campaigns")
          .select("id, name")
          .in("id", list)
          .order("name");
        if (error) throw error;
        return data || [];
      }
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (campaignsData) {
      setCampaigns(campaignsData);
    }
  }, [campaignsData]);

  // Fetch attendance data for today
  const { data: attendanceData, refetch } = useQuery({
    queryKey: ["attendance", selectedCampaign, employeeId, isLeadership, isTeamLead],
    queryFn: async () => {
      const todayStr = todayLocal();

      const { data: timeClock, error: timeClockError } = await supabase
        .from("time_clock")
        .select("id, employee_id, clock_in, clock_out, is_late, late_minutes")
        .eq("date", todayStr);

      if (timeClockError) throw timeClockError;

      // Fetch employees scoped by role.
      //
      // - Leadership view: query `employees` directly and explicitly
      //   exclude owners + system users (they never punch a clock; counting
      //   them as Absent is pure noise). Half-onboarded hires with no
      //   campaign DO still appear so they surface as a problem.
      // - TL view: query the `employees_no_pay` view (no sensitive cols)
      //   and scope via my_team_member_ids() — that helper already returns
      //   only agents the TL is responsible for, so no owner/system-user
      //   pollution is possible.
      //
      // The two branches are separate query builders because the view
      // doesn't expose `title` or `is_system_user`, so Supabase's generated
      // types reject those filters on the view.
      let employees: any[] | null = null;
      let employeesError: any = null;

      if (isTeamLead && !isLeadership && employeeId) {
        const { data: ids, error: idsErr } = await supabase.rpc("my_team_member_ids");
        if (idsErr) throw idsErr;
        const list = (ids ?? []) as string[];
        if (list.length === 0) return [];
        const res = await supabase
          .from("employees_no_pay")
          .select("id, employee_id, full_name, work_name, campaign_id")
          .eq("is_active", true)
          .in("id", list);
        employees = res.data;
        employeesError = res.error;
      } else {
        const res = await supabase
          .from("employees")
          .select("id, employee_id, full_name, work_name, campaign_id, title, is_system_user")
          .eq("is_active", true)
          .neq("title", "owner")
          .eq("is_system_user", false);
        employees = res.data;
        employeesError = res.error;
      }

      if (employeesError) throw employeesError;
      if (!employees) employees = [];

      // Pull each campaign's shift definition so we can tell who's
      // *scheduled* to work today vs. on a scheduled-off day. days_of_week
      // is a Postgres int[] where 0=Sunday … 6=Saturday — same convention
      // JS Date.getDay() uses, so we can compare directly.
      const { data: shiftSettings, error: shiftErr } = await supabase
        .from("shift_settings")
        .select("campaign_id, days_of_week");
      if (shiftErr) throw shiftErr;
      const shiftByCampaign = new Map<string, number[]>();
      (shiftSettings ?? []).forEach((s: { campaign_id: string; days_of_week: number[] | null }) => {
        if (s.days_of_week && s.days_of_week.length > 0) {
          shiftByCampaign.set(s.campaign_id, s.days_of_week);
        }
      });
      const todayDow = new Date().getDay();

      // Pull approved time off covering today. If an employee is on
      // approved leave today, they belong in the Day Off bucket no matter
      // what their shift says (e.g., they took PTO on a regular workday).
      const { data: timeOffToday, error: toErr } = await supabase
        .from("vacation_requests")
        .select("employee_id, request_type")
        .eq("status", "approved")
        .lte("start_date", todayStr)
        .gte("end_date", todayStr);
      if (toErr) throw toErr;
      const onLeaveToday = new Map<string, DayOffReason>();
      (timeOffToday ?? []).forEach((r: { employee_id: string; request_type: string | null }) => {
        // Normalize whatever request_type the row carries (vacation, sick,
        // personal, time_off, etc.) into our DayOffReason union; unknown
        // values fall back to generic "time_off".
        const known: DayOffReason[] = ["vacation", "sick", "personal", "time_off"];
        const reason = (known as string[]).includes(r.request_type ?? "")
          ? (r.request_type as DayOffReason)
          : "time_off";
        onLeaveToday.set(r.employee_id, reason);
      });

      // Fetch clients for campaign names
      const { data: campaignsList, error: campaignsError } = await supabase
        .from("campaigns")
        .select("id, name");

      if (campaignsError) throw campaignsError;

      const campaignMap = new Map(campaignsList.map((c: any) => [c.id, c.name]));

      // Get repeat lates for this week
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = todayLocal(weekStart);

      const { data: weekLates, error: weekLatesError } = await supabase
        .from("time_clock")
        .select("employee_id")
        .eq("is_late", true)
        .gte("date", weekStartStr)
        .lte("date", todayStr);

      if (weekLatesError) throw weekLatesError;

      const lateCountMap = new Map<string, number>();
      weekLates?.forEach((record: any) => {
        lateCountMap.set(
          record.employee_id,
          (lateCountMap.get(record.employee_id) || 0) + 1
        );
      });

      // Build attendance map from today's time clock
      const attendanceMap = new Map<string, any>();
      timeClock?.forEach((record: any) => {
        attendanceMap.set(record.employee_id, record);
      });

      // Build employee list with attendance status.
      //
      // Status precedence (highest wins):
      //   completado   — clocked in AND out (already worked today)
      //   presente     — clocked in but not out (currently working)
      //   day_off      — approved time off, OR campaign shift doesn't
      //                  include today's day-of-week
      //   ausente      — scheduled to work today, no clock-in yet
      //
      // Day-off reason: vacation/sick/personal/time_off come from the
      // approved request. scheduled_off is the "today isn't your day"
      // case (e.g., MCA's 3x12 weekend rotation, or a Mon–Fri agent
      // showing up here on Saturday).
      const employeeList: EmployeeWithAttendance[] = employees.map(
        (emp: any) => {
          const attendance = attendanceMap.get(emp.id);
          const campaignName = campaignMap.get(emp.campaign_id) || "Unknown";
          const isRepeatLate = (lateCountMap.get(emp.id) || 0) > 1;

          let status: "presente" | "ausente" | "completado" | "day_off" = "ausente";
          let day_off_reason: DayOffReason | null = null;

          if (attendance?.clock_out) {
            status = "completado";
          } else if (attendance?.clock_in) {
            status = "presente";
          } else {
            // Not clocked in — could be Day Off or actually Absent.
            const leaveReason = onLeaveToday.get(emp.id);
            if (leaveReason) {
              status = "day_off";
              day_off_reason = leaveReason;
            } else {
              // Check campaign shift. If no shift_settings row exists
              // we fall back to "scheduled today" (matches the TL roster
              // default) so half-configured campaigns surface as Absent
              // rather than silently hiding.
              const shiftDays = emp.campaign_id ? shiftByCampaign.get(emp.campaign_id) : undefined;
              const scheduledToday = !shiftDays || shiftDays.includes(todayDow);
              if (!scheduledToday) {
                status = "day_off";
                day_off_reason = "scheduled_off";
              }
              // else status stays "ausente"
            }
          }

          return {
            id: emp.id,
            employee_id: emp.employee_id,
            name: emp.work_name?.trim() || emp.full_name,
            campaign_id: emp.campaign_id,
            campaign_name: campaignName,
            status,
            day_off_reason,
            clock_in: attendance?.clock_in || null,
            clock_out: attendance?.clock_out || null,
            is_late: attendance?.is_late || false,
            late_minutes: attendance?.late_minutes || null,
            is_repeat_late: isRepeatLate,
          };
        }
      );

      return employeeList;
    },
    refetchInterval: 30000, // 30 seconds
  });

  // Calculate overview stats
  const stats: OverviewStats = {
    presentes: attendanceData?.filter((e) => e.status === "presente").length || 0,
    ausentes: attendanceData?.filter((e) => e.status === "ausente").length || 0,
    day_off: attendanceData?.filter((e) => e.status === "day_off").length || 0,
    tardanzas_hoy: attendanceData?.filter((e) => e.is_late).length || 0,
    tardanzas_repetidas: attendanceData?.filter((e) => e.is_repeat_late).length || 0,
  };

  // Filter by campaign
  const filteredData = attendanceData?.filter((emp) => {
    if (selectedCampaign === "all") return true;
    return emp.campaign_id === selectedCampaign;
  });

  // Default sort (no column selected): Absent first (action needed) → Present
  // → Completed → Day Off (informational, bottom of list).
  // When a header is clicked: that column drives the order; nulls sort last.
  const statusOrder = { ausente: 0, presente: 1, completado: 2, day_off: 3 } as const;
  const hoursValue = (e: EmployeeWithAttendance) => {
    if (!e.clock_in || !e.clock_out) return null;
    return new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime();
  };
  const sortedData = filteredData ? [...filteredData].sort((a, b) => {
    if (!sortKey) return statusOrder[a.status] - statusOrder[b.status];
    const dir = sortDir === "asc" ? 1 : -1;
    let av: string | number | null;
    let bv: string | number | null;
    switch (sortKey) {
      case "name":          av = a.name.toLowerCase();           bv = b.name.toLowerCase(); break;
      case "campaign_name": av = a.campaign_name.toLowerCase();  bv = b.campaign_name.toLowerCase(); break;
      case "status":        av = statusOrder[a.status];          bv = statusOrder[b.status]; break;
      case "clock_in":      av = a.clock_in  ? new Date(a.clock_in).getTime()  : null; bv = b.clock_in  ? new Date(b.clock_in).getTime()  : null; break;
      case "clock_out":     av = a.clock_out ? new Date(a.clock_out).getTime() : null; bv = b.clock_out ? new Date(b.clock_out).getTime() : null; break;
      case "hours":         av = hoursValue(a);                  bv = hoursValue(b); break;
      case "late_minutes":  av = a.is_late ? (a.late_minutes ?? 0) : null; bv = b.is_late ? (b.late_minutes ?? 0) : null; break;
    }
    // Nulls always sort last, regardless of direction
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return  1 * dir;
    return 0;
  }) : undefined;

  // Friendly label for the day-off badge in the table.
  const dayOffLabel = (reason: DayOffReason | null): string => {
    switch (reason) {
      case "vacation":   return "Vacation";
      case "sick":       return "Sick";
      case "personal":   return "Personal";
      case "time_off":   return "Time off";
      case "scheduled_off": return "Day off";
      default:           return "Day off";
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateHours = (clockIn: string | null, clockOut: string | null) => {
    if (!clockIn || !clockOut) return "-";
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return hours.toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground mt-2">
          Real-time attendance dashboard
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* Presentes */}
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-green-900">
              <UserCheck className="h-4 w-4" />
              Present
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-700">{stats.presentes}</p>
          </CardContent>
        </Card>

        {/* Ausentes — true no-shows: scheduled today, no clock-in */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-red-900">
              <UserX className="h-4 w-4" />
              Absent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-700">{stats.ausentes}</p>
          </CardContent>
        </Card>

        {/* Day Off — scheduled-off or approved time off; informational */}
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-700">
              <CalendarOff className="h-4 w-4" />
              Day Off
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-600">{stats.day_off}</p>
          </CardContent>
        </Card>

        {/* Tardanzas Hoy */}
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-yellow-900">
              <Clock className="h-4 w-4" />
              Late Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-700">
              {stats.tardanzas_hoy}
            </p>
          </CardContent>
        </Card>

        {/* Tardanzas Repetidas */}
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-orange-900">
              <AlertTriangle className="h-4 w-4" />
              Repeat Late
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-700">
              {stats.tardanzas_repetidas}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Live Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Campaign Filter Tabs — scroll horizontally when there are more
              campaigns than fit on screen. Without overflow-x-auto the
              trailing tabs get clipped off the right edge. */}
          <Tabs value={selectedCampaign} onValueChange={setSelectedCampaign} className="mb-4">
            <div className="w-full overflow-x-auto pb-1">
              <TabsList className="inline-flex w-max">
                <TabsTrigger value="all">All</TabsTrigger>
                {campaigns.map((campaign) => (
                  <TabsTrigger key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader k="name"          label="Name" />
                  <SortHeader k="campaign_name" label="Campaign" />
                  <SortHeader k="status"        label="Status" />
                  <SortHeader k="clock_in"      label="Clock In" />
                  <SortHeader k="clock_out"     label="Clock Out" />
                  <SortHeader k="hours"         label="Hours" />
                  <SortHeader k="late_minutes"  label="Late By" />
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData && sortedData.length > 0 ? (
                  sortedData.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Link to={`/empleados/${employee.employee_id}`} className="hover:underline text-primary">
                            {employee.name}
                          </Link>
                          {employee.is_repeat_late && (
                            <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                              Repeat
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{employee.campaign_name}</TableCell>
                      <TableCell>
                        {employee.status === "presente" && (
                          <Badge className="bg-green-600 hover:bg-green-700">
                            Present
                          </Badge>
                        )}
                        {employee.status === "ausente" && (
                          // Bumped from secondary (gray) → destructive (red)
                          // since Absent now means "scheduled and didn't
                          // punch" — that's action-needed, not just a state.
                          <Badge variant="destructive">Absent</Badge>
                        )}
                        {employee.status === "completado" && (
                          <Badge className="bg-blue-600 hover:bg-blue-700">
                            Completed
                          </Badge>
                        )}
                        {employee.status === "day_off" && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">
                            {dayOffLabel(employee.day_off_reason)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatTime(employee.clock_in)}</TableCell>
                      <TableCell>{formatTime(employee.clock_out)}</TableCell>
                      <TableCell>
                        {calculateHours(employee.clock_in, employee.clock_out)}
                      </TableCell>
                      <TableCell>
                        {employee.is_late ? (
                          <Badge variant="destructive">
                            {formatMinutesVerbose(employee.late_minutes)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={employee.clock_in ? "Edit punch" : "Add missing punch"}
                          onClick={() =>
                            setEditPunchTarget({
                              employee_id: employee.id,
                              employee_name: employee.name,
                              clock_in: employee.clock_in,
                              clock_out: employee.clock_out,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No attendance data
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {editPunchTarget && (
        <EditPunchDialog
          open={!!editPunchTarget}
          onOpenChange={(open) => !open && setEditPunchTarget(null)}
          employeeId={editPunchTarget.employee_id}
          employeeName={editPunchTarget.employee_name}
          date={todayLocal()}
          existing={{
            clock_in: editPunchTarget.clock_in,
            clock_out: editPunchTarget.clock_out,
            lunch_start: null,
            lunch_end: null,
            break1_start: null,
            break1_end: null,
            break2_start: null,
            break2_end: null,
          }}
        />
      )}
    </div>
  );
}
