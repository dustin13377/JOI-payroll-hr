import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateMyGoal, useMyGoal } from "@/hooks/useSupabasePayroll";
import { toast } from "sonner";

/**
 * First-login goal prompt. Shows when an agent has no personal_goal set AND
 * hasn't dismissed the prompt yet.
 *
 * Deliberately uses warm, non-corporate copy. Agents won't write anything real
 * if it sounds like an HR form.
 */
export interface GoalPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  firstName?: string;
}

export function GoalPromptDialog({ open, onOpenChange, employeeId, firstName }: GoalPromptDialogProps) {
  const { data: existingGoal } = useMyGoal(employeeId);
  const updateGoal = useUpdateMyGoal();
  const [goal, setGoal] = useState("");
  const [shareWithTl, setShareWithTl] = useState(false);

  // Pre-fill on open (edit case)
  useEffect(() => {
    if (open) {
      setGoal(existingGoal?.personal_goal ?? "");
      setShareWithTl(existingGoal?.goal_visible_to_tl ?? false);
    }
  }, [open, existingGoal]);

  const isEditing = !!existingGoal?.personal_goal;

  const handleSave = () => {
    if (goal.trim().length < 3) {
      toast.error("Tell us something — even a few words.");
      return;
    }
    updateGoal.mutate(
      {
        employee_id: employeeId,
        personal_goal: goal.trim(),
        goal_visible_to_tl: shareWithTl,
      },
      {
        onSuccess: () => {
          toast.success("Got it. We're rooting for you.");
          onOpenChange(false);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const handleSkip = () => {
    updateGoal.mutate(
      { employee_id: employeeId, dismiss_prompt: true },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? "Update your goal"
              : `Quick question${firstName ? `, ${firstName}` : ""} 👋`}
          </DialogTitle>
          <DialogDescription className="text-base leading-relaxed pt-2">
            {isEditing
              ? "What are you working toward right now? Update it whenever your priorities shift."
              : "What are you actually working toward? A car, a kid, getting out of debt, a trip, paying for your mom's stuff — whatever it is. We won't grade it, and it stays yours."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="goal-text" className="sr-only">Your goal</Label>
            <Textarea
              id="goal-text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Buying my mom a washing machine"
              rows={3}
              maxLength={300}
              autoFocus
            />
            <p className="text-xs text-muted-foreground text-right">
              {goal.length}/300
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="share-tl"
              checked={shareWithTl}
              onCheckedChange={(v) => setShareWithTl(v === true)}
            />
            <Label htmlFor="share-tl" className="text-sm font-normal leading-relaxed cursor-pointer">
              Let my team lead see this. They can use it during reviews. <span className="text-muted-foreground">(optional)</span>
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={isEditing ? () => onOpenChange(false) : handleSkip}
            disabled={updateGoal.isPending}
          >
            {isEditing ? "Cancel" : "Maybe later"}
          </Button>
          <Button onClick={handleSave} disabled={updateGoal.isPending}>
            {updateGoal.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
