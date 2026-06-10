import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EditPunchDialog } from "@/components/EditPunchDialog";
import { AddDayOffDialog, type ExistingDayOff } from "@/components/AddDayOffDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { todayLocal, parseLocalDate, formatDateUSShort } from "@/lib/localDate";

/**
 * Calendar-style clock-in history on EmpleadoPerfil.
 *
 * Visible to Team Lead and above. Renders one month at a time as a 7-column
 * grid of colored squares:
 *   - Green  = on-time clock-in (within grace) AND clocked out at-or-after shift end
 *   - Yellow = late, early-out, missing clock-out, or auto-clocked-out
 *   - Red    = scheduled day with no punch at all
 *   - Gray   = not scheduled, before hire, after last_worked_day, or future
 *   - Blue dot overlay = row was edited via edit-time-clock (audit trail)
 *
 * Today is shown as gray-with-pulse if the agent has clocked in but not out
 * yet — we don't penalize an in-progress day.
 *
 * Clicking any cell opens EditPunchDialog so TLs can fix punches inline.
 * For manager+ (canManageDayOff), clicking opens a chooser: edit punches OR
 * add/remove a day off (paid or unpaid) — and future dates become clickable
 * so days off can be planned ahead. Approved time off renders sky-blue.
 * Month navigation stops at the agent's hire_date (no point seeing months
 * before they existed).
 */

type Shift = {
  start_time: string;          // "HH:MM:SS"
  end_time: string;            // "HH:MM:SS"
  grace_minutes: number | null;
  days_of_week: number[] | null; // 0=Sun..6=Sat
};

type ClockRow = {
  id: string;
  date: string;                // YYYY-MM-DD
  clock_in: string;
  clock_out: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  break1_start: string | null;
  break1_end: string | null;
  break2_start: string | null;
  break2_end: string | null;
  is_late: boolean | null;
  late_minutes: number | null;
  auto_clocked_out: boolean;
  shift_end_expected: string | null;
};

interface Props {
  employeeUuid: string;            // employees.id (UUID — not text employee_id)
  employeeName: string;
  hireDate: string | null;         // YYYY-MM-DD
  lastWorkedDay: string | null;    // YYYY-MM-DD; null = still active
  shift: Shift | null;             // null = no campaign / no shift configured
  clientId: string | null;         // employee's client (for client_holidays lookup)
  campaignId: string | null;       // for inserting day-off rows (NOT NULL in DB)
  canManageDayOff: boolean;        // manager+ — unlocks add/remove day off
}

// Holiday info we look up for the visible month
type HolidayInfo = { date: string; name: string; kind: "statutory" | "client" };

// Approved time-off covering a given day (from vacation_requests)
type TimeOffInfo = ExistingDayOff;

const TIME_OFF_LABELS: Record<TimeOffInfo["request_type"], string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  other: "Other",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

// "HH:MM:SS" → minutes since midnight (handles "HH:MM" too)
function timeStringToMinutes(t: string): number {
  const [hh = "0", mm = "0"] = t.split(":");
  return Number(hh) * 60 + Number(mm);
}

// ISO timestamp → minutes since local midnight on the same calendar day
function isoToLocalMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

type DayStatus =
  | { kind: "off" }                          // not scheduled / outside employment window
  | { kind: "future" }                       // after today
  | { kind: "missed" }                       // scheduled, no punch
  | { kind: "live"; row: ClockRow }          // today, clocked in, not yet out
  | { kind: "green"; row: ClockRow; holidayWorked?: HolidayInfo }
  | { kind: "yellow"; row: ClockRow; reason: string; holidayWorked?: HolidayInfo }
  | { kind: "holiday"; info: HolidayInfo }   // client/LFT holiday, no work expected
  | { kind: "timeoff"; info: TimeOffInfo };  // approved day off (paid or unpaid)

