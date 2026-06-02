import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayLocal } from "@/lib/localDate";
import { getDisplayName } from "@/lib/displayName";

/* ------------------------------------------------------------------ */
/*  Shared local types                                                 */
/* ------------------------------------------------------------------ */

interface TeamMember {
  id: string;
  employee_id: string;
  full_name: string;
  work_name: string | null;
  title: string | null;
  campaign_id: string | null;
  campaigns: { name: string } | null;
}

interface ShiftSettings {
  id: string;
  campaign_id: string;
  shift_name: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  grace_minutes: number;
  days_of_week: number[];
}

interface TimeClockRow {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  date: string;
  is_late: boolean;
  late_minutes: number | null;
}

interface TimeOffRow {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  // request_type from unified vacation_requests table: vacation | sick | personal | other
  reason: string;
  status: string;
  is_paid: boolean;
}

interface EODLogRow {
  id: string;
  employee_id: string;
  date: string;
  metrics: Record<string, unknown> | null;
}

/* ------------------------------------------------------------------ */
/*  Helper: format a Date as YYYY-MM-DD (local)                        */
/* ------------------------------------------------------------------ */

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ */
/*  Helper: fetch the calling TL's team member UUIDs                   */
/*                                                                     */
/*  Calls my_team_member_ids() which UNIONs:                           */
/*    (a) employees.reports_to = me                                    */
/*    (b) active 'agent' employees in any campaign I lead              */
/*        (via campaigns.team_lead_id OR team_lead_campaigns)          */
/*                                                                     */
/*  Pre-2026-05-28 every TL hook here inlined `.eq("reports_to", id)`, */
/*  which silently returned 0 rows for cross-campaign TLs (Adrian on   */
/*  3 Torro campaigns via the join table only). Centralizing through   */
/*  the RPC means the union is enforced server-side and all hooks      */
/*  inherit the fix.                                                   */
/* ------------------------------------------------------------------ */

async function fetchMyTeamMemberIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_team_member_ids");
  if (error) throw error;
  return (data ?? []) as string[];
}

/* ================================================================== */
/*  Hook 1 – useTeamRoster                                             */
/* ================================================================== */

export function useTeamRoster(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["team-roster", tlEmployeeId],
    queryFn: async () => {
      if (!tlEmployeeId) return [];

      // Resolve team via the union helper (reports_to ∪ campaigns-I-lead).
      const memberIds = await fetchMyTeamMemberIds();
      if (memberIds.length === 0) return [];

      // Query the view (no salary columns) instead of the base table.
      // The view has no FK so we can't use PostgREST joins; fetch
      // campaign names in a second query and merge in memory.
      const { data: rows, error } = await supabase
        .from("employees_no_pay")
        .select("id, employee_id, full_name, work_name, title, campaign_id")
        .in("id", memberIds)
        .eq("is_active", true);
      if (error) throw error;
      if (!rows || rows.length === 0) return [];

      const campaignIds = [...new Set(rows.map((r) => r.campaign_id).filter(Boolean))] as string[];
      let campaignMap = new Map<string, string>();
      if (campaignIds.length > 0) {
        const { data: camps, error: campErr } = await supabase
          .from("campaigns")
          .select("id, name")
          .in("id", campaignIds);
        if (campErr) throw campErr;
        for (const c of camps || []) {
          campaignMap.set(c.id, c.name);
        }
      }

      return rows.map((r) => ({
        ...r,
        campaigns: r.campaign_id ? { name: campaignMap.get(r.campaign_id) ?? "" } : null,
      })) as unknown as TeamMember[];
    },
    enabled: !!tlEmployeeId,
  });
}

/* ================================================================== */
/*  Hook 2 – useTodayTimeclockStatus                                   */
/* ================================================================== */

export type TimeclockStatus =
  | "present"
  | "late"
  | "absent"
  | "expected"
  | "completed"
  | "day_off";

export interface TimeclockStatusRow {
  employeeId: string;
  fullName: string;
  workName: string | null;
  status: TimeclockStatus;
  clockInTime: string | null;
  scheduledStart: string | null;
  /** Agent's current campaign — needed for same-day TL-submitted EOD */
  campaignId: string | null;
  /** false → TL can file EOD/punches on their behalf via the agent-submit edge fns */
  hasLogin: boolean;
}

