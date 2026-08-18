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
  // Exact position the applicant chose on the form. Accepts any role (not just
  // the legacy 5). This is what we show as their applied-for role.
  applied_position: string | null;
  english_level_self: "C1" | "C2" | "below_c1" | "unknown";
  referral_source: string | null;
  applicant_notes: string | null;
  recruiter_notes: string | null;
  position_fits: string[];
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
  final_status: "hired" | "passed" | "withdrew" | "ghosted" | "no_show" | null;
  pass_reason: string | null;
  hired_for_role: string | null;
  hired_at: string | null;
  // Offer / Pending Start: set when a candidate is given an offer with an
  // expected first day. Cleared once they're hired or marked no-show.
  offer_start_date: string | null;
  offer_extended_at: string | null;
  offer_extended_by: string | null;
  // When true, the Upcoming Interviews widget color-codes this candidate's
  // calendar row so D can spot them. Replaces the old position-title map.
  is_highlighted: boolean;
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
 * Creates a candidate by hand, tagged source = "referral".
 *
 * Used when someone books an interview through a shared link but was never
 * entered through the application form, so there's no profile to match. We
 * create a minimal row (just the name) and let the recruiter fill in the rest
 * on the profile later. Returns the new candidate's id so the caller can
 * immediately record the interview outcome against it.
 */
export function useCreateReferralCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fullName,
      stage,
      note,
    }: {
      fullName: string;
      stage: Stage;
      note?: string;
    }): Promise<string> => {
      const trimmedNote = note?.trim();
      const { data, error } = await supabase
        .from("recruiting_candidates")
        .insert({
          full_name: fullName.trim() || null,
          source: "referral",
          stage,
          recruiter_notes: trimmedNote ? trimmedNote : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CANDIDATES_KEY }),
  });
}

// ---------------------------------------------------------------------------
// Position options (editable dropdown — recruiters add new ones as they go)
// ---------------------------------------------------------------------------

export interface RecruitingPosition {
  id: string;
  name: string;
}

const POSITIONS_KEY = ["recruiting", "positions"] as const;

export function usePositions() {
  return useQuery({
    queryKey: POSITIONS_KEY,
    queryFn: async (): Promise<RecruitingPosition[]> => {
      const { data, error } = await supabase
        .from("recruiting_positions")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as RecruitingPosition[];
    },
  });
}

export function useAddPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Position name is empty");
      const { data, error } = await supabase
        .from("recruiting_positions")
        .insert({ name: trimmed })
        .select("id, name")
        .single();
      if (error) {
        // Unique violation = someone already added it; treat as success.
        if (error.code === "23505") return { id: "", name: trimmed };
        throw error;
      }
      return data as RecruitingPosition;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: POSITIONS_KEY }),
  });
}

// ---------------------------------------------------------------------------
// Interview outcomes (Completed / No show from the Upcoming Interviews widget)
// ---------------------------------------------------------------------------

export type InterviewOutcome =
  | "completed" // legacy rows only; the UI no longer produces this
  | "no_show"
  | "couldnt_attend"
  | "passed"
  | "offer_extended";

/** Short label for each outcome, used on the badge in the interviews widget. */
export const OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  completed: "Completed",
  no_show: "No show",
  couldnt_attend: "Couldn't attend",
  passed: "Not a fit",
  offer_extended: "Offer extended",
};

export interface InterviewRecord {
  id: string;
  candidate_id: string;
  conducted_at: string;
  scheduled_at: string | null;
  event_key: string | null;
  outcome: InterviewOutcome | null;
  interview_type: string;
  recommendation: string | null;
  notes: string | null;
}

const OUTCOMES_KEY = ["recruiting", "interview-outcomes"] as const;

/** All rows that came from the calendar widget (event_key set), for showing
 *  each event's current Completed/No-show state. */
export function useInterviewOutcomes() {
  return useQuery({
    queryKey: OUTCOMES_KEY,
    queryFn: async (): Promise<InterviewRecord[]> => {
      const { data, error } = await supabase
        .from("recruiting_interviews")
        .select("id, candidate_id, conducted_at, scheduled_at, event_key, outcome, interview_type, recommendation, notes")
        .not("event_key", "is", null);
      if (error) throw error;
      return (data ?? []) as InterviewRecord[];
    },
  });
}

/** Interview history for one candidate (drawer). */
export function useCandidateInterviews(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["recruiting", "interviews", candidateId],
    enabled: !!candidateId,
    queryFn: async (): Promise<InterviewRecord[]> => {
      if (!candidateId) return [];
      const { data, error } = await supabase
        .from("recruiting_interviews")
        .select("id, candidate_id, conducted_at, scheduled_at, event_key, outcome, interview_type, recommendation, notes")
        .eq("candidate_id", candidateId)
        .order("conducted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InterviewRecord[];
    },
  });
}

/**
 * Marks a calendar event as completed / no-show for a candidate.
 * Upserts on event_key so correcting a mis-click updates the same row.
 */