function classifyDay(
  dateStr: string,
  row: ClockRow | undefined,
  shift: Shift | null,
  hireDate: string | null,
  lastWorkedDay: string | null,
  today: string,
  holidays: Map<string, HolidayInfo>,
  timeOff: Map<string, TimeOffInfo>,
): DayStatus {
  // Outside employment window
  if (hireDate && dateStr < hireDate) return { kind: "off" };
  if (lastWorkedDay && dateStr > lastWorkedDay) return { kind: "off" };

  // Approved day off with no punch — wins over future/missed/holiday so
  // planned (future) days off are visible on the calendar too.
  const dayOff = timeOff.get(dateStr);
  if (dayOff && !row) return { kind: "timeoff", info: dayOff };

  // Future
  if (dateStr > today) return { kind: "future" };

  const holiday = holidays.get(dateStr);

  // No shift configured for the campaign — show punches but no schedule judgment
  if (!shift) {
    if (!row) return holiday ? { kind: "holiday", info: holiday } : { kind: "off" };
    if (!row.clock_out) {
      if (dateStr === today) return { kind: "live", row };
      return { kind: "yellow", row, reason: "Missing clock-out", holidayWorked: holiday };
    }
    return { kind: "green", row, holidayWorked: holiday };
  }

  // Check if this weekday is a scheduled day
  const dow = parseLocalDate(dateStr).getDay();
  const scheduledDays = shift.days_of_week ?? [];
  const isScheduled = scheduledDays.includes(dow);

  if (!isScheduled) {
    // Off-schedule day — only flag if they did punch
    if (!row) return holiday ? { kind: "holiday", info: holiday } : { kind: "off" };
    if (!row.clock_out && dateStr === today) return { kind: "live", row };
    return { kind: "yellow", row, reason: "Punched on off-schedule day", holidayWorked: holiday };
  }

  // Holiday on a scheduled day → don't penalize for not punching
  if (holiday && !row) return { kind: "holiday", info: holiday };

  // Scheduled day with no punch = missed
  if (!row) {
    if (dateStr === today) return { kind: "future" }; // give them all day to clock in
    return { kind: "missed" };
  }

  // In-progress today
  if (!row.clock_out && dateStr === today) return { kind: "live", row };

  // Missing clock-out from a past scheduled day
  if (!row.clock_out) return { kind: "yellow", row, reason: "Missing clock-out", holidayWorked: holiday };

  // Auto-clocked-out by the system (forgot to clock out)
  if (row.auto_clocked_out) return { kind: "yellow", row, reason: "Auto clocked-out", holidayWorked: holiday };

  // Late beyond grace
  const grace = shift.grace_minutes ?? 0;
  const expectedStart = timeStringToMinutes(shift.start_time);
  const expectedEnd = timeStringToMinutes(shift.end_time);
  const actualIn = isoToLocalMinutes(row.clock_in);
  const actualOut = isoToLocalMinutes(row.clock_out);

  if (actualIn > expectedStart + grace) {
    return { kind: "yellow", row, reason: `Late by ${actualIn - expectedStart} min`, holidayWorked: holiday };
  }

  // Early clock-out (more than 5 min before shift end is "early")
  if (actualOut < expectedEnd - 5) {
    return { kind: "yellow", row, reason: `Out ${expectedEnd - actualOut} min early`, holidayWorked: holiday };
  }

  return { kind: "green", row, holidayWorked: holiday };
}

function statusColor(s: DayStatus): string {
  switch (s.kind) {
    case "green":  return "bg-green-500 hover:bg-green-600 text-white";
    case "yellow": return "bg-amber-400 hover:bg-amber-500 text-amber-950";
    case "missed": return "bg-red-500 hover:bg-red-600 text-white";
    case "live":   return "bg-blue-200 hover:bg-blue-300 text-blue-950 animate-pulse";
    case "off":    return "bg-muted hover:bg-muted/80 text-muted-foreground";
    case "future": return "bg-muted/40 text-muted-foreground/40";
    case "holiday": return "bg-purple-200 hover:bg-purple-300 text-purple-950";
    case "timeoff": return "bg-sky-300 hover:bg-sky-400 text-sky-950";
  }
}