export function useTodayTimeclockStatus(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["team-timeclock-today", tlEmployeeId],
    queryFn: async (): Promise<TimeclockStatusRow[]> => {
      if (!tlEmployeeId) return [];

      // 1. Team roster (union helper)
      const teamIds = await fetchMyTeamMemberIds();
      if (teamIds.length === 0) return [];
      const { data: roster, error: rosterErr } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name, campaign_id")
        .in("id", teamIds)
        .eq("is_active", true);
      if (rosterErr) throw rosterErr;
      const members = (roster || []) as { id: string; full_name: string; work_name: string | null; campaign_id: string | null }[];
      if (members.length === 0) return [];

      const memberIds = members.map((m) => m.id);

      // 2. Today's time_clock rows
      const today = todayLocal();
      const { data: tcRows, error: tcErr } = await supabase
        .from("time_clock")
        .select("id, employee_id, clock_in, clock_out, date, is_late, late_minutes")
        .in("employee_id", memberIds)
        .eq("date", today);
      if (tcErr) throw tcErr;
      const clockRows = (tcRows || []) as TimeClockRow[];

      // 3. Shift settings for team campaigns
      const campaignIds = [...new Set(members.map((m) => m.campaign_id).filter(Boolean))] as string[];
      let shiftMap = new Map<string, ShiftSettings>();
      if (campaignIds.length > 0) {
        const { data: shifts, error: shiftErr } = await supabase
          .from("shift_settings")
          .select("id, campaign_id, shift_name, start_time, end_time, grace_minutes, days_of_week")
          .in("campaign_id", campaignIds);
        if (shiftErr) throw shiftErr;
        for (const s of (shifts || []) as ShiftSettings[]) {
          shiftMap.set(s.campaign_id, s);
        }
      }

      // 3b. No-login set — TLs can submit EOD/punches for these agents.
      //     user_profiles RLS blocks TLs from reading other users' rows, so we
      //     go through the SECURITY DEFINER RPC, batched per campaign in parallel.
      const noLoginIds = new Set<string>();
      if (campaignIds.length > 0) {
        const results = await Promise.all(
          campaignIds.map((cid) =>
            supabase.rpc("employees_without_login", { p_campaign_id: cid })
          )
        );
        for (const r of results) {
          if (r.error) throw r.error;
          for (const row of (r.data || []) as { employee_id: string }[]) {
            noLoginIds.add(row.employee_id);
          }
        }
      }

      // 4. Compute status for each member
      const now = new Date();
      const todayDow = new Date(today + "T00:00:00").getDay(); // 0=Sun

      return members.map((m) => {
        const shift = m.campaign_id ? shiftMap.get(m.campaign_id) : undefined;
        const clockRow = clockRows.find((r) => r.employee_id === m.id);
        const startTime = shift?.start_time ?? null;

        // Determine if today is a workday
        const isWorkday = shift ? shift.days_of_week.includes(todayDow) : true; // default to workday if no shift

        const hasLogin = !noLoginIds.has(m.id);

        if (!isWorkday) {
          return {
            employeeId: m.id,
            fullName: m.full_name,
            workName: m.work_name,
            status: "day_off" as TimeclockStatus,
            clockInTime: clockRow?.clock_in ?? null,
            scheduledStart: startTime,
            campaignId: m.campaign_id,
            hasLogin,
          };
        }

        // Parse scheduled start into today's date
        let scheduled: Date | null = null;
        let graceDeadline: Date | null = null;
        let absentDeadline: Date | null = null;
        const graceMinutes = shift?.grace_minutes ?? 0;

        if (startTime) {
          const [h, mn] = startTime.split(":").map(Number);
          scheduled = new Date(now);
          scheduled.setHours(h, mn, 0, 0);
          graceDeadline = new Date(scheduled.getTime() + graceMinutes * 60000);
          absentDeadline = new Date(scheduled.getTime() + (graceMinutes + 60) * 60000);
        }

        // Clocked out -> completed
        if (clockRow?.clock_out) {
          return {
            employeeId: m.id,
            fullName: m.full_name,
            workName: m.work_name,
            status: "completed" as TimeclockStatus,
            clockInTime: clockRow.clock_in,
            scheduledStart: startTime,
            campaignId: m.campaign_id,
            hasLogin,
          };
        }

        // Clocked in
        if (clockRow) {
          const clockInTime = new Date(clockRow.clock_in);
          const isLate = graceDeadline ? clockInTime > graceDeadline : false;
          return {
            employeeId: m.id,
            fullName: m.full_name,
            workName: m.work_name,
            status: isLate ? ("late" as TimeclockStatus) : ("present" as TimeclockStatus),
            clockInTime: clockRow.clock_in,
            scheduledStart: startTime,
            campaignId: m.campaign_id,
            hasLogin,
          };
        }

        // Not clocked in
        if (absentDeadline && now > absentDeadline) {
          return {
            employeeId: m.id,
            fullName: m.full_name,
            workName: m.work_name,
            status: "absent" as TimeclockStatus,
            clockInTime: null,
            scheduledStart: startTime,
            campaignId: m.campaign_id,
            hasLogin,
          };
        }
        if (graceDeadline && now > graceDeadline) {
          return {
            employeeId: m.id,
            fullName: m.full_name,
            workName: m.work_name,
            status: "late" as TimeclockStatus,
            clockInTime: null,
            scheduledStart: startTime,
            campaignId: m.campaign_id,
            hasLogin,
          };
        }
        return {
          employeeId: m.id,
          fullName: m.full_name,
          workName: m.work_name,
          status: "expected" as TimeclockStatus,
          clockInTime: null,
          scheduledStart: startTime,
          campaignId: m.campaign_id,
          hasLogin,
        };
      });
    },
    enabled: !!tlEmployeeId,
    refetchInterval: 30000,
  });
}

/* ================================================================== */
/*  Hook 3 – usePendingTimeOffForTeam                                  */
/* ================================================================== */

export interface PendingTimeOff extends TimeOffRow {
  fullName: string;
  workName: string | null;
}

