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
import { Textarea } from "@/components/ui/textarea";
import {
  useCandidates,
  useCreateReferralCandidate,
  useInterviewOutcomes,
  useMarkInterviewOutcome,
  OUTCOME_LABELS,
  type Candidate,
  type InterviewOutcome,
} from "@/hooks/useRecruiting";
import { toast } from "sonner";
import {
  Ban,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  UserPlus,
  Video,
  X,
} from "lucide-react";

/** The outcomes offered as buttons once an interview slot has started. */
const OUTCOME_ACTIONS: {
  outcome: InterviewOutcome;
  label: string;
  icon: typeof Check;
  destructive?: boolean;
}[] = [
  { outcome: "no_show", label: "No show", icon: X, destructive: true },
  { outcome: "couldnt_attend", label: "Couldn't attend", icon: Clock },
  { outcome: "passed", label: "Not a fit", icon: Ban },
  { outcome: "offer_extended", label: "Extend offer", icon: Check },
];

const OUTCOME_BADGE_VARIANT: Record<
  InterviewOutcome,
  "default" | "secondary" | "destructive" | "outline"
> = {
  completed: "secondary",
  no_show: "destructive",
  couldnt_attend: "outline",
  passed: "secondary",
  offer_extended: "default",
};

/**
 * Row color for a live interview whose candidate has been flagged
 * is_highlighted from the CandidateDrawer. Single amber accent — one flag,
 * one look — so D doesn't have to babysit a title-to-color map every time a
 * role gets renamed.
 */
const HIGHLIGHT_ROW_COLOR =
  "bg-amber-50 dark:bg-amber-950/30 border-l-2 border-l-amber-400";

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

/**
 * Interview start time is more than an hour in the past. Once past this cutoff
 * we treat the slot as done and drop its row color even if no outcome was
 * recorded. (all-day events excluded)
 */
function pastByAnHour(e: CalendarEvent): boolean {
  return !e.allDay && new Date(e.start).getTime() + 60 * 60 * 1000 <= Date.now();
}

/**
 * Pull the candidate's name out of a calendar title. Handles the two shapes we
 * see: "Interview (Jane Doe)" and "Jane Doe and Human Resources JOI".
 */
function extractEventName(summary: string): string | null {
  let s = summary;
  // "Interview (Jane Doe)" → "Jane Doe"
  const paren = summary.match(/\(([^)]+)\)/);
  if (/^\s*interview/i.test(summary) && paren) {
    s = paren[1];
  }
  // "Jane Doe and Human Resources JOI" → "Jane Doe"
  const m = s.match(/^(.*?)\s+and\s+Human Resources/i);
  return (m ? m[1] : s).trim() || null;
}

/**
 * The applied-for position to show for an event, from the candidate(s) whose
 * name matches the calendar title. People re-apply (sometimes many times), so a
 * name can match several rows: if they all name the same position we show it;
 * if they disagree we show the most recent application's position.
 */
function positionForEvent(e: CalendarEvent, candidates: Candidate[]): string | null {
  const name = extractEventName(e.summary);
  if (!name) return null;
  const withPosition = matchCandidates(name, candidates).filter(
    (c) => c.applied_position,
  );
  if (withPosition.length === 0) return null;
  const distinct = new Set(withPosition.map((c) => c.applied_position));
  if (distinct.size === 1) return withPosition[0].applied_position;
  // Genuinely different roles across applications — trust the newest one.
  const newest = withPosition.reduce((a, b) =>
    a.created_at >= b.created_at ? a : b,
  );
  return newest.applied_position;
}

/**
 * True if any candidate matching this event has been flagged is_highlighted
 * from the CandidateDrawer. Any match with the flag wins — safer than picking
 * one row and getting it wrong when a person has re-applied.
 */
