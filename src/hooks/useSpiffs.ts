import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ================================================================== */
/*  Interfaces                                                          */
/* ================================================================== */

export interface SpiffRow {
  id: string;
  employee_id: string;
  client_id: string;
  spiff_date: string;          // YYYY-MM-DD
  amount_usd: number;
  reason: string;
  status: "unverified" | "pending" | "billed" | "void";
  source: string;              // 'app' | 'sheet_import' | 'csv_import'
  invoice_line_id: string | null;
  billed_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_by: string | null;
  created_at: string;
  // Enriched:
  employee_name: string;
  client_name: string;
}

export interface SpiffCampaign {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
}

export interface SpiffAgent {
  id: string;
  display_name: string;
  campaign_id: string;
  client_id: string;
  client_name: string;
}

export interface CreateSpiffInput {
  employee_id: string;
  client_id: string;
  spiff_date: string;
  amount_usd: number;
  reason: string;
  created_by: string;
}

/** One parsed + matched CSV row, ready to insert as an unverified spiff. */
export interface BulkSpiffInput {
  employee_id: string;
  client_id: string;
  spiff_date: string;
  amount_usd: number;
  reason: string;
}

/* ================================================================== */
/*  Hook 1 – useTLCampaignsWithClient                                  */
/*  Union of campaigns.team_lead_id + team_lead_campaigns join table,  */
/*  enriched with client_name from clients table.                      */
/* ================================================================== */