export function useMarkInterviewOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidateId,
      eventKey,
      scheduledAt,
      outcome,
    }: {
      candidateId: string;
      eventKey: string;
      scheduledAt: string;
      outcome: InterviewOutcome;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("recruiting_interviews").upsert(
        {
          candidate_id: candidateId,
          event_key: eventKey,
          scheduled_at: scheduledAt,
          outcome,
          conducted_by: auth?.user?.id ?? null,
          interview_type: "screen",
        },
        { onConflict: "event_key" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: OUTCOMES_KEY });
      qc.invalidateQueries({ queryKey: ["recruiting", "interviews", vars.candidateId] });
    },
  });
}

/**
 * Records that a WhatsApp message was sent (Path A wa.me link) — either the
 * first interview invite or a follow-up nudge.
 *
 * This does the DB side only — logging the message and updating the candidate.
 * The caller opens the wa.me link itself, synchronously on click, so the
 * browser doesn't block the popup.
 *
 * Effects:
 *   1. Inserts a recruiting_messages row (channel whatsapp, outbound,
 *      status 'link_generated' — we generated a link, we can't confirm a send).
 *   2. Stamps last_contacted_at = now() (so a follow-up resets the clock and
 *      the candidate drops off the "needs follow-up" list).
 *   3. For the first invite only, advances stage to 'contacted' when the
 *      candidate isn't already further along (see ADVANCE_TO_CONTACTED_FROM).
 *      A follow-up never changes the stage.
 *
 * `templateKey` records which message went out; `advanceStage` (default true)
 * is set false by follow-ups so a second touch can't drag stage around.
 */
export function useSendWhatsAppInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidate,
      messageBody,
      templateKey = INTERVIEW_INVITE_TEMPLATE_KEY,
      advanceStage = true,
    }: {
      candidate: Pick<Candidate, "id" | "stage">;
      messageBody: string;
      templateKey?: string;
      advanceStage?: boolean;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const sentBy = auth?.user?.id ?? null;

      const { error: msgErr } = await supabase.from("recruiting_messages").insert({
        candidate_id: candidate.id,
        direction: "outbound",
        channel: "whatsapp",
        template_key: templateKey,
        body: messageBody,
        sent_by: sentBy,
        status: "link_generated",
      });
      if (msgErr) throw msgErr;

      const patch: Partial<Candidate> = {
        last_contacted_at: new Date().toISOString(),
      };
      if (advanceStage && ADVANCE_TO_CONTACTED_FROM.has(candidate.stage)) {
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

/**
 * Sends a recruiting follow-up EMAIL via the send-recruiting-email edge
 * function (Resend). Unlike WhatsApp — which is a wa.me link the recruiter
 * taps — the email actually goes out server-side, so the edge function owns
 * the DB writes (logs the message, re-stamps last_contacted_at). Here we just
 * fire the request and refresh the candidate on success.
 *
 * Second-channel nudge only: it never changes the candidate's stage.
 */
export function useSendRecruitingEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidateId,
      subject,
      body,
      templateKey,
    }: {
      candidateId: string;
      subject: string;
      body: string;
      templateKey?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-recruiting-email", {
        body: {
          candidate_id: candidateId,
          subject,
          body_text: body,
          template_key: templateKey,
        },
      });
      // supabase.functions.invoke surfaces non-2xx as `error`; the function's
      // JSON error message is the most useful thing to show the recruiter.
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
          const parsed = ctx?.json ? await ctx.json() : null;
          if (parsed?.error) detail = parsed.error;
        } catch {
          // fall back to error.message
        }
        throw new Error(detail);
      }
      return data as { status: string; to: string };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: CANDIDATES_KEY });
      qc.invalidateQueries({ queryKey: ["recruiting", "candidate", vars.candidateId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Computer skills assessment — self-serve test link per candidate.
// The public /skills-test/:token page + skills-assessment edge function write
// the results back; here we only generate links and read results (leadership
// RLS applies). `(supabase as any)` because recruiting_skill_assessments is not
// yet in the generated Database types — regenerate types to make it typed.
// ---------------------------------------------------------------------------
export interface SkillAssessment {
  id: string;
  candidate_id: string;
  token: string;
  status: "pending" | "in_progress" | "completed" | "expired";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  total_seconds: number | null;
  results: any | null;
}

function makeAssessmentToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function useCandidateAssessments(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["recruiting", "assessments", candidateId],
    enabled: !!candidateId,
    queryFn: async (): Promise<SkillAssessment[]> => {
      if (!candidateId) return [];
      const { data, error } = await (supabase as any)
        .from("recruiting_skill_assessments")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SkillAssessment[];
    },
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidateId: string): Promise<SkillAssessment> => {
      const { data, error } = await (supabase as any)
        .from("recruiting_skill_assessments")
        .insert({ candidate_id: candidateId, token: makeAssessmentToken() })
        .select()
        .single();
      if (error) throw error;
      return data as SkillAssessment;
    },
    onSuccess: (_data, candidateId) => {
      qc.invalidateQueries({ queryKey: ["recruiting", "assessments", candidateId] });
    },
  });
}
