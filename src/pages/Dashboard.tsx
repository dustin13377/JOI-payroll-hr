import { useEmployees, useActivePeriod, usePayrollRecords, useCreatePeriod, getCurrentPeriodDates, formatPeriodLabel, recordToConfig } from "@/hooks/useSupabasePayroll";
import { calcularNomina } from "@/types/payroll";
import { useCurrentPayPeriod, useCurrentPeriodTotal } from "@/hooks/usePayroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Users, DollarSign, TrendingUp, Calculator, Upload, Pencil, ChevronDown, ChevronUp, AlertTriangle, UserPlus } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { getPayrollCutoffInfo, formatDateES, type PayrollCutoffInfo } from "@/utils/payrollCutoff";
import { parseTCW, type TCWResult } from "@/utils/tcwParser";
import { usePublishedPosts, useMyAcks, useAcknowledgePost, useCurrentRecognition } from "@/hooks/useBulletin";
import { useAuth } from "@/hooks/useAuth";
import { Megaphone, CheckCircle2, Trophy, Star } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { employeeId } = useAuth();
  const navigate = useNavigate();
  const { data: publishedPosts = [] } = usePublishedPosts();
  const { data: myAcks = new Set<string>() } = useMyAcks();
  const acknowledge = useAcknowledgePost();
  const { data: currentRecognition } = useCurrentRecognition();
  const unreadPosts = publishedPosts.filter((p) => p.requires_ack && !myAcks.has(p.id));

  const { data: employees = [], isLoading: loadingEmps } = useEmployees();
  // OLD: useActivePeriod() — queries lowercase status="open"; broken after Phase 1
  //      rename to status="OPEN". Kept for compat with legacy code paths below.
  const { data: activePeriod, isLoading: loadingPeriod } = useActivePeriod();
  // NEW: useCurrentPayPeriod queries uppercase "OPEN" — the real source of truth.
  // This is what the KPI cards and cutoff banner now read from.
  const { data: currentPeriod } = useCurrentPayPeriod();
  // NEW: sum of total_pay across every payroll_record in every week of the current period.
  const { data: currentPeriodTotal } = useCurrentPeriodTotal();
  const createPeriod = useCreatePeriod();
  const { data: records = [] } = usePayrollRecords(activePeriod?.id);

  // ========== State for Payroll Cutoff ==========
  const [cutoffInfo, setCutoffInfo] = useState<PayrollCutoffInfo | null>(null);
  const [cutoffOverrideOpen, setCutoffOverrideOpen] = useState(false);
  const [cutoffOverrideDate, setCutoffOverrideDate] = useState("");
  const [overriddenCutoff, setOverriddenCutoff] = useState<Date | null>(null);

  // ========== State for TCW Upload ==========
  const [tcwAlerts, setTcwAlerts] = useState<TCWResult[]>([]);
  const [tcwAlertCount, setTcwAlertCount] = useState(0);
  const [tcwCollapsed, setTcwCollapsed] = useState(true);
  const tcwFileInputRef = useRef<HTMLInputElement>(null);

  // ========== State for Spiff Upload ==========
  const [spiffPreviewOpen, setSpiffPreviewOpen] = useState(false);
  const [spiffPreviewData, setSpiffPreviewData] = useState<Array<{ agentName: string; matchedEmployee: string | null; amount: number }>>([]);
  const [spiffCampaignName, setSpiffCampaignName] = useState("");
  const [spiffFileInputRef] = useState(useRef<HTMLInputElement>(null));
  const [isApplyingSpiff, setIsApplyingSpiff] = useState(false);

  // Auto-create period if none exists
  useEffect(() => {
    if (!loadingPeriod && !activePeriod && !createPeriod.isPending) {
      createPeriod.mutate(getCurrentPeriodDates());
    }
  }, [loadingPeriod, activePeriod]);

  // Initialize cutoff info
  useEffect(() => {
    setCutoffInfo(getPayrollCutoffInfo());
  }, []);

  // Use the new currentPeriod (uppercase OPEN) for the visible label.
  // formatPeriodLabel works fine — currentPeriod has start_date + end_date.
  const periodLabel = formatPeriodLabel(currentPeriod ?? activePeriod);

  // Phase 4b: Biweekly Payroll = sum of payroll_records.total_pay across every
  // week in the current open period. Returns 0 if no period or no records yet.
  // Click into /admin/payroll/week/[id] for per-week breakdowns.
  const totalNomina = currentPeriodTotal?.total ?? 0;

  const promedioSalarial = employees.length
    ? employees.reduce((s, e) => s + e.sueldoBase, 0) / employees.length
    : 0;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "MXN" });

  const cards = [
    { title: "Total Employees", value: employees.length, icon: Users, format: false },
    { title: "Biweekly Payroll", value: totalNomina, icon: DollarSign, format: true },
    { title: "Average Salary", value: promedioSalarial, icon: TrendingUp, format: true },
    { title: "Current Period", value: periodLabel, icon: Calculator, format: false },
  ];

  // ========== Payroll Cutoff Handlers ==========
  const getCutoffColor = (urgency: string) => {
    switch (urgency) {
      case "normal":
        return "bg-primary/5";
      case "soon":
        return "bg-yellow-50";
      case "urgent":
        return "bg-red-50";
      case "overdue":
        return "bg-red-900";
      default:
        return "bg-muted";
    }
  };

  const getCutoffTextColor = (urgency: string) => {
    return urgency === "overdue" ? "text-white" : "text-gray-900";
  };

  const handleCutoffOverride = () => {
    if (cutoffOverrideDate) {
      const newDate = new Date(cutoffOverrideDate);
      setOverriddenCutoff(newDate);
      setCutoffOverrideOpen(false);
      setCutoffOverrideDate("");
    }
  };

  const handleResetCutoff = () => {
    setOverriddenCutoff(null);
  };

  // ========== TCW Upload Handlers ==========
  const handleTCWUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target?.result as string;
      const knownEmployeeNames = employees.map((e) => e.nombre);
      const results = parseTCW(csv, knownEmployeeNames);
      setTcwAlerts(results);

      // Count non-ok alerts
      const alertCount = results.filter((r) => r.status !== "ok").length;
      setTcwAlertCount(alertCount);
      setTcwCollapsed(false);
    };
    reader.readAsText(file);
  };

  const handleTCWFileClick = () => {
    tcwFileInputRef.current?.click();
  };

  // ========== Spiff Upload Handlers ==========
  const handleSpiffUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;

    let allPreviewData: Array<{ agentName: string; matchedEmployee: string | null; amount: number }> = [];

    // Process all selected files
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const csv = event.target?.result as string;
        const rows = csv.split("\n").map((line) => line.trim()).filter((line) => line);

        if (rows.length > 1) {
          // Skip header if present, assume first column = agent name, second = amount
          const dataRows = rows.slice(1);
          const knownEmployeeNames = employees.map((e) => e.nombre);

          dataRows.forEach((row) => {
            const cols = row.split(",").map((c) => c.trim());
            if (cols.length >= 2) {
              const agentName = cols[0];
              const amountStr = cols[1];
              const amount = parseFloat(amountStr) || 0;

              // Try to match agent name to known employee
              const normalizedAgent = agentName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const matched = knownEmployeeNames.find(
                (e) => e.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalizedAgent
              ) || null;

              allPreviewData.push({
                agentName,
                matchedEmployee: matched,
                amount,
              });
            }
          });
        }

        // Set preview data
        setSpiffPreviewData(allPreviewData);
        setSpiffCampaignName(file.name.replace(/\.csv$/, ""));
        setSpiffPreviewOpen(true);
      };
      reader.readAsText(file);
    });
  };

  const handleConfirmSpiff = async () => {
    // DISABLED 2026-06-17 — SPIFF apply via the legacy path is broken against the
    // live schema. useUpsertPayrollRecord writes { period_id, additional_bonuses }
    // with onConflict "employee_id,period_id" — none of which exist on the current
    // payroll_records table (keyed by week_id; bonuses live in extra_bonus). It used
    // to early-return on the always-null activePeriod, silently dropping bonuses.
    // Now it fails loudly so nobody believes the import worked. Real rewire (write by
    // week_id into extra_bonus) belongs to Joe's rework — see docs/payroll-rework.md.
    toast.error(
      "SPIFF import is temporarily disabled while payroll is being reworked. No bonuses were applied — apply these manually for now."
    );
    setSpiffPreviewOpen(false);
    setSpiffPreviewData([]);
    setSpiffCampaignName("");
  };

  const handleSpiffFileClick = () => {
    spiffFileInputRef.current?.click();
  };

  if (loadingEmps) {
    return <div className="flex items-center justify-center py-20"><LogoLoadingIndicator /></div>;
  }

  const displayCutoffDate = overriddenCutoff || cutoffInfo?.suggestedCutoff;
  const displayCutoffUrgency = overriddenCutoff ? cutoffInfo?.urgency : cutoffInfo?.urgency;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Payroll overview and management</p>
      </div>

      {/* ========== PAYROLL CUTOFF BANNER ========== */}
      {cutoffInfo && (
        <div className={`rounded-xl p-5 ${getCutoffColor(displayCutoffUrgency || "")}`}>
          <div className={`${getCutoffTextColor(displayCutoffUrgency || "")} space-y-2`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">Current Period</p>
                <p className="text-xs opacity-90">{cutoffInfo.periodLabel}</p>
              </div>
              <div>
                <p className="font-semibold text-sm">Pay Date</p>
                <p className="text-xs opacity-90">{formatDateES(cutoffInfo.payday)}</p>
              </div>
              <div>
                <p className="font-semibold text-sm">Suggested Cutoff</p>
                <p className="text-xs opacity-90">
                  {formatDateES(displayCutoffDate || cutoffInfo.suggestedCutoff)}
                  {overriddenCutoff && " (date adjusted)"}
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm">Days Remaining</p>
                <p className="text-xs opacity-90">{cutoffInfo.daysUntilCutoff} days</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCutoffOverrideOpen(true)}
                  className={`p-1.5 rounded hover:opacity-80 transition ${getCutoffTextColor(displayCutoffUrgency || "")}`}
                  title="Adjust cutoff date"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {overriddenCutoff && (
                  <button
                    onClick={handleResetCutoff}
                    className={`text-xs underline hover:opacity-80 transition ${getCutoffTextColor(displayCutoffUrgency || "")}`}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== CUTOFF OVERRIDE DIALOG ========== */}
      <Dialog open={cutoffOverrideOpen} onOpenChange={setCutoffOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Cutoff Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              type="date"
              value={cutoffOverrideDate}
              onChange={(e) => setCutoffOverrideDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCutoffOverrideOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCutoffOverride}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== ANNOUNCEMENTS WIDGET ========== */}
      {unreadPosts.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              {unreadPosts.length === 1
                ? "1 unread announcement"
                : `${unreadPosts.length} unread announcements`}
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/comunicados")}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {unreadPosts.slice(0, 3).map((post) => (
              <div key={post.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{post.title}</p>
                  {post.body && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{post.body}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 gap-1 text-xs"
                  disabled={acknowledge.isPending}
                  onClick={() => {
                    if (!employeeId) return;
                    acknowledge.mutate(
                      { postId: post.id, employeeId },
                      { onSuccess: () => toast.success("Marked as read") }
                    );
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Read
                </Button>
              </div>
            ))}
            {unreadPosts.length > 3 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{unreadPosts.length - 3} more — <button className="underline" onClick={() => navigate("/comunicados")}>view all</button>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========== EMPLOYEE OF THE MONTH ========== */}
      {currentRecognition && (
        <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-300 dark:from-yellow-950/30 dark:to-amber-950/30 dark:border-yellow-700">
          <CardContent className="pt-4">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/50 p-3 shrink-0">
                <Trophy className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-400">
                  {currentRecognition.title}
                </p>
                <p className="text-xl font-bold">
                  {currentRecognition.recognized_employee_name ?? "—"}
                </p>
                {currentRecognition.body && (
                  <p className="text-sm text-muted-foreground">{currentRecognition.body}</p>
                )}
              </div>
              <Star className="h-5 w-5 text-yellow-400 fill-yellow-400 shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== SUMMARY CARDS ========== */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {typeof c.value === "number" && c.format ? fmt(c.value) : c.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ========== TCW & SPIFF UPLOAD BUTTONS ========== */}
      <div className="flex gap-2">
        <Button
          onClick={handleTCWFileClick}
          variant="outline"
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Upload TCW Timesheet
          {tcwAlertCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {tcwAlertCount}
            </Badge>
          )}
        </Button>
        <input
          ref={tcwFileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleTCWUpload}
        />

        <Button
          onClick={handleSpiffFileClick}
          variant="outline"
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Upload Spiffs
        </Button>
        <input
          ref={spiffFileInputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={handleSpiffUpload}
        />
      </div>

      {/* ========== TCW ALERTS SECTION ========== */}
      {tcwAlerts.length > 0 && (
        <Card>
          <Collapsible open={!tcwCollapsed} onOpenChange={(open) => setTcwCollapsed(!open)}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">TCW Alerts</CardTitle>
                  {tcwCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-3">
                  {tcwAlerts.map((alert, idx) => {
                    const badgeColor =
                      alert.status === "critical"
                        ? "destructive"
                        : alert.status === "warning"
                        ? "secondary"
                        : alert.status === "new"
                        ? "default"
                        : "outline";

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 rounded-xl bg-muted/50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{alert.name}</span>
                            <Badge variant={badgeColor} className="text-xs">
                              {alert.status === "critical"
                                ? "Critical"
                                : alert.status === "warning"
                                ? "Warning"
                                : alert.status === "new"
                                ? "New"
                                : "OK"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>Total hours: {alert.totalHours.toFixed(1)}</p>
                            {alert.hoursDeficit > 0 && (
                              <p className="text-red-600">Deficit: {alert.hoursDeficit.toFixed(1)} hours</p>
                            )}
                          </div>
                        </div>
                        {alert.matchedEmployee && (
                          <a
                            href={`/employees/${alert.matchedEmployee}`}
                            className="text-xs text-blue-600 hover:underline ml-4"
                          >
                            View Profile
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* ========== SPIFF PREVIEW DIALOG ========== */}
      <Dialog open={spiffPreviewOpen} onOpenChange={setSpiffPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview - {spiffCampaignName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {spiffPreviewData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data to display</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Agent Name</th>
                      <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Matched Employee</th>
                      <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spiffPreviewData.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`hover:bg-muted/50 transition-colors ${
                          !item.matchedEmployee ? "bg-yellow-50/50" : ""
                        }`}
                      >
                        <td className="p-3">{item.agentName}</td>
                        <td className="p-3">
                          {item.matchedEmployee ? (
                            <span className="text-green-700">{item.matchedEmployee}</span>
                          ) : (
                            <span className="text-yellow-700 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              No match
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-semibold">{fmt(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSpiffPreviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSpiff}
              disabled={isApplyingSpiff}
            >
              {isApplyingSpiff ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== EMPLOYEE PAYROLL TABLE ========== */}
      {employees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Biweekly Summary — {periodLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">ID</th>
                    <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                    <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Base Salary</th>
                    <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Biweekly Net</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Per-employee biweekly net was computed here via calcularNomina().
                      That function was removed in Phase 2 — net pay now lives at /admin/payroll.
                      Placeholder dashes until Phase 4c retires this table entirely. */}
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-muted/50 transition-colors">
                      <td className="p-3">{emp.id}</td>
                      <td className="p-3">{emp.nombre}</td>
                      <td className="p-3 text-right">{fmt(emp.sueldoBase)}</td>
                      <td className="p-3 text-right font-semibold text-muted-foreground">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
