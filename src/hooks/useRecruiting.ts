import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Stage } from "@/lib/recruiting/stages";

export interface Candidate {
  id: string;
  created_at: string;
  updated_at: string;
  source: "form" | "referral" | "other";
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  role_interest: "b2b_setter" | "funding_activation" | "customer_reactivation" | null;
  english_level_self: "C1" | "C2" | "below_c1" | "unknown";
  referral_source: string | null;
  applicant_notes: string | null;
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
