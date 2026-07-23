import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/sales/stages";
import { cn } from "@/lib/utils";

const STAGE_CLASSES: Record<SalesStage, string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  researched: "bg-indigo-100 text-indigo-800 border-indigo-200",
  contacted: "bg-amber-100 text-amber-800 border-amber-200",
  meeting: "bg-purple-100 text-purple-800 border-purple-200",
  proposal: "bg-cyan-100 text-cyan-800 border-cyan-200",
  won: "bg-green-100 text-green-800 border-green-200",
  lost: "bg-gray-100 text-gray-600 border-gray-200",
};

export function StageBadge({ stage }: { stage: SalesStage | string }) {
  const s = stage as SalesStage;
  const label = SALES_STAGE_LABELS[s] ?? stage;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STAGE_CLASSES[s] ?? "bg-gray-100 text-gray-600 border-gray-200",
      )}
    >
      {label}
    </span>
  );
}