export function usePendingTimeOffForTeam(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["team-timeoff-pending", tlEmployeeId],
    queryFn: async (): Promise<PendingTimeOff[]> => {
      if (!tlEmployeeId) return [];

      // 1. Get team member IDs + names (union helper)
      const teamIds = await fetchMyTeamMemberIds();
      if (teamIds.length === 0) return [];
      const { data: roster, error: rosterErr } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name")
        .in("id", teamIds)
        .eq("is_active", true);
      if (rosterErr) throw rosterErr;
      const members = (roster || []) as { id: string; full_name: string; work_name: string | null }[];
      if (members.length === 0) return [];

      const memberIds = members.map((m) => m.id);
      const nameMap = new Map(members.map((m) => [m.id, { full_name: m.full_name, work_name: m.work_name }]));

      // 2. Fetch pending time-off requests from the unified table.
      // status='pending_tl' = waiting on TL approval (first stage).
      // See TIME_OFF_UNIFICATION_PLAN.md.
      const { data: requests, error: reqErr } = await supabase
        .from("vacation_requests")
        .select("id, employee_id, start_date, end_date, request_type, is_paid, status")
        .in("employee_id", memberIds)
        .eq("status", "pending_tl");
      if (reqErr) throw reqErr;

      return ((requests || []) as Array<{
        id: string;
        employee_id: string;
        start_date: string;
        end_date: string;
        request_type: string;
        is_paid: boolean;
        status: string;
      }>).map((r) => {
        const names = nameMap.get(r.employee_id);
        return {
          id: r.id,
          employee_id: r.employee_id,
          start_date: r.start_date,
          end_date: r.end_date,
          reason: r.request_type,
          is_paid: r.is_paid,
          status: r.status,
          fullName: names?.full_name ?? "Unknown",
          workName: names?.work_name ?? null,
        };
      });
    },
    enabled: !!tlEmployeeId,
  });
}

/* ================================================================== */
/*  Hook 4 – useTeamEODThisWeek                                        */
/* ================================================================== */

export interface TeamEODSummary {
  employeeId: string;
  fullName: string;
  workName: string | null;
  submissions: number;
  metrics: Record<string, number>;
  isTopPerformer: boolean;
  isBottomPerformer: boolean;
}

export interface TeamEODWeekResult {
  summaries: TeamEODSummary[];
  /** Ordered KPI fields from campaign config — use for column headers. */
  kpiFields: { field_name: string; field_label: string }[];
}

export function useTeamEODThisWeek(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["team-eod-week", tlEmployeeId],
    queryFn: async (): Promise<TeamEODWeekResult> => {
      if (!tlEmployeeId) return { summaries: [], kpiFields: [] };

      // 1. Team roster (union helper) — campaign_id needed for min_target
      const teamIds = await fetchMyTeamMemberIds();
      if (teamIds.length === 0) return { summaries: [], kpiFields: [] };
      const { data: roster, error: rosterErr } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name, campaign_id")
        .in("id", teamIds)
        .eq("is_active", true);
      if (rosterErr) throw rosterErr;
      const members = (roster || []) as { id: string; full_name: string; work_name: string | null; campaign_id: string | null }[];
      if (members.length === 0) return { summaries: [], kpiFields: [] };

      const memberIds = members.map((m) => m.id);
      const campaignIds = [...new Set(members.map((m) => m.campaign_id).filter(Boolean))] as string[];

      // 2. Compute Monday–Sunday of current week
      const todayDate = new Date(todayLocal() + "T00:00:00");
      const monday = new Date(todayDate);
      monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const mondayStr = fmtDate(monday);
      const sundayStr = fmtDate(sunday);

      // 3. Fetch eod_logs in range + ALL active KPI fields in parallel
      const [logRes, kpiRes] = await Promise.all([
        supabase
          .from("eod_logs")
          .select("id, employee_id, date, metrics")
          .in("employee_id", memberIds)
          .gte("date", mondayStr)
          .lte("date", sundayStr),
        campaignIds.length > 0
          ? supabase
              .from("campaign_kpi_config")
              .select("campaign_id, field_name, field_label, flag_threshold, flag_independent, display_order")
              .in("campaign_id", campaignIds)
              .eq("field_type", "number")
              .eq("is_active", true)
              .order("display_order")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (logRes.error) throw logRes.error;
      if (kpiRes.error) throw kpiRes.error;

      const eodLogs = (logRes.data || []) as EODLogRow[];

      // Build kpiFields for column headers — dedup by field_name, preserve order
      // (if team spans multiple campaigns we keep first occurrence of each field_name)
      const seenFieldNames = new Set<string>();
      const kpiFields: { field_name: string; field_label: string }[] = [];
      for (const kpi of kpiRes.data ?? []) {
        if (!seenFieldNames.has(kpi.field_name)) {
          seenFieldNames.add(kpi.field_name);
          kpiFields.push({ field_name: kpi.field_name, field_label: kpi.field_label });
        }
      }

      // Build per-campaign flag map — only fields that have flag_threshold set
      // AND flag_independent = true. Fields with flag_independent = false (e.g.
      // calls_made) are displayed but never trigger the flag on their own.
      type KPIMin = { field_name: string; flag_threshold: number };
      const kpisByCampaign = new Map<string, KPIMin[]>();
      for (const kpi of kpiRes.data ?? []) {
        if (kpi.flag_threshold === null || kpi.flag_threshold === undefined) continue;
        if (kpi.flag_independent === false) continue;
        if (!kpisByCampaign.has(kpi.campaign_id)) kpisByCampaign.set(kpi.campaign_id, []);
        kpisByCampaign.get(kpi.campaign_id)!.push({
          field_name: kpi.field_name,
          flag_threshold: Number(kpi.flag_threshold),
        });
      }

      // 4. Aggregate per member
      const summaries: TeamEODSummary[] = members.map((m) => {
        const myLogs = eodLogs.filter((l) => l.employee_id === m.id);
        const metricsTotals: Record<string, number> = {};

        for (const log of myLogs) {
          if (log.metrics && typeof log.metrics === "object") {
            for (const [key, val] of Object.entries(log.metrics)) {
              const num = typeof val === "number" ? val : parseFloat(String(val));
              if (!isNaN(num)) {
                metricsTotals[key] = (metricsTotals[key] ?? 0) + num;
              }
            }
          }
        }

        // Flag if daily average is below flag_threshold on ANY tracked KPI.
        // Only count days where the agent actually submitted a value for that
        // field — old submissions that predate a field being added show null
        // and must not be treated as zero.
        let isBottomPerformer = false;
        if (m.campaign_id && myLogs.length > 0) {
          const kpis = kpisByCampaign.get(m.campaign_id) ?? [];
          isBottomPerformer = kpis.some((kpi) => {
            // Count only logs that actually contain this field
            let sum = 0;
            let count = 0;
            for (const log of myLogs) {
              const raw = (log.metrics as Record<string, unknown> | null)?.[kpi.field_name];
              if (raw !== undefined && raw !== null) {
                const n = typeof raw === "number" ? raw : parseFloat(String(raw));
                if (!isNaN(n)) { sum += n; count++; }
              }
            }
            if (count === 0) return false; // no data for this field — don't flag
            return (sum / count) < kpi.flag_threshold;
          });
        }

        return {
          employeeId: m.id,
          fullName: m.full_name,
          workName: m.work_name,
          submissions: myLogs.length,
          metrics: metricsTotals,
          isTopPerformer: false,
          isBottomPerformer,
        };
      });

      return { summaries, kpiFields };
    },
    enabled: !!tlEmployeeId,
  });
}

