/**
 * I3: System users (non-employee logins)
 *
 * Why: D's business partner (and future auditors / accountants / contractors)
 * need login access but are NOT employees on payroll. Today every login = an
 * employee row, which means non-employees pollute the Empleados list, payroll
 * runs, attendance views, EOD digests, etc.
 *
 * What: Add a boolean `is_system_user` to employees. Default FALSE so all
 * existing rows are unchanged. When TRUE:
 *   - The row is hidden from every employee/payroll/attendance/EOD list
 *     (filtering is done client-side by adding .eq('is_system_user', false))
 *   - The row only appears on a new Owner-only /admin/system-users page
 *   - Title is constrained to ('owner', 'admin') — system users are by
 *     definition high-privilege; team_lead/agent require team/campaign
 *     assignments that don't make sense for non-employees.
 *
 * No data migration needed — current employees stay is_system_user=false.
 * The Owner adds the partner / future system users via the new page.
 */

ALTER TABLE public.employees
  ADD COLUMN is_system_user boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.is_system_user IS
  'TRUE = non-payroll login (partners, auditors, accountants). Hidden from employee/payroll/attendance views. Managed only on the Owner-only system-users page.';

-- Title constraint — system users must be owner or admin. Skipping team_lead /
-- agent because those need actual team/campaign assignment which doesn't fit.
ALTER TABLE public.employees
  ADD CONSTRAINT employees_system_user_title_check
  CHECK (
    is_system_user = false
    OR title IN ('owner', 'admin')
  );

-- Index for the Owner-only page query
CREATE INDEX idx_employees_system_user
  ON public.employees (is_system_user)
  WHERE is_system_user = true;
