import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  useVacationBalance,
  useMyVacationRequests,
  useRequestVacationOff,
  useCancelVacationRequest,
  type TimeOffRequestType,
} from "@/hooks/useVacationRequests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CalendarCheck, AlertCircle } from "lucide-react";
import { formatDateMX, todayLocal } from "@/lib/localDate";
import { toast } from "sonner";

// Notice rules: Vacation = 21 days (LFT), everything else = 7 days.
// See TIME_OFF_UNIFICATION_PLAN.md.
function noticeDaysFor(type: TimeOffRequestType): number {
  return type === "vacation" ? 21 : 7;
}

function minStartDateFor(type: TimeOffRequestType): string {
  const d = new Date();
  d.setDate(d.getDate() + noticeDaysFor(type));
  return todayLocal(d);
}

function daysBetween(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

const REASON_LABEL: Record<TimeOffRequestType, string> = {
  vacation: "Vacation (paid)",
  sick: "Sick",
  personal: "Personal",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  pending_tl: "Pending TL",
  pending_hr: "Pending HR",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  pending_tl: "bg-yellow-100 text-yellow-800",
  pending_hr: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function VacationRequests() {
  const { employeeId, isLeadership } = useAuth();
  const [requestType, setRequestType] = useState<TimeOffRequestType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: campaignId } = useQuery({
    queryKey: ["employeeCampaign", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("employees")
        .select("campaign_id")
        .eq("id", employeeId!)
        .single();
      if (error) throw error;
      return (data?.campaign_id as string) ?? null;
    },
  });

  const { data: balance, isLoading: balanceLoading } = useVacationBalance(employeeId);
  const { data: requests = [], isLoading: requestsLoading } = useMyVacationRequests(employeeId);
  const requestMutation = useRequestVacationOff();
  const cancelMutation = useCancelVacationRequest();

  // Tenure gate. balance.years_of_service comes from get_vacation_balance().
  // If we don't have a balance yet, conservatively assume untenured so the
  // Vacation option stays disabled until we know.
  const isTenured = (balance?.years_of_service ?? 0) >= 1;

  // If user picked vacation but isn't tenured (race condition or balance arrived
  // late), force their selection back to sick.
  if (requestType === "vacation" && balance && !isTenured) {
    setRequestType("sick");
  }

  const min = minStartDateFor(requestType);
  const liveDays =
    startDate && endDate && endDate >= startDate
      ? daysBetween(startDate, endDate)
      : null;

  const isPaid = requestType === "vacation";
  const pageTitle = isPaid ? "Paid Time Off Request" : "Time Off Request";

  async function handleSubmit() {
    if (!employeeId || !campaignId || !startDate || !endDate) return;
    try {
      await requestMutation.mutateAsync({
        employeeId,
        campaignId,
        startDate,
        endDate,
        notes: notes.trim() || undefined,
        requestType,
      });
      toast.success("Time off request submitted.");
      setStartDate("");
      setEndDate("");
      setNotes("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit request.";
      toast.error(msg);
    }
  }

  async function handleCancel(requestId: string) {
    if (!employeeId) return;
    try {
      await cancelMutation.mutateAsync({ requestId, employeeId });
      toast.success("Request cancelled.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel request.";
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Time Off</h1>
        <p className="text-muted-foreground mt-2">
          Submit a time off request and track your balance.
        </p>
      </div>

      {/* Balance card — hidden for non-leadership until historical used_days
          is backfilled. Agents/TLs would see inflated "available" numbers
          because pre-system vacation isn't tracked in vacation_requests yet.
          They can still submit; the balance just isn't displayed.
          Toggle: when historical data is in, remove the isLeadership gate. */}
      {!isLeadership && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Vacation balances are being reconciled with historical records.
              <br />
              <span className="text-foreground">
                Confirm your available days with HR before submitting a Vacation request.
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {isLeadership && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5" />
            Vacation Balance — {new Date().getFullYear()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {balanceLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : balance === null ? (
            <p className="text-muted-foreground">Unable to load balance.</p>
          ) : balance.years_of_service === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-yellow-800">First Year — No Paid Vacation Yet</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Per LFT, paid vacation starts after your first full year of service. You can still
                  submit unpaid Sick, Personal, or Other time-off requests.
                </p>
                {balance.next_entitlement_date && (
                  <p className="text-sm text-yellow-700 mt-1">
                    Your paid entitlement begins on{" "}
                    <span className="font-medium">{formatDateMX(balance.next_entitlement_date)}</span>.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-3xl font-bold">{balance.entitlement_days}</p>
                <p className="text-sm text-muted-foreground mt-1">Entitled</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-3xl font-bold text-orange-600">{balance.used_days}</p>
                <p className="text-sm text-muted-foreground mt-1">Used</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{balance.available_days}</p>
                <p className="text-sm text-muted-foreground mt-1">Available</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Request form */}
      <Card>
        <CardHeader>
          <CardTitle>New {pageTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Reason — first decision the agent makes */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Select
                value={requestType}
                onValueChange={(v) => {
                  const next = v as TimeOffRequestType;
                  setRequestType(next);
                  // If new notice rule pushes min further, clear out-of-range dates
                  const newMin = minStartDateFor(next);
                  if (startDate && startDate < newMin) {
                    setStartDate("");
                    setEndDate("");
                  }
                }}
              >
                <SelectTrigger id="reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation" disabled={!isTenured}>
                    {REASON_LABEL.vacation}
                    {!isTenured && " — requires 1 year of service"}
                  </SelectItem>
                  <SelectItem value="sick">{REASON_LABEL.sick} (unpaid)</SelectItem>
                  <SelectItem value="personal">{REASON_LABEL.personal} (unpaid)</SelectItem>
                  <SelectItem value="other">{REASON_LABEL.other} (unpaid)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  min={min}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate && e.target.value > endDate) setEndDate("");
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  min={startDate || min}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {liveDays !== null && (
              <p className="text-sm text-muted-foreground">
                Duration:{" "}
                <span className="font-semibold text-foreground">
                  {liveDays} {liveDays === 1 ? "day" : "days"}
                </span>
                {isPaid && (
                  <span className="ml-2 text-xs">
                    (will deduct from vacation balance)
                  </span>
                )}
                {!isPaid && (
                  <span className="ml-2 text-xs">(unpaid)</span>
                )}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {isPaid
                ? "Vacation requires at least 21 days notice"
                : "Sick / Personal / Other requires at least 7 days notice"}
              {" "}(earliest start: <span className="font-medium">{formatDateMX(min)}</span>).
            </p>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any additional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-20"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={
                requestMutation.isPending ||
                !startDate ||
                !endDate ||
                !campaignId
              }
              className="w-full"
            >
              Submit Request
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* My Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            My Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No time off requests yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4 shrink-0 text-muted-foreground" />
                          {formatDateMX(req.start_date)} – {formatDateMX(req.end_date)}
                        </div>
                      </TableCell>
                      <TableCell>{req.days_requested}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm capitalize">
                            {req.request_type ?? "vacation"}
                          </span>
                          {req.is_paid ? (
                            <span className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Paid</span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Unpaid</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-800"}>
                          {STATUS_LABELS[req.status] ?? req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateMX(req.created_at)}
                      </TableCell>
                      <TableCell>
                        {(req.status === "pending_tl" || req.status === "pending_hr") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={cancelMutation.isPending}
                            onClick={() => handleCancel(req.id)}
                          >
                            Cancel
                          </Button>
                        )}
                        {req.status === "denied" && req.denial_reason && (
                          <span className="text-xs text-muted-foreground italic">
                            {req.denial_reason}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
