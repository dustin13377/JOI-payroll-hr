import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StageBadge } from "./StageBadge";
import { FollowupBadge } from "./FollowupBadge";
import { SALES_STAGES, SALES_STAGE_LABELS, type SalesStage } from "@/lib/sales/stages";
import {
  useSalesLead,
  useUpdateSalesLead,
  useEnrichLead,
  fullName,
} from "@/hooks/useSalesLeads";
import { toast } from "sonner";
import {
  ExternalLink, Mail, Phone, RefreshCw, Loader2, AlertCircle, Building2,
} from "lucide-react";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

export function LeadDrawer({
  leadId,
  onClose,
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const { data: lead } = useSalesLead(leadId);
  const updateLead = useUpdateSalesLead();
  const enrich = useEnrichLead();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(lead?.notes ?? "");
  }, [lead?.id, lead?.notes]);

  const saveNotes = () => {
    if (!lead) return;
    if ((lead.notes ?? "") === notes) return;
    updateLead.mutate(
      { id: lead.id, patch: { notes } },
      { onError: (e) => toast.error(`Couldn't save notes: ${(e as Error).message}`) },
    );
  };

  const changeStage = (stage: SalesStage) => {
    if (!lead) return;
    updateLead.mutate(
      { id: lead.id, patch: { stage } },
      { onError: (e) => toast.error(`Couldn't update stage: ${(e as Error).message}`) },
    );
  };

  const refreshProfile = () => {
    if (!lead) return;
    enrich.mutate(lead.id, {
      onSuccess: (r) =>
        r.status === "ready"
          ? toast.success("Profile updated")
          : toast.message("Couldn't read their site", { description: "Have a look manually." }),
      onError: (e) => toast.error(`Couldn't read the site: ${(e as Error).message}`),
    });
  };

  const website = lead?.profile_source_url || lead?.website || null;
  const websiteHref = website
    ? (/^https?:\/\//i.test(website) ? website : `https://${website}`)
    : null;

  return (
    <Sheet open={!!leadId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {!lead ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-6">
            <SheetHeader className="space-y-2 text-left">
              <SheetTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                {lead.company || fullName(lead) || "Lead"}
              </SheetTitle>
              {websiteHref && (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {lead.website} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <div className="flex items-center gap-2 pt-1">
                <StageBadge stage={lead.stage} />
                <FollowupBadge lead={lead} />
                <Select value={lead.stage} onValueChange={(v) => changeStage(v as SalesStage)}>
                  <SelectTrigger className="h-7 w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALES_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{SALES_STAGE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SheetHeader>

            {/* Who they are — website read */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Who they are</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={refreshProfile}
                  disabled={enrich.isPending}
                >
                  {enrich.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  )}
                  {enrich.isPending ? "Reading…" : "Refresh"}
                </Button>
              </div>

              {lead.profile_status === "ready" && lead.profile_summary && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-line">
                  {lead.profile_summary}
                </div>
              )}
              {lead.profile_status === "pending" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading their website…
                </div>
              )}
              {lead.profile_status === "failed" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{lead.profile_error || "Couldn't read their site automatically."}</span>
                </div>
              )}
            </section>

            {/* What they asked for */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">What they're asking for</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Services" value={(lead.services ?? []).join(", ") || null} />
                <Field label="Budget" value={lead.budget} />
                <Field label="Timeline" value={lead.timeline} />
                <Field label="Team size" value={lead.team_size} />
                <Field label="Coverage" value={lead.coverage} />
                <Field label="Language" value={lead.language} />
                <Field label="Industry" value={lead.industry} />
              </div>
            </section>

            {/* Contact */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Contact</h3>
              <Field label="Name" value={fullName(lead) || null} />
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Mail className="h-4 w-4" /> {lead.email}
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Phone className="h-4 w-4" /> {lead.phone}
                </a>
              )}
            </section>

            {/* Notes / pitch angle */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Notes &amp; pitch angle</h3>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="Your read on them, the angle for the pitch, next steps…"
                rows={5}
              />
            </section>

            {(lead.utm_source || lead.referrer || lead.landing_page) && (
              <section className="space-y-1 border-t pt-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Source</div>
                <div className="text-xs text-muted-foreground">
                  {[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ") || lead.source}
                </div>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
