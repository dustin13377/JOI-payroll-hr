# Spiffs TL Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a leadership/TL-only Spiffs page where team leads enter spiffs for their agents, review this week's entries by status, and void pending ones.

**Architecture:** New `src/hooks/useSpiffs.ts` handles all `spiffs` table I/O (list by week, create, void, plus TL campaign/agent lookups). New `src/pages/Spiffs.tsx` renders a multi-row entry form above a this-week ledger with week navigation. Route `/spiffs` is guarded by `RequireTeamLeadOrAbove`; nav entry added to both TL and leadership sidebar lists.

**Tech Stack:** React 18, tanstack-query v5, shadcn/ui, Supabase PostgREST, sonner toasts, lucide-react, react-router-dom v6.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Regenerate | `src/integrations/supabase/types.ts` | Add `spiffs` table types |
| Create | `src/hooks/useSpiffs.ts` | All spiffs data: list, create, void, TL agent/campaign lookups |
| Create | `src/pages/Spiffs.tsx` | Entry form + week ledger page |
| Modify | `src/App.tsx` | Add `/spiffs` route (RequireTeamLeadOrAbove) |
| Modify | `src/components/AppSidebar.tsx` | "Spiffs" nav item in teamLeadItems + leadershipItems |

---

## Task 1: Regenerate Supabase Types

**Files:**
- Regenerate: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Run type generation**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
npx supabase gen types typescript --project-id jpaihltkrohdqkqlbqkf > src/integrations/supabase/types.ts
```

- [ ] **Step 2: Verify `spiffs` appears in the output**

```bash
grep -n "spiffs" src/integrations/supabase/types.ts | head -20
```

Expected: lines like `spiffs: { Row: { ... } }` in the Tables section.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: regenerate supabase types — add spiffs table"
```

---

## Task 2: Write `useSpiffs` hook

**Files:**
- Create: `src/hooks/useSpiffs.ts`

This hook exports:
1. `useTLCampaignsWithClient` — TL's campaigns (union of primary + join-table), includes `client_id`
2. `useTLCampaignAgents` — active agents on those campaigns, with their `campaign_id` → `client_id` resolved
3. `useSpiffsForWeek` — fetch spiffs for a date range, enriched with employee name + client name
4. `useCreateSpiff` — insert mutation
5. `useVoidSpiff` — update status='void' mutation

- [ ] **Step 1: Create the file with types and helpers**

Create `src/hooks/useSpiffs.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface SpiffRow {
  id: string;
  employee_id: string;
  client_id: string;
  spiff_date: string;          // YYYY-MM-DD
  amount_usd: number;
  reason: string;
  status: "pending" | "billed" | "void";
  invoice_line_id: string | null;
  billed_at: string | null;
  created_by: string | null;
  created_at: string;
  // Enriched client-side:
  employee_name: string;       // work_name ?? full_name
  client_name: string;
}

export interface SpiffCampaign {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
}

export interface SpiffAgent {
  id: string;              // employees.id (UUID)
  display_name: string;   // work_name ?? full_name
  campaign_id: string;
  client_id: string;
  client_name: string;
}

/* ------------------------------------------------------------------ */
/*  Helper                                                              */
/* ------------------------------------------------------------------ */

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 2: Add `useTLCampaignsWithClient`**

Append to `src/hooks/useSpiffs.ts`:

```ts
/* ================================================================== */
/*  useTLCampaignsWithClient                                           */
/*  Unions campaigns.team_lead_id + team_lead_campaigns join table.    */
/*  Includes client_id + client name (second query).                   */
/* ================================================================== */

export function useTLCampaignsWithClient(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["tl-campaigns-with-client", tlEmployeeId],
    enabled: !!tlEmployeeId,
    queryFn: async (): Promise<SpiffCampaign[]> => {
      if (!tlEmployeeId) return [];

      // 1. Two sources: direct team_lead_id + join table
      const [primaryRes, joinRes] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, client_id")
          .eq("team_lead_id", tlEmployeeId)
          .eq("is_active", true),
        supabase
          .from("team_lead_campaigns")
          .select("campaign:campaigns(id, name, client_id)")
          .eq("team_lead_id", tlEmployeeId),
      ]);
      if (primaryRes.error) throw primaryRes.error;
      if (joinRes.error) throw joinRes.error;

      type CampRaw = { id: string; name: string; client_id: string };
      const primary = (primaryRes.data ?? []) as CampRaw[];
      const fromJoin = ((joinRes.data ?? []) as { campaign: CampRaw | null }[])
        .map((r) => r.campaign)
        .filter((c): c is CampRaw => c !== null);

      // Dedupe by id
      const byId = new Map<string, CampRaw>();
      for (const c of [...primary, ...fromJoin]) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }
      const campaigns = Array.from(byId.values());
      if (campaigns.length === 0) return [];

      // 2. Fetch client names
      const clientIds = [...new Set(campaigns.map((c) => c.client_id).filter(Boolean))];
      const { data: clients, error: clientErr } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      if (clientErr) throw clientErr;

      const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]));

      return campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        client_id: c.client_id,
        client_name: clientMap.get(c.client_id) ?? "Unknown Client",
      })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
