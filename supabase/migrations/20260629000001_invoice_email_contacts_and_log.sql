-- Invoice email feature: client contact list + send log.
--
-- 1. client_contacts — default recipient list per client. Feeds the
--    "Send to Client" dialog (auto-filled, but editable per-send). Seeded
--    by SQL for now; no CRUD UI in v1.
-- 2. invoice_email_log — one row per send attempt. Records who/what/when +
--    the Postmark message id so a bounce can be traced and D has a paper
--    trail of every invoice that left the building.
--
-- Both tables are org-scoped and leadership-gated, matching clients/invoices.

-- ---------------------------------------------------------------------------
-- 1. client_contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.my_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name            text,
  email           text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, email)
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client
  ON public.client_contacts (client_id) WHERE active;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leadership_select_client_contacts" ON public.client_contacts;
DROP POLICY IF EXISTS "leadership_write_client_contacts"  ON public.client_contacts;
DROP POLICY IF EXISTS "leadership_update_client_contacts" ON public.client_contacts;
DROP POLICY IF EXISTS "leadership_delete_client_contacts" ON public.client_contacts;

CREATE POLICY "leadership_select_client_contacts" ON public.client_contacts
  FOR SELECT TO authenticated
  USING (organization_id = public.my_org_id() AND public.is_leadership());

CREATE POLICY "leadership_write_client_contacts" ON public.client_contacts
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.my_org_id() AND public.is_leadership());

CREATE POLICY "leadership_update_client_contacts" ON public.client_contacts
  FOR UPDATE TO authenticated
  USING (organization_id = public.my_org_id() AND public.is_leadership());

CREATE POLICY "leadership_delete_client_contacts" ON public.client_contacts
  FOR DELETE TO authenticated
  USING (organization_id = public.my_org_id() AND public.is_leadership());

-- ---------------------------------------------------------------------------
-- 2. invoice_email_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_email_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL DEFAULT public.my_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id           uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  recipients           text[] NOT NULL,
  cc                   text[],
  bcc                  text[],
  subject              text,
  status               text NOT NULL DEFAULT 'sent',  -- 'sent' | 'error'
  postmark_message_id  text,
  error                text,
  sent_by              uuid,                           -- auth.users id of the sender
  sent_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_email_log_invoice
  ON public.invoice_email_log (invoice_id, sent_at DESC);

ALTER TABLE public.invoice_email_log ENABLE ROW LEVEL SECURITY;

-- Read-only for leadership in the browser; the edge function writes with the
-- service role (which bypasses RLS), so no INSERT policy is needed.
DROP POLICY IF EXISTS "leadership_select_invoice_email_log" ON public.invoice_email_log;

CREATE POLICY "leadership_select_invoice_email_log" ON public.invoice_email_log
  FOR SELECT TO authenticated
  USING (organization_id = public.my_org_id() AND public.is_leadership());
