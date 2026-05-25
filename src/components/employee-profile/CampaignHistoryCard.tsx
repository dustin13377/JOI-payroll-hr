import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, ArrowRight } from "lucide-react";
import { formatDateMX } from "@/lib/localDate";

/**
 * Campaign assignment timeline for an employee.
 *
 * Shows every (campaign, start_date, end_date) row, newest first. The current
 * assignment has end_date NULL and renders as "Present". Used by TLs and
 * leadership to understand "where was this person on date X" without
 * having to dig into invoice or payroll records.
 *
 * Read-only here — campaign changes happen via the Assignment card / picker
 * which opens ChangeCampaignDialog.
 */

type AssignmentRow = {
  id: string;
  campaign_id: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  campaign: { name: string; client: { name: string } | null } | null;
};

export function CampaignHistoryCard({ employeeUuid }: { employeeUuid: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["employee-campaign-history", employeeUuid],
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from("employee_campaign_assignments")
        .select("id, campaign_id, start_date, end_date, reason, campaign:campaigns(name, client:clients(name))")
        .eq("employee_id", employeeUuid)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AssignmentRow[];
    },
    enabled: !!employeeUuid,
  });

  if (isLoading) return null;
  if (rows.length === 0) return null;

  // Only show the card if there's actual movement — a single backfilled row
  // is just the current state and is already visible in the Assignment card.
  if (rows.length === 1) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Campaign History
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {rows.length} assignments
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => {
          const isCurrent = r.end_date === null;
          const clientName = r.campaign?.client?.name ?? null;
          return (
            <div
              key={r.id}
              className={`flex items-start gap-3 rounded-md border p-3 ${
                isCurrent ? "bg-primary/5 border-primary/30" : "bg-muted/20"
              }`}
            >
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {r.campaign?.name ?? "Unknown campaign"}
                  {clientName && (
                    <span className="text-muted-foreground font-normal"> · {clientName}</span>
                  )}
                  {isCurrent && (
                    <span className="ml-2 text-xs text-primary font-semibold uppercase tracking-wide">
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <span>{formatDateMX(r.start_date)}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>{isCurrent ? "Present" : formatDateMX(r.end_date!)}</span>
                </div>
                {r.reason && (
                  <p className="text-xs text-muted-foreground mt-1 italic">"{r.reason}"</p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
