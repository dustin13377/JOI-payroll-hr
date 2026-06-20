-- =============================================================================
-- Spiffs table for the pre-payroll rebuild.
--
-- The live Spiffs page (app /spiffs: Agent, Date, Amount USD, Reason, Client,
-- status) was added directly to production and is NOT in this repo's schema, so
-- it doesn't exist locally. This creates a spiffs table matching that page so
-- the new payroll can PULL each agent's spiffs for a period and convert USD→MXN.
--
-- ⚠️ D: production already has a spiffs table from that feature. When merging,
-- reconcile column names / migrate existing rows (or point payroll at the prod
-- table). This definition mirrors the Spiffs page fields. See docs.
--
-- Additive, owner/admin RLS, org-scoped.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.spiffs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  spiff_date      date NOT NULL,
  amount_usd      numeric(12,2) NOT NULL DEFAULT 0,
  reason          text,
  client          text,
  status          text NOT NULL DEFAULT 'pending',
  organization_id uuid NOT NULL DEFAULT public.my_org_id(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spiffs_status_check CHECK (status IN ('pending', 'paid', 'void'))
);

ALTER TABLE public.spiffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spiffs_admin_all" ON public.spiffs
  TO authenticated
  USING (public.is_owner_or_admin() AND organization_id = public.my_org_id())
  WITH CHECK (public.is_owner_or_admin() AND organization_id = public.my_org_id());

CREATE INDEX IF NOT EXISTS idx_spiffs_emp_date ON public.spiffs (employee_id, spiff_date);
