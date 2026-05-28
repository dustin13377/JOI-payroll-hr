import { useMemo, useState } from "react";
import { useCandidates } from "@/hooks/useRecruiting";
import { CandidateTable } from "@/components/recruiting/CandidateTable";
import { CandidateDrawer } from "@/components/recruiting/CandidateDrawer";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGES, STAGE_LABELS } from "@/lib/recruiting/stages";
import { Search } from "lucide-react";

const STAGE_FILTER_ACTIVE = "active";

export default function Recruiting() {
  const { data: candidates = [], isLoading, error } = useCandidates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(STAGE_FILTER_ACTIVE);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (stageFilter === STAGE_FILTER_ACTIVE) {
        if (c.stage === "hired" || c.stage === "passed" || c.stage === "withdrew" || c.stage === "ghosted") {
          return false;
        }
      } else if (stageFilter !== "all") {
        if (c.stage !== stageFilter) return false;
      }
      if (!q) return true;
      return (
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [candidates, search, stageFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Recruiting</h2>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${filtered.length} of ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STAGE_FILTER_ACTIVE}>Active (non-terminal)</SelectItem>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="text-sm text-destructive">Failed to load candidates: {error.message}</div>
      )}

      <CandidateTable candidates={filtered} onRowClick={setSelectedId} />

      <CandidateDrawer candidateId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
