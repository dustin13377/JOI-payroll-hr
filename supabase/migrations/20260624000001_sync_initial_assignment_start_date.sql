-- When an employee's hire_date is set or corrected after their initial campaign
-- assignment was created, keep that assignment's start_date in sync.
--
-- Why: manual-add new hires are inserted with hire_date NULL (HR fills it in later
-- from the profile). The AFTER-INSERT trigger create_initial_campaign_assignment
-- therefore falls back to CURRENT_DATE for start_date. When HR later enters the real
-- hire_date, the assignment kept the wrong (today) start, leaving early punches
-- uncovered and silently dropped from invoices.
CREATE OR REPLACE FUNCTION public.sync_initial_assignment_start_date()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.hire_date IS NOT NULL
     AND NEW.hire_date IS DISTINCT FROM OLD.hire_date THEN
    UPDATE public.employee_campaign_assignments
    SET start_date = NEW.hire_date
    WHERE employee_id = NEW.id
      AND reason = 'Initial assignment at hire'
      AND start_date IS DISTINCT FROM NEW.hire_date;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_initial_assignment_start ON public.employees;
CREATE TRIGGER trg_sync_initial_assignment_start
AFTER UPDATE OF hire_date ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.sync_initial_assignment_start_date();