/* ================================================================== */
/*  Hook 5 – useUnderperformerAlerts                                   */
/* ================================================================== */

export interface UnderperformerAlert {
  employeeId: string;
  fullName: string;
  workName: string | null;
  reason: string;
}

export function useUnderperformerAlerts(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["team-underperformer-alerts", tlEmployeeId],
    queryFn: async (): Promise<UnderperformerAlert[]> => {
      if (!tlEmployeeId) return [];

      // 1. Team roster (union helper) with campaign_id
      const teamIds = await fetchMyTeamMemberIds();
      if (teamIds.length === 0) return [];
      const { data: roster, error: rosterErr } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name, campaign_id")
        .in("id", teamIds)
        .eq("is_active", true);
      if (rosterErr) throw rosterErr;
      const members = (roster || []) as { id: string; full_name: string; work_name: string | null; campaign_id: string | null }[];
      if (members.length === 0) return [];

      const memberIds = members.map((m) => m.id);

      // 2. Shift settings for team campaigns
      const campaignIds = [...new Set(members.map((m) => m.campaign_id).filter(Boolean))] as string[];
      const shiftMap = new Map<string, ShiftSettings>();
      if (campaignIds.length > 0) {
        const { data: shifts, error: shiftErr } = await supabase
          .from("shift_settings")
          .select("id, campaign_id, shift_name, start_time, end_time, grace_minutes, days_of_week")
          .in("campaign_id", campaignIds);
        if (shiftErr) throw shiftErr;
        for (const s of (shifts || []) as ShiftSettings[]) {
          shiftMap.set(s.campaign_id, s);
        }
      }

      // Date range: last 14 calendar days
      const todayDate = new Date(todayLocal() + "T00:00:00");
      const fourteenAgo = new Date(todayDate);
      fourteenAgo.setDate(todayDate.getDate() - 14);
      const fromStr = fmtDate(fourteenAgo);
      const toStr = todayLocal();

      // 3. EOD logs in last 14 days
      const { data: eodData, error: eodErr } = await supabase
        .from("eod_logs")
        .select("id, employee_id, date")
        .in("employee_id", memberIds)
        .gte("date", fromStr)
        .lte("date", toStr);
      if (eodErr) throw eodErr;
      const eodLogs = (eodData || []) as { id: string; employee_id: string; date: string }[];

      // 4. Late clock-ins in last 14 days
      const { data: lateData, error: lateErr } = await supabase
        .from("time_clock")
        .select("id, employee_id")
        .in("employee_id", memberIds)
        .eq("is_late", true)
        .gte("date", fromStr)
        .lte("date", toStr);
      if (lateErr) throw lateErr;
      const lateRows = (lateData || []) as { id: string; employee_id: string }[];

      // Count lates per employee
      const lateCountMap = new Map<string, number>();
      for (const row of lateRows) {
        lateCountMap.set(row.employee_id, (lateCountMap.get(row.employee_id) ?? 0) + 1);
      }

      // Count EOD submissions per employee
      const eodCountMap = new Map<string, number>();
      for (const log of eodLogs) {
        eodCountMap.set(log.employee_id, (eodCountMap.get(log.employee_id) ?? 0) + 1);
      }

      const alerts: UnderperformerAlert[] = [];

      for (const m of members) {
        // Count scheduled workdays in the last 14 calendar days
        const shift = m.campaign_id ? shiftMap.get(m.campaign_id) : undefined;
        const daysOfWeek = shift?.days_of_week ?? [1, 2, 3, 4, 5]; // default Mon-Fri
        let scheduledWorkdays = 0;
        for (let d = new Date(fourteenAgo); d <= todayDate; d.setDate(d.getDate() + 1)) {
          if (daysOfWeek.includes(d.getDay())) scheduledWorkdays++;
        }

        const eodCount = eodCountMap.get(m.id) ?? 0;
        if (scheduledWorkdays - eodCount > 2) {
          alerts.push({
            employeeId: m.id,
            fullName: m.full_name,
            workName: m.work_name,
            reason: "Missed EOD",
          });
        }

        const lateCount = lateCountMap.get(m.id) ?? 0;
        if (lateCount > 3) {
          alerts.push({
            employeeId: m.id,
            fullName: m.full_name,
            workName: m.work_name,
            reason: "Frequently late",
          });
        }
      }

      return alerts;
    },
    enabled: !!tlEmployeeId,
  });
}