function isHighlightedForEvent(e: CalendarEvent, candidates: Candidate[]): boolean {
  const name = extractEventName(e.summary);
  if (!name) return false;
  return matchCandidates(name, candidates).some((c) => c.is_highlighted);
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
  // Optional note captured when creating a brand-new profile from the dialog.
  const [note, setNote] = useState("");
  // Event whose already-recorded outcome the user clicked to change.
  const [editingKey, setEditingKey] = useState<string | null>(null);

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
  const createReferral = useCreateReferralCandidate();

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
        onSuccess: () => toast.success(`Marked ${OUTCOME_LABELS[outcome].toLowerCase()}`),
        onError: (e) =>
          toast.error(`Couldn't save: ${e instanceof Error ? e.message : "unknown"}`),
      },
    );
  };

  const handleMark = (event: CalendarEvent, outcome: InterviewOutcome) => {
    setEditingKey(null);
    const name = extractEventName(event.summary);
    const matches = name ? matchCandidates(name, candidates) : [];
    if (matches.length === 1) {
      save(event, matches[0].id, outcome);
    } else {
      // 0 or several matches — let the user pick or create a profile.
      setNote("");
      setPending({ event, outcome });
    }
  };

  const closeDialog = () => {
    setPending(null);
    setNote("");
  };

  // No matching profile (interview link handed out, or a referral who skipped
  // the application form): create the person as a new profile — with an optional
  // note — and record the outcome against it in one click. This is also how a
  // no-show gets a permanent record even though they never had a profile.
  const createProfile = async () => {
    if (!pending) return;
    const name = extractEventName(pending.event.summary) ?? "";
    try {
      const id = await createReferral.mutateAsync({
        fullName: name,
        stage: "interviewed",
        note,
      });
      save(pending.event, id, pending.outcome);
      closeDialog();
    } catch (e) {
      toast.error(
        `Couldn't create profile: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  const pendingName = pending ? extractEventName(pending.event.summary) : null;

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
              const position = positionForEvent(e, candidates);
              // Color the row only while the interview is still live: the
              // candidate has been flagged from the drawer, no outcome
              // recorded yet, and not yet an hour past its start time.
              const highlighted = isHighlightedForEvent(e, candidates);
              const rowColor =
                highlighted && !marked && !pastByAnHour(e)
                  ? HIGHLIGHT_ROW_COLOR
                  : "";
              return (
                <li
                  key={i}
                  className={
                    "py-1.5 px-2 flex items-baseline gap-3 text-sm rounded-sm " +
                    rowColor
                  }
                >
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
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{e.summary}</span>
                    {position && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {position}
                      </span>
                    )}
                  </span>

                  {/* Right side: recorded outcome (click to change) > outcome
                      buttons (started or being edited) > Join link */}
                  {marked && editingKey !== eventKey(e) ? (
                    <button
                      type="button"
                      className="shrink-0"
                      title="Click to change"
                      onClick={() => setEditingKey(eventKey(e))}
                    >
                      <Badge variant={OUTCOME_BADGE_VARIANT[marked]} className="text-xs">
                        {OUTCOME_LABELS[marked]}
                      </Badge>
                    </button>
                  ) : hasStarted(e) || editingKey === eventKey(e) ? (
                    <span className="shrink-0 flex flex-wrap items-center justify-end gap-1">
                      {OUTCOME_ACTIONS.map(({ outcome, label, icon: Icon, destructive }) => (
                        <Button
                          key={outcome}
                          size="sm"
                          variant="outline"
                          className={
                            "h-6 px-2 text-xs" +
                            (destructive ? " text-destructive hover:text-destructive" : "")
                          }
                          disabled={markOutcome.isPending}
                          onClick={() => handleMark(e, outcome)}
                        >
                          <Icon className="h-3 w-3 mr-1" /> {label}
                        </Button>
                      ))}
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
      <Dialog open={!!pending} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Which candidate is this?</DialogTitle>
            <DialogDescription>
              Couldn't match “{pending ? extractEventName(pending.event.summary) : ""}”
              to an existing candidate. Pick them below to mark{" "}
              {pending ? OUTCOME_LABELS[pending.outcome] : ""}, or create a new
              profile for them.
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
                      closeDialog();
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

          {/* Create a brand-new profile — for referrals who skipped the form, and
              so no-shows still leave a permanent record. */}
          <div className="space-y-2 border-t pt-3">
            <Textarea
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              placeholder="Optional note (e.g. referred by agent, why they didn't show)…"
              className="min-h-[64px] text-sm"
            />
            <Button
              className="w-full justify-start"
              disabled={createReferral.isPending || markOutcome.isPending || !pendingName}
              onClick={createProfile}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Create profile{pendingName ? ` “${pendingName}”` : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
