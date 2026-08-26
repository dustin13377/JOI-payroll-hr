import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserPlus, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import {
  useClientCampaigns,
  useClientEmployees,
  useClientRoles,
  useClientApplicants,
  type ClientApplicant,
} from "@/hooks/useClientPortal";
import { formatSource, mondayISO } from "@/lib/clientPortal";

/**
 * Client dashboard: compact role cards for at-a-glance totals + new counts.
 * Click a card to drill into that role's applicant list (see ClientRoleDetail).
 *
 * Weekly source counter sits above the cards so the client can reconcile ad
 * spend at a glance without drilling in.
 *
 * The campaigns/agents section renders only when a campaign has active
 * agents — pre-launch clients like Copper Rock see just the recruiting view.
 */

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { data: roles = [], isLoading: rolesLoading } = useClientRoles();
  const { data: applicants = [], isLoading: applicantsLoading } = useClientApplicants();
  const { data: campaigns = [] } = useClientCampaigns();
  const { data: employees = [] } = useClientEmployees();

  // Applicant totals per role, plus a "new" bucket (stage = 'new'). "New" is
  // the raw app stage — anyone not yet reviewed by JOI. Keeps the number
  // stable across days instead of resetting on Monday like a week-based count.
  const stats = useMemo(() => {
    const totals = new Map<string, { total: number; newCount: number }>();
    for (const r of roles) totals.set(r.role_name, { total: 0, newCount: 0 });
    for (const a of applicants) {
      const name = a.applied_position ?? "";
      const bucket = totals.get(name);
      if (!bucket) continue;
      bucket.total += 1;
      if (a.stage === "new") bucket.newCount += 1;
    }
    return totals;
  }, [roles, applicants]);

  // This-week source counter — ad-spend receipt for the client.
  const weeklyCounts = useMemo(() => {
    const monday = mondayISO();
    const map = new Map<string, number>();
    for (const a of applicants) {
      if (!a.created_at || a.created_at < monday) continue;
      const label = formatSource(a.ft_source, a.ft_channel);
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [applicants]);

  const showCampaigns = employees.some((e) => e.is_active);
  const isLoading = rolesLoading || applicantsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LogoLoadingIndicator size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Your Recruitment</h2>
        <p className="text-muted-foreground text-sm mt-1">
          One card per role you're hiring for. Click to see who's applied.
        </p>
      </div>

      {weeklyCounts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">This week's applications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-xs">
              {weeklyCounts.map(([label, count]) => (
                <Badge key={label} variant="outline" className="font-normal">
                  {count} × {label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {roles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No roles assigned yet. Your JOI contact will set these up shortly.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => {
            const s = stats.get(r.role_name) ?? { total: 0, newCount: 0 };
            return (
              <Card
                key={r.role_name}
                className="cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40"
                onClick={() =>
                  navigate(`/client/role/${encodeURIComponent(r.role_name)}`)
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{r.role_name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      {s.total} applicant{s.total === 1 ? "" : "s"}
                    </span>
                    {s.newCount > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs border-amber-500 bg-amber-50 text-amber-700"
                      >
                        {s.newCount} new
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCampaigns && (
        <div className="pt-6 border-t">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Your Campaigns</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Select a campaign to view agent roster and this-week performance.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
            {campaigns.map((campaign) => {
              const campaignEmployees = employees.filter(
                (e) => e.campaign_id === campaign.id,
              );
              const total = campaignEmployees.length;
              const active = campaignEmployees.filter((e) => e.is_active).length;
              return (
                <Card
                  key={campaign.id}
                  className="cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40"
                  onClick={() =>
                    (window.location.href = `/client/campaign/${campaign.id}`)
                  }
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {campaign.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{total} agents</span>
                      {active < total && (
                        <Badge variant="secondary" className="text-xs">
                          {active} active
                        </Badge>
                      )}
                      {active === total && total > 0 && (
                        <Badge variant="outline" className="text-xs">
                          All active
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Keep unused type-safety helper reachable — silences lint if applicant types
// aren't imported anywhere else in the file.
export type _ = ClientApplicant;
