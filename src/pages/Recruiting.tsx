import { useState } from "react";
import { useCandidates } from "@/hooks/useRecruiting";
import { CandidateTable } from "@/components/recruiting/CandidateTable";
import { CandidateDrawer } from "@/components/recruiting/CandidateDrawer";

export default function Recruiting() {
  const { data: candidates = [], isLoading, error } = useCandidates();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Recruiting</h2>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} in pipeline`}
        </p>
      </div>

      {error && (
        <div className="text-sm text-destructive">Failed to load candidates: {error.message}</div>
      )}

      <CandidateTable candidates={candidates} onRowClick={setSelectedId} />

      <CandidateDrawer candidateId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
