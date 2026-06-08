import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, type Stage } from "@/lib/recruiting/stages";

const VARIANT: Record<Stage, "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  triaged: "secondary",
  contacted: "outline",
  interview_scheduled: "default",
  interviewed: "secondary",
  warm_hold: "outline",
  reactivated: "default",
  hired: "default",
  passed: "destructive",
  withdrew: "destructive",
  ghosted: "destructive",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge variant={VARIANT[stage]}>{STAGE_LABELS[stage]}</Badge>;
}
