// Dynamic lunch balancing — "freeze current, balance new hires".
//
// Goal: keep an even number of people at lunch per team WITHOUT disrupting
// anyone who already has a schedule. Current agents (those with a static entry
// in breakSchedules.ts) keep their existing lunch. Only NEW hires — people with
// no schedule on file yet — get auto-assigned, each dropped into whichever lunch
// window is currently emptiest for their team. As the team grows it evens out.
//
// Grouping: by campaign_id. In this DB the campaign IS the team (e.g.
// "SLOC Weekday", "MCA", "Underwriting"); everyone in a campaign works the same
// days/hours, so it's the correct lunch pool. shift_type/department are
// inconsistent across the roster and would fragment teams, so they're not used.
//
// Only LUNCH is balanced. First/second breaks roll in waves of 3 and stay as
// defined in breakSchedules.ts.

export interface LunchWindow {
  label: string;
  group: "A" | "B" | "C";
}

/** The three standard 60-minute lunch windows, in order. */
export const LUNCH_WINDOWS: LunchWindow[] = [
  { label: "12:00p – 1:00p", group: "A" },
  { label: "1:00p – 2:00p", group: "B" },
  { label: "2:00p – 3:00p", group: "C" },
];

/**
 * Maps a static schedule's lunch string (e.g. "12:00p – 1:00p") to its window
 * index. Anything unrecognized counts as the first window (noon) since that's
 * the default the ungrouped single-person desks use.
 */
export function lunchIndexForLabel(lunch: string | null | undefined): number {
  if (!lunch) return 0;
  const i = LUNCH_WINDOWS.findIndex((w) => w.label === lunch);
  return i >= 0 ? i : 0;
}

/** Index of the emptiest window given current counts; ties go to the earliest. */
export function emptiestWindow(counts: number[]): number {
  let best = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] < counts[best]) best = i;
  }
  return best;
}
