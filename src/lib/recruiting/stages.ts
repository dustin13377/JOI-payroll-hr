export const STAGES = [
  "new",
  "triaged",
  "contacted",
  "interview_scheduled",
  "interviewed",
  "warm_hold",
  "reactivated",
  "hired",
  "passed",
  "withdrew",
  "ghosted",
] as const;

export type Stage = typeof STAGES[number];

export const TERMINAL_STAGES: readonly Stage[] = [
  "hired",
  "passed",
  "withdrew",
  "ghosted",
] as const;

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  triaged: "Reviewed",
  contacted: "Contacted",
  interview_scheduled: "Interview Scheduled",
  interviewed: "Interviewed",
  warm_hold: "Warm Hold",
  reactivated: "Reactivated",
  hired: "Hired",
  passed: "Passed",
  withdrew: "Withdrew",
  ghosted: "Ghosted",
};

// Forward-only graph (excludes terminal-from-anywhere — that's a global rule)
const FORWARD_EDGES: Record<Stage, Stage[]> = {
  new: ["triaged"],
  triaged: ["contacted"],
  contacted: ["interview_scheduled"],
  interview_scheduled: ["interviewed"],
  interviewed: ["warm_hold"],
  warm_hold: ["reactivated"],
  reactivated: ["interview_scheduled", "hired"],
  hired: [],
  passed: [],
  withdrew: [],
  ghosted: [],
};

export function isTerminal(stage: Stage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

export function isValidTransition(from: Stage, to: Stage): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;        // no escape from terminal
  if (isTerminal(to)) return true;            // any → terminal always allowed
  return FORWARD_EDGES[from].includes(to);
}
