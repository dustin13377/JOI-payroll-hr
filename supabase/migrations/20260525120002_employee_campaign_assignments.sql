-- Phase: campaign assignment history (Phase 1 of campaign-history work)
-- Tracks where each employee was assigned over time so past invoices and
-- payroll can look up the correct campaign for a given date, not just
-- the current employees.campaign_id pointer.
--
-- Also adds campaigns.is_active so closed clients can hide from picker
-- dropdowns while keeping their history rows valid.
--
-- Applied 2026-05-25 via Supabase MCP apply_migration. Backfilled 70 rows
-- (one per employee with a campaign_id) using hire_date as start_date.

ALTER TABLE public.campaigns
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE TABLE public.employee_campaign_assignments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  campaign_id     uuid        NOT NULL REFERENCES public.campaigns(id),
  start_date      date        NOT NULL,
  end_date        date,                            -- NULL = current assignment
  reason          text,
  changed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Only one "current" row per employee
CREATE UNIQUE INDEX uniq_employee_current_assignment
  ON public.employee_campaign_assignments (employee_id)
  WHERE end_date IS NULL;

CREATE INDEX idx_eca_employee ON public.employee_campaign_assignments (employee_id);
CREATE INDEX idx_eca_campaign ON public.employee_campaign_assignments (campaign_id);
CREATE INDEX idx_eca_dates    ON public.employee_campaign_assignments (start_date, end_date);

ALTER TABLE public.employee_campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eca_read" ON public.employee_campaign_assignments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "eca_leadership_write" ON public.employee_campaign_assignments
  FOR ALL USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

-- Backfill: one row per current employee on their current campaign.
INSERT INTO public.employee_campaign_assignments
  (employee_id, campaign_id, start_date, end_date, reason, organization_id)
SELECT
  e.id,
  e.campaign_id,
  COALESCE(e.hire_date, e.created_at::date, CURRENT_DATE) AS start_date,
  NULL                                                    AS end_date,
  'backfill from current campaign'                        AS reason,
  c.organization_id
FROM public.employees e
JOIN public.campaigns c ON c.id = e.campaign_id
WHERE e.campaign_id IS NOT NULL
ON CONFLICT DO NOTHING;
