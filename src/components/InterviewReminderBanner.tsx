import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Video, X } from "lucide-react";

/**
 * Global banner that warns leadership about an HR interview starting soon.
 *
 * - Shows from 5 minutes before the start until the event ends
 *   (Google already notifies 10 min ahead; this is the last-call nudge).
 * - Only fires for interview-looking events (has a video link, or
 *   "human resources" in the title) so personal items on the HR calendar
 *   don't pop up for everyone.
 * - Dismissable per event (remembered in localStorage).
 * - Shares the ["hr-calendar"] query cache with UpcomingInterviews.
 */

const LEAD_MINUTES = 5;
const DISMISS_PREFIX = "joi-interview-banner-dismissed:";

interface CalendarEvent {
  summary: string;
  location: string | null;
  meetUrl: string | null;
  start: string;
  end: string | null;
  allDay: boolean;
}

function eventKey(e: CalendarEvent): string {
  return `${e.start}|${e.summary}`;
}

function looksLikeInterview(e: CalendarEvent): boolean {
  return !!e.meetUrl || /human resources/i.test(e.summary);
}

export function InterviewReminderBanner() {
  const { isLeadership } = useAuth();
  // Tick every 30s so the countdown stays fresh without refetching.
  const [now, setNow] = useState(() => Date.now());
  const [dismissedVersion, setDismissedVersion] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data } = useQuery({
    queryKey: ["hr-calendar"],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase.functions.invoke("hr-calendar");
      if (error) throw error;
      if (data?.error) throw new Error(data.detail ?? data.error);
      return data.events ?? [];
    },
    enabled: isLeadership,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  if (!isLeadership || !data) return null;

  const candidate = data
    .filter((e) => !e.allDay && looksLikeInterview(e))
    .filter((e) => {
      const start = new Date(e.start).getTime();
      const end = e.end
        ? new Date(e.end).getTime()
        : start + 30 * 60 * 1000;
      return start - LEAD_MINUTES * 60 * 1000 <= now && now < end;
    })
    .filter((e) => !localStorage.getItem(DISMISS_PREFIX + eventKey(e)))
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  // dismissedVersion is referenced so dismissing re-renders immediately.
  void dismissedVersion;

  if (!candidate) return null;

  const startMs = new Date(candidate.start).getTime();
  const minutes = Math.round((startMs - now) / 60000);
  const when =
    minutes > 1
      ? `in ${minutes} min`
      : minutes >= -1
        ? "now"
        : `started ${Math.abs(minutes)} min ago`;

  const dismiss = () => {
    localStorage.setItem(DISMISS_PREFIX + eventKey(candidate), "1");
    setDismissedVersion((v) => v + 1);
  };

  return (
    <div className="flex items-center gap-3 px-6 py-2 bg-amber-100 text-amber-950 border-b border-amber-200 text-sm">
      <Video className="h-4 w-4 shrink-0" />
      <span className="truncate">
        <strong>Interview {when}:</strong> {candidate.summary}{" "}
        <span className="text-amber-800">
          (
          {new Date(candidate.start).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Mexico_City",
          })}
          )
        </span>
      </span>
      {candidate.meetUrl && (
        <Button asChild size="sm" className="ml-auto shrink-0 h-7">
          <a href={candidate.meetUrl} target="_blank" rel="noopener noreferrer">
            <Video className="mr-1.5 h-3.5 w-3.5" /> Join
          </a>
        </Button>
      )}
      <button
        onClick={dismiss}
        className={candidate.meetUrl ? "shrink-0" : "ml-auto shrink-0"}
        title="Dismiss this reminder"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
