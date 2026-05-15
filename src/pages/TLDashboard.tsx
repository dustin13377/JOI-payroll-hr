import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { todayLocal } from "@/lib/localDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Users, AlertCircle, TrendingUp, Calendar, MessageSquarePlus, Loader2, FileWarning, StickyNote,
} from "lucide-react";
import { getDisplayName } from "@/lib/displayName";
import { formatDateMX } from "@/lib/localDate";

// ---------------------------------------------------------------------------
// Timezone helpers (same pattern as edge function)
// ---------------------------------------------------------------------------
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - days);
  return todayLocal(dt);
}
function mondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=Sun
  dt.setDate(dt.getDate() - ((day + 6) % 7));
  return todayLocal(dt);
}
function daysRange(from: string, to: string): string[] {
  const result: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const cur = new Date(fy, fm - 1, fd);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = new Date(ty, tm - 1, td);
  while (cur <= end) {
    result.push(todayLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface KPIField {
  field_name: string;
  field_label: string;
  field_type: string;
  min_target: number | null;
  display_order: number;
}

interface Agent {
  id: string;
  full_name: string;
  work_name: string | null;
}

interface EODLog {
  employee_id: string;
  date: string;
  metrics: Record<string, unknown> | null;
}

interface CoachingNote {
  id: string;
  agent_id: string;
  author_id: string;
  entry_type: "note" | "verbal_warning";
  note: string;
  created_at: string;
  author: { full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TLDashboard() {
  const { employeeId, isLeadership } = useAuth();
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [noteAgent, setNoteAgent] = useState<Agent | null>(null);
  const [noteText, setNoteText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // --- Campaign list ---
  const { data: campaigns = [] } = useQuery({
    queryKey: ["tl-dash-campaigns", employeeId, isLeadership],
    queryFn: async () => {
      if (isLeadership) {
        const { data, error } = await supabase
          .from("campaigns").select("id, name, eod_digest_timezone").order("name");
        if (error) throw error;
        return data as { id: string; name: string; eod_digest_timezone: string }[];
      }
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("campaigns").select("id, name, eod_digest_timezone")
        .eq("team_lead_id", employeeId).order("name");
      if (error) throw error;
      return data as { id: string; name: string; eod_digest_timezone: string }[];
    },
    enabled: !!employeeId || isLeadership,
  });

  const activeCampaignId = campaignId ?? campaigns[0]?.id ?? null;
  const campaignTz = campaigns.find((c) => c.id === activeCampaignId)?.eod_digest_timezone || "America/Denver";
  const today = todayInTz(campaignTz);
  const yesterday = subtractDays(today, 1);
  const weekStart = mondayOfWeek(today);
  const weekEnd = today; // current week up to today
  const sevenDaysAgo = subtractDays(today, 6);
  const twentyEightDaysAgo = subtractDays(today, 27);
  const monthStart = today.slice(0, 8) + "01";

  // --- Active agents on this campaign ---
  const { data: agents = [] } = useQuery({
    queryKey: ["tl-dash-agents", activeCampaignId],
    queryFn: async () => {
      if (!activeCampaignId) return [];
      const { data, error } = await supabase.from("employees_no_pay")
        .select("id, full_name, work_name").eq("campaign_id", activeCampaignId).eq("is_active", true).order("full_name");
      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!activeCampaignId,
  });

  // --- KPI fields ---
  const { data: kpiFields = [] } = useQuery({
    queryKey: ["tl-dash-kpi", activeCampaignId],
    queryFn: async () => {
      if (!activeCampaignId) return [];
      const { data, error } = await supabase.from("campaign_kpi_config")
        .select("field_name, field_label, field_type, min_target, display_order")
        .eq("campaign_id", activeCampaignId).eq("is_active", true).order("display_order");
      if (error) throw error;
      return data as KPIField[];
    },
    enabled: !!activeCampaignId,
  });
  const numericKpis = useMemo(() => kpiFields.filter((f) => f.field_type === "number"), [kpiFields]);

  // --- EOD logs for last 28 days (covers all widgets) ---
  const { data: eodLogs = [] } = useQuery({
    queryKey: ["tl-dash-eod", activeCampaignId, twentyEightDaysAgo],
    queryFn: async () => {
      if (!activeCampaignId) return [];
      const { data, error } = await supabase.from("eod_logs")
        .select("employee_id, date, metrics")
        .eq("campaign_id", activeCampaignId)
        .gte("date", twentyEightDaysAgo)
        .lte("date", today);
      if (error) throw error;
      return data as EODLog[];
    },
    enabled: !!activeCampaignId,
  });

  // --- Early-release time_clock rows for today (agents who left early after
  //     self-reporting they hit metrics) ---
  const agentIdsList = useMemo(() => agents.map((a) => a.id), [agents]);
  const { data: earlyReleaseToday = [] } = useQuery({
    queryKey: ["tl-dash-early-release", activeCampaignId, today, agentIdsList.join(",")],
    queryFn: async () => {
      if (!activeCampaignId || agentIdsList.length === 0) return [];
      const { data, error } = await supabase
        .from("time_clock")
        .select("id, employee_id, clock_in, clock_out")
        .eq("date", today)
        .eq("early_release", true)
        .in("employee_id", agentIdsList);
      if (error) throw error;
      return (data ?? []) as { id: string; employee_id: string; clock_in: string; clock_out: string | null }[];
    },
    enabled: !!activeCampaignId && agentIdsList.length > 0,
    refetchInterval: 60000, // refresh every minute so it appears in near-real-time
  });

  // --- Coaching notes ---
  const { data: coachingNotes = [] } = useQuery({
    queryKey: ["tl-dash-coaching", activeCampaignId],
    queryFn: async () => {
      if (!activeCampaignId) return [];
      const { data, error } = await supabase.from("agent_coaching_notes")
        .select("id, agent_id, author_id, entry_type, note, created_at, author:author_id(full_name)")
        .eq("campaign_id", activeCampaignId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as CoachingNote[];
    },
    enabled: !!activeCampaignId,
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      if (!noteAgent || !employeeId || !activeCampaignId) throw new Error("Missing context");
      const { error } = await supabase.from("agent_coaching_notes").insert({
        agent_id: noteAgent.id,
        author_id: employeeId,
        campaign_id: activeCampaignId,
        note: noteText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteAgent(null);
      setNoteText("");
      toast({ title: "Coaching note added" });
      queryClient.invalidateQueries({ queryKey: ["tl-dash-coaching"] });
    },
  });

  // --- Derived data ---
  const logsByDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    eodLogs.forEach((l) => {
      if (!map.has(l.date)) map.set(l.date, new Set());
      map.get(l.date)!.add(l.employee_id);
    });
    return map;
  }, [eodLogs]);

  const logsByAgentDate = useMemo(() => {
    const map = new Map<string, EODLog>();
    eodLogs.forEach((l) => map.set(`${l.employee_id}|${l.date}`, l));
    return map;
  }, [eodLogs]);

  // =========================================================================
  // Widget 1: Daily bars (last 7 days)
  // =========================================================================
  const dailyBarsData = useMemo(() => {
    const days = daysRange(sevenDaysAgo, today);
    return days.map((d) => {
      const submitted = logsByDate.get(d)?.size ?? 0;
      const total = agents.length;
      const pct = total > 0 ? submitted / total : 0;
      return {
        day: new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }),
        submitted,
        total,
        fill: pct >= 1 ? "#22c55e" : pct >= 0.5 ? "#eab308" : "#ef4444",
      };
    });
  }, [sevenDaysAgo, today, logsByDate, agents.length]);

  // =========================================================================
  // Widget 2: Per-agent leaderboard (current week)
  // =========================================================================
  const leaderboardData = useMemo(() => {
    const weekDays = daysRange(weekStart, weekEnd);
    return agents.map((a) => {
      const sums: Record<string, number> = {};
      numericKpis.forEach((k) => { sums[k.field_name] = 0; });
      weekDays.forEach((d) => {
        const log = logsByAgentDate.get(`${a.id}|${d}`);
        if (!log?.metrics) return;
        numericKpis.forEach((k) => {
          const v = log.metrics![k.field_name];
          if (typeof v === "number") sums[k.field_name] += v;
        });
      });
      return { agent: a, sums };
    });
  }, [agents, numericKpis, weekStart, weekEnd, logsByAgentDate]);

  const sortedLeaderboard = useMemo(() => {
    if (!sortCol) return leaderboardData;
    return [...leaderboardData].sort((a, b) => {
      const va = a.sums[sortCol] ?? 0;
      const vb = b.sums[sortCol] ?? 0;
      return sortAsc ? va - vb : vb - va;
    });
  }, [leaderboardData, sortCol, sortAsc]);

  const handleSort = (col: string) => {
    if (sortCol === col) { setSortAsc(!sortAsc); } else { setSortCol(col); setSortAsc(false); }
  };

  // =========================================================================
  // Widget 3: Missing-submission counter (yesterday)
  // =========================================================================
  const missingYesterday = useMemo(() => {
    const submittedYesterday = logsByDate.get(yesterday) ?? new Set();
    return agents.filter((a) => !submittedYesterday.has(a.id));
  }, [agents, logsByDate, yesterday]);

  // =========================================================================
  // Widget 4: 4-week sparklines
  // =========================================================================
  const sparklineData = useMemo(() => {
    const days28 = daysRange(twentyEightDaysAgo, today);
    return agents.map((a) => {
      const series = numericKpis.map((kpi) => ({
        kpi,
        points: days28.map((d) => {
          const log = logsByAgentDate.get(`${a.id}|${d}`);
          const v = log?.metrics?.[kpi.field_name];
          return { day: d, value: typeof v === "number" ? v : null };
        }),
      }));
      return { agent: a, series };
    });
  }, [agents, numericKpis, twentyEightDaysAgo, today, logsByAgentDate]);

  // =========================================================================
  // Widget 5: Monthly heatmap
  // =========================================================================
  const heatmapDays = useMemo(() => daysRange(monthStart, today), [monthStart, today]);
  const daysInMonth = new Date(
    parseInt(today.slice(0, 4)), parseInt(today.slice(5, 7)), 0
  ).getDate();
  const futureDays = useMemo(() => {
    const result: string[] = [];
    const nextDay = subtractDays(today, -1);
    const endOfMonth = today.slice(0, 8) + String(daysInMonth).padStart(2, "0");
    if (nextDay <= endOfMonth) {
      return daysRange(nextDay, endOfMonth);
    }
    return result;
  }, [today, daysInMonth]);

  const heatmapStatus = useMemo(() => {
    const map = new Map<string, "green" | "yellow" | "red">();
    agents.forEach((a) => {
      [...heatmapDays].forEach((d) => {
        const log = logsByAgentDate.get(`${a.id}|${d}`);
        if (!log) { map.set(`${a.id}|${d}`, "red"); return; }
        const belowTarget = numericKpis.some((kpi) => {
          if (kpi.min_target === null) return false;
          const v = log.metrics?.[kpi.field_name];
          return typeof v === "number" && v < kpi.min_target;
        });
        map.set(`${a.id}|${d}`, belowTarget ? "yellow" : "green");
      });
    });
    return map;
  }, [agents, heatmapDays, logsByAgentDate, numericKpis]);

  // =========================================================================
  // Render
  // =========================================================================
  if (!activeCampaignId && campaigns.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Team Dashboard</h1>
        <Card><CardContent className="py-8 text-center text-muted-foreground">No campaigns found.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + campaign selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Team Dashboard</h1>
        <Select value={activeCampaignId ?? ""} onValueChange={setCampaignId}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select campaign" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Widget row 1: Daily bars + Missing counter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Widget 1: Daily bars */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Daily Submissions (Last 7 Days)</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={dailyBarsData} layout="vertical" margin={{ left: 60 }}>
                  <XAxis type="number" domain={[0, agents.length || 1]} allowDecimals={false} />
                  <YAxis type="category" dataKey="day" width={70} fontSize={12} />
                  <RechartsTooltip formatter={(v: number, _n: string, p: { payload: { total: number } }) => [`${v} / ${p.payload.total}`, "Submitted"]} />
                  <Bar dataKey="submitted" radius={[0, 4, 4, 0]}>
                    {dailyBarsData.map((entry, i) => (
                      <rect key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Widget 3: Missing counter */}
        <Card className={missingYesterday.length > 0 ? "border-red-200" : ""}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5" />Missing Yesterday</CardTitle></CardHeader>
          <CardContent>
            {missingYesterday.length === 0 ? (
              <p className="text-emerald-600 font-medium">All agents submitted yesterday.</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-red-600 mb-2">{missingYesterday.length} agent{missingYesterday.length !== 1 ? "s" : ""}</p>
                <ul className="space-y-1">
                  {missingYesterday.map((a) => (
                    <li key={a.id} className="text-sm text-muted-foreground">{getDisplayName(a)}</li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Early Release Today — only renders when someone has left early.
          Read-only visibility for TLs; client report later confirms the claim. */}
      {earlyReleaseToday.length > 0 && (
        <Card className="border-emerald-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Left Early Today ({earlyReleaseToday.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Agents who self-reported hitting metrics. Their EOD is queued and will go out with the team's digest at end of day.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Clocked In</TableHead>
                  <TableHead>Clocked Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earlyReleaseToday.map((row) => {
                  const agent = agents.find((a) => a.id === row.employee_id);
                  const fmt = (iso: string | null) =>
                    iso
                      ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
                      : "—";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{agent ? getDisplayName(agent) : row.employee_id}</TableCell>
                      <TableCell>{fmt(row.clock_in)}</TableCell>
                      <TableCell>{fmt(row.clock_out)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Widget 2: Leaderboard */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Weekly Leaderboard (Mon–Today)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  {numericKpis.map((k) => (
                    <TableHead
                      key={k.field_name}
                      className="text-center cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort(k.field_name)}
                    >
                      {k.field_label}
                      {sortCol === k.field_name && (sortAsc ? " ↑" : " ↓")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLeaderboard.map(({ agent, sums }) => {
                  const weekDayCount = daysRange(weekStart, weekEnd).length;
                  return (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{getDisplayName(agent)}</TableCell>
                      {numericKpis.map((k) => {
                        const val = sums[k.field_name] ?? 0;
                        const weekTarget = k.min_target !== null ? k.min_target * weekDayCount : null;
                        const below = weekTarget !== null && val < weekTarget;
                        return (
                          <TableCell key={k.field_name} className={`text-center font-medium ${below ? "bg-amber-50 text-amber-800" : ""}`}>
                            {val}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {sortedLeaderboard.length === 0 && (
                  <TableRow><TableCell colSpan={numericKpis.length + 1} className="text-center py-6 text-muted-foreground">No agents on this campaign.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Widget 4: 4-week sparklines */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />4-Week Trends</CardTitle></CardHeader>
        <CardContent>
          {sparklineData.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No agents.</p>
          ) : (
            <div className="space-y-4">
              {sparklineData.map(({ agent, series }) => (
                <div key={agent.id} className="border rounded-lg p-3">
                  <p className="font-medium text-sm mb-2">{getDisplayName(agent)}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {series.map(({ kpi, points }) => (
                      <div key={kpi.field_name}>
                        <p className="text-xs text-muted-foreground mb-1">
                          {kpi.field_label}
                          {kpi.min_target !== null && <span className="ml-1">(target: {kpi.min_target})</span>}
                        </p>
                        <div style={{ width: "100%", height: 48 }}>
                          <ResponsiveContainer>
                            <LineChart data={points}>
                              <Line
                                type="monotone"
                                dataKey="value"
                                stroke="hsl(var(--primary))"
                                strokeWidth={1.5}
                                dot={false}
                                connectNulls
                              />
                              {kpi.min_target !== null && (
                                <CartesianGrid horizontal={false} vertical={false} />
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Widget 5: Monthly heatmap */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Monthly Heatmap</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left pr-2 py-1 font-medium sticky left-0 bg-white">Agent</th>
                  {[...heatmapDays, ...futureDays].map((d) => (
                    <th key={d} className="px-0.5 py-1 font-normal text-muted-foreground min-w-[18px]">
                      {parseInt(d.slice(8, 10))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="pr-2 py-0.5 font-medium whitespace-nowrap sticky left-0 bg-white">{getDisplayName(a)}</td>
                    {[...heatmapDays, ...futureDays].map((d) => {
                      const isFuture = futureDays.includes(d);
                      const status = isFuture ? "grey" : (heatmapStatus.get(`${a.id}|${d}`) ?? "red");
                      const colors: Record<string, string> = {
                        green: "bg-emerald-400",
                        yellow: "bg-amber-300",
                        red: "bg-red-400",
                        grey: "bg-gray-200",
                      };
                      const labels: Record<string, string> = {
                        green: "Submitted, targets met",
                        yellow: "Submitted, below target",
                        red: "Not submitted",
                        grey: "Future",
                      };
                      const dayLabel = formatDateMX(d);
                      return (
                        <td key={d} className="px-0.5 py-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`w-4 h-4 rounded-sm ${colors[status]}`} />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {getDisplayName(a)} — {dayLabel}: {labels[status]}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Coaching Log */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquarePlus className="h-5 w-5" />Agent Log</CardTitle></CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No agents.</p>
          ) : (
            <div className="space-y-4">
              {agents.map((a) => {
                const notes = coachingNotes.filter((n) => n.agent_id === a.id);
                return (
                  <div key={a.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">{getDisplayName(a)}</p>
                      <Button size="sm" variant="outline" onClick={() => { setNoteAgent(a); setNoteText(""); }}>
                        Add Note
                      </Button>
                    </div>
                    {notes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No log entries yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {notes.slice(0, 5).map((n) => (
                          <li key={n.id} className="text-sm border-l-2 border-muted pl-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {n.entry_type === "verbal_warning" ? (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0"><FileWarning className="mr-0.5 h-2.5 w-2.5" />Warning</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0"><StickyNote className="mr-0.5 h-2.5 w-2.5" />Note</Badge>
                              )}
                              <span>{n.author?.full_name ?? "Unknown"} — {formatDateMX(n.created_at)}</span>
                            </div>
                            <p className="mt-0.5">{n.note}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tier 2 placeholder */}
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">Client data feed not connected for this campaign.</p>
          <p className="text-sm mt-1">Tier 2 metrics (client QA scores, CSAT, handle time) will appear here once integrated.</p>
        </CardContent>
      </Card>

      {/* Add Note Dialog */}
      <Dialog open={!!noteAgent} onOpenChange={(o) => { if (!o) setNoteAgent(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Coaching Note — {noteAgent ? getDisplayName(noteAgent) : ""}</DialogTitle>
          </DialogHeader>
          <Label htmlFor="coaching-note">Note</Label>
          <Textarea
            id="coaching-note"
            placeholder="Write your coaching note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-24"
          />
          {addNoteMutation.error && (
            <p className="text-sm text-red-600">{(addNoteMutation.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteAgent(null)} disabled={addNoteMutation.isPending}>Cancel</Button>
            <Button onClick={() => addNoteMutation.mutate()} disabled={addNoteMutation.isPending || !noteText.trim()}>
              {addNoteMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
