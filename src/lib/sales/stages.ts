// Sales pipeline stages. Kept intentionally short — we can add more once D and
// Joe have run real leads through it. Order here is the funnel order.

export const SALES_STAGES = [
  "new",
  "researched",
  "contacted",
  "meeting",
  "proposal",
  "won",
  "lost",
] as const;

export type SalesStage = (typeof SALES_STAGES)[number];

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  new: "New",
  researched: "Researched",
  contacted: "Contacted",
  meeting: "Meeting set",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

// Terminal stages drop off the default "active" view.
export const TERMINAL_SALES_STAGES: SalesStage[] = ["won", "lost"];

export function isTerminalStage(stage: string): boolean {
  return TERMINAL_SALES_STAGES.includes(stage as SalesStage);
}
