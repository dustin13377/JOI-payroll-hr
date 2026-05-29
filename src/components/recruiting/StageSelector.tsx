import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STAGES, STAGE_LABELS, isTerminal, isValidTransition, type Stage } from "@/lib/recruiting/stages";
import { toast } from "sonner";

interface Props {
  currentStage: Stage;
  onChange: (next: Stage) => Promise<void>;
  disabled?: boolean;
}

export function StageSelector({ currentStage, onChange, disabled }: Props) {
  const [pending, setPending] = useState<Stage | null>(null);

  const handleSelect = (next: string) => {
    const nextStage = next as Stage;
    if (nextStage === currentStage) return;
    if (!isValidTransition(currentStage, nextStage)) {
      toast.error(`Cannot move from ${STAGE_LABELS[currentStage]} to ${STAGE_LABELS[nextStage]}`);
      return;
    }
    if (isTerminal(nextStage)) {
      setPending(nextStage); // open confirmation
      return;
    }
    void onChange(nextStage);
  };

  const confirm = async () => {
    if (!pending) return;
    await onChange(pending);
    setPending(null);
  };

  return (
    <>
      <Select value={currentStage} onValueChange={handleSelect} disabled={disabled}>
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGES.map((s) => (
            <SelectItem
              key={s}
              value={s}
              disabled={s !== currentStage && !isValidTransition(currentStage, s)}
            >
              {STAGE_LABELS[s]}
              {isTerminal(s) && s !== currentStage && " ⚠"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to {pending && STAGE_LABELS[pending]}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is a terminal stage. The candidate cannot be moved out of it later.
              You can still edit notes and view their history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
