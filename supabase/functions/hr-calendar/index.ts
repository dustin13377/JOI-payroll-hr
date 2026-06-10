// HR Interview Calendar feed.
//
// Fetches the HR Google Calendar's iCal feed server-side and returns upcoming
// events as JSON, so leadership sees interviews inside the app without
// needing to be logged into the Google HR account.
//
// ICS source resolution:
//   1. HR_CALENDAR_ICS_URL secret (use Google Calendar's "Secret address in
//      iCal format" — works without making the calendar public)
//   2. Fallback: the calendar's public ICS address (only works if the
//      calendar is shared publicly)
//
// Authorization: caller must be logged in AND have role manager/admin/owner
// (same audience as the /recruiting page).
//
// GET/POST → { events: [{ summary, location, start, end, allDay }] }

import { createClient } from "@supabase/supabase-js";

const PUBLIC_ICS_URL =
  "https://calendar.google.com/calendar/ical/humanresources%40justoutsource.it/public/basic.ics";

const ALLOWED_ORIGINS_RAW =
  Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
const ALLOWED_ORIGINS = ALLOWED_ORIGINS_RAW
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

interface CalendarEvent {
  summary: string;
  location: string | null;
  meetUrl: string | null; // Google Meet (or other video call) link
  start: string; // ISO timestamp, or YYYY-MM-DD for all-day events
  end: string | null;
  allDay: boolean;
}

/**
 * Parse an ICS datetime value into an ISO string.
 * - "20260615T140000Z"  → UTC instant
 * - "20260615T140000"   → treated as America/Mexico_City wall time (UTC-6,
 *   no DST since 2022). The HR calendar lives in that timezone.
 * - "20260615"          → all-day date (returned as YYYY-MM-DD)
 */
