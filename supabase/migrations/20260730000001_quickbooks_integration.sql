-- QuickBooks Online integration — phase 1 (books only).
--
-- Adds:
--   1. quickbooks_connections — ONE row per organization holding the OAuth
--      connection (realm id + rotating refresh/access tokens). Tokens are
--      secrets: RLS is ON with NO policies for authenticated users, so PostgREST
--      returns nothing to the browser. Only the edge functions (service role,
--      which bypasses RLS) read/write this table.
--   2. quickbooks_connection_status() — a SECURITY DEFINER function so leadership
--      can see "connected? which realm? since when?" WITHOUT exposing any token.
--   3. quickbooks_customer_id on clients — cached QB Customer id per client.
--   4. quickbooks_* columns on invoices — the QB invoice id + a small sync state
--      so the UI can show synced / error and the last error message.
--
-- Nothing here is destructive: all additive (CREATE TABLE IF NOT EXISTS + ADD
-- COLUMN IF NOT EXISTS). Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. quickbooks_connections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quickbooks_connections (
  organization_id           uuid PRIMARY KEY
                              REFERENCES public.organizations(id) ON DELETE CASCADE,
  realm_id                  text,                 -- QuickBooks company id
  access_token              text,                 -- short-lived (~1h)
  access_token_expires_at   timestamptz,
  refresh_token             text,                 -- long-lived (~100d), ROTATES on refresh
  refresh_token_expires_at  timestamptz,
  pending_state             text,                 -- CSRF state during the connect handshake
  connected_at              timestamptz,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quickbooks_connections ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: authenticated users get zero rows. The edge
-- functions use the service role key, which bypasses RLS entirely.

-- ---------------------------------------------------------------------------
-- 2. Safe status readout for the UI (no tokens leave the DB)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quickbooks_connection_status()
RETURNS TABLE (connected boolean, realm_id text, connected_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (qc.realm_id IS NOT NULL)              AS connected,
    qc.realm_id                            AS realm_id,
    qc.connected_at                        AS connected_at
  FROM public.quickbooks_connections qc
  WHERE qc.organization_id = public.my_org_id()
    AND public.is_leadership()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.quickbooks_connection_status() FROM public;
GRANT EXECUTE ON FUNCTION public.quickbooks_connection_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. clients.quickbooks_customer_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS quickbooks_customer_id text;

-- ---------------------------------------------------------------------------
-- 4. invoices.quickbooks_* sync columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS quickbooks_invoice_id  text,
  ADD COLUMN IF NOT EXISTS quickbooks_sync_status text,        -- null | 'synced' | 'error'
  ADD COLUMN IF NOT EXISTS quickbooks_synced_at   timestamptz,
  ADD COLUMN IF NOT EXISTS quickbooks_sync_error  text;
