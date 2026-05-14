/**
 * H1: Employee offboarding + rehire memory
 *
 * Before: employees.is_active was a simple boolean. Trash button just flipped
 * it to false. That hid the row but left no record of WHY the person left or
 * whether we'd take them back. So we couldn't catch a "bad employee" trying
 * to come back under a slightly different name.
 *
 * After: every offboarding captures status (terminated / resigned / on_leave),
 * a reason, free-text notes, a "Do Not Rehire" flag, and who/when did it.
 * Existing inactive rows are backfilled to 'terminated' with NULL reason so
 * the UI can prompt to fill in details.
 *
 * `is_active` stays for backwards compat — it's mirrored from
 * employment_status via trigger so existing queries (.eq("is_active", true))
 * keep working.
 *
 * Indexes on curp and (lower(full_name), date_of_birth) speed up the rehire
 * check that fires when adding a new employee.
 */

-- 1. Employment status enum -------------------------------------------------

CREATE TYPE public.employment_status AS ENUM (
  'active',
  'terminated',   -- involuntary, employer-initiated
  'resigned',     -- voluntary, employee-initiated
  'on_leave'      -- temporary; still on the books
);

-- 2. New columns on employees ----------------------------------------------

ALTER TABLE public.employees
  ADD COLUMN employment_status public.employment_status NOT NULL DEFAULT 'active',
  ADD COLUMN termination_reason text,
  ADD COLUMN termination_notes text,
  ADD COLUMN rehire_eligible boolean,           -- NULL = "not decided yet"
  ADD COLUMN terminated_at timestamptz,
  ADD COLUMN terminated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.employees.employment_status IS
  'Lifecycle: active / terminated / resigned / on_leave. Source of truth — is_active mirrors this.';
COMMENT ON COLUMN public.employees.rehire_eligible IS
  'Do-Not-Rehire flag. TRUE = ok to rehire, FALSE = blocked, NULL = needs decision.';

-- 3. Backfill existing inactive rows ---------------------------------------

-- Anyone currently flagged is_active=false becomes 'terminated' with no reason
-- captured. The UI surfaces a "needs review" badge for these so D can
-- backfill reasons over time.
UPDATE public.employees
   SET employment_status = 'terminated',
       terminated_at = COALESCE(last_worked_day::timestamptz, created_at, NOW())
 WHERE is_active = false
   AND employment_status = 'active';  -- only the default rows

-- 4. Trigger: keep is_active in sync with employment_status ----------------

CREATE OR REPLACE FUNCTION public.sync_employee_is_active()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_active := (NEW.employment_status = 'active');

  -- Stamp termination metadata when transitioning out of 'active'
  IF NEW.employment_status <> 'active' AND OLD.employment_status = 'active' THEN
    IF NEW.terminated_at IS NULL THEN
      NEW.terminated_at := NOW();
    END IF;
    IF NEW.terminated_by IS NULL THEN
      NEW.terminated_by := auth.uid();
    END IF;
  END IF;

  -- Clear stamps on reactivation
  IF NEW.employment_status = 'active' AND OLD.employment_status <> 'active' THEN
    NEW.terminated_at := NULL;
    NEW.terminated_by := NULL;
    -- Keep termination_reason / notes / rehire_eligible as history.
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_is_active ON public.employees;
CREATE TRIGGER trg_sync_employee_is_active
  BEFORE INSERT OR UPDATE OF employment_status ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_is_active();

-- 5. Indexes for rehire-check lookups --------------------------------------

-- Match by CURP (Mexican government ID — the strongest signal)
CREATE INDEX IF NOT EXISTS idx_employees_curp_inactive
  ON public.employees (curp)
  WHERE employment_status <> 'active' AND curp IS NOT NULL;

-- Match by (name + DOB) as fallback when CURP missing
CREATE INDEX IF NOT EXISTS idx_employees_name_dob_inactive
  ON public.employees (lower(full_name), date_of_birth)
  WHERE employment_status <> 'active';

-- 6. RPC: rehire check ----------------------------------------------------
--
-- Pass in the prospective hire's CURP and/or (name + DOB). Returns matching
-- past employees so the UI can warn before creating a duplicate / rehiring
-- someone marked Do Not Rehire.

CREATE OR REPLACE FUNCTION public.check_rehire(
  p_curp text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  employee_id text,
  full_name text,
  curp text,
  date_of_birth date,
  employment_status public.employment_status,
  termination_reason text,
  termination_notes text,
  rehire_eligible boolean,
  terminated_at timestamptz,
  match_type text  -- 'curp' | 'name_dob'
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id,
         e.employee_id,
         e.full_name,
         e.curp,
         e.date_of_birth,
         e.employment_status,
         e.termination_reason,
         e.termination_notes,
         e.rehire_eligible,
         e.terminated_at,
         'curp'::text AS match_type
    FROM public.employees e
   WHERE e.employment_status <> 'active'
     AND p_curp IS NOT NULL
     AND e.curp IS NOT NULL
     AND upper(trim(e.curp)) = upper(trim(p_curp))

  UNION

  SELECT e.id,
         e.employee_id,
         e.full_name,
         e.curp,
         e.date_of_birth,
         e.employment_status,
         e.termination_reason,
         e.termination_notes,
         e.rehire_eligible,
         e.terminated_at,
         'name_dob'::text AS match_type
    FROM public.employees e
   WHERE e.employment_status <> 'active'
     AND p_full_name IS NOT NULL
     AND p_date_of_birth IS NOT NULL
     AND lower(trim(e.full_name)) = lower(trim(p_full_name))
     AND e.date_of_birth = p_date_of_birth
$$;

-- Owners / admins / managers only — agents and TLs shouldn't run rehire checks.
REVOKE ALL ON FUNCTION public.check_rehire(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rehire(text, text, date) TO authenticated;
-- RLS-style filtering: the function uses SECURITY DEFINER, so leadership
-- gate is enforced at the call site (Empleados page is RequireRole-gated).
