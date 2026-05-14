import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useAgentReviews,
  usePendingTerminationReviews,
  useCompleteAgentReview,
  useConfirmReviewTermination,
  reviewStatus,
  type AgentReviewWithJoins,
  type ReviewDecision,
} from "@/hooks/useAgentReviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateMX } from "@/lib/localDate";
import { getDisplayName } from "@/lib/displayName";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function statusBadge(r: AgentReviewWithJoins) {
  const s = reviewStatus(r);
  if (s === "completed") {
    return <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />Done</Badge>;
  }
  if (s === "overdue") {
    return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Overdue</Badge>;
  }
  if (s === "due_today") {
    return <Badge className="bg-amber-500 hover:bg-amber-600"><Clock className="mr-1 h-3 w-3" />Due today</Badge>;
  }
  return <Badge variant="outline"><CalendarClock className="mr-1 h-3 w-3" />Upcoming</Badge>;
}

function weekLabel(weekNumber: number): string {
  if (weekNumber <= 4) return `Week ${weekNumber}`;
  return `Extension #${weekNumber - 4}`;
}

function dayOfProbation(weekNumber: number): string {
  // Maps week_number → "Day N" (the offset from hire_date used by the trigger).
  if (weekNumber === 1) return "Day 7";
  if (weekNumber === 2) return "Day 14";
  if (weekNumber === 3) return "Day 21";
  if (weekNumber === 4) return "Day 29 (Final)";
  return "Extension";
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AgentReviews() {
  const { isLeadership } = useAuth();
  const { data: openReviews = [], isLoading } = useAgentReviews({ onlyOpen: true });
  const { data: pendingTerm = [] } = usePendingTerminationReviews();

  const [reviewToFill, setReviewToFill] = useState<AgentReviewWithJoins | null>(null);
  const [reviewToConfirm, setReviewToConfirm] = useState<AgentReviewWithJoins | null>(null);

  // Sort: overdue first, then due_today, then upcoming, all by due_date asc
  const sortedOpen = useMemo(() => {
    const order: Record<string, number> = { overdue: 0, due_today: 1, upcoming: 2, completed: 3 };
    return [...openReviews].sort((a, b) => {
      const sa = order[reviewStatus(a)] ?? 9;
      const sb = order[reviewStatus(b)] ?? 9;
      if (sa !== sb) return sa - sb;
      return a.due_date.localeCompare(b.due_date);
    });
  }, [openReviews]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">30-Day Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Weekly probation check-ins. Final keep/let-go/extend decision happens at Week 4 (day 29).
        </p>
      </div>

      <Tabs defaultValue="open" className="w-full">
        <TabsList>
          <TabsTrigger value="open">
            Open ({sortedOpen.length})
          </TabsTrigger>
          {isLeadership && (
            <TabsTrigger value="pending-hr">
              Pending HR ({pendingTerm.length})
              {pendingTerm.length > 0 && (
                <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reviews needing your attention</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : sortedOpen.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No open reviews. Nice work — you're caught up.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Week</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedOpen.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.employee ? getDisplayName(r.employee) : "(unknown)"}
                        </TableCell>
                        <TableCell>{r.campaign?.name ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{weekLabel(r.week_number)}</span>
                            <span className="text-xs text-muted-foreground">{dayOfProbation(r.week_number)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDateMX(r.due_date)}</TableCell>
                        <TableCell>{statusBadge(r)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => setReviewToFill(r)}>
                            Fill out
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isLeadership && (
          <TabsContent value="pending-hr" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Termination recommendations awaiting confirmation</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingTerm.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing pending.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Filed by</TableHead>
                        <TableHead>Filed on</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingTerm.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.employee ? getDisplayName(r.employee) : "(unknown)"}
                          </TableCell>
                          <TableCell>{r.campaign?.name ?? "—"}</TableCell>
                          <TableCell>{r.reviewer?.full_name ?? "—"}</TableCell>
                          <TableCell>{r.completed_at ? formatDateMX(r.completed_at) : "—"}</TableCell>
                          <TableCell className="max-w-md truncate">
                            {r.decision_reason ?? r.notes ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="destructive" onClick={() => setReviewToConfirm(r)}>
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {reviewToFill && (
        <FillReviewDialog
          review={reviewToFill}
          onClose={() => setReviewToFill(null)}
        />
      )}
      {reviewToConfirm && (
        <ConfirmTerminationDialog
          review={reviewToConfirm}
          onClose={() => setReviewToConfirm(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fill-out dialog
// ─────────────────────────────────────────────────────────────────────────────

function FillReviewDialog({
  review,
  onClose,
}: {
  review: AgentReviewWithJoins;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const completeMut = useCompleteAgentReview();
  const isFinal = review.week_number >= 4;

  const [attendance, setAttendance] = useState<number>(review.attendance_score ?? 3);
  const [kpi, setKpi] = useState<number>(review.kpi_score ?? 3);
  const [attitude, setAttitude] = useState<number>(review.attitude_score ?? 3);
  const [notes, setNotes] = useState<string>(review.notes ?? "");
  const [decision, setDecision] = useState<ReviewDecision | "">("");
  const [decisionReason, setDecisionReason] = useState("");
  const [extensionDays, setExtensionDays] = useState<string>("15");

  // Confirm-name guard for let-go (matches the TerminateEmployeeDialog pattern)
  const [confirmName, setConfirmName] = useState("");
  const expectedName = review.employee?.full_name ?? "";
  const letGoConfirmed =
    decision !== "let_go" ||
    confirmName.trim().toLowerCase() === expectedName.trim().toLowerCase();

  const canSubmit =
    attendance >= 1 && attendance <= 5 &&
    kpi >= 1 && kpi <= 5 &&
    attitude >= 1 && attitude <= 5 &&
    (!isFinal || (decision !== "" && (decision !== "extend" || (Number(extensionDays) >= 1 && Number(extensionDays) <= 60)))) &&
    letGoConfirmed;

  async function handleSubmit() {
    try {
      await completeMut.mutateAsync({
        reviewId: review.id,
        employeeId: review.employee_id,
        attendanceScore: attendance,
        kpiScore: kpi,
        attitudeScore: attitude,
        notes: notes || undefined,
        decision: isFinal && decision ? (decision as ReviewDecision) : undefined,
        decisionReason: isFinal && decisionReason ? decisionReason : undefined,
        extensionDays: decision === "extend" ? Number(extensionDays) : undefined,
      });
      toast({ title: "Review saved." });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Couldn't save", description: msg, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {weekLabel(review.week_number)} review — {review.employee?.full_name ?? ""}
          </DialogTitle>
          <DialogDescription>
            {dayOfProbation(review.week_number)} · Hired {formatDateMX(review.employee?.hire_date ?? null)}
            {review.employee?.work_name ? ` · ${review.employee.work_name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ScoreField label="Attendance" value={attendance} onChange={setAttendance} />
          <ScoreField label="KPI performance" value={kpi} onChange={setKpi} />
          <ScoreField label="Attitude / coachability" value={attitude} onChange={setAttitude} />

          <div>
            <Label htmlFor="review-notes">Notes</Label>
            <Textarea
              id="review-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you see this week? Specifics help future TLs and HR."
              rows={3}
            />
          </div>

          {isFinal && (
            <div className="rounded-md border p-3 space-y-3 bg-muted/30">
              <Label>Final decision</Label>
              <RadioGroup
                value={decision}
                onValueChange={(v) => setDecision(v as ReviewDecision)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="keep" id="keep" />
                  <Label htmlFor="keep" className="font-normal">Keep — passed probation</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="extend" id="extend" />
                  <Label htmlFor="extend" className="font-normal">Extend — needs more time</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="let_go" id="let_go" />
                  <Label htmlFor="let_go" className="font-normal">Let go — recommend termination</Label>
                </div>
              </RadioGroup>

              {decision === "extend" && (
                <div className="pl-6 space-y-2">
                  <Label htmlFor="ext-days">Extend by (days)</Label>
                  <Select value={extensionDays} onValueChange={setExtensionDays}>
                    <SelectTrigger id="ext-days" className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="15">15 days</SelectItem>
                      <SelectItem value="21">21 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="45">45 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A new review will appear, due {extensionDays} days after this one.
                  </p>
                </div>
              )}

              {decision === "let_go" && (
                <div className="pl-6 space-y-3">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      The agent is <strong>not</strong> terminated immediately. HR has to confirm.
                      Once confirmed, the employee account is deactivated.
                    </AlertDescription>
                  </Alert>
                  <div>
                    <Label htmlFor="reason">Reason for recommending termination</Label>
                    <Textarea
                      id="reason"
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      placeholder="Be specific. HR will see this."
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirm-name">
                      Type the agent's full name to confirm: <strong>{expectedName}</strong>
                    </Label>
                    <Input
                      id="confirm-name"
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={expectedName}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || completeMut.isPending}>
            {completeMut.isPending ? "Saving…" : "Save review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HR confirmation dialog
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmTerminationDialog({
  review,
  onClose,
}: {
  review: AgentReviewWithJoins;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const confirmMut = useConfirmReviewTermination();
  const [hrNotes, setHrNotes] = useState("");

  async function handle(confirm: boolean) {
    try {
      await confirmMut.mutateAsync({
        reviewId: review.id,
        confirm,
        hrNotes: hrNotes || undefined,
      });
      toast({
        title: confirm ? "Termination confirmed" : "Termination denied",
        description: confirm
          ? "Employee account has been deactivated."
          : "The agent stays active. The TL will see your decision.",
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast({ title: "Couldn't update", description: msg, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm termination — {review.employee?.full_name}</DialogTitle>
          <DialogDescription>
            {review.reviewer?.full_name ?? "TL"} recommended letting this agent go after their 30-day review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div><strong>Reason:</strong> {review.decision_reason || "—"}</div>
            {review.notes && <div><strong>Week notes:</strong> {review.notes}</div>}
            <div className="text-xs text-muted-foreground">
              Scores: attendance {review.attendance_score}/5 · KPI {review.kpi_score}/5 · attitude {review.attitude_score}/5
            </div>
          </div>

          <div>
            <Label htmlFor="hr-notes">HR notes (optional, recorded with the decision)</Label>
            <Textarea
              id="hr-notes"
              value={hrNotes}
              onChange={(e) => setHrNotes(e.target.value)}
              rows={2}
            />
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Confirming will set the employee to <strong>terminated</strong> with reason
              "failed_30_day_review". This blocks future logins and triggers the offboarding flow.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={() => handle(false)} disabled={confirmMut.isPending}>
            Deny — keep employed
          </Button>
          <Button variant="destructive" onClick={() => handle(true)} disabled={confirmMut.isPending}>
            <ClipboardCheck className="mr-2 h-4 w-4" /> Confirm termination
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Score 1-5 selector
// ─────────────────────────────────────────────────────────────────────────────

function ScoreField({
  label, value, onChange,
}: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <Label>{label}: <span className="font-mono">{value}/5</span></Label>
      <div className="mt-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant={value === n ? "default" : "outline"}
            onClick={() => onChange(n)}
            className="w-10"
          >
            {n}
          </Button>
        ))}
      </div>
    </div>
  );
}