/* ================================================================== */
/*  Hook 6 – useTLCampaigns                                           */
/*  Campaigns where this employee is the team_lead_id.                 */
/* ================================================================== */

export interface TLCampaign {
  id: string;
  name: string;
  eod_digest_cutoff_time: string | null;
  eod_digest_timezone: string;
}

export function useTLCampaigns(employeeId: string | null) {
  return useQuery({
    queryKey: ["tl-campaigns", employeeId],
    queryFn: async (): Promise<TLCampaign[]> => {
      if (!employeeId) return [];

      // Two sources of TL→campaign linkage:
      //   1. campaigns.team_lead_id  — single "primary" TL per campaign (legacy)
      //   2. team_lead_campaigns     — many-to-many join table (added 2026-05-18)
      // We union both, dedupe by campaign id, and sort by name.
      const [primaryRes, joinRes] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, eod_digest_cutoff_time, eod_digest_timezone")
          .eq("team_lead_id", employeeId),
        supabase
          .from("team_lead_campaigns")
          .select("campaign:campaigns(id, name, eod_digest_cutoff_time, eod_digest_timezone)")
          .eq("team_lead_id", employeeId),
      ]);
      if (primaryRes.error) throw primaryRes.error;
      if (joinRes.error) throw joinRes.error;

      const primary = (primaryRes.data ?? []) as TLCampaign[];
      const fromJoin = ((joinRes.data ?? []) as { campaign: TLCampaign | null }[])
        .map((r) => r.campaign)
        .filter((c): c is TLCampaign => c !== null);

      const byId = new Map<string, TLCampaign>();
      for (const c of [...primary, ...fromJoin]) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }
      return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!employeeId,
  });
}

/* ================================================================== */
/*  Hook 7 – useTodaysTLNote                                           */
/*  Read today's TL note for a campaign.                               */
/* ================================================================== */

export interface TLNoteRow {
  id: string;
  campaign_id: string;
  date: string;
  note: string | null;
  written_by: string | null;
  updated_at: string;
}

export function useTodaysTLNote(campaignId: string | null) {
  const today = todayLocal();
  return useQuery({
    queryKey: ["tl-note-today", campaignId, today],
    queryFn: async (): Promise<TLNoteRow | null> => {
      if (!campaignId) return null;
      const { data, error } = await supabase
        .from("campaign_eod_tl_notes")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data as TLNoteRow | null;
    },
    enabled: !!campaignId,
  });
}

/* ================================================================== */
/*  Hook 8 – useSaveTLNote                                             */
/*  Upsert today's TL note for a campaign.                             */
/* ================================================================== */

export function useSaveTLNote() {
  const queryClient = useQueryClient();
  const today = todayLocal();

  return useMutation({
    mutationFn: async ({
      campaignId,
      note,
      writtenBy,
    }: {
      campaignId: string;
      note: string;
      writtenBy: string;
    }) => {
      const { error } = await supabase
        .from("campaign_eod_tl_notes")
        .upsert(
          {
            campaign_id: campaignId,
            date: today,
            note,
            written_by: writtenBy,
          },
          { onConflict: "campaign_id,date" }
        );
      if (error) throw error;
    },
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({
        queryKey: ["tl-note-today", campaignId, today],
      });
    },
  });
}

/* ================================================================== */
/*  Hook 10 – useAgentBreakdown                                        */
/*  Week + month daily EOD detail for an individual agent.             */
/* ================================================================== */

export interface AgentBreakdownDay {
  date: string;        // YYYY-MM-DD
  isCurrentWeek: boolean;
  metrics: Record<string, number | string | boolean | null>;
  notes: string | null;
}

export interface AgentBreakdownData {
  employeeId: string;
  fullName: string;
  workName: string | null;
  campaignName: string;
  kpiFields: { field_name: string; field_label: string; field_type: string; min_target: number | null }[];
  days: AgentBreakdownDay[]; // last 30 days, newest first
}

