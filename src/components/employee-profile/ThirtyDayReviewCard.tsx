import { useEmployeeReviews, reviewStatus, type AgentReviewWithJoins } from "@/hooks/useAgentReviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ThumbsDown, ThumbsUp, RotateCw } from "lucide-react";
import { formatDateMX } from "@/lib/localDate";

/**
 * 30-day probation review summary on EmpleadoPerfil.
 *
 * Shows the 4 weekly checkpoints (plus any extensions) with status,
 * scores, and the final decision once made. Read-only — to fill out a
 * review the user goes to /reviews where the form lives.
 */
export function ThirtyDayReviewCard({ employeeId }: { employeeId: string }) {
  const { data: reviews = [], isLoading } = useEmployeeReviews(employeeId);

  // Hide entirely when there are no reviews (employee was hired before this
  // feature shipped, or has no hire_date set yet).
  if (!isLoading && reviews.length === 0) return null;

  const final = reviews.find((r) => r.week_number === 4);
  const completedCount = reviews.filter((r) => r.completed_at).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          30-Day Review
          {final && <FinalDecisionBadge review={final} />}
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {completedCount}/{reviews.length} completed
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {reviews.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <Separator className="my-2" />}
                <ReviewRow review={r} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewRow({ review }: { review: AgentReviewWithJoins }) {
  const status = reviewStatus(review);
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="w-24 shrink-0">
        <div className="font-medium">
          {review.week_number <= 4 ? `Week ${review.week_number}` : `Ext. ${review.week_number - 4}`}
        </div>
        <div className="text-xs text-muted-foreground">{formatDateMX(review.due_date)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <StatusBadge status={status} />
        {review.completed_at && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Att {review.attendance_score}/5</span>
            <span>KPI {review.kpi_score}/5</span>
            <span>Atd {review.attitude_score}/5</span>
            {review.reviewer?.full_name && <span>by {review.reviewer.full_name}</span>}
          </div>
        )}
        {review.notes && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{review.notes}</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof reviewStatus> }) {
  if (status === "completed") {
    return <Badge variant="secondary" className="text-xs"><CheckCircle2 className="mr-1 h-3 w-3" />Done</Badge>;
  }
  if (status === "overdue") {
    return <Badge variant="destructive" className="text-xs"><AlertTriangle className="mr-1 h-3 w-3" />Overdue</Badge>;
  }
  if (status === "due_today") {
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-xs"><Clock className="mr-1 h-3 w-3" />Due today</Badge>;
  }
  return <Badge variant="outline" className="text-xs"><CalendarClock className="mr-1 h-3 w-3" />Upcoming</Badge>;
}

function FinalDecisionBadge({ review }: { review: AgentReviewWithJoins }) {
  if (!review.decision) return null;
  if (review.decision === "keep") {
    return <Badge variant="secondary" className="text-xs"><ThumbsUp className="mr-1 h-3 w-3" />Kept</Badge>;
  }
  if (review.decision === "extend") {
    const days = review.extension_days ? ` +${review.extension_days}d` : "";
    return <Badge variant="outline" className="text-xs"><RotateCw className="mr-1 h-3 w-3" />Extended{days}</Badge>;
  }
  // let_go
  if (review.termination_status === "confirmed") {
    return <Badge variant="destructive" className="text-xs"><ThumbsDown className="mr-1 h-3 w-3" />Let go</Badge>;
  }
  if (review.termination_status === "denied") {
    return <Badge variant="secondary" className="text-xs">Let-go denied</Badge>;
  }
  return <Badge className="bg-amber-500 hover:bg-amber-600 text-xs"><Clock className="mr-1 h-3 w-3" />Pending HR</Badge>;
}
