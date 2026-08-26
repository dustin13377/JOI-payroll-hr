import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import {
  useClientCampaigns,
  useClientEmployees,
} from "@/hooks/useClientPortal";

/**
 * Team dashboard: one compact card per campaign showing agent counts.
 * Clicking a card drills into ClientCampaignDetail, where the client can
 * see the roster + this-week KPIs and send feedback about specific agents.
 *
 * Empty state (no active agents anywhere) surfaces an honest "not staffed
 * yet" message — pre-launch clients like Copper Rock see this today.
 */
export default function ClientTeam() {
  const navigate = useNavigate();
  const { data: campaigns = [], isLoading: campaignsLoading } = useClientCampaigns();
  const { data: employees = [], isLoading: employeesLoading } = useClientEmployees();
  const isLoading = campaignsLoading || employeesLoading;

  const stats = useMemo(() => {
    const byCampaign = new Map<string, { total: number; active: number }>();
    for (const c of campaigns) byCampaign.set(c.id, { total: 0, active: 0 });
    for (const e of employees) {
      if (!e.campaign_id) continue;
      const bucket = byCampaign.get(e.campaign_id);
      if (!bucket) continue;
      bucket.total += 1;
      if (e.is_active) bucket.active += 1;
    }
    return byCampaign;
  }, [campaigns, employees]);

  const anyActive = employees.some((e) => e.is_active);

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
        <h2 className="text-2xl font-bold tracking-tight">Your Team</h2>
        <p className="text-muted-foreground text-sm mt-1">
          One card per campaign. Click to see the roster and send notes, questions,
          or write-up requests to JOI about a specific agent.
        </p>
      </div>

      {!anyActive || campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-2">
            <Users className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No agents on staff yet</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Once your first hires start, campaigns will appear here. From each
              agent's row you'll be able to leave notes and request write-ups.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => {
            const s = stats.get(c.id) ?? { total: 0, active: 0 };
            return (
              <Card
                key={c.id}
                className="cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40"
                onClick={() => navigate(`/client/campaign/${c.id}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      {s.total} agent{s.total === 1 ? "" : "s"}
                    </span>
                    {s.active < s.total && (
                      <Badge variant="secondary" className="text-xs">
                        {s.active} active
                      </Badge>
                    )}
                    {s.active === s.total && s.total > 0 && (
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
      )}
    </div>
  );
}