function statusLabel(s: DayStatus): string {
  switch (s.kind) {
    case "green":  return s.holidayWorked ? `On time (worked ${s.holidayWorked.name})` : "On time";
    case "yellow": return s.holidayWorked ? `${s.reason} — worked ${s.holidayWorked.name}` : s.reason;
    case "missed": return "No punch";
    case "live":   return "Clocked in (in progress)";
    case "off":    return "Off / not scheduled";
    case "future": return "—";
    case "holiday": return `Holiday — ${s.info.name}`;
    case "timeoff": return `Day off — ${TIME_OFF_LABELS[s.info.request_type]} (${s.info.is_paid ? "paid" : "unpaid"})`;
  }
}

export function ClockInHistoryCard({
  employeeUuid,
  employeeName,
  hireDate,
  lastWorkedDay,
  shift,
  clientId,
  campaignId,
  canManageDayOff,
}: Props) {
  // Month being viewed (anchored to first of month, local)
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [editTarget, setEditTarget] = useState<{ date: string; row?: ClockRow } | null>(null);
  // Manager+ day-off flow: chooser (edit punches vs day off) + the day-off dialog itself
  const [chooser, setChooser] = useState<{ date: string; row?: ClockRow; timeOff?: TimeOffInfo } | null>(null);
  const [dayOffTarget, setDayOffTarget] = useState<{ date: string; timeOff?: TimeOffInfo } | null>(null);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth(); // 0-11

  // Range to query: full month
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["clock-in-history", employeeUuid, monthStart, monthEnd],
    queryFn: async (): Promise<ClockRow[]> => {
      const { data, error } = await supabase
        .from("time_clock")
        .select("id, date, clock_in, clock_out, lunch_start, lunch_end, break1_start, break1_end, break2_start, break2_end, is_late, late_minutes, auto_clocked_out, shift_end_expected")
        .eq("employee_id", employeeUuid)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as ClockRow[];
    },
    enabled: !!employeeUuid,
  });

  // Audit-trail entries → mark edited days with blue dot
  const { data: editedDates = new Set<string>() } = useQuery({
    queryKey: ["clock-in-history-audit", employeeUuid, monthStart, monthEnd],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("time_clock_audit")
        .select("date")
        .eq("employee_id", employeeUuid)
        .gte("date", monthStart)
        .lte("date", monthEnd);
      if (error) {
        // Audit table might not exist in older schemas — fail gracefully
        return new Set();
      }
      return new Set((data || []).map((r: { date: string }) => r.date));
    },
    enabled: !!employeeUuid,
  });

  // Holidays in the visible month — union of statutory (LFT) + client-specific
  const { data: holidays = new Map<string, HolidayInfo>() } = useQuery({
    queryKey: ["clock-in-history-holidays", clientId, monthStart, monthEnd],
    queryFn: async (): Promise<Map<string, HolidayInfo>> => {
      const m = new Map<string, HolidayInfo>();

      // Mexican LFT statutory holidays (apply to everyone)
      const { data: statutory } = await supabase
        .from("company_holidays")
        .select("date, name, is_statutory")
        .gte("date", monthStart)
        .lte("date", monthEnd);
      for (const r of (statutory || [])) {
        if (r.is_statutory) m.set(r.date, { date: r.date, name: r.name, kind: "statutory" });
      }

      // Client-specific holidays (only for this employee's client)
      if (clientId) {
        const { data: clientHols } = await supabase
          .from("client_holidays")
          .select("date, name")
          .eq("client_id", clientId)
          .gte("date", monthStart)
          .lte("date", monthEnd);
        for (const r of (clientHols || [])) {
          // Client holiday wins over statutory if same date (more specific name)
          m.set(r.date, { date: r.date, name: r.name, kind: "client" });
        }
      }

      return m;
    },
    enabled: true, // always run; statutory holidays apply even with no clientId
  });

  // Approved time off in the visible month — drives the sky-blue cells.
  // Range overlap: request starts before month-end AND ends after month-start.
  const { data: timeOffByDate = new Map<string, TimeOffInfo>() } = useQuery({
    queryKey: ["clock-in-history-timeoff", employeeUuid, monthStart, monthEnd],
    queryFn: async (): Promise<Map<string, TimeOffInfo>> => {
      const m = new Map<string, TimeOffInfo>();
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("id, start_date, end_date, request_type, is_paid")
        .eq("employee_id", employeeUuid)
        .eq("status", "approved")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart);
      if (error) throw error;
      for (const r of (data || []) as TimeOffInfo[]) {
        // Expand the request's date range, clamped to the visible month
        const from = r.start_date > monthStart ? r.start_date : monthStart;
        const to = r.end_date < monthEnd ? r.end_date : monthEnd;
        const cursor = parseLocalDate(from);
        const stop = parseLocalDate(to);
        while (cursor.getTime() <= stop.getTime()) {
          m.set(todayLocal(cursor), r);
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      return m;
    },
    enabled: !!employeeUuid,
  });

  const today = todayLocal();
  const rowByDate = useMemo(() => {
    const m = new Map<string, ClockRow>();
    for (const r of rows) m.set(r.date, r);
    return m;
  }, [rows]);

  // Build the 6-row x 7-col grid (some cells may be blank padding before/after month)
  const cells = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
    const out: Array<{ date: string | null }> = [];
    for (let i = 0; i < firstDow; i++) out.push({ date: null });
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ date: dateStr });
    }
    // Pad to a multiple of 7 for a clean grid
    while (out.length % 7 !== 0) out.push({ date: null });
    return out;
  }, [year, month, lastDay]);

  // Disable "previous month" when it would go before hire month
  const hireMonthStart = useMemo(() => {
    if (!hireDate) return null;
    const d = parseLocalDate(hireDate);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, [hireDate]);
  const prevDisabled =
    hireMonthStart !== null &&
    new Date(year, month - 1, 1).getTime() < hireMonthStart;

  // Disable "next month" when it would go past current month
  const nowMonthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);
  const nextDisabled = new Date(year, month + 1, 1).getTime() > nowMonthStart;

  function handleCellClick(dateStr: string, row: ClockRow | undefined) {
    const timeOff = timeOffByDate.get(dateStr);

    if (!canManageDayOff) {
      // TLs: punch editing only, past/today only (original behavior)
      if (dateStr > today) return;
      setEditTarget({ date: dateStr, row });
      return;
    }

    if (dateStr > today) {
      // Future: nothing to punch-edit — go straight to add/remove day off
      setDayOffTarget({ date: dateStr, timeOff });
      return;
    }

    // Past/today: let the manager pick between punches and day off
    setChooser({ date: dateStr, row, timeOff });
  }

  // Monthly summary counters
  const summary = useMemo(() => {
    let green = 0, yellow = 0, missed = 0, holiday = 0, timeoff = 0;
    for (const cell of cells) {
      if (!cell.date) continue;
      const s = classifyDay(cell.date, rowByDate.get(cell.date), shift, hireDate, lastWorkedDay, today, holidays, timeOffByDate);
      if (s.kind === "timeoff") { timeoff++; continue; }
      if (cell.date > today) continue;
      if (s.kind === "green")  green++;
      else if (s.kind === "yellow") yellow++;
      else if (s.kind === "missed") missed++;
      else if (s.kind === "holiday") holiday++;
    }
    return { green, yellow, missed, holiday, timeoff };
  }, [cells, rowByDate, shift, hireDate, lastWorkedDay, today, holidays, timeOffByDate]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">Clock-in History</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              disabled={prevDisabled}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[10rem] text-center text-sm font-medium">
              {MONTH_NAMES[month]} {year}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              disabled={nextDisabled}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-green-500" /> On time ({summary.green})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> Clock in/out ({summary.yellow})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-red-500" /> Missed ({summary.missed})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-purple-200" /> Holiday ({summary.holiday})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-sky-300" /> Day off ({summary.timeoff})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-muted" /> Off-schedule</span>
        </div>
      </CardHeader>
      <CardContent>
        {!shift && (
          <p className="text-xs text-muted-foreground mb-2">
            No shift configured for this campaign — color rules are limited. Set a shift in Shift Settings to unlock full grading.
          </p>
        )}
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_HEADERS.map((w, i) => (
            <div key={`hdr-${i}`} className="text-center text-[10px] font-medium text-muted-foreground py-1">
              {w}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell.date) {
              return <div key={`pad-${i}`} className="aspect-square" />;
            }
            const row = rowByDate.get(cell.date);
            const status = classifyDay(cell.date, row, shift, hireDate, lastWorkedDay, today, holidays, timeOffByDate);
            const day = Number(cell.date.slice(-2));
            const isToday = cell.date === today;
            const wasEdited = editedDates.has(cell.date);
            // Manager+ can click future days to plan a day off
            const isClickable = canManageDayOff || status.kind !== "future";
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => handleCellClick(cell.date!, row)}
                disabled={!isClickable}
                title={`${cell.date} — ${statusLabel(status)}`}
                className={`
                  relative aspect-square rounded-md text-sm font-medium
                  flex items-center justify-center
                  transition-colors
                  ${statusColor(status)}
                  ${isToday ? "ring-2 ring-ring ring-offset-1" : ""}
                  ${isClickable ? "cursor-pointer" : ""}
                `}
              >
                {day}
                {wasEdited && (
                  <span
                    className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-blue-600 ring-1 ring-white"
                    aria-label="Edited"
                  />
                )}
              </button>
            );
          })}
        </div>
        {isLoading && (
          <p className="text-xs text-muted-foreground mt-3">Loading…</p>
        )}
      </CardContent>

      {/* Manager+ chooser: edit punches vs add/remove day off */}
      {chooser && (
        <Dialog open={!!chooser} onOpenChange={(open) => { if (!open) setChooser(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{formatDateUSShort(chooser.date)}</DialogTitle>
              <DialogDescription>
                What do you want to do for {employeeName} on this day?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditTarget({ date: chooser.date, row: chooser.row });
                  setChooser(null);
                }}
              >
                Edit punches
              </Button>
              <Button
                variant={chooser.timeOff ? "destructive" : "default"}
                onClick={() => {
                  setDayOffTarget({ date: chooser.date, timeOff: chooser.timeOff });
                  setChooser(null);
                }}
              >
                {chooser.timeOff ? "Remove day off" : "Add day off"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {dayOffTarget && (
        <AddDayOffDialog
          open={!!dayOffTarget}
          onOpenChange={(open) => { if (!open) setDayOffTarget(null); }}
          employeeUuid={employeeUuid}
          employeeName={employeeName}
          campaignId={campaignId}
          date={dayOffTarget.date}
          existing={dayOffTarget.timeOff}
        />
      )}

      {editTarget && (
        <EditPunchDialog
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          employeeId={employeeUuid}
          employeeName={employeeName}
          date={editTarget.date}
          existing={editTarget.row ? {
            clock_in: editTarget.row.clock_in,
            clock_out: editTarget.row.clock_out,
            lunch_start: editTarget.row.lunch_start,
            lunch_end: editTarget.row.lunch_end,
            break1_start: editTarget.row.break1_start,
            break1_end: editTarget.row.break1_end,
            break2_start: editTarget.row.break2_start,
            break2_end: editTarget.row.break2_end,
          } : undefined}
        />
      )}
    </Card>
  );
}
