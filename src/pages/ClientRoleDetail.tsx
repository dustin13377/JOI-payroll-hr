import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  UserCheck,
  Pause,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { cn } from "@/lib/utils";
import {
  useClientApplicants,
  useClientApplicantPreferences,
  useSetClientApplicantPreference,
  type ClientApplicantPref,
} from "@/hooks/useClientPortal";
import { STAGE_LABELS, type Stage } from "@/lib/recruiting/stages";
import { formatSource, fmtDate } from "@/lib/clientPortal";

/**
 * Applicants for one role. Reached from ClientDashboard's role cards. URL
 * carries the role_name (encoded); we match candidates client-side because
 * the view already restricts to this client's assigned roles — filtering by
 * applied_position here doesn't leak scope, it just picks the subset.
 */
const PAGE_SIZE = 25;

export default function ClientRoleDetail() {
  const { roleName: encoded } = useParams<{ roleName: string }>();
  const navigate = useNavigate();
  const { data: applicants = [], isLoading } = useClientApplicants();
  const { data: preferences = new Map() } = useClientApplicantPreferences();
  const setPref = useSetClientApplicantPreference();
  const [page, setPage] = useState(0);

  const roleName = encoded ? decodeURIComponent(encoded) : "";
  const forRole = useMemo(
    () => applicants.filter((a) => (a.applied_position ?? "") === roleName),
    [applicants, roleName],
  );

  async function togglePref(candidateId: string, next: ClientApplicantPref) {
    const current = preferences.get(candidateId);
    const value = current === next ? null : next; // click same icon = clear
    try {
      await setPref.mutateAsync({ candidateId, preference: value });
      toast.success(
        value === null
          ? "Preference cleared"
          : value === "want_interview"
            ? "Marked — JOI will contact"
            : value === "back_burner"
              ? "Moved to back burner"
              : "Rejected — JOI notified",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  const totalPages = Math.max(1, Math.ceil(forRole.length / PAGE_SIZE));
  // Clamp the page number if the applicant list shrinks (e.g. stale query).
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, forRole.length);
  const pageRows = forRole.slice(start, end);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LogoLoadingIndicator size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/client")}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{roleName}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {forRole.length} applicant{forRole.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Applicants</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {forRole.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No applicants yet. Ads are running — check back soon.
            </p>
          ) : (
            <div className="divide-y">
              {pageRows.map((a) => {
                const pref = preferences.get(a.id);
                const rejected = pref === "reject";
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "grid grid-cols-12 gap-2 items-center py-2 text-sm",
                      // Rejected rows are visually dampened so the client's
                      // eye skips past them — they can still un-reject.
                      rejected && "opacity-50",
                    )}
                  >
                    <div className="col-span-3 font-medium truncate">
                      {a.full_name ?? "—"}
                    </div>
                    <div className="col-span-1 text-muted-foreground text-xs">
                      {a.created_at ? fmtDate(a.created_at) : "—"}
                    </div>
                    <div className="col-span-2">
                      <Badge variant="secondary" className="text-xs">
                        {formatSource(a.ft_source, a.ft_channel)}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-xs text-muted-foreground">
                      {STAGE_LABELS[a.stage as Stage] ?? a.stage}
                    </div>
                    <div className="col-span-1">
                      {a.cv_url ? (
                        <a
                          href={a.cv_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          title="Open CV"
                        >
                          CV <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-7 w-7",
                          pref === "want_interview" &&
                            "bg-green-100 text-green-700 hover:bg-green-200",
                        )}
                        onClick={() => togglePref(a.id, "want_interview")}
                        disabled={setPref.isPending}
                        title="I want to interview this person"
                      >
                        <UserCheck className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-7 w-7",
                          pref === "back_burner" &&
                            "bg-sky-100 text-sky-700 hover:bg-sky-200",
                        )}
                        onClick={() => togglePref(a.id, "back_burner")}
                        disabled={setPref.isPending}
                        title="Back burner — hold for later"
                      >
                        <Pause className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-7 w-7",
                          rejected &&
                            "bg-rose-100 text-rose-700 hover:bg-rose-200",
                        )}
                        onClick={() => togglePref(a.id, "reject")}
                        disabled={setPref.isPending}
                        title="Reject"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {forRole.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4 mt-2 border-t text-sm">
              <div className="text-xs text-muted-foreground">
                Showing {start + 1}–{end} of {forRole.length}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  Page {safePage + 1} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