export function useTLCampaignsWithClient(tlEmployeeId: string | null) {
  return useQuery({
    queryKey: ["tl-campaigns-with-client", tlEmployeeId],
    queryFn: async (): Promise<SpiffCampaign[]> => {
      if (!tlEmployeeId) return [];

      // Two sources of TL→campaign linkage (union, dedupe by id):
      //   1. campaigns.team_lead_id — primary TL, filter is_active=true
      //   2. team_lead_campaigns join table — include all linked campaigns
      const [primaryRes, joinRes] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, client_id")
          .eq("team_lead_id", tlEmployeeId)
          .eq("is_active", true),
        supabase
          .from("team_lead_campaigns")
          .select("campaign:campaigns(id, name, client_id)")
          .eq("team_lead_id", tlEmployeeId),
      ]);
      if (primaryRes.error) throw primaryRes.error;
      if (joinRes.error) throw joinRes.error;

      type RawCampaign = { id: string; name: string; client_id: string };
      const primary = (primaryRes.data ?? []) as RawCampaign[];
      const fromJoin = ((joinRes.data ?? []) as { campaign: RawCampaign | null }[])
        .map((r) => r.campaign)
        .filter((c): c is RawCampaign => c !== null);

      // Dedupe by id
      const byId = new Map<string, RawCampaign>();
      for (const c of [...primary, ...fromJoin]) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }
      const campaigns = Array.from(byId.values());
      if (campaigns.length === 0) return [];

      // Fetch client names
      const clientIds = [...new Set(campaigns.map((c) => c.client_id).filter(Boolean))];
      const clientMap = new Map<string, string>();
      if (clientIds.length > 0) {
        const { data: clients, error: clientErr } = await supabase
          .from("clients")
          .select("id, name")
          .in("id", clientIds);
        if (clientErr) throw clientErr;
        for (const cl of clients ?? []) {
          clientMap.set(cl.id, cl.name);
        }
      }

      return campaigns
        .map((c) => ({
          id: c.id,
          name: c.name,
          client_id: c.client_id,
          client_name: clientMap.get(c.client_id) ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!tlEmployeeId,
  });
}

/* ================================================================== */
/*  Hook 2 – useTLCampaignAgents                                       */
/*  Active employees on the given campaigns from employees_no_pay view.*/
/* ================================================================== */

export function useTLCampaignAgents(campaigns: SpiffCampaign[]) {
  const campaignIds = [...campaigns.map((c) => c.id)].sort();

  return useQuery({
    queryKey: ["tl-campaign-agents-spiffs", campaignIds],
    queryFn: async (): Promise<SpiffAgent[]> => {
      if (campaignIds.length === 0) return [];

      const { data, error } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name, campaign_id")
        .in("campaign_id", campaignIds)
        .eq("is_active", true);
      if (error) throw error;

      const rows = (data ?? []) as {
        id: string;
        full_name: string;
        work_name: string | null;
        campaign_id: string | null;
      }[];

      // Build campaign lookup from the input array
      const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

      return rows
        .filter((r) => r.campaign_id !== null)
        .map((r) => {
          const camp = campaignMap.get(r.campaign_id!);
          return {
            id: r.id,
            display_name: r.work_name ?? r.full_name,
            campaign_id: r.campaign_id!,
            client_id: camp?.client_id ?? "",
            client_name: camp?.client_name ?? "",
          };
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
    enabled: campaignIds.length > 0,
  });
}

/* ================================================================== */
/*  Hook 2b – useAllSpiffAgents                                        */
/*  Every active agent on a campaign (org-wide), with their campaign's */
/*  client. Used by the CSV upload so a manager can match rows for any */
/*  agent, not just campaigns they personally lead.                    */
/* ================================================================== */

export function useAllSpiffAgents(enabled = true) {
  return useQuery({
    queryKey: ["all-spiff-agents"],
    enabled,
    queryFn: async (): Promise<SpiffAgent[]> => {
      const { data: emps, error: empErr } = await supabase
        .from("employees_no_pay")
        .select("id, full_name, work_name, campaign_id")
        .eq("is_active", true);
      if (empErr) throw empErr;

      const rows = ((emps ?? []) as {
        id: string;
        full_name: string;
        work_name: string | null;
        campaign_id: string | null;
      }[]).filter((r) => r.campaign_id !== null);
      if (rows.length === 0) return [];

      const campaignIds = [...new Set(rows.map((r) => r.campaign_id!))];
      const { data: camps, error: campErr } = await supabase
        .from("campaigns")
        .select("id, client_id")
        .in("id", campaignIds);
      if (campErr) throw campErr;
      const campToClient = new Map(
        ((camps ?? []) as { id: string; client_id: string }[]).map((c) => [c.id, c.client_id])
      );

      const clientIds = [...new Set([...campToClient.values()].filter(Boolean))];
      const clientMap = new Map<string, string>();
      if (clientIds.length > 0) {
        const { data: clients, error: clErr } = await supabase
          .from("clients")
          .select("id, name")
          .in("id", clientIds);
        if (clErr) throw clErr;
        for (const cl of (clients ?? []) as { id: string; name: string }[]) {
          clientMap.set(cl.id, cl.name);
        }
      }

      return rows
        .map((r) => {
          const clientId = campToClient.get(r.campaign_id!) ?? "";
          return {
            id: r.id,
            display_name: r.work_name ?? r.full_name,
            campaign_id: r.campaign_id!,
            client_id: clientId,
            client_name: clientMap.get(clientId) ?? "",
          };
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });
}

/* ================================================================== */
/*  Hook 3 – useSpiffsForWeek                                          */
/*  Spiffs where spiff_date between weekStart and weekEnd, enriched    */
/*  with employee_name and client_name.                                */
/* ================================================================== */

export function useSpiffsForWeek(weekStart: string, weekEnd: string) {
  return useQuery({
    queryKey: ["spiffs-week", weekStart, weekEnd],
    queryFn: async (): Promise<SpiffRow[]> => {
      const { data, error } = await supabase
        .from("spiffs")
        .select(
          "id, employee_id, client_id, spiff_date, amount_usd, reason, status, source, invoice_line_id, billed_at, verified_at, verified_by, created_by, created_at"
        )
        .gte("spiff_date", weekStart)
        .lte("spiff_date", weekEnd)
        .order("spiff_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Omit<SpiffRow, "employee_name" | "client_name">[];
      if (rows.length === 0) return [];

      const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
      const clientIds = [...new Set(rows.map((r) => r.client_id))];

      // Parallel enrichment queries
      const [empRes, clientRes] = await Promise.all([
        supabase
          .from("employees_no_pay")
          .select("id, full_name, work_name")
          .in("id", employeeIds),
        supabase
          .from("clients")
          .select("id, name")
          .in("id", clientIds),
      ]);
      if (empRes.error) throw empRes.error;
      if (clientRes.error) throw clientRes.error;

      const empMap = new Map(
        ((empRes.data ?? []) as { id: string; full_name: string; work_name: string | null }[]).map(
          (e) => [e.id, e.work_name ?? e.full_name]
        )
      );
      const clientMap = new Map(
        ((clientRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
      );

      return rows.map((r) => ({
        ...r,
        amount_usd: Number(r.amount_usd),
        status: r.status as SpiffRow["status"],
        employee_name: empMap.get(r.employee_id) ?? "",
        client_name: clientMap.get(r.client_id) ?? "",
      }));
    },
    enabled: !!weekStart && !!weekEnd,
  });
}

/* ================================================================== */
/*  Hook 4 – useCreateSpiff                                            */
/*  Insert one spiff row with source='app' and status='pending'.       */
/* ================================================================== */

export function useCreateSpiff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSpiffInput) => {
      const { error } = await supabase.from("spiffs").insert({
        employee_id: input.employee_id,
        client_id: input.client_id,
        spiff_date: input.spiff_date,
        amount_usd: input.amount_usd,
        reason: input.reason,
        created_by: input.created_by,
        source: "app",
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}

/* ================================================================== */
/*  Hook 5 – useVoidSpiff                                              */
/*  Set status='void'. Only pending or unverified rows can be voided   */
/*  (a billed row is locked).                                          */
/* ================================================================== */

export function useVoidSpiff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spiffId: string) => {
      const { error } = await supabase
        .from("spiffs")
        .update({ status: "void" })
        .eq("id", spiffId)
        .in("status", ["pending", "unverified"]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}

/* ================================================================== */
/*  Hook 6 – useBulkCreateSpiffs                                       */
/*  Insert many CSV-uploaded rows as source='csv_import' /             */
/*  status='unverified'. They stay invisible to pay + billing until a  */
/*  manager verifies them.                                             */
/* ================================================================== */

export function useBulkCreateSpiffs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rows: BulkSpiffInput[]; created_by: string }) => {
      if (input.rows.length === 0) return;
      const payload = input.rows.map((r) => ({
        employee_id: r.employee_id,
        client_id: r.client_id,
        spiff_date: r.spiff_date,
        amount_usd: r.amount_usd,
        reason: r.reason,
        created_by: input.created_by,
        source: "csv_import",
        status: "unverified",
      }));
      const { error } = await supabase.from("spiffs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}

/* ================================================================== */
/*  Hook 7 – useVerifySpiffs                                           */
/*  Flip one or many unverified rows to live 'pending', stamping the   */
/*  verifier + timestamp. Guarded to status='unverified' so a billed   */
/*  or voided row can never be silently reactivated.                   */
/* ================================================================== */

export function useVerifySpiffs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; verified_by: string }) => {
      if (input.ids.length === 0) return;
      const { error } = await supabase
        .from("spiffs")
        .update({
          status: "pending",
          verified_at: new Date().toISOString(),
          verified_by: input.verified_by,
        })
        .in("id", input.ids)
        .eq("status", "unverified");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}
