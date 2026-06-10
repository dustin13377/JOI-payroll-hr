import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCandidates } from "@/hooks/useRecruiting";
import { CandidateTable } from "@/components/recruiting/CandidateTable";
import { CandidateDrawer } from "@/components/recruiting/CandidateDrawer";
import { UpcomingInterviews } from "@/components/recruiting/UpcomingInterviews";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGES, STAGE_LABELS } from "@/lib/recruiting/stages";
import { Check, Copy, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";

const BOOKING_URL = "https://calendly.com/humanresources-justoutsource/30min";

const STAGE_FILTER_ACTIVE = "active";

export default function Recruiting() {
  const { data: candidates = [], isLoading, error } = useCandidates();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(STAGE_FILTER_ACTIVE);
  const [copied, setCopied] = useState(false);

  const copyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(BOOKING_URL);
      setCopied(true);
      toast.success("Interview booking link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  // Deep-link: /recruiting?candidate=<id> opens that candidate's drawer.
  // Hired candidates are normally filtered out (terminal), so we also flip
  // the stage filter to "all" — otherwise the deep-link target is invisible.
  const candidateParam = searchParams.get("candidate");
  useEffect(() => {
    if (!candidateParam) return;
    setSelectedId(candidateParam);
    setStageFilter("all");
  }, [candidateParam]);

  const handleCloseDrawer = () => {
    setSelectedId(null);
    if (searchParams.get("candidate")) {
      searchParams.delete("candidate");
      setSearchParams(searchParams, { replace: true });
    }
  };

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Recruiting</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${filtered.length} of ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={copyBookingLink}>
            {copied ? (
              <Check className="mr-2 h-4 w-4 text-green-600" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied!" : "Copy interview booking link"}
          </Button>
          <Button asChild variant="ghost" size="sm" title="Open the booking page">
            <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      <UpcomingInterviews />

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

      <CandidateDrawer candidateId={selectedId} onClose={handleCloseDrawer} />
    </div>
  );
}
