import { cn } from "@/lib/utils";
import { MailCheck, MessageSquareReply } from "lucide-react";
import type { SalesLead } from "@/hooks/useSalesLeads";

// Short "which email, when" indicator for a lead's spot in the 4-email
// follow-up sequence. Sits next to the StageBadge. Renders nothing until the
// first email has actually gone out.

function fmt(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return "";
  // Build from local parts so a date-only value never shifts a day in UTC.
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type FollowupFields = Pick<
  SalesLead,
  "followup_step" | "followup_last_sent_at" | "followup_paused" | "stage"
>;

export function FollowupBadge({ lead }: { lead: FollowupFields }) {
  // Once a lead is booked, proposed, won, or lost, the sequence is over — don't
  // show a stale follow-up chip.
  const active =
    lead.stage !== "meeting" &&
    lead.stage !== "proposal" &&
    lead.stage !== "won" &&
    lead.stage !== "lost";

  if (lead.followup_paused && active) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
          "border-rose-200 bg-rose-100 text-rose-800",
        )}
      >
        <MessageSquareReply className="h-3 w-3" /> Replied · you
      </span>
    );
  }

  if (!lead.followup_step || lead.followup_step < 1) return null;

  const date = fmt(lead.followup_last_sent_at);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        "border-amber-200 bg-amber-50 text-amber-700",
      )}
    >
      <MailCheck className="h-3 w-3" /> E{lead.followup_step}
      {date ? ` · ${date}` : ""}
    </span>
  );
}
