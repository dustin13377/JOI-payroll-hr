import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Check, X } from "lucide-react";
import { formatDateMX, todayLocal } from "@/lib/localDate";
import { toast } from "sonner";

interface TimeOffRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  notes: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  employees: {
    full_name: string;
  } | null;
}

const reasonMap: { [key: string]: string } = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  other: "Other",
};

const statusBadgeColor = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "approved":
      return "bg-green-100 text-green-800";
    case "denied":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    default:
      return status;
  }
};

export default function TimeOff() {
  const { user, employeeId, role } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    startDate: "",
    endDate: "",
    reason: "vacation",
    notes: "",
  });

  // Fetch employee's time off requests
  const { data: myRequests = [] } = useQuery({
    queryKey: ["timeOffRequests", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("time_off_requests")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TimeOffRequest[];
    },
    enabled: !!employeeId,
  });

  // Fetch pending requests (for managers/admins)
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["pendingTimeOffRequests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_off_requests")
        .select("*, employees(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TimeOffRequest[];
    },
    enabled: role === "team_lead" || role === "manager" || role === "admin" || role === "owner",
  });

  // Fetch all reviewed requests (for managers/admins)
  const { data: reviewedRequests = [] } = useQuery({
    queryKey: ["reviewedTimeOffRequests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_off_requests")
        .select("*, employees(full_name)")
        .in("status", ["approved", "denied"])
        .order("reviewed_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TimeOffRequest[];
    },
    enabled: role === "team_lead" || role === "manager" || role === "admin" || role === "owner",
  });

  // Client-side validation surfaced via toast. Mirrors the server-side
  // expectations: both dates required, start cannot be in the past, end must
  // be on or after start. Without this the date inputs accept anything the
  // user types (including pasted text), so we can't rely on the browser
  // native date picker alone.
  const validateDates = (): string | null => {
    if (!formData.startDate) return "Start date is required";
    if (!formData.endDate) return "End date is required";
    const today = todayLocal();
    if (formData.startDate < today) return "Start date cannot be in the past";
    if (formData.endDate < formData.startDate) return "End date must be on or after the start date";
    return null;
  };

  // Submit time off request
  const submitRequestMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Not signed in");
      const validationError = validateDates();
      if (validationError) throw new Error(validationError);

      const { data, error } = await supabase
        .from("time_off_requests")
        .insert([
          {
            employee_id: employeeId,
            start_date: formData.startDate,
            end_date: formData.endDate,
            reason: formData.reason,
            notes: formData.notes || null,
            status: "pending",
          },
        ])
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeOffRequests", employeeId] });
      setFormData({ startDate: "", endDate: "", reason: "vacation", notes: "" });
      toast.success("Time off request submitted");
    },
    onError: (err) => {
      toast.error((err as Error).message);
    },
  });

  // Approve request
  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("time_off_requests")
        .update({
          status: "approved",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingTimeOffRequests"] });
      queryClient.invalidateQueries({ queryKey: ["reviewedTimeOffRequests"] });
      queryClient.invalidateQueries({ queryKey: ["time_off_requests", "pending_count"] });
    },
  });

  // Deny request
  const denyMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("time_off_requests")
        .update({
          status: "denied",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingTimeOffRequests"] });
      queryClient.invalidateQueries({ queryKey: ["reviewedTimeOffRequests"] });
      queryClient.invalidateQueries({ queryKey: ["time_off_requests", "pending_count"] });
    },
  });

  // 5-tier title model:
  //   - agents request and view their own
  //   - team leads can also approve their team's
  //   - leadership (owner/admin/manager) can approve everyone's
  const isAgent = role === "agent" || role === "employee"; // legacy fallback
  const isApprover = role === "team_lead" || role === "manager" || role === "admin" || role === "owner";
  // Back-compat names for the JSX below (so we don't have to rewrite all the conditionals)
  const isEmployee = isAgent;
  const isManagerOrAdmin = isApprover;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Time Off Requests</h1>
        <p className="text-muted-foreground mt-2">
          {isEmployee
            ? "Request and manage your time off"
            : "Review and approve time off requests"}
        </p>
      </div>

      {/* Employee form - shown for employees and managers who have an employeeId */}
      {(isEmployee || (isManagerOrAdmin && employeeId)) && (
        <Card>
          <CardHeader>
            <CardTitle>New Time Off Request</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date <span className="text-red-600">*</span></Label>
                  <Input
                    id="startDate"
                    type="date"
                    required
                    min={todayLocal()}
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date <span className="text-red-600">*</span></Label>
                  <Input
                    id="endDate"
                    type="date"
                    required
                    min={formData.startDate || todayLocal()}
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Select value={formData.reason} onValueChange={(value) => setFormData({ ...formData, reason: value })}>
                  <SelectTrigger id="reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Vacation</SelectItem>
                    <SelectItem value="sick">Sick</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional information..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="min-h-24"
                />
              </div>

              {/* Inline error so the user sees the problem before clicking Submit. */}
              {(() => {
                const err = validateDates();
                return err && (formData.startDate || formData.endDate) ? (
                  <p className="text-sm text-red-600">{err}</p>
                ) : null;
              })()}

              <Button
                onClick={() => submitRequestMutation.mutate()}
                disabled={submitRequestMutation.isPending || !!validateDates()}
                className="w-full"
              >
                Submit Request
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee view - my requests */}
      {isEmployee && (
        <Card>
          <CardHeader>
            <CardTitle>My Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {myRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No time off requests
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dates</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4" />
                            {formatDateMX(request.start_date)} -{" "}
                            {formatDateMX(request.end_date)}
                          </div>
                        </TableCell>
                        <TableCell>{reasonMap[request.reason] || request.reason}</TableCell>
                        <TableCell>
                          <Badge className={statusBadgeColor(request.status)}>
                            {statusLabel(request.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDateMX(request.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manager/Admin view - pending requests */}
      {isManagerOrAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Pending Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No pending requests
                </p>
              ) : (
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <Card key={request.id} className="border">
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold">
                                {request.employees?.full_name || "Unknown employee"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatDateMX(request.start_date)} -{" "}
                                {formatDateMX(request.end_date)}
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {reasonMap[request.reason] || request.reason}
                            </Badge>
                          </div>

                          {request.notes && (
                            <p className="text-sm text-muted-foreground italic">
                              {request.notes}
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground">
                            Requested: {formatDateMX(request.created_at)}
                          </p>

                          <div className="flex gap-2 pt-2">
                            <Button
                              onClick={() => approveMutation.mutate(request.id)}
                              disabled={approveMutation.isPending || denyMutation.isPending}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              size="sm"
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              onClick={() => denyMutation.mutate(request.id)}
                              disabled={approveMutation.isPending || denyMutation.isPending}
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                              variant="destructive"
                              size="sm"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Deny
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manager/Admin view - history */}
          <Card>
            <CardHeader>
              <CardTitle>Request History</CardTitle>
            </CardHeader>
            <CardContent>
              {reviewedRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No reviewed requests
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reviewed by</TableHead>
                        <TableHead>Review Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewedRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">
                            {request.employees?.full_name || "Unknown"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CalendarDays className="w-4 h-4" />
                              {formatDateMX(request.start_date)} -{" "}
                              {formatDateMX(request.end_date)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {reasonMap[request.reason] || request.reason}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusBadgeColor(request.status)}>
                              {statusLabel(request.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {request.reviewed_by ? (
                              <span className="text-muted-foreground">
                                ID: {request.reviewed_by.substring(0, 8)}...
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {request.reviewed_at
                              ? formatDateMX(request.reviewed_at)
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
