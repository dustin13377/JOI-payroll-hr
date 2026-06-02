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
import { ExternalLink, FileText, Download } from "lucide-react";
import type { Stage } from "@/lib/recruiting/stages";

/**
 * Detect attachment type from URL. Gravity Forms URLs look like:
 *   https://justoutsource.it/index.php?gf-download=2026%2F05%2Fcv.pdf&form-id=4&...
 * The actual filename is URL-encoded inside the gf-download query param,
 * so we have to decode it before checking the extension.
 */
function detectMediaType(url: string): "pdf" | "audio" | "video" | "doc" | "other" {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // fall through with original
  }
  const lower = decoded.toLowerCase();
  if (/\.pdf(\b|[?&#])/.test(lower)) return "pdf";
  if (/\.(mp3|m4a|wav|ogg|aac)(\b|[?&#])/.test(lower)) return "audio";
  if (/\.(mp4|mov|webm|m4v|avi)(\b|[?&#])/.test(lower)) return "video";
  if (/\.(docx?|odt|rtf)(\b|[?&#])/.test(lower)) return "doc";
  return "other";
}

function AttachmentBlock({
  label,
  url,
}: {
  label: string;
  url: string | null | undefined;
}) {
  if (!url) {
    return (
      <div>
        <Label className="text-sm">{label}</Label>
        <div className="text-sm text-muted-foreground mt-1">—</div>
      </div>
    );
  }

  const kind = detectMediaType(url);

  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      {kind === "pdf" && (
        <Button asChild size="sm" variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <FileText className="mr-2 h-4 w-4" />
            View CV (PDF)
            <ExternalLink className="ml-2 h-3 w-3" />
          </a>
        </Button>
      )}
      {kind === "doc" && (
        <Button asChild size="sm" variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Download className="mr-2 h-4 w-4" />
            Download CV (Word doc)
          </a>
        </Button>
      )}
      {kind === "audio" && (
        <audio controls preload="none" className="w-full">
          <source src={url} />
          Your browser does not support audio playback.{" "}
          <a href={url} target="_blank" rel="noopener noreferrer">Download</a>
        </audio>
      )}
      {kind === "video" && (
        <video controls preload="none" className="w-full rounded border max-h-64">
          <source src={url} />
          Your browser does not support video playback.{" "}
          <a href={url} target="_blank" rel="noopener noreferrer">Download</a>
        </video>
      )}
      {kind === "other" && (
        <Button asChild size="sm" variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open attachment
          </a>
        </Button>
      )}
    </div>
  );
}

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

export function CandidateDrawer({ candidateId, onClose }: Props) {
  const { data: candidate, isLoading } = useCandidate(candidateId ?? undefined);
  const updateMutation = useUpdateCandidate();

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
                <AttachmentBlock label="CV / Resume" url={candidate.cv_url} />
                <AttachmentBlock label="Intro recording" url={candidate.presentation_url} />
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
