import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edge";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Plus, Pencil } from "lucide-react";
import { formatDateMX, todayLocal } from "@/lib/localDate";
import {
  useAllPendingHolidayRequests,
  useAllApprovedHolidayRequests,
  useHROverrideHolidayRequest,
  useCompanyHolidays,
  useAddCompanyHoliday,
  useUpdateCompanyHoliday,
  useActiveCampaignsWithHeadcount,
} from "@/hooks/useHolidayRequests";
import {
  useHRPendingTLVacationRequests,
  useHRPendingVacationRequests,
  useHRAllVacationRequests,
  useHRApproveVacationRequest,
  useHRDenyVacationRequest,
  useHRCancelVacationRequest,
  useOwnerOverrideApproveVacationRequest,
} from "@/hooks/useVacationRequests";

// ── Coverage helpers ──────────────────────────────────────────────────────────

function computeCap(headcount: number): number {
  return Math.max(1, Math.floor(headcount * 0.2));
}

function CoverageStatus({ approved, cap }: { approved: number; cap: number }) {
  if (approved >= cap)
    return <Badge className="bg-destructive text-destructive-foreground">At cap</Badge>;
  if (approved === cap - 1)
    return <Badge className="bg-amber-500 text-white">Near cap</Badge>;
  return <Badge className="bg-emerald-600 text-white">OK</Badge>;
}

// ── Custom Holiday Dialogs ────────────────────────────────────────────────────

function AddHolidayDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const addMutation = useAddCompanyHoliday();

  function handleSave() {
    if (!date || !name.trim()) return;
    addMutation.mutate(
      { date, name: name.trim() },
      {
        onSuccess: () => {
          toast.success("Holiday added");
          onOpenChange(false);
          setDate("");
          setName("");
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to add holiday"),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Custom Holiday</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hol-date">Date</Label>
            <Input
              id="hol-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hol-name">Name</Label>
            <Input
              id="hol-name"
              placeholder="e.g. Company Day Off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!date || !name.trim() || addMutation.isPending}
          >
            {addMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditHolidayDialog({
  holiday,
  onOpenChange,
}: {
  holiday: { id: string; name: string } | null;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState(holiday?.name ?? "");
  const updateMutation = useUpdateCompanyHoliday();

  function handleSave() {
    if (!holiday || !name.trim()) return;
    updateMutation.mutate(
      { id: holiday.id, name: name.trim() },
      {
        onSuccess: () => {
          toast.success("Holiday updated");
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to update holiday"),
      }
    );
  }

  return (
    <Dialog open={!!holiday} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Holiday Name</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="edit-hol-name">Name</Label>
          <Input
            id="edit-hol-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Date is immutable after creation.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HrTimeOff() {
  const [addOpen, setAddOpen] = useState(false);
  const [editHoliday, setEditHoliday] = useState<{ id: string; name: string } | null>(null);
  // Track in-flight manual email sends: key = `${campaignId}|${daysBefore}`
  const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({});
  // Vacation deny inline state
  const [vacDenyingId, setVacDenyingId] = useState<string | null>(null);
  const [vacDenyReason, setVacDenyReason] = useState("");
  // Cancel confirmation state (All Requests table)
  const [vacCancellingId, setVacCancellingId] = useState<string | null>(null);

  const sendNotification = useCallback(async (campaignId: string, daysBefore: 14 | 7) => {
    const key = `${campaignId}|${daysBefore}`;
    setSendingMap((m) => ({ ...m, [key]: true }));
    try {
      const { error } = await supabase.functions.invoke("holiday-notifications", {
        body: { mode: "manual", campaignId, daysBefore },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      toast.success("Email sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSendingMap((m) => ({ ...m, [key]: false }));
    }
  }, []);

  const { data: pending = [], isLoading: loadingPending } = useAllPendingHolidayRequests();
  const { data: approved = [], isLoading: loadingApproved } = useAllApprovedHolidayRequests();
  const { data: holidays = [], isLoading: loadingHolidays } = useCompanyHolidays();
  const { data: campaigns = [], isLoading: loadingCampaigns } = useActiveCampaignsWithHeadcount();
  const overrideMutation = useHROverrideHolidayRequest();

  const { data: vacPendingTL = [], isLoading: loadingVacPendingTL } = useHRPendingTLVacationRequests();
  const { data: vacPending = [], isLoading: loadingVacPending } = useHRPendingVacationRequests();
  const { data: vacAll = [], isLoading: loadingVacAll } = useHRAllVacationRequests();
  const vacApproveMutation = useHRApproveVacationRequest();
  const vacDenyMutation = useHRDenyVacationRequest();
  const vacCancelMutation = useHRCancelVacationRequest();
  const ownerOverrideMutation = useOwnerOverrideApproveVacationRequest();

  const today = todayLocal();

  // Next 3 upcoming holidays for coverage gap dashboard
  const upcomingHolidays = holidays
    .filter((h) => h.date > today)
    .slice(0, 3);

  // Coverage data: approved count per campaign_id + holiday_date
  const approvedCountMap: Record<string, number> = {};
  for (const req of approved) {
    const key = `${req.campaign_id}|${req.holiday_date}`;
    approvedCountMap[key] = (approvedCountMap[key] || 0) + 1;
  }

  const customHolidays = holidays.filter((h) => !h.is_statutory);
  const statutoryHolidays = holidays.filter((h) => h.is_statutory);
  const coverageCampaigns = campaigns.filter((c) => c.requires_holiday_coverage);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Time Off</h1>
      </div>

      {/* Default landed on Holidays which buried the time-off requests —
          flipped to "vacation" tab so the queue is the first thing visible. */}
      <Tabs defaultValue="vacation">
        <TabsList>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="vacation">Time Off</TabsTrigger>
        </TabsList>

        {/* ── Holidays tab ── */}
        <TabsContent value="holidays" className="space-y-8 pt-4">

          {/* Section A: Pending Requests */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Pending Requests
                {pending.length > 0 && (
                  <Badge className="ml-2 bg-amber-500 text-white">{pending.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="flex justify-center py-6"><LogoLoadingIndicator /></div>
              ) : pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No pending requests across all campaigns.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Holiday</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((req) => {
                      const isActing =
                        overrideMutation.isPending &&
                        overrideMutation.variables?.id === req.id;
                      return (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">{req.displayName}</TableCell>
                          <TableCell className="text-muted-foreground">{req.campaignName}</TableCell>
                          <TableCell>{req.holiday_name}</TableCell>
                          <TableCell>{formatDateMX(req.holiday_date)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateMX(req.requested_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={isActing}
                                onClick={() =>
                                  overrideMutation.mutate(
                                    { id: req.id, status: "approved" },
                                    {
                                      onSuccess: () => toast.success("Request approved"),
                                      onError: (err) =>
                                        toast.error(
                                          err instanceof Error ? err.message : "Failed"
                                        ),
                                    }
                                  )
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={isActing}
                                onClick={() =>
                                  overrideMutation.mutate(
                                    { id: req.id, status: "denied" },
                                    {
                                      onSuccess: () => toast.success("Request denied"),
                                      onError: (err) =>
                                        toast.error(
                                          err instanceof Error ? err.message : "Failed"
                                        ),
                                    }
                                  )
                                }
                              >
                                Deny
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Section B: Coverage Gap Dashboard */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Coverage Overview — Next 3 Holidays</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingApproved || loadingCampaigns || loadingHolidays ? (
                <div className="flex justify-center py-6"><LogoLoadingIndicator /></div>
              ) : upcomingHolidays.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming holidays.</p>
              ) : (
                <div className="space-y-6">
                  {upcomingHolidays.map((holiday) => (
                    <div key={holiday.id}>
                      <p className="text-sm font-semibold mb-2">
                        {holiday.name}{" "}
                        <span className="font-normal text-muted-foreground">
                          — {formatDateMX(holiday.date)}
                        </span>
                        {holiday.is_statutory && (
                          <Badge variant="secondary" className="ml-2 text-xs">Statutory</Badge>
                        )}
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campaign</TableHead>
                            <TableHead className="text-right">Headcount</TableHead>
                            <TableHead className="text-right">Approved Off</TableHead>
                            <TableHead className="text-right">Cap</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {campaigns.map((campaign) => {
                            const cap = computeCap(campaign.headcount);
                            const approvedOff =
                              approvedCountMap[`${campaign.id}|${holiday.date}`] ?? 0;
                            return (
                              <TableRow key={campaign.id}>
                                <TableCell>{campaign.name}</TableCell>
                                <TableCell className="text-right">{campaign.headcount}</TableCell>
                                <TableCell className="text-right">{approvedOff}</TableCell>
                                <TableCell className="text-right">{cap}</TableCell>
                                <TableCell className="text-right">
                                  <CoverageStatus approved={approvedOff} cap={cap} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section C: Custom Holidays */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Custom Holidays</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Custom Holiday
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingHolidays ? (
                <div className="flex justify-center py-4"><LogoLoadingIndicator /></div>
              ) : customHolidays.length === 0 ? (
                <p className="text-sm text-muted-foreground">No custom holidays added yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Edit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customHolidays.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell>{h.name}</TableCell>
                        <TableCell>{formatDateMX(h.date)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditHoliday({ id: h.id, name: h.name })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Statutory read-only list */}
              <div className="pt-2">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Statutory Holidays (LFT)
                </p>
                {statutoryHolidays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None seeded.</p>
                ) : (
                  <div className="space-y-1">
                    {statutoryHolidays.map((h) => (
                      <div key={h.id} className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground w-24 shrink-0">
                          {formatDateMX(h.date)}
                        </span>
                        <span>{h.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section D: Manual Email Trigger */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Client Holiday Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Send 14-day or 7-day advance notice emails to clients for campaigns requiring
                holiday coverage. Sends for the next upcoming holiday on the campaign.
              </p>
              {coverageCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No campaigns have holiday coverage enabled.
                </p>
              ) : (
                <div className="space-y-3">
                  {coverageCampaigns.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-4 flex-wrap">
                      <span className="text-sm font-medium">{c.name}</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!sendingMap[`${c.id}|14`]}
                          onClick={() => sendNotification(c.id, 14)}
                        >
                          {sendingMap[`${c.id}|14`] ? "Sending…" : "Send 14-day notice"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!sendingMap[`${c.id}|7`]}
                          onClick={() => sendNotification(c.id, 7)}
                        >
                          {sendingMap[`${c.id}|7`] ? "Sending…" : "Send 7-day notice"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Vacation tab ── */}
        <TabsContent value="vacation" className="space-y-8 pt-4">

          {/* Section 0 — Pending TL Approval (owner can override) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span>Pending TL Approval</span>
                {vacPendingTL.length > 0 && (
                  <Badge className="bg-orange-500 text-white">{vacPendingTL.length}</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground pt-1">
                Requests waiting on the TL's review. Approving here is an owner override that skips the TL stage.
              </p>
            </CardHeader>
            <CardContent>
              {loadingVacPendingTL ? (
                <div className="flex justify-center py-6"><LogoLoadingIndicator /></div>
              ) : vacPendingTL.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing stuck at the TL stage.
                </p>
              ) : (
                <ul className="space-y-3">
                  {vacPendingTL.map((req) => {
                    const isDenying = vacDenyingId === req.id;
                    const isActing =
                      (ownerOverrideMutation.isPending && ownerOverrideMutation.variables?.id === req.id) ||
                      (vacDenyMutation.isPending && vacDenyMutation.variables?.id === req.id);
                    return (
                      <li key={req.id} className="rounded-md border px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-medium">{req.displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              {req.campaignName}
                              {req.tlName && (
                                <span className="ml-2">· TL: <span className="font-medium">{req.tlName}</span></span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {formatDateMX(req.start_date)} – {formatDateMX(req.end_date)}
                              <span className="ml-1">· {req.days_requested} {req.days_requested === 1 ? "day" : "days"}</span>
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">
                                {req.request_type ?? "vacation"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-xs ${req.is_paid ? "border-emerald-300 text-emerald-700" : "border-gray-300 text-gray-600"}`}
                              >
                                {req.is_paid ? "Paid" : "Unpaid"}
                              </Badge>
                            </div>
                            {req.notes && (
                              <p className="text-xs text-muted-foreground italic mt-1">{req.notes}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Submitted {formatDateMX(req.created_at)}
                            </p>
                          </div>
                          {!isDenying && (
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={isActing}
                                onClick={() =>
                                  ownerOverrideMutation.mutate(
                                    { id: req.id },
                                    {
                                      onSuccess: () => toast.success("Approved (owner override)"),
                                      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
                                    }
                                  )
                                }
                              >
                                Approve (Override)
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={isActing}
                                onClick={() => { setVacDenyingId(req.id); setVacDenyReason(""); }}
                              >
                                Deny
                              </Button>
                            </div>
                          )}
                        </div>
                        {isDenying && (
                          <div className="flex gap-2 items-center flex-wrap">
                            <Input
                              placeholder="Reason for denial (required)"
                              value={vacDenyReason}
                              onChange={(e) => setVacDenyReason(e.target.value)}
                              className="flex-1 h-8 text-sm min-w-48"
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!vacDenyReason.trim() || vacDenyMutation.isPending}
                              onClick={() =>
                                vacDenyMutation.mutate(
                                  { id: req.id, reason: vacDenyReason.trim() },
                                  {
                                    onSuccess: () => {
                                      toast.success("Request denied");
                                      setVacDenyingId(null);
                                      setVacDenyReason("");
                                    },
                                    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
                                  }
                                )
                              }
                            >
                              Confirm Deny
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setVacDenyingId(null); setVacDenyReason(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Section 1 — Pending HR Approval */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Pending HR Approval
                {vacPending.length > 0 && (
                  <Badge className="ml-2 bg-amber-500 text-white">{vacPending.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingVacPending ? (
                <div className="flex justify-center py-6"><LogoLoadingIndicator /></div>
              ) : vacPending.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No vacation requests pending HR review.
                </p>
              ) : (
                <ul className="space-y-3">
                  {vacPending.map((req) => {
                    const isDenying = vacDenyingId === req.id;
                    const isActing =
                      (vacApproveMutation.isPending && vacApproveMutation.variables?.id === req.id) ||
                      (vacDenyMutation.isPending && vacDenyMutation.variables?.id === req.id);
                    return (
                      <li key={req.id} className="rounded-md border px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-medium">{req.displayName}</p>
                            <p className="text-xs text-muted-foreground">{req.campaignName}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {formatDateMX(req.start_date)} – {formatDateMX(req.end_date)}
                              <span className="ml-1">· {req.days_requested} {req.days_requested === 1 ? "day" : "days"}</span>
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">
                                {req.request_type ?? "vacation"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-xs ${req.is_paid ? "border-emerald-300 text-emerald-700" : "border-gray-300 text-gray-600"}`}
                              >
                                {req.is_paid ? "Paid" : "Unpaid"}
                              </Badge>
                            </div>
                            {req.notes && (
                              <p className="text-xs text-muted-foreground italic mt-1">{req.notes}</p>
                            )}
                          </div>
                          {!isDenying && (
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={isActing}
                                onClick={() =>
                                  vacApproveMutation.mutate(
                                    { id: req.id },
                                    {
                                      onSuccess: () => toast.success("Vacation request approved"),
                                      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
                                    }
                                  )
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={isActing}
                                onClick={() => { setVacDenyingId(req.id); setVacDenyReason(""); }}
                              >
                                Deny
                              </Button>
                            </div>
                          )}
                        </div>
                        {isDenying && (
                          <div className="flex gap-2 items-center flex-wrap">
                            <Input
                              placeholder="Reason for denial (required)"
                              value={vacDenyReason}
                              onChange={(e) => setVacDenyReason(e.target.value)}
                              className="flex-1 h-8 text-sm min-w-48"
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!vacDenyReason.trim() || vacDenyMutation.isPending}
                              onClick={() =>
                                vacDenyMutation.mutate(
                                  { id: req.id, reason: vacDenyReason.trim() },
                                  {
                                    onSuccess: () => {
                                      toast.success("Request denied");
                                      setVacDenyingId(null);
                                      setVacDenyReason("");
                                    },
                                    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
                                  }
                                )
                              }
                            >
                              Confirm Deny
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setVacDenyingId(null); setVacDenyReason(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Section 2 — All Requests history */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All Vacation Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingVacAll ? (
                <div className="flex justify-center py-6"><LogoLoadingIndicator /></div>
              ) : vacAll.length === 0 ? (
                <p className="text-sm text-muted-foreground">No vacation requests yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vacAll.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.displayName}</TableCell>
                        <TableCell className="text-muted-foreground">{req.campaignName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="capitalize text-sm">{req.request_type ?? "vacation"}</span>
                            {req.is_paid ? (
                              <span className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">paid</span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">unpaid</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatDateMX(req.start_date)} – {formatDateMX(req.end_date)}
                        </TableCell>
                        <TableCell className="text-right">{req.days_requested}</TableCell>
                        <TableCell>
                          {req.status === "approved" && (
                            <Badge className="bg-emerald-600 text-white">Approved</Badge>
                          )}
                          {req.status === "pending_hr" && (
                            <Badge className="bg-amber-500 text-white">Pending HR</Badge>
                          )}
                          {req.status === "pending_tl" && (
                            <Badge className="bg-gray-100 text-gray-700">Pending TL</Badge>
                          )}
                          {req.status === "denied" && (
                            <Badge className="bg-destructive text-destructive-foreground">Denied</Badge>
                          )}
                          {req.status === "cancelled" && (
                            <Badge className="bg-gray-100 text-gray-500">Cancelled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateMX(req.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Cancellable: anything not already terminal, and not in the past */}
                          {(req.status === "approved" ||
                            req.status === "pending_hr" ||
                            req.status === "pending_tl") &&
                            req.end_date >= today &&
                            (vacCancellingId === req.id ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7"
                                  disabled={vacCancelMutation.isPending}
                                  onClick={() =>
                                    vacCancelMutation.mutate(
                                      { id: req.id },
                                      {
                                        onSuccess: () => {
                                          toast.success("Request cancelled");
                                          setVacCancellingId(null);
                                        },
                                        onError: (err) =>
                                          toast.error(err instanceof Error ? err.message : "Failed"),
                                      }
                                    )
                                  }
                                >
                                  Confirm cancel
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() => setVacCancellingId(null)}
                                >
                                  Keep
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                onClick={() => setVacCancellingId(req.id)}
                              >
                                Cancel
                              </Button>
                            ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>

      <AddHolidayDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditHolidayDialog
        holiday={editHoliday}
        onOpenChange={(v) => { if (!v) setEditHoliday(null); }}
      />
    </div>
  );
}
