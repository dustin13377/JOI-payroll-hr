import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edge";
import { todayLocal } from "@/lib/localDate";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserX } from "lucide-react";

export interface SubmitEODKPIField {
  field_name: string;
  field_label: string;
  field_type: "number" | "boolean" | "text" | "dropdown";
  is_required: boolean;
  dropdown_options: string[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: { id: string; name: string } | null;
  campaignId: string | null;
  kpiFields: SubmitEODKPIField[];
  /** Defaults to today. TL can override for a backfill. */
  defaultDate?: string;
  onSubmitted?: () => void;
}

type FormValue = string | number | boolean;

/**
 * "Submit EOD on behalf of an agent who has no login yet."
 * Used by TLs covering new hires. Calls the submit-eod-for-agent edge function
 * which writes an audit row. Required `reason` field captures why the TL is
 * filing on the agent's behalf.
 */
export function SubmitEODForAgentDialog({
  open,
  onOpenChange,
  agent,
  campaignId,
  kpiFields,
  defaultDate,
  onSubmitted,
}: Props) {
  const { toast } = useToast();
  const [date, setDate] = useState(defaultDate ?? todayLocal());
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form whenever dialog opens for a new agent
  useEffect(() => {
    if (open) {
      setDate(defaultDate ?? todayLocal());
      setValues({});
      setNotes("");
      setReason("");
      setErrors({});
    }
  }, [open, agent?.id, defaultDate]);

  const setVal = (k: string, v: FormValue) => setValues((p) => ({ ...p, [k]: v }));

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!agent || !campaignId) throw new Error("Missing agent or campaign");

      // Validate required fields
      const errs: Record<string, string> = {};
      kpiFields.forEach((f) => {
        if (!f.is_required) return;
        const v = values[f.field_name];
        if (v === undefined || v === "" || v === null) {
          errs[f.field_name] = "Required";
        }
      });
      if (reason.trim().length < 3) {
        errs.__reason__ = "Tell us why you're filing this on their behalf (min 3 chars)";
      }
      setErrors(errs);
      if (Object.keys(errs).length > 0) {
        throw new Error("Please fill in all required fields.");
      }

      // Coerce types into the JSON metrics payload
      const metrics: Record<string, unknown> = {};
      kpiFields.forEach((f) => {
        const raw = values[f.field_name];
        if (raw === undefined || raw === "") return;
        if (f.field_type === "number") {
          const n = typeof raw === "number" ? raw : parseFloat(String(raw));
          metrics[f.field_name] = isNaN(n) ? null : n;
        } else if (f.field_type === "boolean") {
          metrics[f.field_name] = !!raw;
        } else {
          metrics[f.field_name] = String(raw);
        }
      });

      const { data, error } = await supabase.functions.invoke("submit-eod-for-agent", {
        body: {
          employee_id: agent.id,
          date,
          campaign_id: campaignId,
          metrics,
          notes: notes.trim() || undefined,
          reason: reason.trim(),
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      return data;
    },
    onSuccess: () => {
      toast({ title: "EOD submitted", description: `Logged for ${agent?.name}.` });
      onOpenChange(false);
      onSubmitted?.();
    },
    onError: (err) => {
      toast({
        title: "Could not submit EOD",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-amber-600" />
            Submit EOD for {agent.name}
          </DialogTitle>
          <DialogDescription>
            This agent doesn't have a login yet, so you're filing their end-of-day
            on their behalf. This action is logged with the reason you provide.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="eod-date">Date</Label>
            <Input
              id="eod-date"
              type="date"
              value={date}
              max={todayLocal()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {kpiFields.map((f) => (
            <div key={f.field_name} className="grid gap-1.5">
              <Label htmlFor={`kpi-${f.field_name}`}>
                {f.field_label}
                {f.is_required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {f.field_type === "number" && (
                <Input
                  id={`kpi-${f.field_name}`}
                  type="number"
                  inputMode="numeric"
                  value={values[f.field_name] !== undefined ? String(values[f.field_name]) : ""}
                  onChange={(e) => setVal(f.field_name, e.target.value === "" ? "" : parseFloat(e.target.value))}
                />
              )}
              {f.field_type === "text" && (
                <Input
                  id={`kpi-${f.field_name}`}
                  type="text"
                  value={(values[f.field_name] as string) ?? ""}
                  onChange={(e) => setVal(f.field_name, e.target.value)}
                />
              )}
              {f.field_type === "boolean" && (
                <Select
                  value={values[f.field_name] === true ? "yes" : values[f.field_name] === false ? "no" : ""}
                  onValueChange={(v) => setVal(f.field_name, v === "yes")}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {f.field_type === "dropdown" && (
                <Select
                  value={(values[f.field_name] as string) ?? ""}
                  onValueChange={(v) => setVal(f.field_name, v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(f.dropdown_options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {errors[f.field_name] && (
                <p className="text-xs text-red-600">{errors[f.field_name]}</p>
              )}
            </div>
          ))}

          <div className="grid gap-1.5">
            <Label htmlFor="eod-notes">Notes (optional)</Label>
            <Textarea
              id="eod-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth noting about today's shift…"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="eod-reason">
              Why are you filing this on their behalf?
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <Textarea
              id="eod-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='e.g. "New hire, no login yet — Day 3 of training"'
            />
            {errors.__reason__ && (
              <p className="text-xs text-red-600">{errors.__reason__}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
            {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit EOD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
