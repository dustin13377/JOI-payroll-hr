import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { StageSelector } from "./StageSelector";
import { useCandidate, useUpdateCandidate } from "@/hooks/useRecruiting";
import { toast } from "sonner";
import { format } from "date-fns";
import { UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isTerminal } from "@/lib/recruiting/stages";
import { MediaAttachment } from "@/components/MediaAttachment";
import type { Stage } from "@/lib/recruiting/stages";

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

export function CandidateDrawer({ candidateId, onClose }: Props) {
  const { data: candidate, isLoading } = useCandidate(candidateId ?? undefined);
  const updateMutation = useUpdateCandidate();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    city: "",
    applicant_notes: "",
  });

  useEffect(() => {
    if (candidate) {
      setForm({
        full_name: candidate.full_name ?? "",
        email: candidate.email ?? "",
        phone: candidate.phone ?? "",
        city: candidate.city ?? "",
        applicant_notes: candidate.applicant_notes ?? "",
      });
      setEditing(false);
    }
  }, [candidate]);

  const handleStageChange = async (next: Stage) => {
    if (!candidate) return;
    const patch: Parameters<typeof updateMutation.mutateAsync>[0]["patch"] = { stage: next };
    if (next === "hired" || next === "passed" || next === "withdrew" || next === "ghosted") {
      patch.final_status = next;
    }
    try {
      await updateMutation.mutateAsync({ id: candidate.id, patch });
      toast.success(`Moved to ${next}`);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  const saveEdits = async () => {
    if (!candidate) return;
    try {
      await updateMutation.mutateAsync({ id: candidate.id, patch: form });
      toast.success("Saved");
      setEditing(false);
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  return (
    <Sheet open={!!candidateId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {candidate && (
          <>
            <SheetHeader>
              <SheetTitle>{candidate.full_name ?? "Unnamed candidate"}</SheetTitle>
              <SheetDescription>
                Applied {format(new Date(candidate.created_at), "PP p")}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Label className="w-24 text-sm">Stage</Label>
                <StageSelector
                  currentStage={candidate.stage}
                  onChange={handleStageChange}
                  disabled={updateMutation.isPending}
                />
              </div>

              {/*
                "Hire as employee" button. Hidden once the candidate is in a
                terminal stage (already hired, passed, withdrew, ghosted) since
                you can't re-hire from this row — the rehire check on the
                employee form handles that case directly.
              */}
              {!isTerminal(candidate.stage) && (
                <Button
                  className="w-full"
                  onClick={() => {
                    onClose();
                    navigate(`/empleados?hireFromCandidate=${candidate.id}`);
                  }}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Hire as employee
                </Button>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Details</h3>
                  {!editing ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                      <Button size="sm" onClick={saveEdits} disabled={updateMutation.isPending}>Save</Button>
                    </div>
                  )}
                </div>

                {(["full_name","email","phone","city"] as const).map((field) => (
                  <div key={field} className="grid grid-cols-3 gap-2 items-center">
                    <Label className="text-sm capitalize">{field.replace("_"," ")}</Label>
                    {editing ? (
                      <Input
                        className="col-span-2"
                        value={form[field]}
                        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      />
                    ) : (
                      <div className="col-span-2 text-sm">{candidate[field] ?? "—"}</div>
                    )}
                  </div>
                ))}

                <div>
                  <Label className="text-sm">Applicant notes</Label>
                  {editing ? (
                    <Textarea
                      value={form.applicant_notes}
                      onChange={(e) => setForm({ ...form, applicant_notes: e.target.value })}
                      rows={4}
                    />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">{candidate.applicant_notes ?? "—"}</div>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-medium">Attachments</h3>
                <MediaAttachment label="CV / Resume" url={candidate.cv_url} buttonLabel="View CV (PDF)" />
                <MediaAttachment label="Intro recording" url={candidate.presentation_url} />
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-2">Form metadata</h3>
                <dl className="text-sm space-y-1">
                  <div className="flex gap-2"><dt className="text-muted-foreground w-32">Role interest</dt><dd>{candidate.role_interest ?? "—"}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted-foreground w-32">English (self)</dt><dd>{candidate.english_level_self}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted-foreground w-32">Referral</dt><dd>{candidate.referral_source ?? "—"}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted-foreground w-32">CURP</dt><dd>{candidate.curp ?? "—"}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted-foreground w-32">Needs review</dt><dd>{candidate.needs_manual_review ? "Yes" : "No"}</dd></div>
                </dl>
              </div>

              <Separator />

              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Raw email body</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs bg-muted p-3 rounded max-h-64 overflow-y-auto">
                  {candidate.raw_email_body ?? "(none)"}
                </pre>
              </details>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
