import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Stage } from "@/lib/recruiting/stages";
import { INTERVIEW_INVITE_TEMPLATE_KEY } from "@/lib/recruiting/whatsapp";

// Stages from which sending an invite should advance the candidate to
// "contacted". Anyone already further along the funnel (interview_scheduled,
// interviewed, …) or in a terminal stage keeps their stage — a re-send must
// never drag a candidate backwards.
const ADVANCE_TO_CONTACTED_FROM: ReadonlySet<Stage> = new Set<Stage>([
  "new",
  "triaged",
  "contacted",
]);

export interface Candidate {
  id: string;
  created_at: string;
  updated_at: string;
  source: "form" | "referral" | "other";
  full_name: string | null;
  curp: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  role_interest: "b2b_setter" | "funding_activation" | "customer_reactivation" | "ai_automation" | "ai_operations" | null;
  english_level_self: "C1" | "C2" | "below_c1" | "unknown";
  referral_source: string | null;
  applicant_notes: string | null;
  cv_url: string | null;
  presentation_url: string | null;
  raw_email_body: string | null;
  raw_email_received_at: string | null;
  needs_manual_review: boolean;
  geo_qualified: boolean | null;
  english_level_assessed: "C1" | "C2" | "below_c1" | null;
  qualified_for_roles: string[];
  stage: Stage;
  stage_changed_at: string;
  assigned_to: string | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  final_status: "hired" | "passed" | "withdrew" | "ghosted" | null;
  pass_reason: string | null;
  hired_for_role: string | null;
  hired_at: string | null;
}

const CANDIDATES_KEY = ["recruiting", "candidates"] as const;

export function useCandidates() {
  return useQuery({
    queryKey: CANDIDATES_KEY,
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase
        .from("recruiting_candidates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });
}

export function useCandidate(id: string | undefined) {
  return useQuery({
    queryKey: ["recruiting", "candidate", id],
    enabled: !!id,
    queryFn: async (): Promise<Candidate | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("recruiting_candidates")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Candidate | null;
    },
  });
}

export function useUpdateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<Candidate, "id" | "created_at" | "updated_at">>;
    }) => {
      const { data, error } = await supabase
        .from("recruiting_candidates")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Candidate;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: CANDIDATES_KEY });
      qc.invalidateQueries({ queryKey: ["recruiting", "candidate", vars.id] });
    },
  });
}

/**
 * Records that a WhatsApp interview invite was sent (Path A wa.me link).
 *
 * This does the DB side only — logging the message and updating the candidate.
 * The caller opens the wa.me link itself, synchronously on click, so the
 * browser doesn't block the popup.
 *
 * Effects:
 *   1. Inserts a recruiting_messages row (channel whatsapp, outbound,
 *      status 'link_generated' — we generated a link, we can't confirm a send).
 *   2. Stamps last_contacted_at = now().
 *   3. Advances stage to 'contacted' only when the candidate isn't already
 *      further along the funnel (see ADVANCE_TO_CONTACTED_FROM).
 */
export function useSendWhatsAppInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidate,
      messageBody,
    }: {
      candidate: Pick<Candidate, "id" | "stage">;
      messageBody: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const sentBy = auth?.user?.id ?? null;

      const { error: msgErr } = await supabase.from("recruiting_messages").insert({
        candidate_id: candidate.id,
        direction: "outbound",
        channel: "whatsapp",
        template_key: INTERVIEW_INVITE_TEMPLATE_KEY,
        body: messageBody,
        sent_by: sentBy,
        status: "link_generated",
      });
      if (msgErr) throw msgErr;

      const patch: Partial<Candidate> = {
        last_contacted_at: new Date().toISOString(),
      };
      if (ADVANCE_TO_CONTACTED_FROM.has(candidate.stage)) {
        patch.stage = "contacted";
      }

      const { error: updErr } = await supabase
        .from("recruiting_candidates")
        .update(patch)
        .eq("id", candidate.id);
      if (updErr) throw updErr;

      return { advanced: patch.stage === "contacted" };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: CANDIDATES_KEY });
      qc.invalidateQueries({ queryKey: ["recruiting", "candidate", vars.candidate.id] });
    },
  });
}
