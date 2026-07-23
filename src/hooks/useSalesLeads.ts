import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SalesStage } from "@/lib/sales/stages";

// sales_leads isn't in the generated Database types yet, so we read/write
// through `(supabase as any)` like the recruiting module does for its newer
// tables. Regenerate types later to make these fully typed.

export interface SalesLead {
  id: string;
  created_at: string;
  updated_at: string | null;
  source: string;

  // Contact
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;

  // Company
  company: string | null;
  website: string | null;
  industry: string | null;

  // What they asked the form for
  services: string[] | null;
  team_size: string | null;
  language: string | null;
  coverage: string | null;
  timeline: string | null;
  budget: string | null;

  // Pipeline
  stage: SalesStage;
  stage_changed_at: string | null;
  assigned_to: string | null;
  notes: string | null;

  // Website read ("business profile")
  profile_status: "pending" | "ready" | "failed" | "manual";
  profile_summary: string | null;
  profile_details: {
    title?: string | null;
    og_title?: string | null;
    site_name?: string | null;
    description?: string | null;
    h1?: string[];
    h2?: string[];
    resolved_url?: string | null;
  } | null;
  profile_source_url: string | null;
  profile_fetched_at: string | null;
  profile_error: string | null;

  // Attribution (present but not surfaced heavily)
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page: string | null;
  referrer: string | null;
}

const LEADS_KEY = ["sales", "leads"] as const;

/** True when the signed-in user is on the sales access allowlist. */
export function useSalesAccess() {
  return useQuery({
    queryKey: ["sales", "access"],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any).rpc("can_access_sales");
      if (error) return false;
      return data === true;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesLeads() {
  return useQuery({
    queryKey: LEADS_KEY,
    queryFn: async (): Promise<SalesLead[]> => {
      const { data, error } = await (supabase as any)
        .from("sales_leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SalesLead[];
    },
  });
}

export function useSalesLead(id: string | null | undefined) {
  return useQuery({
    queryKey: ["sales", "lead", id],
    enabled: !!id,
    queryFn: async (): Promise<SalesLead | null> => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("sales_leads")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SalesLead | null;
    },
  });
}

export function useUpdateSalesLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<SalesLead, "stage" | "notes" | "assigned_to" | "profile_status" | "profile_summary">
      >;
    }) => {
      const { data, error } = await (supabase as any)
        .from("sales_leads")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as SalesLead;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: LEADS_KEY });
      qc.invalidateQueries({ queryKey: ["sales", "lead", vars.id] });
    },
  });
}

/**
 * Runs the website reader (enrich-lead edge function) for one lead. The function
 * fetches their site, writes the profile back, and we refresh the row.
 */
export function useEnrichLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke("enrich-lead", {
        body: { lead_id: leadId },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
          const parsed = ctx?.json ? await ctx.json() : null;
          if (parsed?.error) detail = parsed.error;
        } catch {
          // keep error.message
        }
        throw new Error(detail);
      }
      return data as { ok: boolean; status: string; summary?: string };
    },
    onSuccess: (_data, leadId) => {
      qc.invalidateQueries({ queryKey: LEADS_KEY });
      qc.invalidateQueries({ queryKey: ["sales", "lead", leadId] });
    },
  });
}

export function fullName(lead: Pick<SalesLead, "first_name" | "last_name">): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
}