export function useAgentBreakdown(employeeId: string | null, campaignId: string | null) {
  return useQuery({
    queryKey: ["agent-breakdown", employeeId, campaignId],
    queryFn: async (): Promise<AgentBreakdownData | null> => {
      if (!employeeId || !campaignId) return null;

      const todayDate = new Date(todayLocal() + "T00:00:00");
      const monday = new Date(todayDate);
      monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7));
      const mondayStr = fmtDate(monday);

      const startDate = new Date(todayDate);
      startDate.setDate(todayDate.getDate() - 29); // 30 days inclusive

      const [empRes, kpiRes, logRes] = await Promise.all([
        supabase
          .from("employees_no_pay")
          .select("id, full_name, work_name, campaign_id")
          .eq("id", employeeId)
          .single(),
        supabase
          .from("campaign_kpi_config")
          .select("field_name, field_label, field_type, min_target, display_order")
          .eq("campaign_id", campaignId)
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("eod_logs")
          .select("date, metrics, notes")
          .eq("employee_id", employeeId)
          .gte("date", fmtDate(startDate))
          .lte("date", todayLocal())
          .order("date", { ascending: false }),
      ]);

      if (empRes.error) throw empRes.error;
      if (kpiRes.error) throw kpiRes.error;
      if (logRes.error) throw logRes.error;

      const emp = empRes.data as { id: string; full_name: string; work_name: string | null; campaign_id: string } | null;

      // Campaign name
      let campaignName = "";
      if (campaignId) {
        const { data: camp } = await supabase
          .from("campaigns")
          .select("name")
          .eq("id", campaignId)
          .single();
        campaignName = camp?.name ?? "";
      }

      const kpiFields = (kpiRes.data ?? []).map((k) => ({
        field_name: k.field_name,
        field_label: k.field_label,
        field_type: k.field_type,
        min_target: k.min_target !== null ? Number(k.min_target) : null,
      }));

      type LogRow = { date: string; metrics: unknown; notes: string | null };
      const days: AgentBreakdownDay[] = (logRes.data ?? [] as LogRow[]).map((log) => {
        const rawMetrics = (log.metrics as Record<string, unknown>) ?? {};
        const metrics: Record<string, number | string | boolean | null> = {};
        for (const kpi of kpiFields) {
          const raw = rawMetrics[kpi.field_name];
          if (raw === undefined || raw === null) {
            metrics[kpi.field_name] = null;
          } else if (kpi.field_type === "number") {
            const n = typeof raw === "number" ? raw : parseFloat(String(raw));
            metrics[kpi.field_name] = isNaN(n) ? null : n;
          } else {
            metrics[kpi.field_name] = String(raw);
          }
        }
        return {
          date: log.date,
          isCurrentWeek: log.date >= mondayStr,
          metrics,
          notes: log.notes as string | null,
        };
      });

      return {
        employeeId,
        fullName: emp?.full_name ?? "",
        workName: emp?.work_name ?? null,
        campaignName,
        kpiFields,
        days,
      };
    },
    enabled: !!employeeId && !!campaignId,
  });
}

/* ================================================================== */
/*  Hook 12 – useUnderperformerTrend                                   */
/*  4-week daily KPI trend for agents below campaign min_target.       */
/* ================================================================== */

export interface AgentTrendDay {
  date: string;        // YYYY-MM-DD
  value: number | null; // null = no submission that day
  belowTarget: boolean;
  notes: string | null; // agent's EOD notes that day
}

export interface KPITrend {
  fieldName: string;
  fieldLabel: string;
  minTarget: number;
  days: AgentTrendDay[]; // 28 entries, oldest → newest
  daysBelow: number;
  daysSubmitted: number;
}

export interface AgentUnderperformerTrend {
  employeeId: string;
  fullName: string;
  workName: string | null;
  campaignName: string;
  kpis: KPITrend[];
  totalDaysBelow: number; // across all KPI fields
  recentBelowNotes: { date: string; note: string }[]; // up to 5, most recent first
}