function parseIcsDate(
  value: string,
): { iso: string; allDay: boolean } | null {
  const allDayMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (allDayMatch) {
    return {
      iso: `${allDayMatch[1]}-${allDayMatch[2]}-${allDayMatch[3]}`,
      allDay: true,
    };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const iso = z
    ? `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
    : `${y}-${mo}-${d}T${h}:${mi}:${s}-06:00`;
  return { iso, allDay: false };
}

/** Unescape ICS text values (\n, \, \; \,). */
function unescapeIcs(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Minimal VEVENT parser. Does not expand RRULE recurrences — interview
 * events are one-offs; a recurring event appears once at its first date.
 */
function parseIcs(ics: string): CalendarEvent[] {
  // Unfold continuation lines (RFC 5545: CRLF followed by space/tab)
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const events: CalendarEvent[] = [];
  let cur: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur["DTSTART"]) {
        const start = parseIcsDate(cur["DTSTART"]);
        if (start && cur["STATUS"] !== "CANCELLED") {
          const end = cur["DTEND"] ? parseIcsDate(cur["DTEND"]) : null;

          // Video call link: Google exports Meet links as X-GOOGLE-CONFERENCE.
          // Fall back to scanning description/location for a meet/zoom URL.
          let meetUrl: string | null = null;
          const conf = cur["X-GOOGLE-CONFERENCE"];
          if (conf?.startsWith("http")) {
            meetUrl = conf.trim();
          } else {
            const haystack = unescapeIcs(
              `${cur["DESCRIPTION"] ?? ""} ${cur["LOCATION"] ?? ""}`,
            );
            const m = haystack.match(
              /https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com)\/[^\s<>"')]+/i,
            );
            if (m) meetUrl = m[0];
          }

          events.push({
            summary: unescapeIcs(cur["SUMMARY"] ?? "(no title)"),
            location: cur["LOCATION"] ? unescapeIcs(cur["LOCATION"]) : null,
            meetUrl,
            start: start.iso,
            end: end?.iso ?? null,
            allDay: start.allDay,
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    // Property name may carry params, e.g. DTSTART;TZID=America/Mexico_City
    const name = line.slice(0, idx).split(";")[0].toUpperCase();
    const value = line.slice(idx + 1);
    if (
      [
        "DTSTART",
        "DTEND",
        "SUMMARY",
        "LOCATION",
        "STATUS",
        "DESCRIPTION",
        "X-GOOGLE-CONFERENCE",
      ].includes(name)
    ) {
      cur[name] = value;
    }
  }

  return events;
}

Deno.serve(async (req) => {
  const CORS_HEADERS = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // --- Auth: must be a logged-in leadership user ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey =
      Deno.env.get("APP_SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid session" }, 401);
    }

    const { data: profile } = await userClient
      .from("user_profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile || !["manager", "admin", "owner"].includes(profile.role)) {
      return json({ error: "Leadership only" }, 403);
    }

    // --- Fetch the calendar feed ---
    // HR_CALENDAR_ICS_URL may point at either:
    //   a) an iCal (.ics) feed, or
    //   b) the HR account's Apps Script web app, which returns
    //      { events: [{ summary, location, meetUrl, start, end, allDay }] }
    //      (workaround for Workspace blocking the secret iCal address)
    const feedUrl = Deno.env.get("HR_CALENDAR_ICS_URL") ?? PUBLIC_ICS_URL;
    const res = await fetch(feedUrl);
    if (!res.ok) {
      console.error("calendar fetch failed", res.status, feedUrl.split("?")[0]);
      return json(
        {
          error: "calendar_unavailable",
          detail:
            "Could not fetch the calendar feed. Check the HR_CALENDAR_ICS_URL secret.",
        },
        502,
      );
    }

    const body = await res.text();
    let all: CalendarEvent[];
    const trimmed = body.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        const rawEvents = Array.isArray(parsed) ? parsed : parsed.events;
        if (!Array.isArray(rawEvents)) throw new Error("no events array");
        all = rawEvents
          .filter((e: Record<string, unknown>) => typeof e?.start === "string")
          .map((e: Record<string, unknown>) => ({
            summary: typeof e.summary === "string" ? e.summary : "(no title)",
            location: typeof e.location === "string" ? e.location : null,
            meetUrl:
              typeof e.meetUrl === "string" && e.meetUrl.startsWith("http")
                ? e.meetUrl
                : null,
            start: e.start as string,
            end: typeof e.end === "string" ? e.end : null,
            allDay: e.allDay === true,
          }));
      } catch (parseErr) {
        console.error("JSON feed parse failed", parseErr);
        return json({ error: "calendar_unavailable", detail: "Feed returned unreadable JSON." }, 502);
      }
    } else if (/BEGIN:VCALENDAR/i.test(body)) {
      all = parseIcs(body);
    } else {
      // Neither JSON nor ICS — most likely the Apps Script replied
      // "unauthorized" because the token in HR_CALENDAR_ICS_URL doesn't
      // match the TOKEN in the script. Surface it instead of showing an
      // empty calendar.
      console.error(
        "calendar feed unrecognized, first 80 chars:",
        body.slice(0, 80),
      );
      return json(
        {
          error: "calendar_unavailable",
          detail:
            "Feed returned neither JSON nor ICS — check that the token in HR_CALENDAR_ICS_URL matches the script's TOKEN.",
        },
        502,
      );
    }

    // Window: yesterday → +60 days, sorted ascending
    const now = Date.now();
    const from = now - 24 * 60 * 60 * 1000;
    const to = now + 60 * 24 * 60 * 60 * 1000;

    const events = all
      .filter((e) => {
        const t = new Date(e.allDay ? `${e.start}T00:00:00-06:00` : e.start)
          .getTime();
        return t >= from && t <= to;
      })
      .sort((a, b) => a.start.localeCompare(b.start));

    return json({ events });
  } catch (err) {
    console.error("hr-calendar error", err);
    return json({ error: "internal_error" }, 500);
  }
});
