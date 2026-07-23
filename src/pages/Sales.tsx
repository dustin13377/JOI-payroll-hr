import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSalesLeads, fullName } from "@/hooks/useSalesLeads";
import { LeadTable } from "@/components/sales/LeadTable";
import { LeadDrawer } from "@/components/sales/LeadDrawer";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SALES_STAGES, SALES_STAGE_LABELS, isTerminalStage } from "@/lib/sales/stages";
import { Search } from "lucide-react";

const FILTER_ACTIVE = "active";

export default function Sales() {
  const { data: leads = [], isLoading, error } = useSalesLeads();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(FILTER_ACTIVE);
  const autoEnriched = useRef<Set<string>>(new Set());

  // Auto-read the website for any lead we haven't profiled yet. Runs the first
  // time leads load (and when new ones arrive). Sequential + best-effort so we
  // don't hammer sites; the drawer's Refresh button covers retries.
  useEffect(() => {
    const pending = leads.filter(
      (l) => l.profile_status === "pending" && !autoEnriched.current.has(l.id),
    );
    if (pending.length === 0) return;
    pending.forEach((l) => autoEnriched.current.add(l.id));
    let cancelled = false;
    (async () => {
      for (const l of pending) {
        if (cancelled) return;
        try {
          await supabase.functions.invoke("enrich-lead", { body: { lead_id: l.id } });
          if (!cancelled) qc.invalidateQueries({ queryKey: ["sales", "leads"] });
        } catch {
          // ignore — Refresh in the drawer can retry
        }
      }
    })();
    return () => { cancelled = true; };
  }, [leads, qc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (stageFilter === FILTER_ACTIVE) {
        if (isTerminalStage(lead.stage)) return false;
      } else if (stageFilter !== "all") {
        if (lead.stage !== stageFilter) return false;
      }
      if (!q) return true;
      return (
        (lead.company ?? "").toLowerCase().includes(q) ||
        fullName(lead).toLowerCase().includes(q) ||
        (lead.email ?? "").toLowerCase().includes(q) ||
        (lead.website ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, search, stageFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Sales Leads</h2>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${filtered.length} of ${leads.length} lead${leads.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, name, email, website…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ACTIVE}>Active (open leads)</SelectItem>
            <SelectItem value="all">All stages</SelectItem>
            {SALES_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{SALES_STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="text-sm text-destructive">
          Failed to load leads: {(error as Error).message}
        </div>
      )}

      <LeadTable leads={filtered} onRowClick={setSelectedId} />

      <LeadDrawer leadId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
