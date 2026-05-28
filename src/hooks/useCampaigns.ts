import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";

export interface Campaign {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
}

export interface ClientWithCampaigns {
  id: string;
  name: string;
  prefix: string;
  bill_to_name: string | null;
  campaigns: Campaign[];
}

export function useCampaigns(clientId?: string, options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;
  return useQuery({
    queryKey: ["campaigns", clientId, includeInactive],
    queryFn: async () => {
      let query = supabase.from("campaigns").select("*").order("name");
      if (clientId) query = query.eq("client_id", clientId);
      if (!includeInactive) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Campaign[];
    },
  });
}

export function useCampaignsByClient() {
  return useQuery({
    queryKey: ["campaigns-by-client"],
    queryFn: async () => {
      const [{ data: clients, error: cErr }, { data: campaigns, error: campErr }] =
        await Promise.all([
          supabase.from("clients").select("*").order("name"),
          supabase.from("campaigns").select("*").eq("is_active", true).order("name"),
        ]);
      if (cErr) throw cErr;
      if (campErr) throw campErr;
      return (clients || []).map((cl: any) => ({
        ...cl,
        campaigns: (campaigns || []).filter((c: any) => c.client_id === cl.id),
      })) as ClientWithCampaigns[];
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  // organization_id is NOT NULL on campaigns with no DB default; the RLS
  // WITH CHECK requires (organization_id = my_org_id()). See audit finding H-2.
  const { organizationId } = useUserProfile();
  return useMutation({
    mutationFn: async ({ clientId, name }: { clientId: string; name: string }) => {
      if (!organizationId) throw new Error('Cannot create campaign: your profile has no organization. Refresh and try again.');
      const { data, error } = await supabase
        .from("campaigns")
        .insert({ client_id: clientId, name: name.trim(), organization_id: organizationId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns-by-client"] });
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ name: name.trim() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns-by-client"] });
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
      qc.invalidateQueries({ queryKey: ["campaign"] });
    },
  });
}

/**
 * Soft-delete a campaign. We never hard-delete because eod_logs, payroll_records,
 * agent_reviews and other audit tables FK-reference campaigns.id. Setting
 * is_active=false hides the campaign from every query that filters on
 * is_active (which is almost all of them) without nuking history.
 */
export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns-by-client"] });
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
  });
}
