import { useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePublishedPosts, useMyAcks, useAcknowledgePost } from "@/hooks/useBulletin";

interface AnnouncementAckBannerProps {
  /** Auth employee UUID (employees.id) — written to bulletin_acks. */
  employeeId: string | null;
  /** Used to scope campaign-specific announcements. */
  campaignId: string | null;
}

/**
 * Top-of-dashboard banner for announcements that require acknowledgment.
 *
 * Shows one card per unacknowledged ack-required announcement the employee is
 * eligible for (company-wide, or matching their campaign, and not expired).
 * Tapping Acknowledge writes the ack and the card disappears — so an agent
 * can't miss it and we get a real read signal. Renders nothing when there's
 * nothing outstanding.
 */
export function AnnouncementAckBanner({ employeeId, campaignId }: AnnouncementAckBannerProps) {
  const { data: posts = [] } = usePublishedPosts();
  const { data: myAcks = new Set<string>() } = useMyAcks();
  const ack = useAcknowledgePost();
  const [acking, setAcking] = useState<string | null>(null);

  const now = Date.now();
  const pending = posts.filter(
    (p) =>
      p.type === "announcement" &&
      p.requires_ack &&
      !myAcks.has(p.id) &&
      (p.campaign_id == null || p.campaign_id === campaignId) &&
      (!p.expires_at || new Date(p.expires_at).getTime() > now)
  );

  if (!employeeId || pending.length === 0) return null;

  return (
    <div className="space-y-2">
      {pending.map((p) => (
        <Card key={p.id} className="border-amber-200 border-l-4 border-l-[#FFA700] bg-amber-50">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <Megaphone className="h-5 w-5 text-[#FFA700] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-amber-800/80">
                Please read &amp; acknowledge
              </p>
              <p className="text-sm font-semibold text-[#0A1133]">{p.title}</p>
              {p.body && (
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{p.body}</p>
              )}
              <Link
                to="/comunicados"
                className="mt-1 inline-block text-xs text-primary underline"
              >
                View in Announcements
              </Link>
            </div>
            <Button
              size="sm"
              className="shrink-0 bg-[#0A1133] text-white hover:bg-[#0A1133]/90"
              disabled={acking === p.id}
              onClick={() => {
                setAcking(p.id);
                ack.mutate(
                  { postId: p.id, employeeId },
                  { onSettled: () => setAcking(null) }
                );
              }}
            >
              {acking === p.id ? "Saving…" : "Acknowledge"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