export function useUnderperformerTrend(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["team-underperformer-trend", tlEmployeeId],
    queryFn: async (): Promise<AgentUnderperformerTrend[]> => {
      if (!tlEmployeeId) return [];

      // 1. Team roster (union helper)
      const teamIds = await fetchMyTeamMemberIds();
      if (teamIds.length === 0) return [];
      const { data: roster, error: rosterErr } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name, campaign_id")
        .in("id", teamIds)
        .eq("is_active", true);
      if (rosterErr) throw rosterErr;
      const members = (roster ?? []) as { id: string; full_name: string; work_name: string | null; campaign_id: string | null }[];
      if (members.length === 0) return [];

      const campaignIds = [
        ...new Set(members.map((m) => m.campaign_id).filter(Boolean)),
      ] as string[];
      if (campaignIds.length === 0) return [];

      // 2. Campaign names + KPI configs (number fields with min_target set)
      const [campaignRes, kpiRes] = await Promise.all([
        supabase.from("campaigns").select("id, name").in("id", campaignIds),
        supabase
          .from("campaign_kpi_config")
          .select("campaign_id, field_name, field_label, min_target, display_order")
          .in("campaign_id", campaignIds)
          .eq("field_type", "number")
          .eq("is_active", true)
          .not("min_target", "is", null)
          .order("display_order"),
      ]);
      if (campaignRes.error) throw campaignRes.error;
      if (kpiRes.error) throw kpiRes.error;

      const campaignNameMap = new Map(
        (campaignRes.data ?? []).map((c) => [c.id, c.name])
      );

      type KPIConfig = {
        field_name: string;
        field_label: string;
        min_target: number;
        display_order: number;
      };
      const kpisByCampaign = new Map<string, KPIConfig[]>();
      for (const kpi of kpiRes.data ?? []) {
        if (!kpisByCampaign.has(kpi.campaign_id))
          kpisByCampaign.set(kpi.campaign_id, []);
        kpisByCampaign.get(kpi.campaign_id)!.push({
          field_name: kpi.field_name,
          field_label: kpi.field_label,
          min_target: Number(kpi.min_target),
          display_order: kpi.display_order ?? 0,
        });
      }

      // 3. Last 28 days of EOD logs
      const todayDate = new Date(todayLocal() + "T00:00:00");
      const startDate = new Date(todayDate);
      startDate.setDate(todayDate.getDate() - 27); // 28 days inclusive

      const memberIds = members.map((m) => m.id);
      const { data: logs, error: logErr } = await supabase
        .from("eod_logs")
        .select("employee_id, date, metrics, notes")
        .in("employee_id", memberIds)
        .gte("date", fmtDate(startDate))
        .lte("date", todayLocal());
      if (logErr) throw logErr;

      type LogRow = {
        employee_id: string;
        date: string;
        metrics: unknown;
        notes: string | null;
      };
      const logIndex = new Map<string, LogRow>();
      for (const log of (logs ?? []) as LogRow[]) {
        logIndex.set(`${log.employee_id}__${log.date}`, log);
      }

      // Build 28-day date array, oldest first
      const dateRange: string[] = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date(todayDate);
        d.setDate(todayDate.getDate() - i);
        dateRange.push(fmtDate(d));
      }

      // 4. Build per-agent trends
      const trends: AgentUnderperformerTrend[] = [];

      for (const m of members) {
        const campaignKpis = m.campaign_id
          ? kpisByCampaign.get(m.campaign_id)
          : undefined;
        if (!campaignKpis || campaignKpis.length === 0) continue;

        const kpiTrends: KPITrend[] = [];
        let totalDaysBelow = 0;
        const belowNotesByDate = new Map<string, string>();

        for (const kpi of campaignKpis) {
          const days: AgentTrendDay[] = dateRange.map((date) => {
            const log = logIndex.get(`${m.id}__${date}`);
            if (!log) return { date, value: null, belowTarget: false, notes: null };

            const metrics = (log.metrics as Record<string, unknown>) ?? {};
            const rawVal = metrics[kpi.field_name];
            let value: number | null = null;
            if (rawVal !== undefined && rawVal !== null) {
              const parsed =
                typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
              if (!isNaN(parsed)) value = parsed;
            }

            const belowTarget = value !== null && value < kpi.min_target;
            if (belowTarget && log.notes) {
              belowNotesByDate.set(date, log.notes as string);
            }
            return {
              date,
              value,
              belowTarget,
              notes: log.notes as string | null,
            };
          });

          const daysBelow = days.filter((d) => d.value !== null && d.belowTarget).length;
          const daysSubmitted = days.filter((d) => d.value !== null).length;
          totalDaysBelow += daysBelow;

          kpiTrends.push({
            fieldName: kpi.field_name,
            fieldLabel: kpi.field_label,
            minTarget: kpi.min_target,
            days,
            daysBelow,
            daysSubmitted,
          });
        }

        // Only include agents with 3+ below-target days (across any KPI)
        if (totalDaysBelow < 3) continue;

        const recentBelowNotes = [...belowNotesByDate.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, 5)
          .map(([date, note]) => ({ date, note }));

        trends.push({
          employeeId: m.id,
          fullName: m.full_name,
          workName: m.work_name,
          campaignName: m.campaign_id
            ? (campaignNameMap.get(m.campaign_id) ?? "")
            : "",
          kpis: kpiTrends,
          totalDaysBelow,
          recentBelowNotes,
        });
      }

      // Worst performers first
      trends.sort((a, b) => b.totalDaysBelow - a.totalDaysBelow);
      return trends;
    },
    enabled: !!tlEmployeeId,
  });
}

/* ================================================================== */
/*  Hook 9 – useEODProgress                                            */
/*  How many active agents have submitted today's EOD for a campaign.  */
/* ================================================================== */

export interface EODProgress {
  submitted: number;
  total: number;
}

