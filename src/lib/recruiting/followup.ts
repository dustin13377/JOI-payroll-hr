// "Needs follow-up" logic — shared by the recruiting board filter and the
// candidate drawer so both agree on who is overdue for a second touch.
//
// A candidate needs a follow-up when they've been contacted once, haven't
// moved forward in the funnel (still sitting in "contacted"), and enough time
// has passed that a nudge is warranted. We key off last_contacted_at + stage,
// both of which the WhatsApp invite already stamps, so this works for every
// existing candidate with no backfill.

import type { Stage } from "@/lib/recruiting/stages";

/** Hours after last contact before a Contacted candidate is "due" a nudge. */
export const FOLLOWUP_AFTER_HOURS = 48;

/**
 * True when a candidate is overdue for a follow-up: still in "contacted",
 * has a last-contacted timestamp, and it's older than FOLLOWUP_AFTER_HOURS.
 */
export function needsFollowUp(
  stage: Stage,
  lastContactedAt: string | null,
): boolean {
  if (stage !== "contacted") return false;
  if (!lastContactedAt) return false;
  const ageMs = Date.now() - new Date(lastContactedAt).getTime();
  return ageMs >= FOLLOWUP_AFTER_HOURS * 60 * 60 * 1000;
}

/**
 * When the 48h follow-up lock lifts for a candidate, based on their last
 * contact. Returns null when we have no timestamp (nothing to count from).
 */
export function followUpUnlockAt(lastContactedAt: string | null): Date | null {
  if (!lastContactedAt) return null;
  return new Date(
    new Date(lastContactedAt).getTime() + FOLLOWUP_AFTER_HOURS * 60 * 60 * 1000,
  );
}

/**
 * True while a candidate is inside the 48h wait window — contacted recently
 * enough that a follow-up should stay locked. False once the window passes (due
 * for follow-up) and also false when there's no timestamp to enforce against,
 * so a manually-set "contacted" with no send isn't locked forever.
 */
export function isFollowUpLocked(lastContactedAt: string | null): boolean {
  if (!lastContactedAt) return false;
  const ageMs = Date.now() - new Date(lastContactedAt).getTime();
  return ageMs < FOLLOWUP_AFTER_HOURS * 60 * 60 * 1000;
}
