import { LogIn, LogOut, Coffee, UtensilsCrossed, CalendarDays, AlertCircle } from "lucide-react";
import { getBreakSchedule, type AltShift, type BreakSchedule } from "@/lib/breakSchedules";
import { useLunchSlot } from "@/hooks/useLunchSlot";

interface ScheduleBannerProps {
  employeeId: string | null | undefined;
  /**
   * "full"  — bordered card with chips for each break (use between cards).
   * "compact" — slim one-line summary (use directly under the Clock In button).
   */
  variant?: "full" | "compact";
}

/** Color scheme so each segment type is instantly recognizable. */
type Tone = "in" | "break" | "lunch" | "out";

const TONE: Record<
  Tone,
  { pill: string; chip: string; icon: string; label: string }
> = {
  in: {
    pill: "bg-emerald-50 border-emerald-200",
    chip: "bg-emerald-50 border-emerald-200",
    icon: "text-emerald-600",
    label: "text-emerald-700",
  },
  break: {
    pill: "bg-amber-50 border-amber-200",
    chip: "bg-amber-50 border-amber-200",
    icon: "text-amber-600",
    label: "text-amber-800",
  },
  lunch: {
    pill: "bg-violet-50 border-violet-200",
    chip: "bg-violet-50 border-violet-200",
    icon: "text-violet-600",
    label: "text-violet-700",
  },
  out: {
    pill: "bg-rose-50 border-rose-200",
    chip: "bg-rose-50 border-rose-200",
    icon: "text-rose-600",
    label: "text-rose-700",
  },
};

/**
 * Read-only banner that shows an agent their own scheduled clock-in/out and
 * breaks. Data comes from src/lib/breakSchedules.ts (sourced from the June 17
 * 2026 schedule PDF, keyed by employee_id).
 *
 * Display-only: it does NOT change clock-in or break enforcement. It just tells
 * the agent WHEN they're scheduled so they break in their assigned wave.
 */
export function ScheduleBanner({ employeeId, variant = "full" }: ScheduleBannerProps) {
  const schedule = getBreakSchedule(employeeId);
  // Lunch is balanced dynamically per team; fall back to the static value while
  // it resolves or if the employee/campaign can't be looked up.
  const computedLunch = useLunchSlot(employeeId);
  const lunchValue = computedLunch?.label ?? schedule?.lunch ?? "—";
  const lunchGroup = computedLunch?.group ?? schedule?.lunchGroup ?? null;

  if (variant === "compact") {
    if (!schedule) return null; // keep the area clean when nothing's on file
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-[#0A1133]">
          <CalendarDays className="h-3.5 w-3.5 text-[#FFA700]" />
          Your schedule
        </span>
        <Pill tone="in" label="In" value={schedule.clockIn} />
        <Pill tone="break" label="Break 1" value={schedule.break1} />
        <Pill
          tone="lunch"
          label={lunchGroup ? `Lunch (${lunchGroup})` : "Lunch"}
          value={lunchValue}
        />
        <Pill tone="break" label="Break 2" value={schedule.break2} />
        <Pill tone="out" label="Out" value={schedule.clockOut} />
      </div>
    );
  }

  // No schedule on file (e.g. department not yet assigned) — soft empty state.
  if (!schedule) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40 p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" />
        No break schedule is assigned to you yet. Check with HR.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-[#0A1133] text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-[#FFA700]" />
          Your scheduled times
        </div>
        <div className="text-xs text-white/70">
          {schedule.campaign} · {schedule.unit}
        </div>
      </div>
      <ShiftRow s={schedule} days={schedule.days} lunchValue={lunchValue} lunchGroup={lunchGroup} />
      {schedule.altShift && <AltShiftRow alt={schedule.altShift} />}
      <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground">
        Stay within these exact times — breaks are scheduled, not chosen. Log every
        break and lunch in both the JOI app and your CRM.
      </p>
    </div>
  );
}

function Pill({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${t.pill}`}
    >
      <span className={`font-medium ${t.label}`}>{label}</span>
      <span className="font-semibold text-[#0A1133]">{value}</span>
    </span>
  );
}

function ShiftRow({
  s,
  days,
  lunchValue,
  lunchGroup,
}: {
  s: BreakSchedule;
  days: string;
  lunchValue: string;
  lunchGroup: "A" | "B" | "C" | null;
}) {
  return (
    <div className="px-4 pt-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {days}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip tone="in" icon={<LogIn className="h-3.5 w-3.5" />} label="Clock in" value={s.clockIn} />
        <Chip tone="break" icon={<Coffee className="h-3.5 w-3.5" />} label="Break 1" value={s.break1} />
        <Chip
          tone="lunch"
          icon={<UtensilsCrossed className="h-3.5 w-3.5" />}
          label={lunchGroup ? `Lunch · Group ${lunchGroup}` : "Lunch"}
          value={lunchValue}
        />
        <Chip tone="break" icon={<Coffee className="h-3.5 w-3.5" />} label="Break 2" value={s.break2} />
      </div>
      <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-700">
        <LogOut className="h-3 w-3" />
        Clock out {s.clockOut}
      </div>
    </div>
  );
}

function AltShiftRow({ alt }: { alt: AltShift }) {
  return (
    <div className="mt-2 px-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {alt.days}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip tone="in" icon={<LogIn className="h-3.5 w-3.5" />} label="Clock in" value={alt.clockIn} />
        <Chip tone="break" icon={<Coffee className="h-3.5 w-3.5" />} label="Break 1" value={alt.break1} />
        <Chip tone="lunch" icon={<UtensilsCrossed className="h-3.5 w-3.5" />} label="Lunch" value={alt.lunch} />
        <Chip tone="break" icon={<Coffee className="h-3.5 w-3.5" />} label="Break 2" value={alt.break2} />
      </div>
      <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-700">
        <LogOut className="h-3 w-3" />
        Clock out {alt.clockOut}
      </div>
    </div>
  );
}

function Chip({
  tone,
  icon,
  label,
  value,
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const t = TONE[tone];
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${t.chip}`}>
      <div className={`flex items-center gap-1 text-[11px] font-medium ${t.label}`}>
        <span className={t.icon}>{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-[#0A1133]">{value}</div>
    </div>
  );
}
