import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { formatDateUSShort } from "@/lib/localDate";

/**
 * Owner-only feature-usage dashboard — TEAM-WIDE.
 *
 * Every logged-in person's page views are logged (usePageTracking); this screen
 * just reads the rollup. The goal is to trim fat: find features nobody uses, and
 * features built for the whole team that almost nobody uses.
 *
 * Key idea: low usage only means "fat" for features meant for many people.
 * Owner-only tools (payroll, invoices, system users) are SUPPOSED to have 1–2
 * users, so we tag each feature by intended audience and only flag broad ones.
 *
 * History starts when tracking shipped — earlier usage isn't recorded.
 */

// Audience = who a feature is built for. Only 'all' features get flagged as
// "barely used" cut-candidates; 'leadership'/'owner' tools are low-use by design.
type Audience = "all" | "leadership" | "owner";
type Feature = { path: string; label: string; section: string; audience: Audience };

// Every meaningful route, keyed by NORMALIZED path (matches normalizeUsagePath).
const FEATURES: Feature[] = [
  { path: "/", label: "Home / Dashboard", section: "Core", audience: "all" },
  // People
  { path: "/empleados", label: "Employees (list)", section: "People", audience: "leadership" },
  { path: "/empleados/:id", label: "Employee profile", section: "People", audience: "leadership" },
  // Payroll & billing (owner tools — low use is expected)
  { path: "/historial", label: "Payroll History", section: "Payroll", audience: "owner" },
  { path: "/facturas", label: "Invoices (list)", section: "Payroll", audience: "owner" },
  { path: "/facturas/nueva", label: "New Invoice", section: "Payroll", audience: "owner" },
  { path: "/facturas/:id", label: "Invoice detail", section: "Payroll", audience: "owner" },
  { path: "/spiffs", label: "Spiffs", section: "Payroll", audience: "leadership" },
  { path: "/admin/payroll/prepay", label: "Pre-Payroll", section: "Payroll", audience: "owner" },
  { path: "/admin/payroll/prepay/history", label: "Prepay History", section: "Payroll", audience: "owner" },
  { path: "/admin/payroll/rates", label: "Payroll Rates", section: "Payroll", audience: "owner" },
  { path: "/admin/payroll/agent/:id", label: "Payroll — agent breakdown", section: "Payroll", audience: "owner" },
  { path: "/admin/payroll/holidays", label: "Payroll Holidays", section: "Payroll", audience: "owner" },
  { path: "/admin/payroll/client-holidays", label: "Client Holidays", section: "Payroll", audience: "owner" },
  // Time & attendance
  { path: "/reloj", label: "My Timeclock", section: "Time", audience: "all" },
  { path: "/eod", label: "EOD History", section: "Time", audience: "all" },
  { path: "/asistencia", label: "Attendance / My Team", section: "Time", audience: "leadership" },
  { path: "/desempeno", label: "Performance", section: "Time", audience: "leadership" },
  { path: "/reviews", label: "30-Day Reviews", section: "Time", audience: "leadership" },
  // Time off
  { path: "/vacation", label: "Time Off (request form)", section: "Time Off", audience: "all" },
  { path: "/holidays", label: "Holiday Requests", section: "Time Off", audience: "all" },
  { path: "/hr/time-off", label: "Time Off (HR queue)", section: "Time Off", audience: "leadership" },
  // HR documents
  { path: "/hr/document-queue", label: "Cartas y Actas", section: "HR Docs", audience: "leadership" },
  { path: "/hr/document-queue/:id/edit", label: "HR Document Draft", section: "HR Docs", audience: "leadership" },
  // Ops
  { path: "/campaigns", label: "Campaigns (list)", section: "Ops", audience: "leadership" },
  { path: "/campaigns/:id", label: "Campaign detail", section: "Ops", audience: "leadership" },
  { path: "/recruiting", label: "Recruiting", section: "Ops", audience: "leadership" },
  { path: "/sales", label: "Sales", section: "Ops", audience: "leadership" },
  { path: "/comunicados", label: "Announcements", section: "Comms", audience: "all" },
  // Settings
  { path: "/settings/shifts", label: "Shift Settings", section: "Settings", audience: "leadership" },
  { path: "/settings/document-types", label: "Document Types", section: "Settings", audience: "leadership" },
  { path: "/settings/departments", label: "Departments", section: "Settings", audience: "leadership" },
  { path: "/settings/policies", label: "Manage Policies", section: "Settings", audience: "leadership" },
  // Self-service (everyone)
  { path: "/policies", label: "My Policies", section: "Self-service", audience: "all" },
  { path: "/account", label: "My Account", section: "Self-service", audience: "all" },
  // Admin (owner)
  { path: "/admin/system-users", label: "System Users", section: "Admin", audience: "owner" },
  { path: "/admin/provision-org", label: "Provision Org (hidden)", section: "Admin", audience: "owner" },
  { path: "/admin/usage", label: "Usage (this page)", section: "Admin", audience: "owner" },
];

