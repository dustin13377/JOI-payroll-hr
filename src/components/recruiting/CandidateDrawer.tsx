import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { StageSelector } from "./StageSelector";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useCandidate,
  useUpdateCandidate,
  useSendWhatsAppInvite,
  useSendRecruitingEmail,
  useCandidateInterviews,
} from "@/hooks/useRecruiting";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { UserPlus, MessageCircle, Mail, CalendarClock, CheckCircle2, XCircle, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isTerminal } from "@/lib/recruiting/stages";
import {
  normalizePhone,
  buildInterviewInviteMessage,
  buildInterviewFollowUpMessage,
  buildWhatsAppUrl,
  INTERVIEW_FOLLOWUP_TEMPLATE_KEY,
} from "@/lib/recruiting/whatsapp";
import {
  buildInterviewFollowUpEmail,
  INTERVIEW_FOLLOWUP_EMAIL_TEMPLATE_KEY,
} from "@/lib/recruiting/email";
import { needsFollowUp, isFollowUpLocked, followUpUnlockAt } from "@/lib/recruiting/followup";
import { formatDistanceToNow } from "date-fns";
import { MediaAttachment } from "@/components/MediaAttachment";
import { PositionFitPicker } from "./PositionFitPicker";
import { SkillsTestCard } from "./SkillsTestCard";
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
  const sendEmail = useSendRecruitingEmail();
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
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerDate, setOfferDate] = useState("");
  // Which WhatsApp send is waiting on the recruiter to confirm they actually
  // hit send in WhatsApp. Nothing is written to the DB until they confirm, so
  // a link that's opened but never sent leaves no trace on the candidate.
  const [awaitingSend, setAwaitingSend] = useState<null | "invite" | "followup">(null);
  // Checkbox inside the "Yes, mark as contacted" confirm box: when true, the
  // candidate gets flagged is_highlighted alongside the contacted stamp, so
  // their row shows up color-coded on the Upcoming Interviews widget.
  const [highlightOnConfirm, setHighlightOnConfirm] = useState(false);

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

  // Drop any armed send-confirm when switching candidates so it can't carry
  // over to the wrong person.
  useEffect(() => {
    setAwaitingSend(null);
    setHighlightOnConfirm(false);
  }, [candidateId]);

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
    // Moving to "offer" needs a start date, so open the dialog instead of
    // patching straight away.
    if (next === "offer") {
      setOfferDate(candidate.offer_start_date ?? "");
      setOfferDialogOpen(true);
      return;
    }
    const patch: Parameters<typeof updateMutation.mutateAsync>[0]["patch"] = { stage: next };
    if (
      next === "hired" ||
      next === "passed" ||
      next === "withdrew" ||
      next === "ghosted" ||
      next === "no_show"
    ) {
      patch.final_status = next;
    }
    try {
      await updateMutation.mutateAsync({ id: candidate.id, patch });
      toast.success(`Moved to ${next}`);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  // Save the offer + expected start date. Stamps who extended it and when.
  const confirmOffer = async () => {
    if (!candidate || !offerDate) return;
    try {
      const { data: auth } = await supabase.auth.getUser();
      await updateMutation.mutateAsync({
        id: candidate.id,
        patch: {
          stage: "offer",
          offer_start_date: offerDate,
          offer_extended_at: new Date().toISOString(),
          offer_extended_by: auth?.user?.id ?? null,
        },
      });
      toast.success("Offer set — candidate is Pending Start");
      setOfferDialogOpen(false);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  // Day-1 outcome: they showed up. Reuse the existing hire-from-candidate flow,
  // which creates the employee and flips the candidate to "hired" on save.
  const handleShowedUp = () => {
    if (!candidate) return;
    onClose();
    navigate(`/empleados?hireFromCandidate=${candidate.id}`);
  };

  // Day-1 outcome: no-show. Terminal, flagged, kept in history.
  const handleNoShow = async () => {
    if (!candidate) return;
    try {
      await updateMutation.mutateAsync({
        id: candidate.id,
        patch: { stage: "no_show", final_status: "no_show" },
      });
      toast.success("Marked as no-show");
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  // Step 1 of the invite: open WhatsApp with the message pre-filled and arm the
  // inline confirm. Opening happens synchronously on click so the browser
  // doesn't block the popup. NOTHING is written to the DB here — the recruiter
  // still has to actually send the message and then confirm below.
  const handleSendInvite = () => {
    if (!candidate) return;
    const phoneDigits = normalizePhone(candidate.phone);
    if (!phoneDigits) {
      toast.error("No valid WhatsApp number on file. Add one under Details first.");
      return;
    }
    const message = buildInterviewInviteMessage(candidate.full_name);
    window.open(
      buildWhatsAppUrl(phoneDigits, message),
      "_blank",
      "noopener,noreferrer",
    );
    setAwaitingSend("invite");
  };

  // Step 1 of the second-touch nudge — same deal: open WhatsApp, arm the
  // confirm, write nothing yet.
  const handleSendFollowUp = () => {
    if (!candidate) return;
    const phoneDigits = normalizePhone(candidate.phone);
    if (!phoneDigits) {
      toast.error("No valid WhatsApp number on file. Add one under Details first.");
      return;
    }
    const message = buildInterviewFollowUpMessage(candidate.full_name);
    window.open(
      buildWhatsAppUrl(phoneDigits, message),
      "_blank",
      "noopener,noreferrer",
    );
    setAwaitingSend("followup");
  };

  // Step 2: the recruiter confirms they actually sent it. Only now do we log
  // the message and stamp the candidate. Invite advances the stage to
  // Contacted; the follow-up only re-stamps last_contacted_at (no stage move).
  const handleConfirmSent = () => {
    if (!candidate || !awaitingSend) return;
    if (awaitingSend === "invite") {
      // Capture the highlight choice up-front so a mid-flight switch of the
      // checkbox can't apply to a different candidate after the mutation lands.
      const highlightNow = highlightOnConfirm && !candidate.is_highlighted;
      sendInvite.mutate(
        {
          candidate: { id: candidate.id, stage: candidate.stage },
          messageBody: buildInterviewInviteMessage(candidate.full_name),
        },
        {
          onSuccess: (res) => {
            toast.success(res.advanced ? "Invite sent — moved to Contacted" : "Invite logged");
            setAwaitingSend(null);
            setHighlightOnConfirm(false);
            // Flip the highlight flag as a separate write so the invite path
            // stays untouched. Failure here doesn't undo the invite — we just
            // let the recruiter know so they can retry with the standalone
            // toggle further down.
            if (highlightNow) {
              updateMutation.mutate(
                { id: candidate.id, patch: { is_highlighted: true } },
                {
                  onError: (e) =>
                    toast.error(
                      `Highlight didn't save: ${e instanceof Error ? e.message : "unknown"}`,
                    ),
                },
              );
            }
          },
          onError: (e) =>
            toast.error(`Couldn't log the invite: ${e instanceof Error ? e.message : "unknown"}`),
        },
      );
    } else {
      sendInvite.mutate(
        {
          candidate: { id: candidate.id, stage: candidate.stage },
          messageBody: buildInterviewFollowUpMessage(candidate.full_name),
          templateKey: INTERVIEW_FOLLOWUP_TEMPLATE_KEY,
          advanceStage: false,
        },
        {
          onSuccess: () => {
            toast.success("Follow-up logged");
            setAwaitingSend(null);
          },
          onError: (e) =>
            toast.error(`Couldn't log the follow-up: ${e instanceof Error ? e.message : "unknown"}`),
        },
      );
    }
  };

  // Recruiter opened WhatsApp but didn't send — discard without touching the DB.
  const handleCancelSend = () => setAwaitingSend(null);

  // Email follow-up (second channel). The edge function sends via Resend and
  // does the DB writes, so here we just fire it and report the result.
  const handleSendEmailFollowUp = () => {
    if (!candidate) return;
    if (!candidate.email) {
      toast.error("No email on file. Add one under Details first.");
      return;
    }
    const { subject, body } = buildInterviewFollowUpEmail(candidate.full_name);
    sendEmail.mutate(
      {
        candidateId: candidate.id,
        subject,
        body,
        templateKey: INTERVIEW_FOLLOWUP_EMAIL_TEMPLATE_KEY,
      },
      {
        onSuccess: (res) => toast.success(`Email sent to ${res.to}`),
        onError: (e) =>
          toast.error(`Email failed: ${e instanceof Error ? e.message : "unknown"}`),
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

  // Follow-up 48h lock: keep both follow-up buttons locked until enough time
  // has passed since last contact, so nobody double-taps a candidate the same
  // day. Unlocks automatically once the window elapses.
  const followUpLocked = candidate ? isFollowUpLocked(candidate.last_contacted_at) : false;
  const followUpUnlock = candidate ? followUpUnlockAt(candidate.last_contacted_at) : null;
  const followUpLockedTitle = followUpUnlock
    ? `Follow-up unlocks ${formatDistanceToNow(followUpUnlock, { addSuffix: true })} (48h after last contact)`
    : undefined;

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
                Standalone highlight toggle. Independent of the invite flow so
                D can flag/unflag anyone at any stage. The initial checkbox on
                the invite confirm is a convenience shortcut; this is the
                permanent control that survives after contact.
              */}
              <div className="flex items-center gap-3">
                <Label className="w-24 text-sm">Highlight</Label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <Checkbox
                    checked={candidate.is_highlighted}
                    disabled={updateMutation.isPending}
                    onCheckedChange={(v) =>
                      updateMutation.mutate(
                        { id: candidate.id, patch: { is_highlighted: v === true } },
                        {
                          onError: (e) =>
                            toast.error(
                              `Couldn't update: ${e instanceof Error ? e.message : "unknown"}`,
                            ),
                        },
                      )
                    }
                  />
                  <Star
                    className={
                      "h-3.5 w-3.5 " +
                      (candidate.is_highlighted
                        ? "text-amber-500 fill-amber-400"
                        : "text-muted-foreground")
                    }
                  />
                  <span className="text-muted-foreground">
                    Color-code this candidate's row on the interview list
                  </span>
                </label>
              </div>

              {/*
                Offer / Pending Start panel. Shows the expected start date and the
                two day-1 outcomes HR marks: showed up (→ hire) or no-show.
              */}
              {candidate.stage === "offer" && (() => {
                const start = candidate.offer_start_date;
                const overdue =
                  !!start && start < new Date().toISOString().slice(0, 10);
                return (
                  <div className="rounded-md border p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CalendarClock className="h-4 w-4" />
                      Pending Start
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Expected start:{" "}
                      <span className="font-medium text-foreground">
                        {start ? format(new Date(`${start}T00:00:00`), "PP") : "not set"}
                      </span>
                      {overdue && (
                        <span className="ml-2 text-destructive font-medium">
                          — start date passed, mark day-1 outcome
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={handleShowedUp}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Showed up — hire
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={handleNoShow}
                        disabled={updateMutation.isPending}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        No-show
                      </Button>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => {
                        setOfferDate(candidate.offer_start_date ?? "");
                        setOfferDialogOpen(true);
                      }}
                    >
                      Change start date
                    </button>
                  </div>
                );
              })()}

              {/*
                "Hire as employee" button. Hidden once the candidate is in a
                terminal stage (already hired, passed, withdrew, ghosted) since
                you can't re-hire from this row — the rehire check on the
                employee form handles that case directly. Also hidden in the
                "offer" stage, which has its own hire button above.
              */}
              {!isTerminal(candidate.stage) && candidate.stage !== "offer" && (
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
              {!isTerminal(candidate.stage) && awaitingSend !== "invite" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSendInvite}
                  disabled={sendInvite.isPending || awaitingSend !== null || !normalizePhone(candidate.phone)}
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

              {/*
                Inline confirm for the invite. Shown after WhatsApp is opened so
                nothing is logged (and the stage isn't advanced) until the
                recruiter confirms they actually sent the message.
              */}
              {awaitingSend === "invite" && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                  <p className="text-sm font-medium">Did you send the WhatsApp invite?</p>
                  <p className="text-xs text-muted-foreground">
                    Confirm only after you tapped send in WhatsApp. Nothing is saved
                    and the stage won't move to Contacted until you do.
                  </p>
                  {/*
                    Highlight opt-in: when checked, this candidate's row on the
                    Upcoming Interviews widget gets color-coded so D can spot
                    them at a glance. Hidden if already highlighted (nothing to
                    add), and the standalone toggle below covers the "unstar
                    later" case.
                  */}
                  {!candidate.is_highlighted && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                      <Checkbox
                        checked={highlightOnConfirm}
                        onCheckedChange={(v) => setHighlightOnConfirm(v === true)}
                      />
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        Highlight this candidate on the interview list
                      </span>
                    </label>
                  )}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={handleConfirmSent}
                      disabled={sendInvite.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Yes, mark as contacted
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleCancelSend}
                      disabled={sendInvite.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Not yet
                    </Button>
                  </div>
                </div>
              )}

              {/*
                Follow-up nudge. Shown once a candidate is in "contacted" (i.e.
                already invited) so the recruiter can send the shorter second
                message right here. Disabled without a usable phone.
              */}
              {candidate.stage === "contacted" && awaitingSend !== "followup" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSendFollowUp}
                  disabled={sendInvite.isPending || awaitingSend !== null || !normalizePhone(candidate.phone) || followUpLocked}
                  title={
                    !normalizePhone(candidate.phone)
                      ? "No valid WhatsApp number on file"
                      : followUpLocked
                        ? followUpLockedTitle
                        : undefined
                  }
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Send WhatsApp follow-up
                </Button>
              )}

              {/* Inline confirm for the follow-up — same gate, but no stage move. */}
              {awaitingSend === "followup" && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                  <p className="text-sm font-medium">Did you send the WhatsApp follow-up?</p>
                  <p className="text-xs text-muted-foreground">
                    Confirm only after you tapped send in WhatsApp. Nothing is logged
                    until you do.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={handleConfirmSent}
                      disabled={sendInvite.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Yes, log it
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleCancelSend}
                      disabled={sendInvite.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Not yet
                    </Button>
                  </div>
                </div>
              )}

              {/*
                Email follow-up — second channel for a contacted candidate who
                went quiet. Sends server-side via Resend. Disabled without an
                email on file.
              */}
              {candidate.stage === "contacted" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSendEmailFollowUp}
                  disabled={sendEmail.isPending || awaitingSend !== null || !candidate.email || followUpLocked}
                  title={
                    !candidate.email
                      ? "No email on file"
                      : followUpLocked
                        ? followUpLockedTitle
                        : undefined
                  }
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {sendEmail.isPending ? "Sending email…" : "Send email follow-up"}
                </Button>
              )}

              {candidate.last_contacted_at && (
                <p className="text-xs text-muted-foreground -mt-2">
                  Last contacted {format(new Date(candidate.last_contacted_at), "PP p")}
                  {needsFollowUp(candidate.stage, candidate.last_contacted_at) && (
                    <span className="ml-2 text-amber-600 font-medium">
                      — follow-up due
                    </span>
                  )}
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

              <SkillsTestCard candidateId={candidate.id} />

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
                  <div className="flex gap-2"><dt className="text-muted-foreground w-32">Position applied for</dt><dd>{candidate.applied_position ?? candidate.role_interest ?? "—"}</dd></div>
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

            {/* Start-date prompt shown when extending an offer. */}
            <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Extend offer — set expected start date</DialogTitle>
                  <DialogDescription>
                    The candidate moves to “Pending Start”. On the start date, HR
                    marks whether they showed up or were a no-show.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="offer-start-date" className="text-sm">Start date</Label>
                  <Input
                    id="offer-start-date"
                    type="date"
                    value={offerDate}
                    onChange={(e) => setOfferDate(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOfferDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={confirmOffer} disabled={!offerDate || updateMutation.isPending}>
                    Confirm offer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
