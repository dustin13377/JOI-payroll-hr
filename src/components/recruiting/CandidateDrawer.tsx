import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { StageSelector } from "./StageSelector";
import { Badge } from "@/components/ui/badge";
import {
  useCandidate,
  useUpdateCandidate,
  useSendWhatsAppInvite,
  useCandidateInterviews,
} from "@/hooks/useRecruiting";
import { toast } from "sonner";
import { format } from "date-fns";
import { UserPlus, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isTerminal } from "@/lib/recruiting/stages";
import {
  normalizePhone,
  buildInterviewInviteMessage,
  buildWhatsAppUrl,
} from "@/lib/recruiting/whatsapp";
import { MediaAttachment } from "@/components/MediaAttachment";
import { PositionFitPicker } from "./PositionFitPicker";
import type { Stage } from "@/lib/recruiting/stages";

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

export function CandidateDrawer({ candidateId, onClose }: Props) {
  const { data: candidate, isLoading } = useCandidate(candidateId ?? undefined);
  const { data: interviews = [] } = useCandidateInterviews(candidateId ?? undefined);
  const updateMutation = useUpdateCandidate();
  const sendInvite = useSendWhatsAppInvite();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    city: "",
    applicant_notes: "",
  });
  const [recruiterNotes, setRecruiterNotes] = useState("");

  useEffect(() => {
    if (candidate) {
      setForm({
        full_name: candidate.full_name ?? "",
        email: candidate.email ?? "",
        phone: candidate.phone ?? "",
        city: candidate.city ?? "",
        applicant_notes: candidate.applicant_notes ?? "",
      });
      setRecruiterNotes(candidate.recruiter_notes ?? "");
      setEditing(false);
    }
  }, [candidate]);

  const recruiterNotesDirty =
    !!candidate && recruiterNotes !== (candidate.recruiter_notes ?? "");

  const saveRecruiterNotes = async () => {
    if (!candidate) return;
    try {
      await updateMutation.mutateAsync({
        id: candidate.id,
        patch: { recruiter_notes: recruiterNotes.trim() || null },
      });
      toast.success("Notes saved");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  const handlePositionsChange = async (next: string[]) => {
    if (!candidate) return;
    try {
      await updateMutation.mutateAsync({
        id: candidate.id,
        patch: { position_fits: next },
      });
    } catch (e) {
      toast.error(`Update failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

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

  const handleSendInvite = () => {
    if (!candidate) return;
    const phoneDigits = normalizePhone(candidate.phone);
    if (!phoneDigits) {
      toast.error("No valid WhatsApp number on file. Add one under Details first.");
      return;
    }
    const message = buildInterviewInviteMessage(candidate.full_name);
    // Open WhatsApp synchronously on click so the browser doesn't block the
    // popup. The DB write happens after — the recruiter still taps send.
    window.open(
      buildWhatsAppUrl(phoneDigits, message),
      "_blank",
      "noopener,noreferrer",
    );
    sendInvite.mutate(
      { candidate: { id: candidate.id, stage: candidate.stage }, messageBody: message },
      {
        onSuccess: (res) =>
          toast.success(res.advanced ? "Invite sent — moved to Contacted" : "Invite logged"),
        onError: (e) =>
          toast.error(`Couldn't log the invite: ${e instanceof Error ? e.message : "unknown"}`),
      },
    );
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

              {/*
                WhatsApp interview invite (Path A: opens WhatsApp with the
                Calendly link pre-filled; recruiter taps send). Hidden for
                terminal candidates. Disabled when there's no usable phone.
              */}
              {!isTerminal(candidate.stage) && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSendInvite}
                  disabled={sendInvite.isPending || !normalizePhone(candidate.phone)}
                  title={
                    normalizePhone(candidate.phone)
                      ? undefined
                      : "No valid WhatsApp number on file"
                  }
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Send WhatsApp interview invite
                </Button>
              )}

              {candidate.last_contacted_at && (
                <p className="text-xs text-muted-foreground -mt-2">
                  Last contacted {format(new Date(candidate.last_contacted_at), "PP p")}
                </p>
              )}

              <Separator />

              {/* Position fit tags — which roles this person is good for,
                  regardless of what they applied to. Saves on toggle. */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Position fit</h3>
                <PositionFitPicker
                  value={candidate.position_fits ?? []}
                  onChange={handlePositionsChange}
                  disabled={updateMutation.isPending}
                />
              </div>

              {/* Interview attendance history — fed by the Completed / No show
                  buttons on the Upcoming Interviews widget. */}
              {interviews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Interview history</h3>
                    {(() => {
                      const noShows = interviews.filter((iv) => iv.outcome === "no_show").length;
                      return noShows > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          {noShows} no-show{noShows > 1 ? "s" : ""}
                        </Badge>
                      ) : null;
                    })()}
                  </div>
                  <ul className="space-y-1">
                    {interviews.map((iv) => (
                      <li key={iv.id} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground tabular-nums">
                          {format(new Date(iv.scheduled_at ?? iv.conducted_at), "MM/dd/yyyy p")}
                        </span>
                        {iv.outcome ? (
                          <Badge
                            variant={iv.outcome === "completed" ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {iv.outcome === "completed" ? "Completed" : "No show"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Interviewed</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Internal recruiter notes — separate from applicant_notes,
                  which holds what the candidate wrote on the form. */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Recruiter notes</h3>
                  {recruiterNotesDirty && (
                    <Button size="sm" onClick={saveRecruiterNotes} disabled={updateMutation.isPending}>
                      Save
                    </Button>
                  )}
                </div>
                <Textarea
                  value={recruiterNotes}
                  onChange={(e) => setRecruiterNotes(e.target.value)}
                  placeholder="e.g. Great customer service profile, not a sales fit"
                  rows={3}
                />
              </div>

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
                  <Label className="text-sm">Applicant notes (from application form)</Label>
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
                <MediaAttachment label="CV / Resume" url={candidate.cv_url} buttonLabel="View CV" />
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
