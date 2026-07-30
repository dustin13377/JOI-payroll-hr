import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edge";

/* ------------------------------------------------------------------ */
/*  QuickBooks Online integration — phase 1 (books only)               */
/*                                                                     */
/*  Connection status comes from the quickbooks_connection_status()    */
/*  RPC (SECURITY DEFINER, leadership-gated) so no tokens ever reach    */
/*  the browser. Connecting and pushing go through edge functions.     */
/* ------------------------------------------------------------------ */

export interface QuickbooksStatus {
  connected: boolean;
  realm_id: string | null;
  connected_at: string | null;
}

/** Is QuickBooks connected for this org? (leadership only; others get null). */
export function useQuickbooksConnection() {
  return useQuery({
    queryKey: ["quickbooks-connection"],
    queryFn: async (): Promise<QuickbooksStatus> => {
      const { data, error } = await supabase.rpc("quickbooks_connection_status");
      if (error) throw error;
      const row = (data as QuickbooksStatus[] | null)?.[0];
      return row ?? { connected: false, realm_id: null, connected_at: null };
    },
  });
}

/**
 * Start the one-time OAuth connect. Returns the Intuit authorize URL; the
 * caller is responsible for navigating a tab to it (so the popup opens inside
 * the user's click gesture and isn't blocked).
 */
export function useConnectQuickbooks() {
  return useMutation({
    mutationFn: async (): Promise<{ url: string }> => {
      const { data, error } = await supabase.functions.invoke("quickbooks-oauth-callback", {
        body: { action: "authorize_url" },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      return data as { url: string };
    },
  });
}

export interface PushInvoiceArgs {
  invoice_id: string;
  pdf_base64: string;
  pdf_filename: string;
}

export interface PushInvoiceResult {
  status: string;
  action: "created" | "updated";
  quickbooks_invoice_id: string;
  total: number;
  pdf_attached: boolean;
  qbo_url: string;
}

/** Push one invoice into QuickBooks as a single summary line + attached PDF. */
export function usePushInvoiceToQuickbooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: PushInvoiceArgs): Promise<PushInvoiceResult> => {
      const { data, error } = await supabase.functions.invoke("push-invoice-to-quickbooks", {
        body: args,
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      return data as PushInvoiceResult;
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["invoice", args.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
