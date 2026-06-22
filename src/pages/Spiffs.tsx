import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useTLCampaignsWithClient,
  useTLCampaignAgents,
  useSpiffsForWeek,
  useAllSpiffAgents,
  useCreateSpiff,
  useVoidSpiff,
  useVerifySpiffs,
  type SpiffAgent,
  type SpiffCampaign,
} from "@/hooks/useSpiffs";
import SpiffCsvUploadDialog from "@/components/SpiffCsvUploadDialog";
import SpiffCsvBatchesDialog from "@/components/SpiffCsvBatchesDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Banknote, ChevronLeft, ChevronRight, Plus, Trash2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { todayLocal } from "@/lib/localDate";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";

/* ------------------------------------------------------------------ */
/*  Week helpers                                                        */
/* ------------------------------------------------------------------ */

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekBounds(offset: number): { weekStart: string; weekEnd: string } {
  const today = new Date(todayLocal() + "T00:00:00");
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { weekStart: fmtDate(monday), weekEnd: fmtDate(sunday) };
}

function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface SpiffDraft {
  localId: number;
  employee_id: string;
  spiff_date: string;
  amount_usd: string;
  client_id: string;
  reason: string;
}

let nextLocalId = 1;
function makeEmptyDraft(defaultDate: string): SpiffDraft {
  return {
    localId: nextLocalId++,
    employee_id: "",
    spiff_date: defaultDate,
    amount_usd: "",
    client_id: "",
    reason: "",
  };
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: "unverified" | "pending" | "billed" | "void" }) {
  if (status === "unverified") {
    return (
      <Badge variant="outline" className="border-orange-400 text-orange-700 bg-orange-50">
        Unverified
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-700">
        Pending
      </Badge>
    );
  }
  if (status === "billed") {
    return (
      <Badge variant="outline" className="border-blue-400 text-blue-700">
        Billed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
      Void
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function Spiffs() {
  const { employeeId, isLeadership } = useAuth();

  const [weekOffset, setWeekOffset] = useState(0);
  const { weekStart, weekEnd } = getWeekBounds(weekOffset);

  const defaultDate = weekOffset === 0 ? todayLocal() : weekStart;

  const [drafts, setDrafts] = useState<SpiffDraft[]>([makeEmptyDraft(defaultDate)]);

  // Reset drafts when week changes so dates stay within the new week bounds
  useEffect(() => {
    const defaultDate = weekOffset === 0 ? todayLocal() : weekStart;
    setDrafts([makeEmptyDraft(defaultDate)]);
  }, [weekOffset, weekStart]);

  // Hooks
  const campaignsQuery = useTLCampaignsWithClient(employeeId);
  const campaigns: SpiffCampaign[] = campaignsQuery.data ?? [];

  const agentsQuery = useTLCampaignAgents(campaigns);
  const agents: SpiffAgent[] = agentsQuery.data ?? [];

  // Org-wide agent list (leadership only) used by the CSV upload matcher.
  const allAgentsQuery = useAllSpiffAgents(isLeadership);
  const allAgents: SpiffAgent[] = allAgentsQuery.data ?? [];

  const spiffsQuery = useSpiffsForWeek(weekStart, weekEnd);

  const createSpiff = useCreateSpiff();
  const voidSpiff = useVoidSpiff();
  const verifySpiffs = useVerifySpiffs();

  // Build agent map for quick lookups
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // Full-page loader if no employeeId yet
  if (!employeeId) {
    return (
      <div className="flex items-center justify-center h-64">
        <LogoLoadingIndicator size="md" />
      </div>
    );
  }

  /* -- Draft helpers -- */
  function updateDraft(localId: number, patch: Partial<SpiffDraft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.localId === localId ? { ...d, ...patch } : d))
    );
  }

  function addRow() {
    setDrafts((prev) => [...prev, makeEmptyDraft(defaultDate)]);
  }

  function removeRow(localId: number) {
    setDrafts((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((d) => d.localId !== localId);
    });
  }

  function handleAgentChange(localId: number, agentId: string) {
    const agent = agentMap.get(agentId);
    // Find campaigns for this agent
    const agentCampaigns = campaigns.filter((c) =>
      agents.some((a) => a.id === agentId && a.campaign_id === c.id)
    );
    // Auto-fill client_id only when agent is on exactly one campaign
    const client_id = agentCampaigns.length === 1 ? (agent?.client_id ?? "") : "";
    updateDraft(localId, { employee_id: agentId, client_id });
  }

  /* -- Save -- */
  async function handleSave() {
    // Validate
    for (const draft of drafts) {
      if (!draft.employee_id) {
        toast.error("Select an agent for every row.");
        return;
      }
      if (!draft.client_id) {
        toast.error("Select a client for every row.");
        return;
      }
      if (!draft.spiff_date) {
        toast.error("Date is required for every row.");
        return;
      }
      const amt = parseFloat(draft.amount_usd);
      if (!draft.amount_usd || isNaN(amt) || amt <= 0) {
        toast.error("Amount must be greater than $0 for every row.");
        return;
      }
      if (!draft.reason.trim()) {
        toast.error("Reason is required for every row.");
        return;
      }
    }

    try {
      await Promise.all(
        drafts.map((draft) =>
          createSpiff.mutateAsync({
            employee_id: draft.employee_id,
            client_id: draft.client_id,
            spiff_date: draft.spiff_date,
            amount_usd: parseFloat(draft.amount_usd),
            reason: draft.reason.trim(),
            created_by: employeeId,
          })
        )
      );
      toast.success(`${drafts.length} spiff${drafts.length !== 1 ? "s" : ""} saved`);
      setDrafts([makeEmptyDraft(defaultDate)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  /* -- Void -- */
  async function handleVoid(id: string) {
    try {
      await voidSpiff.mutateAsync(id);
      toast.success("Spiff voided");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  /* -- Verify -- */
  async function handleVerify(ids: string[]) {
    if (!employeeId || ids.length === 0) return;
    try {
      await verifySpiffs.mutateAsync({ ids, verified_by: employeeId });
      toast.success(
        ids.length === 1 ? "Spiff verified" : `${ids.length} spiffs verified`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const campaignsLoading = campaignsQuery.isLoading || agentsQuery.isLoading;
  const spiffsLoading = spiffsQuery.isLoading;
  const spiffs = spiffsQuery.data ?? [];

  // Unverified rows for this week (CSV uploads awaiting a manager's check).
  const unverifiedIds = spiffs.filter((s) => s.status === "unverified").map((s) => s.id);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Banknote className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Spiffs</h1>
      </div>

      {/* ============================================================ */}
      {/* Entry form                                                    */}
      {/* ============================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">New Spiff Entries</CardTitle>
            {isLeadership && (
              <div className="flex items-center gap-2">
                <SpiffCsvBatchesDialog />
                <SpiffCsvUploadDialog agents={allAgents} createdBy={employeeId} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {campaignsLoading ? (
            <div className="flex justify-center py-8">
              <LogoLoadingIndicator size="md" />
            </div>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active agents found on your campaigns.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left font-medium pb-2 pr-3 min-w-[160px]">Agent</th>
                      <th className="text-left font-medium pb-2 pr-3 min-w-[140px]">Date</th>
                      <th className="text-left font-medium pb-2 pr-3 min-w-[110px]">Amount (USD)</th>
                      <th className="text-left font-medium pb-2 pr-3 min-w-[200px]">Reason</th>
                      <th className="text-left font-medium pb-2 pr-3 min-w-[140px]">Client</th>
                      <th className="pb-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {drafts.map((draft) => {
                      const agentCampaigns = campaigns.filter((c) =>
                        agents.some(
                          (a) => a.id === draft.employee_id && a.campaign_id === c.id
                        )
                      );
                      const showClientPicker =
                        !!draft.employee_id && agentCampaigns.length > 1;
                      const agent = agentMap.get(draft.employee_id);

                      return (
                        <tr key={draft.localId}>
                          {/* Agent picker */}
                          <td className="py-2 pr-3">
                            <Select
                              value={draft.employee_id || undefined}
                              onValueChange={(v) => handleAgentChange(draft.localId, v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select agent" />
                              </SelectTrigger>
                              <SelectContent>
                                {agents.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.display_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>

                          {/* Date */}
                          <td className="py-2 pr-3">
                            <Input
                              type="date"
                              className="h-8 text-sm"
                              value={draft.spiff_date}
                              min={weekStart}
                              max={weekEnd}
                              onChange={(e) =>
                                updateDraft(draft.localId, { spiff_date: e.target.value })
                              }
                            />
                          </td>

                          {/* Amount */}
                          <td className="py-2 pr-3">
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="h-8 text-sm"
                              placeholder="0.00"
                              value={draft.amount_usd}
                              onChange={(e) =>
                                updateDraft(draft.localId, { amount_usd: e.target.value })
                              }
                            />
                          </td>

                          {/* Reason */}
                          <td className="py-2 pr-3">
                            <Input
                              className="h-8 text-sm"
                              placeholder="e.g. PB 6, 1ST PLACE"
                              value={draft.reason}
                              onChange={(e) =>
                                updateDraft(draft.localId, { reason: e.target.value })
                              }
                            />
                          </td>

                          {/* Client — picker if ambiguous, text label otherwise */}
                          <td className="py-2 pr-3">
                            {showClientPicker ? (
                              <Select
                                value={draft.client_id || undefined}
                                onValueChange={(v) =>
                                  updateDraft(draft.localId, { client_id: v })
                                }
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Select client" />
                                </SelectTrigger>
                                <SelectContent>
                                  {agentCampaigns.map((c) => (
                                    <SelectItem key={c.client_id} value={c.client_id}>
                                      {c.client_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {agent ? agent.client_name || "—" : "—"}
                              </span>
                            )}
                          </td>

                          {/* Remove row */}
                          <td className="py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={drafts.length <= 1}
                              onClick={() => removeRow(draft.localId)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Row
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={createSpiff.isPending}
                >
                  {createSpiff.isPending
                    ? "Saving…"
                    : `Save ${drafts.length} Spiff${drafts.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Week ledger                                                   */}
      {/* ============================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-lg">Week Ledger</CardTitle>
              {isLeadership && unverifiedIds.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-orange-400 text-orange-700 hover:bg-orange-50"
                  disabled={verifySpiffs.isPending}
                  onClick={() => handleVerify(unverifiedIds)}
                >
                  <BadgeCheck className="h-4 w-4 mr-1" />
                  Verify all ({unverifiedIds.length})
                </Button>
              )}
            </div>

            {/* Week navigation */}
            <div className="flex items-center gap-2">
              {weekOffset !== 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekOffset(0)}
                >
                  This week
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekOffset((o) => o - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[140px] text-center">
                {formatWeekLabel(weekStart, weekEnd)}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={weekOffset >= 0}
                onClick={() => setWeekOffset((o) => o + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {spiffsLoading ? (
            <div className="flex justify-center py-8">
              <LogoLoadingIndicator size="md" />
            </div>
          ) : spiffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No spiffs entered for this week yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {spiffs.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.employee_name}</TableCell>
                    <TableCell>
                      {new Date(s.spiff_date + "T00:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      ${s.amount_usd.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell>{s.reason}</TableCell>
                    <TableCell>{s.client_name}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {s.status === "unverified" && isLeadership && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-orange-700 hover:text-orange-800 hover:bg-orange-50"
                            disabled={verifySpiffs.isPending}
                            onClick={() => handleVerify([s.id])}
                          >
                            <BadgeCheck className="h-3.5 w-3.5 mr-1" />
                            Verify
                          </Button>
                        )}
                        {(s.status === "pending" || s.status === "unverified") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            disabled={voidSpiff.isPending}
                            onClick={() => handleVoid(s.id)}
                          >
                            Void
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
