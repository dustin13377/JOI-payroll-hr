/**
 * Build a Google Calendar "create event" link for an all-day event.
 *
 * Google's all-day format uses YYYYMMDD with an EXCLUSIVE end date, so we
 * add one day to the (inclusive) end we store. Works for single- and
 * multi-day ranges. Opening the link drops a prefilled event onto the
 * signed-in user's OWN Google Calendar — nothing is shared org-wide.
 */
export function googleCalendarAllDayUrl(opts: {
  title: string;
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive)
  details?: string;
}): string {
  const compact = (d: string) => d.replace(/-/g, "");
  // end is exclusive in Google's all-day format → +1 day
  const endEx = new Date(`${opts.end}T00:00:00`);
  endEx.setDate(endEx.getDate() + 1);
  const y = endEx.getFullYear();
  const m = String(endEx.getMonth() + 1).padStart(2, "0");
  const d = String(endEx.getDate()).padStart(2, "0");
  const endStr = `${y}${m}${d}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${compact(opts.start)}/${endStr}`,
  });
  if (opts.details) params.set("details", opts.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
