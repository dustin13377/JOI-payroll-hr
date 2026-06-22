-- =============================================================================
-- Auto-create the opening employee_campaign_assignments row for every new hire.
--
-- Problem: creating an employee sets employees.campaign_id (the "current" pointer)
-- but did NOT write an assignment-history row. The invoice generator and payroll
-- bill off employee_campaign_assignments, so a new hire was invisible to billing
-- (their punches "silently dropped") until someone manually created an assignment.
--
-- A trigger fixes ALL creation paths at once (create-employee edge function, the
-- no-email direct insert, future paths). Fires only when campaign_id is set; uses
-- hire_date (or today) as start; org comes from the employee row.
--
-- Note: ChangeCampaignDialog continues to handle MOVES (it UPDATEs campaign_id and
-- writes its own assignment row) — this trigger is INSERT-only, so the two never
-- collide. One-time data migrations that insert employees AND assignments together
-- would now double-insert; that's historical and not a concern for app usage.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_initial_campaign_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    INSERT INTO public.employee_campaign_assignments
      (employee_id, campaign_id, start_date, end_date, reason, organization_id)
    VALUES
      (NEW.id, NEW.campaign_id, COALESCE(NEW.hire_date, CURRENT_DATE), NULL,
       'Initial assignment at hire', NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_initial_assignment ON public.employees;
CREATE TRIGGER trg_employee_initial_assignment
AFTER INSERT ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.create_initial_campaign_assignment();
