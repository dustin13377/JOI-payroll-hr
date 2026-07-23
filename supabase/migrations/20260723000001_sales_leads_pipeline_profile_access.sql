-- Sales leads: CRM pipeline + website "business profile" + access control.
--
-- Builds on the EXISTING public.sales_leads table, which is capture-only today:
-- the `inbound-lead` edge function (service role) inserts website-form leads and
-- nothing reads them yet. RLS is already ENABLED on the table but there are ZERO
-- policies, so currently only the service role can touch it. This migration:
--   1. Adds pipeline + website-profile columns (all additive, nullable/defaulted).
--   2. Adds an explicit access allowlist (sales_access) + can_access_sales().
--   3. Adds RLS policies so only allowlisted users can read/write leads.
--   4. Seeds the allowlist with D (owner) and Joe Renteria.
--
-- Nothing here is destructive. The inbound-lead function keeps working untouched
-- (service role bypasses RLS).

-- =====================================================================
-- 1. Pipeline + website-profile columns
-- =====================================================================
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now(),

  -- Pipeline / CRM
  ADD COLUMN IF NOT EXISTS stage              text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','researched','contacted','meeting','proposal','won','lost')),
  ADD COLUMN IF NOT EXISTS stage_changed_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS assigned_to        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes              text,

  -- Website read ("business profile" — who they are / what they do)
  ADD COLUMN IF NOT EXISTS profile_status     text NOT NULL DEFAULT 'pending'
    CHECK (profile_status IN ('pending','ready','failed','manual')),
  ADD COLUMN IF NOT EXISTS profile_summary    text,
  ADD COLUMN IF NOT EXISTS profile_details    jsonb,
  ADD COLUMN IF NOT EXISTS profile_source_url text,
  ADD COLUMN IF NOT EXISTS profile_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_error      text;

CREATE INDEX IF NOT EXISTS idx_sales_leads_stage
  ON public.sales_leads (stage);
CREATE INDEX IF NOT EXISTS idx_sales_leads_created
  ON public.sales_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_leads_profile_status
  ON public.sales_leads (profile_status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_assigned
  ON public.sales_leads (assigned_to);

-- =====================================================================
-- 2. Triggers: keep updated_at fresh + bump stage_changed_at on stage change
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sales_leads_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_leads_updated_at ON public.sales_leads;
CREATE TRIGGER trg_sales_leads_updated_at
BEFORE UPDATE ON public.sales_leads
FOR EACH ROW EXECUTE FUNCTION public.sales_leads_set_updated_at();

CREATE OR REPLACE FUNCTION public.sales_leads_set_stage_changed_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_leads_stage_changed_at ON public.sales_leads;
CREATE TRIGGER trg_sales_leads_stage_changed_at
BEFORE UPDATE ON public.sales_leads
FOR EACH ROW EXECUTE FUNCTION public.sales_leads_set_stage_changed_at();

-- =====================================================================
-- 3. Access allowlist — who can see sales leads.
--    Deliberately NOT tied to the leadership tier: D wants exactly the named
--    people (him + Joe) until there's a real sales team. Adding a teammate
--    later is a single INSERT here.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.sales_access (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note      text
);

ALTER TABLE public.sales_access ENABLE ROW LEVEL SECURITY;

-- Only owners can view / manage the allowlist itself.
DROP POLICY IF EXISTS sales_access_owner_all ON public.sales_access;
CREATE POLICY sales_access_owner_all
  ON public.sales_access
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

-- Helper: is the current user allowed to see sales leads?
-- SECURITY DEFINER so it can read sales_access regardless of that table's RLS.
CREATE OR REPLACE FUNCTION public.can_access_sales()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sales_access s WHERE s.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_sales() TO authenticated;

-- =====================================================================
-- 4. RLS on sales_leads — allowlisted users get full read/write.
--    (Service-role intake via inbound-lead is unaffected: service role
--    bypasses RLS.)
-- =====================================================================
DROP POLICY IF EXISTS sales_leads_sales_access_all ON public.sales_leads;
CREATE POLICY sales_leads_sales_access_all
  ON public.sales_leads
  FOR ALL TO authenticated
  USING (public.can_access_sales())
  WITH CHECK (public.can_access_sales());

-- =====================================================================
-- 5. Seed the allowlist: D (owner) + Joe Renteria.
--    IDs resolved from auth.users on 2026-07-23.
-- =====================================================================
INSERT INTO public.sales_access (user_id, note) VALUES
  ('e3cecf68-7b5b-4fb2-9a12-6857e5a3d29b', 'Diomedes Sandoval (owner)'),
  ('fcfeac0f-66c2-438d-90f6-240ea868d8e7', 'Jose Guadalupe Renteria Gonzalez (Joe)')
ON CONFLICT (user_id) DO NOTHING;
