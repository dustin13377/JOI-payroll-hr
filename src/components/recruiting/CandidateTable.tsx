import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StageBadge } from "./StageBadge";
import { format } from "date-fns";
import {
  useAllClientApplicantPreferences,
  type Candidate,
  type ApplicationStat,
} from "@/hooks/useRecruiting";
import { AlertTriangle, RotateCw, UserCheck, Pause, X } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  b2b_setter: "B2B Setter",
  funding_activation: "Funding",
  customer_reactivation: "Reactivation",
  ai_automation: "AI Automation",
  ai_operations: "AI Operations",
};

/**
 * The role a candidate applied for. Prefers applied_position (verbatim form
 * value, works for any role); falls back to the legacy role_interest label for
 * older rows that predate applied_position.
 */
export function appliedRoleLabel(c: Candidate): string {
  if (c.applied_position) return c.applied_position;
  if (c.role_interest) return ROLE_LABELS[c.role_interest] ?? c.role_interest;
  return "—";
}

interface Props {
  candidates: Candidate[];
  /**
   * Per-candidate application count + latest submission date, from
   * `recruiting_applications`. Optional so callers that don't care about
   * repeat-applicant surfacing (or don't have the data yet on first paint)
   * still render fine — the table falls back to created_at.
   */
  appStats?: Map<string, ApplicationStat>;
  onRowClick: (id: string) => void;
}

export function CandidateTable({ candidates, appStats, onRowClick }: Props) {
  // Client-driven row highlights: want_interview -> green, back_burner -> sky.
  // Set by clients via the portal (ClientRoleDetail). Cached by react-query so
  // multiple mounts share the fetch; safe to call at row-container level.
  const { data: clientPrefs = new Map() } = useAllClientApplicantPreferences();

  if (candidates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No candidates yet. New form submissions will appear here automatically.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Position fit</TableHead>
          <TableHead>English</TableHead>
          <TableHead>City</TableHead>
          <TableHead>Applied</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidates.map((c) => {
          const stat = appStats?.get(c.id);
          const appliedAt = stat?.latestAt ?? c.created_at;
          const isRepeat = (stat?.count ?? 0) > 1;
          const pref = clientPrefs.get(c.id);
          // Client preference takes precedence over the amber repeat-applicant
          // shade — client signal is more actionable than "they came back."
          // Rejected rows just get a strikethrough hint via the name cell; no
          // full-row color (rejected candidates already get filtered on the
          // client side, so on JOI's side we only need to know it happened).
          const rowClass = (() => {
            if (pref === "want_interview") return "bg-green-50 hover:bg-green-100";
            if (pref === "back_burner") return "bg-sky-50 hover:bg-sky-100";
            if (isRepeat) return "bg-amber-50 hover:bg-amber-100";
            return "hover:bg-muted/50";
          })();
          return (
          <TableRow
            key={c.id}
            className={`cursor-pointer ${rowClass}`}
            onClick={() => onRowClick(c.id)}
          >
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <span className={pref === "reject" ? "line-through text-muted-foreground" : ""}>
                  {c.full_name ?? "—"}
                </span>
                {pref === "want_interview" && (
                  <Badge
                    variant="outline"
                    className="border-green-600 text-green-700 gap-1 text-xs"
                    title="Client wants to interview this candidate"
                  >
                    <UserCheck className="h-3 w-3" />
                    Client: interview
                  </Badge>
                )}
                {pref === "back_burner" && (
                  <Badge
                    variant="outline"
                    className="border-sky-600 text-sky-700 gap-1 text-xs"
                    title="Client wants this candidate on the back burner"
                  >
                    <Pause className="h-3 w-3" />
                    Client: back burner
                  </Badge>
                )}
                {pref === "reject" && (
                  <Badge
                    variant="outline"
                    className="border-rose-500 text-rose-700 gap-1 text-xs"
                    title="Client rejected — mark reviewed"
                  >
                    <X className="h-3 w-3" />
                    Client: rejected
                  </Badge>
                )}
                {isRepeat && (
                  <Badge
                    variant="outline"
                    className="border-amber-500 text-amber-700 gap-1 text-xs"
                    title={`Applied ${stat!.count} times — first on ${format(new Date(stat!.firstAt), "MMM d, yyyy")}`}
                  >
                    <RotateCw className="h-3 w-3" />
                    {stat!.count}×
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
            <TableCell>{appliedRoleLabel(c)}</TableCell>
            <TableCell>
              {c.position_fits?.length ? (
                <div className="flex flex-wrap gap-1">
                  {c.position_fits.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{c.english_level_self}</TableCell>
            <TableCell>{c.city ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {format(new Date(appliedAt), "MMM d, HH:mm")}
              {isRepeat && (
                <div className="text-xs text-muted-foreground/70">
                  First: {format(new Date(stat!.firstAt), "MMM d")}
                </div>
              )}
            </TableCell>
            <TableCell>
              <StageBadge stage={c.stage} />
              {c.stage === "offer" && c.offer_start_date && (
                <div
                  className={`mt-1 text-xs ${
                    c.offer_start_date < new Date().toISOString().slice(0, 10)
                      ? "text-destructive font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  Starts {format(new Date(`${c.offer_start_date}T00:00:00`), "MMM d")}
                </div>
              )}
            </TableCell>
            <TableCell>
              {c.needs_manual_review && (
                <AlertTriangle className="h-4 w-4 text-yellow-500" aria-label="Needs review" />
              )}
            </TableCell>
          </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