```

- [ ] **Step 3: Add `useTLCampaignAgents`**

Append to `src/hooks/useSpiffs.ts`:

```ts
/* ================================================================== */
/*  useTLCampaignAgents                                                */
/*  Active employees on the TL's campaign set.                         */
/*  Depends on useTLCampaignsWithClient result.                        */
/* ================================================================== */

export function useTLCampaignAgents(campaigns: SpiffCampaign[]) {
  const campaignIds = campaigns.map((c) => c.id);

  return useQuery({
    queryKey: ["tl-campaign-agents-spiffs", campaignIds],
    enabled: campaignIds.length > 0,
    queryFn: async (): Promise<SpiffAgent[]> => {
      const { data, error } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name, campaign_id")
        .in("campaign_id", campaignIds)
        .eq("is_active", true);
      if (error) throw error;

      const campMap = new Map(campaigns.map((c) => [c.id, c]));

      return (data ?? [])
        .filter((r) => r.campaign_id !== null)
        .map((r) => {
          const camp = campMap.get(r.campaign_id!)!;
          return {
            id: r.id,
            display_name: (r.work_name as string | null) ?? (r.full_name as string),
            campaign_id: r.campaign_id!,
            client_id: camp.client_id,
            client_name: camp.client_name,
          };
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });
}
```

- [ ] **Step 4: Add `useSpiffsForWeek`**

Append to `src/hooks/useSpiffs.ts`:

```ts
/* ================================================================== */
/*  useSpiffsForWeek                                                   */
/*  All spiffs with spiff_date in [weekStart, weekEnd].               */
/*  Enriches rows with employee_name + client_name.                    */
/* ================================================================== */

export function useSpiffsForWeek(weekStart: string, weekEnd: string) {
  return useQuery({
    queryKey: ["spiffs-week", weekStart, weekEnd],
    enabled: !!weekStart && !!weekEnd,
    queryFn: async (): Promise<SpiffRow[]> => {
      // 1. Fetch spiffs for the week
      const { data: spiffs, error: spiffsErr } = await supabase
        .from("spiffs")
        .select("id, employee_id, client_id, spiff_date, amount_usd, reason, status, invoice_line_id, billed_at, created_by, created_at")
        .gte("spiff_date", weekStart)
        .lte("spiff_date", weekEnd)
        .order("spiff_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (spiffsErr) throw spiffsErr;
      if (!spiffs || spiffs.length === 0) return [];

      // 2. Fetch employee names
      const empIds = [...new Set(spiffs.map((s) => s.employee_id))];
      const clientIds = [...new Set(spiffs.map((s) => s.client_id))];

      const [empRes, clientRes] = await Promise.all([
        supabase
          .from("employees_no_pay")
          .select("id, full_name, work_name")
          .in("id", empIds),
        supabase
          .from("clients")
          .select("id, name")
          .in("id", clientIds),
      ]);
      if (empRes.error) throw empRes.error;
      if (clientRes.error) throw clientRes.error;

      const empMap = new Map(
        (empRes.data ?? []).map((e) => [
          e.id,
          (e.work_name as string | null) ?? (e.full_name as string),
        ])
      );
      const clientMap = new Map(
        (clientRes.data ?? []).map((c) => [c.id, c.name as string])
      );

      return spiffs.map((s) => ({
        ...s,
        amount_usd: Number(s.amount_usd),
        status: s.status as SpiffRow["status"],
        employee_name: empMap.get(s.employee_id) ?? s.employee_id,
        client_name: clientMap.get(s.client_id) ?? s.client_id,
      }));
    },
  });
}
```

- [ ] **Step 5: Add `useCreateSpiff` and `useVoidSpiff`**

Append to `src/hooks/useSpiffs.ts`:

```ts
/* ================================================================== */
/*  useCreateSpiff                                                      */
/* ================================================================== */

export interface CreateSpiffInput {
  employee_id: string;
  client_id: string;
  spiff_date: string;
  amount_usd: number;
  reason: string;
  created_by: string;  // caller passes employeeId from useAuth()
}

export function useCreateSpiff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSpiffInput) => {
      const { error } = await supabase.from("spiffs").insert({
        employee_id: input.employee_id,
        client_id: input.client_id,
        spiff_date: input.spiff_date,
        amount_usd: input.amount_usd,
        reason: input.reason.trim(),
        created_by: input.created_by,
        source: "app",
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}

/* ================================================================== */
/*  useVoidSpiff                                                        */
/* ================================================================== */

export function useVoidSpiff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (spiffId: string) => {
      const { error } = await supabase
        .from("spiffs")
        .update({ status: "void" })
        .eq("id", spiffId)
        .eq("status", "pending"); // guard: only void pending
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSpiffs.ts
git commit -m "feat(spiffs): useSpiffs hook — list/create/void + TL campaign/agent lookups"
```

---

## Task 3: Build the Spiffs page

**Files:**
- Create: `src/pages/Spiffs.tsx`

The page has two sections:
1. **Entry form** — table of draft rows (agent, date, amount, reason, client). "Add Row" + "Save All" buttons.
2. **This week's ledger** — table of committed spiffs with status badge and Void button on pending rows.

Week navigation (← / →) controls both the ledger filter and the default date in new rows.

- [ ] **Step 1: Create the file with imports, types, and week helpers**

Create `src/pages/Spiffs.tsx`:

```tsx
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useTLCampaignsWithClient,
  useTLCampaignAgents,
  useSpiffsForWeek,
  useCreateSpiff,
  useVoidSpiff,
  type SpiffAgent,
  type SpiffCampaign,
} from "@/hooks/useSpiffs";
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
import { Banknote, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { todayLocal } from "@/lib/localDate";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";

/* ------------------------------------------------------------------ */
/*  Week helpers                                                        */
/* ------------------------------------------------------------------ */

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const fmt = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

/* ------------------------------------------------------------------ */
/*  Draft row type                                                      */
/* ------------------------------------------------------------------ */

interface SpiffDraft {
  localId: number;
  employee_id: string;
  spiff_date: string;
  amount_usd: string;
  reason: string;
  client_id: string;
}

let nextId = 1;

function emptyDraft(defaultDate: string): SpiffDraft {
  return {
    localId: nextId++,
    employee_id: "",
    spiff_date: defaultDate,
    amount_usd: "",
    reason: "",
    client_id: "",
  };
}
```

- [ ] **Step 2: Add the status badge helper and the main component scaffold**

Append to `src/pages/Spiffs.tsx`:

```tsx
/* ------------------------------------------------------------------ */
/*  Status badge                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: "pending" | "billed" | "void" }) {
  if (status === "pending") return <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>;
  if (status === "billed") return <Badge variant="outline" className="text-blue-600 border-blue-300">Billed</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Void</Badge>;
}

/* ================================================================== */
/*  Page                                                                */
/* ================================================================== */

export default function Spiffs() {
  const { employeeId, isLeadership } = useAuth();

  // Week navigation — offset 0 = current week
  const [weekOffset, setWeekOffset] = useState(0);
  const { weekStart, weekEnd } = getWeekBounds(weekOffset);

  // Draft rows for entry form
  const [drafts, setDrafts] = useState<SpiffDraft[]>([emptyDraft(weekOffset === 0 ? todayLocal() : weekStart)]);
  const [saving, setSaving] = useState(false);

  // Data hooks
  const { data: campaigns = [], isLoading: campsLoading } = useTLCampaignsWithClient(employeeId);
  const { data: agents = [], isLoading: agentsLoading } = useTLCampaignAgents(campaigns);
  const { data: spiffs = [], isLoading: spiffsLoading } = useSpiffsForWeek(weekStart, weekEnd);
  const createSpiff = useCreateSpiff();
  const voidSpiff = useVoidSpiff();

  if (!employeeId) {
    return (
      <div className="flex items-center justify-center h-48">
        <LogoLoadingIndicator size="lg" />
      </div>
    );
  }

  // Build a map: agent.id → { client_id, client_name } for auto-fill
  const agentMap = new Map<string, SpiffAgent>(agents.map((a) => [a.id, a]));

  /* ---------------------------------------------------------------- */
  /*  Draft row handlers                                               */
  /* ---------------------------------------------------------------- */

  function addRow() {
    const defaultDate = weekOffset === 0 ? todayLocal() : weekStart;
    setDrafts((prev) => [...prev, emptyDraft(defaultDate)]);
  }

  function removeRow(localId: number) {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }

  function updateDraft(localId: number, patch: Partial<SpiffDraft>) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.localId !== localId) return d;
        const updated = { ...d, ...patch };
        // Auto-fill client when agent changes
        if ("employee_id" in patch && patch.employee_id) {
          const agent = agentMap.get(patch.employee_id);
          if (agent) {
            updated.client_id = agent.client_id;
          }
        }
        return updated;
      })
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Save all drafts                                                  */
  /* ---------------------------------------------------------------- */

  async function handleSave() {
    // Validate
    const errors: string[] = [];
    drafts.forEach((d, i) => {
      if (!d.employee_id) errors.push(`Row ${i + 1}: select an agent`);
      if (!d.client_id) errors.push(`Row ${i + 1}: client is required`);
      if (!d.spiff_date) errors.push(`Row ${i + 1}: date is required`);
      const amt = parseFloat(d.amount_usd);
      if (isNaN(amt) || amt === 0) errors.push(`Row ${i + 1}: amount must be non-zero`);
      if (!d.reason.trim()) errors.push(`Row ${i + 1}: reason is required`);
    });
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        drafts.map((d) =>
          createSpiff.mutateAsync({
            employee_id: d.employee_id,
            client_id: d.client_id,
            spiff_date: d.spiff_date,
            amount_usd: parseFloat(d.amount_usd),
            reason: d.reason,
            created_by: employeeId,
          })
        )
      );
      toast.success(`${drafts.length} spiff${drafts.length !== 1 ? "s" : ""} saved`);
      const defaultDate = weekOffset === 0 ? todayLocal() : weekStart;
      setDrafts([emptyDraft(defaultDate)]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save spiffs");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Void handler                                                     */
  /* ---------------------------------------------------------------- */

  async function handleVoid(id: string) {
    try {
      await voidSpiff.mutateAsync(id);
      toast.success("Spiff voided");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to void spiff");
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  const isLoading = campsLoading || agentsLoading;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Banknote className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Spiffs</h1>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-40 text-center">
          {formatWeekLabel(weekStart, weekEnd)}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setWeekOffset((o) => o + 1)}
          disabled={weekOffset >= 0}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {weekOffset !== 0 && (
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
            This week
          </Button>
        )}
      </div>

      {/* Entry form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Spiffs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <LogoLoadingIndicator size="md" />
            </div>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active agents found on your campaigns.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left pb-2 pr-2 font-medium w-44">Agent</th>
                      <th className="text-left pb-2 pr-2 font-medium w-36">Date</th>
                      <th className="text-left pb-2 pr-2 font-medium w-28">Amount (USD)</th>
                      <th className="text-left pb-2 pr-2 font-medium">Reason</th>
                      <th className="text-left pb-2 pr-2 font-medium w-32">Client</th>
                      <th className="pb-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {drafts.map((draft) => {
                      const agentInfo = agentMap.get(draft.employee_id);
                      // Determine if the agent is on multiple campaigns
                      const agentCampaigns = campaigns.filter((c) =>
                        agents.some((a) => a.id === draft.employee_id && a.campaign_id === c.id)
                      );
                      const showClientPicker = draft.employee_id && agentCampaigns.length > 1;

                      return (
                        <tr key={draft.localId} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">
                            <Select
                              value={draft.employee_id}
                              onValueChange={(v) => updateDraft(draft.localId, { employee_id: v })}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select agent…" />
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
                          <td className="py-1.5 pr-2">
                            <Input
                              type="date"
                              className="h-8 text-sm"
                              value={draft.spiff_date}
                              min={weekStart}
                              max={weekEnd}
                              onChange={(e) => updateDraft(draft.localId, { spiff_date: e.target.value })}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              placeholder="0.00"
                              className="h-8 text-sm"
                              value={draft.amount_usd}
                              onChange={(e) => updateDraft(draft.localId, { amount_usd: e.target.value })}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              placeholder="e.g. PB 6, 1ST PLACE"
                              className="h-8 text-sm"
                              value={draft.reason}
                              onChange={(e) => updateDraft(draft.localId, { reason: e.target.value })}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            {showClientPicker ? (
                              <Select
                                value={draft.client_id}
                                onValueChange={(v) => updateDraft(draft.localId, { client_id: v })}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Pick client…" />
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
                                {agentInfo?.client_name ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeRow(draft.localId)}
                              disabled={drafts.length === 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Row
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : `Save ${drafts.length} Spiff${drafts.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* This week's ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {formatWeekLabel(weekStart, weekEnd)} — Entered Spiffs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {spiffsLoading ? (
            <div className="flex justify-center py-4">
              <LogoLoadingIndicator size="md" />
            </div>
          ) : spiffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spiffs entered for this week yet.</p>
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
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {spiffs.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.employee_name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.spiff_date}</TableCell>
                    <TableCell>
                      ${Number(s.amount_usd).toFixed(2)}
                    </TableCell>
                    <TableCell>{s.reason}</TableCell>
                    <TableCell className="text-muted-foreground">{s.client_name}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>
                      {s.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive h-7 text-xs"
                          onClick={() => handleVoid(s.id)}
                          disabled={voidSpiff.isPending}
                        >
                          Void
                        </Button>
                      )}
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
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Spiffs.tsx
git commit -m "feat(spiffs): Spiffs page — multi-row entry form + week ledger"
```

---

## Task 4: Add route to App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import**

In `src/App.tsx`, after the existing page imports, add:

```tsx
import Spiffs from "@/pages/Spiffs";
```

- [ ] **Step 2: Add route**

In `src/App.tsx`, inside the `<Routes>` block in the `AppLayout` section, add after the `/reviews` route (around line 161):

```tsx
<Route path="/spiffs" element={<RequireTeamLeadOrAbove><Spiffs /></RequireTeamLeadOrAbove>} />
```

- [ ] **Step 3: Verify the app compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(spiffs): add /spiffs route (RequireTeamLeadOrAbove)"
```

---

## Task 5: Add nav items to AppSidebar

**Files:**
- Modify: `src/components/AppSidebar.tsx`

- [ ] **Step 1: Add `Banknote` to the lucide-react import**

In `src/components/AppSidebar.tsx`, add `Banknote` to the existing import:

```tsx
import {
  LayoutDashboard,
  Users,
  History,
  LogOut,
  FileText,
  Clock,
  BarChart3,
  CalendarDays,
  Timer,
  ClipboardCheck,
  ClipboardList,
  Settings,
  Building2,
  Calculator,
  DollarSign,
  UserCog,
  FileCheck,
  ScrollText,
  CalendarCheck,
  PlusSquare,
  ClipboardEdit,
  ShieldCheck,
  Megaphone,
  UserPlus,
  Banknote,
} from "lucide-react";
```

- [ ] **Step 2: Add to `leadershipItems`**

In `src/components/AppSidebar.tsx`, in the `leadershipItems` array, add after the `Invoices (USD)` entry:

```tsx
{ title: "Spiffs", url: "/spiffs", icon: Banknote },
```

So the array looks like:
```tsx
const leadershipItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Employees", url: "/empleados", icon: Users },
  { title: "Payroll", url: "/admin/payroll", icon: DollarSign },
  { title: "Payroll History", url: "/historial", icon: History },
  { title: "Invoices (USD)", url: "/facturas", icon: FileText },
  { title: "Spiffs", url: "/spiffs", icon: Banknote },
  { title: "Campaigns", url: "/campaigns", icon: Building2 },
  { title: "Recruiting", url: "/recruiting", icon: UserPlus },
  { title: "My Policies", url: "/policies", icon: ScrollText },
  { title: "Announcements", url: "/comunicados", icon: Megaphone },
];
```

- [ ] **Step 3: Add to `teamLeadItems`**

In `src/components/AppSidebar.tsx`, in the `teamLeadItems` array, add after `30-Day Reviews`:

```tsx
{ title: "Spiffs", url: "/spiffs", icon: Banknote },
```

So the array looks like:
```tsx
const teamLeadItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "My Team", url: "/asistencia", icon: Users },
  { title: "30-Day Reviews", url: "/reviews", icon: ClipboardEdit },
  { title: "Spiffs", url: "/spiffs", icon: Banknote },
  { title: "Shift Settings", url: "/settings/shifts", icon: Settings },
  { title: "My Policies", url: "/policies", icon: ScrollText },
  { title: "My Timeclock", url: "/reloj", icon: Timer },
  { title: "My EOD History", url: "/eod", icon: ClipboardCheck },
  { title: "Request Time Off", url: "/vacation", icon: CalendarDays },
  { title: "Announcements", url: "/comunicados", icon: Megaphone },
];
```

- [ ] **Step 4: Verify TypeScript compiles clean**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat(spiffs): add Spiffs nav item for TL + leadership sidebar"
```

---

## Task 6: Push branch and open PR

- [ ] **Step 1: Verify current branch**

```bash
git branch --show-current
```

Expected: `feat/spiffs-tl-entry`. If you're on a different branch, the PR already asked for this branch:

```bash
git checkout -b feat/spiffs-tl-entry
```

- [ ] **Step 2: Check auth**

```bash
gh auth status
```

Expected: logged in. If not, stop and report.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/spiffs-tl-entry
```

- [ ] **Step 4: Confirm push**

```bash
git log origin/feat/spiffs-tl-entry..HEAD --oneline
```

Expected: empty (all commits are on remote).

- [ ] **Step 5: Open PR**

```bash
gh pr create \
  --base main \
  --title "feat: spiffs TL entry UI (Phase 2)" \
  --body "$(cat <<'EOF'
## Summary

- Regenerates Supabase types to include the `spiffs` table added in Phase 1
- Adds `useSpiffs.ts` hook: list by week (enriched with employee/client names), create, void
- Adds `/spiffs` page: multi-row entry form (agent picker limited to TL campaigns, auto-fills client_id, supports ambiguous campaign picker) + this-week ledger with status badges and Void button on pending rows
- Route `/spiffs` gated by `RequireTeamLeadOrAbove`
- Nav item added to both TL sidebar and leadership sidebar

## What's NOT in this PR (per spec)

- No changes to `FacturaNueva` / `generate_weekly_invoices` / `import-spiffs`
- No invoice-generation wiring (Phase 3)
- No sheet migration (Phase 4)

## Test plan

- [ ] Log in as a TL → Spiffs nav item appears; page loads with agents scoped to TL's campaigns
- [ ] Add a row, pick agent → client auto-fills from campaign
- [ ] Save → row appears in the ledger below with status "Pending"
- [ ] Click Void → status changes to "Void", button disappears
- [ ] Billed rows (if any exist) show "Billed" badge with no Void button
- [ ] Week nav ← / → filters the ledger to the correct Mon–Sun range
- [ ] Log in as leadership → Spiffs nav item appears, can enter spiffs for any agent
- [ ] Log in as an agent → `/spiffs` redirects to `/`
EOF
)"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Regenerate Supabase types | Task 1 |
| useSpiffs hook: list by week | Task 2 step 4 |
| useSpiffs hook: create | Task 2 step 5 |
| useSpiffs hook: void pending | Task 2 step 5 |
| Spiffs page + route + nav (leadership-only) | Tasks 3–5 |
| Agent picker limited to TL's campaigns | Task 2 steps 2–3 (useTLCampaignsWithClient + useTLCampaignAgents) |
| Auto-fill client_id from agent's campaign | Task 3 step 2, `updateDraft` auto-fill logic |
| Ambiguous client → let them pick | Task 3 step 2, `showClientPicker` logic |
| Multi-row entry before saving | Task 3 step 2, drafts array + Add Row |
| This week's spiffs + status badge | Task 3 step 2, ledger table + StatusBadge |
| Void button on pending rows only | Task 3 step 2, `s.status === "pending"` guard |
| Billed rows locked (no Void) | Task 3 step 2, Void button hidden for non-pending |
| Don't touch FacturaNueva / generate_weekly_invoices / import-spiffs | ✓ Not in scope |
| PR on feat/spiffs-tl-entry | Task 6 |

### Type Consistency

- `SpiffRow.status` typed as `"pending" | "billed" | "void"` in hook, cast from DB string in queryFn — consistent with `StatusBadge` props and `useVoidSpiff` `.eq("status", "pending")` guard.
- `SpiffAgent.id` matches `employees_no_pay.id` (UUID), used as `employee_id` in `CreateSpiffInput` — consistent.
- `SpiffCampaign.client_id` flows into `SpiffAgent.client_id` and into `CreateSpiffInput.client_id` — consistent.
- `fmtDate` helper is defined locally in both `useSpiffs.ts` (not exported, used only in hook if needed) and `Spiffs.tsx` — no cross-file dependency issue since each file uses its own.
