import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronDown, ChevronUp, Video } from "lucide-react";

const EMBED_URL =
  "https://calendar.google.com/calendar/embed?src=humanresources%40justoutsource.it&ctz=America%2FMexico_City&mode=WEEK";

interface CalendarEvent {
  summary: string;
  location: string | null;
  meetUrl: string | null;
  start: string; // ISO timestamp, or YYYY-MM-DD for all-day
  end: string | null;
  allDay: boolean;
}

const TZ = "America/Mexico_City";

function fmtDay(e: CalendarEvent): string {
  const d = e.allDay ? new Date(`${e.start}T12:00:00-06:00`) : new Date(e.start);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  });
}

function fmtTime(e: CalendarEvent): string {
  if (e.allDay) return "All day";
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  };
  const start = new Date(e.start).toLocaleTimeString("en-US", opts);
  if (!e.end) return start;
  return `${start} – ${new Date(e.end).toLocaleTimeString("en-US", opts)}`;
}

function isToday(e: CalendarEvent): boolean {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const eventStr = e.allDay
    ? e.start
    : new Date(e.start).toLocaleDateString("en-CA", { timeZone: TZ });
  return todayStr === eventStr;
}

export function UpcomingInterviews() {
  const [showCalendar, setShowCalendar] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["hr-calendar"],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase.functions.invoke("hr-calendar");
      if (error) throw error;
      if (data?.error) throw new Error(data.detail ?? data.error);
      return data.events ?? [];
    },
    staleTime: 5 * 60 * 1000, // refetch at most every 5 minutes
    retry: 1,
  });

  const events = (data ?? []).slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Upcoming interviews
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCalendar((v) => !v)}
          className="text-xs"
        >
          {showCalendar ? (
            <>Hide calendar <ChevronUp className="ml-1 h-3 w-3" /></>
          ) : (
            <>Full calendar <ChevronDown className="ml-1 h-3 w-3" /></>
          )}
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading calendar…</p>
        )}
        {error != null && (
          <p className="text-sm text-muted-foreground">
            Couldn't load the HR calendar feed.
          </p>
        )}
        {!isLoading && !error && events.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing scheduled in the next 60 days.
          </p>
        )}
        {events.length > 0 && (
          <ul className="divide-y">
            {events.map((e, i) => (
              <li key={i} className="py-1.5 flex items-baseline gap-3 text-sm">
                <span
                  className={
                    "w-24 shrink-0 tabular-nums " +
                    (isToday(e)
                      ? "font-semibold text-primary"
                      : "text-muted-foreground")
                  }
                >
                  {isToday(e) ? "Today" : fmtDay(e)}
                </span>
                <span className="w-36 shrink-0 tabular-nums text-muted-foreground">
                  {fmtTime(e)}
                </span>
                <span className="truncate flex-1">{e.summary}</span>
                {e.meetUrl && (
                  <a
                    href={e.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Video className="h-3.5 w-3.5" /> Join
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {showCalendar && (
          <div className="mt-3 rounded-md border overflow-hidden">
            <iframe
              src={EMBED_URL}
              title="HR Interview Calendar"
              className="w-full"
              style={{ height: 600, border: 0 }}
            />
            <p className="px-3 py-2 text-xs text-muted-foreground">
              The month view requires being logged into a Google account with
              access to the HR calendar.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
