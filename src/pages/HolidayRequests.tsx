import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  useMyHolidayRequests,
  useCampaignHolidayCapacities,
  useRequestHolidayOff,
  useCancelHolidayRequest,
} from "@/hooks/useHolidayRequests";
import { todayLocal, formatDateMXLong } from "@/lib/localDate";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CalendarCheck } from "lucide-react";

interface CompanyHoliday {
  id: string;
  date: string;
  name: string;
  is_statutory: boolean;
  requires_request: boolean;
}

export default function HolidayRequests() {
  const { employeeId } = useAuth();
  const { toast } = useToast();

  // Fetch agent's campaign_id
  const { data: campaignId, isLoading: loadingCampaign } = useQuery({
    queryKey: ["agentCampaignId", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("campaign_id")
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return (data?.campaign_id ?? null) as string | null;
    },
    enabled: !!employeeId,
  });

  // Fetch upcoming company holidays
  const { data: holidays = [], isLoading: loadingHolidays } = useQuery({
    queryKey: ["companyHolidays"],
    queryFn: async () => {
      const today = todayLocal();
      const { data, error } = await supabase
        .from("company_holidays")
        .select("id, date, name, is_statutory, requires_request")
        .gt("date", today)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as CompanyHoliday[];
    },
  });

  const { data: myRequests = [], isLoading: loadingRequests } =
    useMyHolidayRequests(employeeId);

  const { data: capacities = {}, isLoading: loadingCapacities } =
    useCampaignHolidayCapacities(campaignId);

  const requestMutation = useRequestHolidayOff();
  const cancelMutation = useCancelHolidayRequest();

  const isLoading =
    loadingCampaign || loadingHolidays || loadingRequests || loadingCapacities;

  // Build lookup: holiday_date → my request (ignore cancelled so agent can re-request)
  const myRequestByDate = Object.fromEntries(
    myRequests
      .filter((r) => r.status !== "cancelled")
      .map((r) => [r.holiday_date, r])
  );

  function handleRequest(holiday: CompanyHoliday) {
    if (!campaignId || !employeeId) return;
    requestMutation.mutate(
      {
        campaignId,
        holidayDate: holiday.date,
        holidayName: holiday.name,
        employeeId,
      },
      {
        onSuccess: (status) => {
          if (status === "approved") {
            toast({ title: "Request submitted — you're approved!" });
          } else {
            toast({ title: "Request submitted — your TL will review it." });
          }
        },
        onError: (err) => {
          toast({
            title: "Could not submit request",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      }
    );
  }

  function handleCancel(requestId: string, holiday: CompanyHoliday) {
    if (!employeeId || !campaignId) return;
    cancelMutation.mutate(
      { id: requestId, employeeId, campaignId },
      {
        onSuccess: () => {
          toast({ title: "Request cancelled." });
        },
        onError: (err) => {
          toast({
            title: "Could not cancel request",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <CalendarCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Holiday Requests</h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : holidays.length === 0 ? (
        <p className="text-muted-foreground text-sm">No upcoming holidays scheduled.</p>
      ) : (
        <div className="space-y-4">
          {holidays.map((holiday) => {
            const capacity = capacities[holiday.date];
            const approvedCount = capacity?.approved_count ?? 0;
            const cap = capacity?.cap ?? 1;
            const capHit = approvedCount >= cap;
            const myRequest = myRequestByDate[holiday.date];

            // Capacity meter color
            const meterColor =
              approvedCount >= cap
                ? "bg-destructive"
                : approvedCount === cap - 1
                ? "bg-amber-500"
                : "bg-emerald-500";

            const isRequesting =
              requestMutation.isPending &&
              requestMutation.variables?.holidayDate === holiday.date;
            const isCancelling =
              cancelMutation.isPending &&
              cancelMutation.variables?.id === myRequest?.id;

            // Change 2: lock next-year holidays until Dec 2 of the prior year
            const holidayYear = new Date(holiday.date).getFullYear();
            const currentYear = new Date().getFullYear();
            const openDate = new Date(holidayYear - 1, 11, 2); // Dec 2 of prior year
            const isNextYearLocked = holidayYear > currentYear && new Date() < openDate;

            return (
              <div
                key={holiday.id}
                className="rounded-xl border bg-card p-5 space-y-4 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-base leading-tight">{holiday.name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatDateMXLong(holiday.date)}
                    </p>
                  </div>
                  {holiday.is_statutory && (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      Statutory
                    </Badge>
                  )}
                </div>

                {/* Capacity meter */}
                <div className="space-y-1.5">
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${meterColor}`}
                      style={{ width: `${Math.min(100, (approvedCount / cap) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {approvedCount} of {cap} slot{cap !== 1 ? "s" : ""} taken
                  </p>
                </div>

                {/* Agent action area */}
                {!holiday.requires_request ? (
                  <Badge variant="secondary" className="text-xs">
                    Mandatory day off
                  </Badge>
                ) : !myRequest && (
                  isNextYearLocked ? (
                    <div className="space-y-1">
                      <Button size="sm" disabled>
                        Request Day Off
                      </Button>
                      <p className="text-xs text-muted-foreground">Requests open Dec 2</p>
                    </div>
                  ) : capHit ? (
                    <p className="text-sm text-muted-foreground">
                      No slots available — speak with your TL to request this holiday.
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleRequest(holiday)}
                      disabled={isRequesting || !campaignId}
                    >
                      {isRequesting ? "Submitting…" : "Request Day Off"}
                    </Button>
                  )
                )}

                {myRequest?.status === "approved" && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      Approved
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancel(myRequest.id, holiday)}
                      disabled={isCancelling}
                    >
                      {isCancelling ? "Cancelling…" : "Cancel Request"}
                    </Button>
                  </div>
                )}

                {myRequest?.status === "pending_tl" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                        Pending TL review
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancel(myRequest.id, holiday)}
                        disabled={isCancelling}
                      >
                        {isCancelling ? "Cancelling…" : "Cancel Request"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Holidays rotate — if this one isn't approved, you'll be first in line for the next one.
                    </p>
                  </div>
                )}

                {myRequest?.status === "denied" && (
                  <Badge variant="destructive">Denied</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
