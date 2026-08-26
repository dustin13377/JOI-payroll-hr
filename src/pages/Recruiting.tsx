import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCandidates, useApplicationStats } from "@/hooks/useRecruiting";
import { CandidateTable, appliedRoleLabel } from "@/components/recruiting/CandidateTable";
import { CandidateDrawer } from "@/components/recruiting/CandidateDrawer";
import { UpcomingInterviews } from "@/components/recruiting/UpcomingInterviews";
import { ManageRolesDialog } from "@/components/recruiting/ManageRolesDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGES, STAGE_LABELS } from "@/lib/recruiting/stages";
import { needsFollowUp } from "@/lib/recruiting/followup";
import { Check, Copy, ExternalLink, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";

const BOOKING_URL = "https://calendar.app.google/nw7EubnaE3gGhaaS8";

const STAGE_FILTER_ACTIVE = "active";
// Worklist: contacted candidates who've gone quiet and are due a second touch.
const STAGE_FILTER_FOLLOWUP = "needs_followup";

export default function Recruiting() {
  const { data: candidates = [], isLoading, error } = useCandidates();
  // Per-candidate application count + latest submission date, so re-applicants
  // bubble to the top and the table shows the most recent apply date instead of
  // the original one.
  const { data: appStats } = useApplicationStats();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(STAGE_FILTER_ACTIVE);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [manageRolesOpen, setManageRolesOpen] = useState(false);

  // Distinct job titles present across ALL candidates (not just the current
  // stage view), so switching stages never empties the role dropdown. Uses the
  // same label the table shows in its "Role" column, so options match rows.
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      const label = appliedRoleLabel(c);
      if (label && label !== "—") set.add(label);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [candidates]);

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

  // Effective "applied at" for sorting: latest submission from appStats, or
  // fall back to the candidate row's created_at when we have no stat yet (older
  // rows created before recruiting_applications existed, or referral inserts).
  const latestAppliedAt = (id: string, createdAt: string): string =>
    appStats?.get(id)?.latestAt ?? createdAt;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = candidates.filter((c) => {
      if (stageFilter === STAGE_FILTER_ACTIVE) {
        if (c.stage === "hired" || c.stage === "passed" || c.stage === "withdrew" || c.stage === "ghosted") {
          return false;
        }
      } else if (stageFilter === STAGE_FILTER_FOLLOWUP) {
        if (!needsFollowUp(c.stage, c.last_contacted_at)) return false;
      } else if (stageFilter !== "all") {
        if (c.stage !== stageFilter) return false;
      }
      if (roleFilter !== "all" && appliedRoleLabel(c) !== roleFilter) return false;
      if (!q) return true;
      return (
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q)
      );
    });
    // Re-sort by latest application date DESC so re-applicants surface at the
    // top the day they come back, instead of staying frozen at their original
    // application date. Server order stays created_at DESC as a stable tiebreak
    // for anything without stats (Array.prototype.sort is stable).
    return [...rows].sort((a, b) => {
      const bAt = latestAppliedAt(b.id, b.created_at);
      const aAt = latestAppliedAt(a.id, a.created_at);
      return bAt.localeCompare(aAt);
    });
  }, [candidates, search, stageFilter, roleFilter, appStats]);

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageRolesOpen(true)}
            title="Assign each role to a client"
          >
            <Settings2 className="mr-2 h-4 w-4" />
            Manage roles
          </Button>
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

      <ManageRolesDialog
        open={manageRolesOpen}
        onOpenChange={setManageRolesOpen}
      />

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
            <SelectItem value={STAGE_FILTER_FOLLOWUP}>Needs follow-up</SelectItem>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="All job titles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All job titles</SelectItem>
            {roleOptions.map((role) => (
              <SelectItem key={role} value={role}>{role}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="text-sm text-destructive">Failed to load candidates: {error.message}</div>
      )}

      <CandidateTable candidates={filtered} appStats={appStats} onRowClick={setSelectedId} />

      <CandidateDrawer candidateId={selectedId} onClose={handleCloseDrawer} />
    </div>
  );
}
