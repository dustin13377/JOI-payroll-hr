import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock, Send, GripVertical, X } from "lucide-react";
import { toast } from "sonner";
import { useCreateQuestionnaire, QuestionType } from "@/hooks/useBulletin";

type DraftQuestion = {
  id: string; // local-only key for React
  question_text: string;
  type: QuestionType;
  options: string[];
};

function QuestionRow({
  q,
  index,
  onChange,
  onRemove,
}: {
  q: DraftQuestion;
  index: number;
  onChange: (updated: DraftQuestion) => void;
  onRemove: () => void;
}) {
  const isMultiple = q.type === "multiple_choice";

  const addOption = () => onChange({ ...q, options: [...q.options, ""] });
  const updateOption = (i: number, val: string) => {
    const opts = [...q.options];
    opts[i] = val;
    onChange({ ...q, options: opts });
  };
  const removeOption = (i: number) =>
    onChange({ ...q, options: q.options.filter((_, idx) => idx !== i) });

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground w-5">Q{index + 1}</span>
            {/* Type toggle */}
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...q,
                  type: isMultiple ? "open_ended" : "multiple_choice",
                  options: isMultiple ? [] : ["", ""],
                })
              }
              className="shrink-0"
            >
              <Badge variant={isMultiple ? "default" : "secondary"} className="text-xs cursor-pointer">
                {isMultiple ? "Multiple choice" : "Open ended"}
              </Badge>
            </button>
          </div>
          <Input
            value={q.question_text}
            onChange={(e) => onChange({ ...q, question_text: e.target.value })}
            placeholder="Question text…"
          />
          {isMultiple && (
            <div className="space-y-1.5 pl-1">
              {q.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full border border-muted-foreground shrink-0" />
                  <Input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="h-8 text-sm"
                  />
                  {q.options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground"
                      onClick={() => removeOption(i)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={addOption}
              >
                <Plus className="h-3 w-3" /> Add option
              </Button>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive shrink-0"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function QuestionnaireCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createQuestionnaire = useCreateQuestionnaire();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { id: crypto.randomUUID(), question_text: "", type: "open_ended", options: [] },
  ]);

  const reset = () => {
    setTitle("");
    setBody("");
    setExpiresAt("");
    setQuestions([{ id: crypto.randomUUID(), question_text: "", type: "open_ended", options: [] }]);
  };

  const addQuestion = () =>
    setQuestions((qs) => [
      ...qs,
      { id: crypto.randomUUID(), question_text: "", type: "open_ended", options: [] },
    ]);

  const updateQuestion = (id: string, updated: DraftQuestion) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? updated : q)));

  const removeQuestion = (id: string) =>
    setQuestions((qs) => qs.filter((q) => q.id !== id));

  const validate = () => {
    if (!title.trim()) { toast.error("Title is required"); return false; }
    for (const q of questions) {
      if (!q.question_text.trim()) { toast.error("All questions must have text"); return false; }
      if (q.type === "multiple_choice") {
        const filled = q.options.filter((o) => o.trim());
        if (filled.length < 2) { toast.error("Multiple choice questions need at least 2 options"); return false; }
      }
    }
    return true;
  };

  const handleSave = async (publish: boolean) => {
    if (!validate()) return;
    try {
      await createQuestionnaire.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        expires_at: expiresAt || null,
        publish,
        questions: questions.map((q) => ({
          question_text: q.question_text.trim(),
          type: q.type,
          options: q.type === "multiple_choice" ? q.options.filter((o) => o.trim()) : null,
        })),
      });
      toast.success(publish ? "Survey published!" : "Survey saved as draft");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const busy = createQuestionnaire.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) { reset(); onOpenChange(v); }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Survey</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Monthly feedback — May 2026"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>Introduction <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Brief context or instructions for employees…"
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label>Expires on <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Questions</Label>
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id}
                q={q}
                index={i}
                onChange={(updated) => updateQuestion(q.id, updated)}
                onRemove={() => questions.length > 1 && removeQuestion(q.id)}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 w-full"
              onClick={addQuestion}
            >
              <Plus className="h-4 w-4" />
              Add question
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={busy}>
            <Clock className="h-4 w-4 mr-1.5" />
            Save as draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={busy}>
            <Send className="h-4 w-4 mr-1.5" />
            {busy ? "Publishing…" : "Publish survey"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
