import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  useCandidates,
  useInterviewOutcomes,
  useMarkInterviewOutcome,
  type Candidate,
  type InterviewOutcome,
} from "@/hooks/useRecruiting";
import { toast } from "sonner";
import { Calendar, Check, ChevronDown, ChevronUp, Video, X } from "lucide-react";

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

/** Stable identifier for a calendar slot — also the upsert key in the DB. */
function eventKey(e: CalendarEvent): string {
  return `${e.start}|${e.summary}`;
}

/** Has the event's start time already passed? (all-day events excluded) */
function hasStarted(e: CalendarEvent): boolean {
  return !e.allDay && new Date(e.start).getTime() <= Date.now();
}

/** Calendly/Google titles look like "Jane Doe and Human Resources JOI". */
function extractEventName(summary: string): string | null {
  const m = summary.match(/^(.*?)\s+and\s+Human Resources/i);
  return (m ? m[1] : summary).trim() || null;
}

/**
 * Match the calendar name to candidates: every word of the event name must
 * appear in the candidate's full_name (case-insensitive). An exact full-name
 * match wins outright.
 */
function matchCandidates(name: string, candidates: Candidate[]): Candidate[] {
  const lower = name.toLowerCase();
  const exact = candidates.filter((c) => (c.full_name ?? "").toLowerCase() === lower);
  if (exact.length === 1) return exact;
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return candidates.filter((c) => {
    const full = (c.full_name ?? "").toLowerCase();
    return words.every((w) => full.includes(w));
  });
}

interface PendingMark {
  event: CalendarEvent;
  outcome: InterviewOutcome;
}

export function UpcomingInterviews() {
  const [showCalendar, setShowCalendar] = useState(false);
  // Set when a click couldn't be auto-matched to one candidate — opens picker.
  const [pending, setPending] = useState<PendingMark | null>(null);

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

  const { data: candidates = [] } = useCandidates();
  const { data: outcomes = [] } = useInterviewOutcomes();
  const markOutcome = useMarkInterviewOutcome();

  const outcomeByKey = new Map(outcomes.map((o) => [o.event_key, o.outcome]));

  const save = (event: CalendarEvent, candidateId: string, outcome: InterviewOutcome) => {
    markOutcome.mutate(
      {
        candidateId,
        eventKey: eventKey(event),
        scheduledAt: event.start,
        outcome,
      },
      {
        onSuccess: () =>
          toast.success(outcome === "completed" ? "Marked completed" : "Marked no-show"),
        onError: (e) =>
          toast.error(`Couldn't save: ${e instanceof Error ? e.message : "unknown"}`),
      },
    );
  };

  const handleMark = (event: CalendarEvent, outcome: InterviewOutcome) => {
    const name = extractEventName(event.summary);
    const matches = name ? matchCandidates(name, candidates) : [];
    if (matches.length === 1) {
      save(event, matches[0].id, outcome);
    } else {
      // 0 or several matches — let the user pick.
      setPending({ event, outcome });
    }
  };

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
            {events.map((e, i) => {
              const marked = outcomeByKey.get(eventKey(e));
              return (
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

                  {/* Right side: outcome state > outcome buttons (started events) > Join */}
                  {marked ? (
                    <button
                      type="button"
                      className="shrink-0"
                      title="Click to change"
                      onClick={() =>
                        handleMark(e, marked === "completed" ? "no_show" : "completed")
                      }
                    >
                      <Badge
                        variant={marked === "completed" ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {marked === "completed" ? "Completed" : "No show"}
                      </Badge>
                    </button>
                  ) : hasStarted(e) ? (
                    <span className="shrink-0 flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        disabled={markOutcome.isPending}
                        onClick={() => handleMark(e, "completed")}
                      >
                        <Check className="h-3 w-3 mr-1" /> Completed
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={markOutcome.isPending}
                        onClick={() => handleMark(e, "no_show")}
                      >
                        <X className="h-3 w-3 mr-1" /> No show
                      </Button>
                    </span>
                  ) : (
                    e.meetUrl && (
                      <a
                        href={e.meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Video className="h-3.5 w-3.5" /> Join
                      </a>
                    )
                  )}
                </li>
              );
            })}
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

      {/* Candidate picker — only when the event name didn't match exactly one candidate */}
      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Which candidate is this?</DialogTitle>
            <DialogDescription>
              Couldn't auto-match “{pending ? extractEventName(pending.event.summary) : ""}”
              to one candidate. Pick them to mark{" "}
              {pending?.outcome === "completed" ? "Completed" : "No show"}.
            </DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Search candidates…" />
            <CommandList className="max-h-64">
              <CommandEmpty>No candidates found.</CommandEmpty>
              <CommandGroup>
                {candidates.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.full_name ?? ""} ${c.email ?? ""}`}
                    onSelect={() => {
                      if (pending) save(pending.event, c.id, pending.outcome);
                      setPending(null);
                    }}
                  >
                    <span className="truncate">{c.full_name ?? "Unnamed"}</span>
                    {c.email && (
                      <span className="ml-2 text-xs text-muted-foreground truncate">
                        {c.email}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