type SummaryRow = {
  path: string;
  opens: number;
  unique_users: number;
  last_used: string | null;
  roles: Record<string, number> | null;
};

type Joined = Feature & { opens: number; unique_users: number; last_used: string | null; roles: Record<string, number> | null };

// Features used by ≤ this many distinct people count as "barely used".
const LOW_USAGE = 3;

const ROLE_ORDER = ["owner", "admin", "manager", "team_lead", "agent", "unknown"];
const ROLE_LABEL: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  manager: "mgr",
  team_lead: "TL",
  agent: "agent",
  unknown: "other",
};

function rolesText(roles: Record<string, number> | null): string {
  if (!roles) return "—";
  const parts = ROLE_ORDER.filter((r) => roles[r]).map(
    (r) => `${ROLE_LABEL[r]} ${roles[r]}`,
  );
  return parts.length ? parts.join(" · ") : "—";
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "Everyone",
  leadership: "Leadership",
  owner: "Owner",
};

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export default function Usage() {
  const [days, setDays] = useState(30);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["feature-usage-summary", days],
    queryFn: async (): Promise<SummaryRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "get_feature_usage_summary",
        { days_back: days },
      );
      if (error) throw error;
      return (data || []) as SummaryRow[];
    },
  });

  const { data: activeUsers = 0 } = useQuery({
    queryKey: ["feature-usage-active-users", days],
    queryFn: async (): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "get_feature_usage_active_users",
        { days_back: days },
      );
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const byPath = useMemo(() => {
    const m = new Map<string, SummaryRow>();
    for (const r of rows) m.set(r.path, r);
    return m;
  }, [rows]);

  const { never, trim, inUse, unknown } = useMemo(() => {
    const knownPaths = new Set(FEATURES.map((f) => f.path));
    const joined: Joined[] = FEATURES.map((f) => {
      const row = byPath.get(f.path);
      return {
        ...f,
        opens: row?.opens ?? 0,
        unique_users: row?.unique_users ?? 0,
        last_used: row?.last_used ?? null,
        roles: row?.roles ?? null,
      };
    });

    // Never touched by anyone (any audience) — strongest cut signal.
    const never = joined
      .filter((f) => f.unique_users === 0)
      .sort((a, b) => a.section.localeCompare(b.section));

    // Built for everyone, but ≤ LOW_USAGE people actually use it → the fat list.
    const trim = joined
      .filter((f) => f.audience === "all" && f.unique_users > 0 && f.unique_users <= LOW_USAGE)
      .sort((a, b) => a.unique_users - b.unique_users || b.opens - a.opens);

    // Everything else that has any usage — reference, most-reached first.
    const trimPaths = new Set(trim.map((f) => f.path));
    const inUse = joined
      .filter((f) => f.unique_users > 0 && !trimPaths.has(f.path))
      .sort((a, b) => b.unique_users - a.unique_users || b.opens - a.opens);

    const unknown = rows
      .filter((r) => !knownPaths.has(r.path))
      .sort((a, b) => b.opens - a.opens);

    return { never, trim, inUse, unknown };
  }, [byPath, rows]);

  const usedCount = FEATURES.length - never.length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Feature Usage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Team-wide — every user's page opens. Find what nobody uses and what's
            built for the team but barely touched, so you can trim with data.
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? "default" : "outline"}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Couldn't load usage data: {(error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{activeUsers}</div>
                  <div className="text-xs text-muted-foreground">People active</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{never.length}</div>
                  <div className="text-xs text-muted-foreground">Never touched</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">{trim.length}</div>
                  <div className="text-xs text-muted-foreground">Team feature, barely used</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{usedCount}/{FEATURES.length}</div>
                  <div className="text-xs text-muted-foreground">Features used</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* The cut list: broad features almost nobody uses. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                Cut candidates — team features barely used
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  {trim.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-2">Loading…</p>
              ) : trim.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Nothing here — every feature meant for the whole team is used by
                  more than {LOW_USAGE} people in this window.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Feature</th>
                        <th className="py-2 px-3 font-medium text-right">People</th>
                        <th className="py-2 px-3 font-medium text-right">Opens</th>
                        <th className="py-2 px-3 font-medium">Who (by role)</th>
                        <th className="py-2 pl-3 font-medium text-right">Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trim.map((f) => (
                        <tr key={f.path} className="border-b last:border-0">
                          <td className="py-2 pr-3">{f.label}</td>
                          <td className="py-2 px-3 text-right font-semibold text-amber-700">{f.unique_users}</td>
                          <td className="py-2 px-3 text-right">{f.opens}</td>
                          <td className="py-2 px-3 text-muted-foreground">{rolesText(f.roles)}</td>
                          <td className="py-2 pl-3 text-right whitespace-nowrap text-muted-foreground">
                            {f.last_used ? formatDateUSShort(f.last_used) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Features meant for everyone but opened by ≤{LOW_USAGE} people out
                of {activeUsers} active. These are the likeliest fat / redundant
                bits. Owner and leadership-only tools are excluded here since low
                use is normal for them.
              </p>
            </CardContent>
          </Card>

          {/* Never touched by anyone (any audience). */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                Never touched — last {days} days
                <Badge variant="outline" className="text-red-600 border-red-300">
                  {never.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-2">Loading…</p>
              ) : never.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Everything got opened at least once in this window.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  {never.map((f) => (
                    <div key={f.path} className="flex items-center justify-between border-b py-1.5 last:border-0">
                      <span className="text-sm">{f.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {AUDIENCE_LABEL[f.audience]} · {f.section}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Zero opens by anyone in the window. "Everyone"-tagged ones here are
                strong cut candidates; widen the range before deciding, and
                remember tracking only started recently.
              </p>
            </CardContent>
          </Card>

          {/* Reference: everything in use, most-reached first. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">In use — by reach</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-2">Loading…</p>
              ) : inUse.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No usage recorded yet. Check back once this has been live a few days.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Feature</th>
                        <th className="py-2 px-3 font-medium">For</th>
                        <th className="py-2 px-3 font-medium text-right">People</th>
                        <th className="py-2 px-3 font-medium text-right">Opens</th>
                        <th className="py-2 px-3 font-medium">Who (by role)</th>
                        <th className="py-2 pl-3 font-medium text-right">Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inUse.map((f) => (
                        <tr key={f.path} className="border-b last:border-0">
                          <td className="py-2 pr-3">{f.label}</td>
                          <td className="py-2 px-3 text-muted-foreground">{AUDIENCE_LABEL[f.audience]}</td>
                          <td className="py-2 px-3 text-right font-medium">{f.unique_users}</td>
                          <td className="py-2 px-3 text-right">{f.opens}</td>
                          <td className="py-2 px-3 text-muted-foreground">{rolesText(f.roles)}</td>
                          <td className="py-2 pl-3 text-right whitespace-nowrap text-muted-foreground">
                            {f.last_used ? formatDateUSShort(f.last_used) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {unknown.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Other routes (not in catalog)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {unknown.map((r) => (
                        <tr key={r.path} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{r.path}</td>
                          <td className="py-2 px-3 text-right font-medium">{r.opens}</td>
                          <td className="py-2 pl-3 text-right text-muted-foreground">
                            {r.last_used ? formatDateUSShort(r.last_used) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