export function useEODProgress(campaignId: string | null) {
  const today = todayLocal();
  return useQuery({
    queryKey: ["eod-progress", campaignId, today],
    queryFn: async (): Promise<EODProgress> => {
      if (!campaignId) return { submitted: 0, total: 0 };

      // Active employees on this campaign
      const { data: roster, error: rosterErr } = await supabase
        .from("employees_no_pay")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("is_active", true);
      if (rosterErr) throw rosterErr;
      const total = roster?.length ?? 0;
      if (total === 0) return { submitted: 0, total: 0 };

      const memberIds = roster!.map((r) => r.id);

      // Distinct employees who submitted today's EOD
      const { data: logs, error: logErr } = await supabase
        .from("eod_logs")
        .select("employee_id")
        .in("employee_id", memberIds)
        .eq("date", today);
      if (logErr) throw logErr;

      const distinctIds = new Set((logs ?? []).map((l) => l.employee_id));
      return { submitted: distinctIds.size, total };
    },
    enabled: !!campaignId,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/* ================================================================== */
/*  Hook – useMissingYesterdayEod                                      */
/*  Agents who clocked in yesterday but didn't submit an EOD log.      */
/*  Used by Today's Roster to surface a "Missing yesterday's EOD"      */
/*  amber strip with a Submit-for-agent button per agent.              */
/* ================================================================== */

export interface MissingYesterdayAgent {
  employeeId: string;
  fullName: string;
  workName: string | null;
  campaignId: string | null;
}

export function useMissingYesterdayEod(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["team-missing-yesterday-eod", tlEmployeeId],
    queryFn: async (): Promise<MissingYesterdayAgent[]> => {
      if (!tlEmployeeId) return [];

      // Compute yesterday's local date
      const yesterdayDt = new Date();
      yesterdayDt.setDate(yesterdayDt.getDate() - 1);
      const yesterday = todayLocal(yesterdayDt);

      // 1. Team roster (union helper — active members across reports_to + campaigns I lead)
      const teamIds = await fetchMyTeamMemberIds();
      if (teamIds.length === 0) return [];
      const { data: roster, error: rosterErr } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name, campaign_id")
        .in("id", teamIds)
        .eq("is_active", true);
      if (rosterErr) throw rosterErr;
      const members = (roster || []) as {
        id: string;
        full_name: string;
        work_name: string | null;
        campaign_id: string | null;
      }[];
      if (members.length === 0) return [];
      const memberIds = members.map((m) => m.id);

      // 2. Yesterday's time_clock entries (clocked in)
      const { data: tcRows, error: tcErr } = await supabase
        .from("time_clock")
        .select("employee_id")
        .in("employee_id", memberIds)
        .eq("date", yesterday);
      if (tcErr) throw tcErr;
      const clockedYesterday = new Set(
        (tcRows || []).map((r) => r.employee_id as string)
      );
      if (clockedYesterday.size === 0) return [];

      // 3. Yesterday's eod_logs entries (submitted EOD)
      const { data: eodRows, error: eodErr } = await supabase
        .from("eod_logs")
        .select("employee_id")
        .in("employee_id", [...clockedYesterday])
        .eq("date", yesterday);
      if (eodErr) throw eodErr;
      const submittedYesterday = new Set(
        (eodRows || []).map((r) => r.employee_id as string)
      );

      // 4. Diff — clocked in yesterday but no EOD
      return members
        .filter((m) => clockedYesterday.has(m.id) && !submittedYesterday.has(m.id))
        .map((m) => ({
          employeeId: m.id,
          fullName: m.full_name,
          workName: m.work_name,
          campaignId: m.campaign_id,
        }));
    },
    enabled: !!tlEmployeeId,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/* ================================================================== */
/*  Hook – useTodayNudges + useCreateNudge                             */
/*  Light audit log: which agents has the TL reached out to today?     */
/*  No notification side-effect — just records that contact was made.  */
/* ================================================================== */

export interface NudgeRow {
  employee_id: string;
  nudged_at: string;
  nudged_by: string;
}

export function useTodayNudges(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["team-nudges-today", tlEmployeeId],
    queryFn: async (): Promise<Map<string, NudgeRow>> => {
      if (!tlEmployeeId) return new Map();
      const today = todayLocal();

      // 1. Team member IDs (union helper — only nudges for THIS TL's team)
      const teamIds = await fetchMyTeamMemberIds();
      if (teamIds.length === 0) return new Map();
      const { data: roster, error: rosterErr } = await supabase
        .from("employees_no_pay")
        .select("id")
        .in("id", teamIds)
        .eq("is_active", true);
      if (rosterErr) throw rosterErr;
      const memberIds = (roster || []).map((r) => r.id as string);
      if (memberIds.length === 0) return new Map();

      // 2. Today's nudges for those agents
      const { data: rows, error } = await supabase
        .from("tl_nudges")
        .select("employee_id, nudged_at, nudged_by")
        .in("employee_id", memberIds)
        .eq("date", today);
      if (error) throw error;

      // Map by employee_id for O(1) lookup in the UI
      const map = new Map<string, NudgeRow>();
      for (const r of (rows || []) as NudgeRow[]) {
        map.set(r.employee_id, r);
      }
      return map;
    },
    enabled: !!tlEmployeeId,
  });
}

export function useCreateNudge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      employeeId,
      tlEmployeeId,
    }: {
      employeeId: string;
      tlEmployeeId: string;
    }) => {
      const today = todayLocal();
      // Upsert so re-nudging the same agent same day updates timestamp,
      // not errors on the PK.
      const { error } = await supabase
        .from("tl_nudges")
        .upsert(
          {
            employee_id: employeeId,
            date: today,
            nudged_by: tlEmployeeId,
            nudged_at: new Date().toISOString(),
          },
          { onConflict: "employee_id,date" }
        );
      if (error) throw error;
    },
    onSuccess: (_data, { tlEmployeeId }) => {
      queryClient.invalidateQueries({ queryKey: ["team-nudges-today", tlEmployeeId] });
    },
  });
}
