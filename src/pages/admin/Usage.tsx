import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { formatDateUSShort } from "@/lib/localDate";

/**
 * Owner-only feature-usage dashboard.
 *
 * Reads the get_feature_usage_summary RPC (owner-guarded) and lines it up
 * against a catalog of every real feature in the app, so you can see at a
 * glance what's used, what's underused, and what's never been touched in the
 * selected window. Data comes from feature_usage_events (page views logged by
 * usePageTracking). History starts the day tracking ships — earlier usage
 * simply isn't recorded.
 */

// Every meaningful route in the app, keyed by its NORMALIZED path (matching
// normalizeUsagePath). Detail pages use ":id". Pure redirects are omitted.
type Feature = { path: string; label: string; section: string };

const FEATURES: Feature[] = [
  { path: "/", label: "Home / Dashboard", section: "Core" },
  // People
  { path: "/empleados", label: "Employees (list)", section: "People" },
  { path: "/empleados/:id", label: "Employee profile", section: "People" },
  // Payroll & billing
  { path: "/historial", label: "Payroll History", section: "Payroll" },
  { path: "/facturas", label: "Invoices (list)", section: "Payroll" },
  { path: "/facturas/nueva", label: "New Invoice", section: "Payroll" },
  { path: "/facturas/:id", label: "Invoice detail", section: "Payroll" },
  { path: "/spiffs", label: "Spiffs", section: "Payroll" },
  { path: "/admin/payroll/prepay", label: "Pre-Payroll", section: "Payroll" },
  { path: "/admin/payroll/prepay/history", label: "Prepay History", section: "Payroll" },
  { path: "/admin/payroll/rates", label: "Payroll Rates", section: "Payroll" },
  { path: "/admin/payroll/agent/:id", label: "Payroll — agent breakdown", section: "Payroll" },
  { path: "/admin/payroll/holidays", label: "Payroll Holidays", section: "Payroll" },
  { path: "/admin/payroll/client-holidays", label: "Client Holidays", section: "Payroll" },
  // Time & attendance
  { path: "/reloj", label: "My Timeclock", section: "Time" },
  { path: "/eod", label: "EOD History", section: "Time" },
  { path: "/asistencia", label: "Attendance / My Team", section: "Time" },
  { path: "/desempeno", label: "Performance", section: "Time" },
  { path: "/reviews", label: "30-Day Reviews", section: "Time" },
  // Time off
  { path: "/vacation", label: "Time Off (request form)", section: "Time Off" },
  { path: "/holidays", label: "Holiday Requests", section: "Time Off" },
  { path: "/hr/time-off", label: "Time Off (HR queue)", section: "Time Off" },
  // HR documents
  { path: "/hr/document-queue", label: "Cartas y Actas", section: "HR Docs" },
  { path: "/hr/document-queue/:id/edit", label: "HR Document Draft", section: "HR Docs" },
  // Ops
  { path: "/campaigns", label: "Campaigns (list)", section: "Ops" },
  { path: "/campaigns/:id", label: "Campaign detail", section: "Ops" },
  { path: "/recruiting", label: "Recruiting", section: "Ops" },
  { path: "/sales", label: "Sales", section: "Ops" },
  { path: "/comunicados", label: "Announcements", section: "Comms" },
  // Settings
  { path: "/settings/shifts", label: "Shift Settings", section: "Settings" },
  { path: "/settings/document-types", label: "Document Types", section: "Settings" },
  { path: "/settings/departments", label: "Departments", section: "Settings" },
  { path: "/settings/policies", label: "Manage Policies", section: "Settings" },
  // Self-service
  { path: "/policies", label: "My Policies", section: "Self-service" },
  { path: "/account", label: "My Account", section: "Self-service" },
  // Admin
  { path: "/admin/system-users", label: "System Users", section: "Admin" },
  { path: "/admin/provision-org", label: "Provision Org (hidden)", section: "Admin" },
  { path: "/admin/usage", label: "Usage (this page)", section: "Admin" },
];

type SummaryRow = {
  path: string;
  opens: number;
  unique_users: number;
  last_used: string | null;
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
      // RPC isn't in the generated types yet — cast locally.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "get_feature_usage_summary",
        { days_back: days },
      );
      if (error) throw error;
      return (data || []) as SummaryRow[];
    },
  });

  // Index the RPC rows by normalized path for quick lookup.
  const byPath = useMemo(() => {
    const m = new Map<string, SummaryRow>();
    for (const r of rows) m.set(r.path, r);
    return m;
  }, [rows]);

  // Join catalog ↔ data. "used" = has ≥1 open; "never" = catalog entry with none.
  const { used, never, unknown } = useMemo(() => {
    const knownPaths = new Set(FEATURES.map((f) => f.path));
    const used: (Feature & SummaryRow)[] = [];
    const never: Feature[] = [];
    for (const f of FEATURES) {
      const row = byPath.get(f.path);
      if (row && row.opens > 0) used.push({ ...f, ...row });
      else never.push(f);
    }
    used.sort((a, b) => b.opens - a.opens);
    // Rows that showed up in data but aren't in the catalog (e.g. a new route
    // added after this page). Surfaced so the catalog can be kept honest.
    const unknown = rows
      .filter((r) => !knownPaths.has(r.path))
      .sort((a, b) => b.opens - a.opens);
    return { used, never, unknown };
  }, [byPath, rows]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Feature Usage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            What's getting used, what's underused, and what's never touched — so
            you can trim with data.
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
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{used.length}</div>
                  <div className="text-xs text-muted-foreground">
                    Features used
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">
                    {never.length}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Never touched
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{FEATURES.length}</div>
                  <div className="text-xs text-muted-foreground">
                    Total features
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                Used — last {days} days
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-2">Loading…</p>
              ) : used.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No usage recorded yet. Tracking starts collecting once this
                  ships — check back in a few days.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Feature</th>
                        <th className="py-2 px-3 font-medium">Section</th>
                        <th className="py-2 px-3 font-medium text-right">Opens</th>
                        <th className="py-2 px-3 font-medium text-right">People</th>
                        <th className="py-2 pl-3 font-medium text-right">Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {used.map((f) => (
                        <tr key={f.path} className="border-b last:border-0">
                          <td className="py-2 pr-3">{f.label}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {f.section}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            {f.opens}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {f.unique_users}
                          </td>
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                Never touched — last {days} days
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  {never.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-2">Loading…</p>
              ) : never.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Everything got used at least once in this window.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  {never.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center justify-between border-b py-1.5 last:border-0"
                    >
                      <span className="text-sm">{f.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {f.section}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                "Never touched" means zero opens in the selected window — a
                candidate to simplify or cut. Widen the range before deciding, and
                remember tracking only started recently.
              </p>
            </CardContent>
          </Card>

          {unknown.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  Other routes (not in catalog)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {unknown.map((r) => (
                        <tr key={r.path} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{r.path}</td>
                          <td className="py-2 px-3 text-right font-medium">
                            {r.opens}
                          </td>
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
