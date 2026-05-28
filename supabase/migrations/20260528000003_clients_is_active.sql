-- Adds is_active to clients so the campaigns page can soft-delete a client
-- the same way campaigns are soft-deleted. Preserves all FK references
-- (campaigns, employees, invoices) — the client just stops appearing in
-- the active client list.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clients.is_active IS
  'Soft-delete flag. false = hidden from default client list but all dependent rows (campaigns, employees, invoices) remain intact.';
