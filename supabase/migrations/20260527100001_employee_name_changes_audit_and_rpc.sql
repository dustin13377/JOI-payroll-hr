-- ============================================================================
-- Employee name change: audit table + RPC
--
-- Context:
--   Until now the only way to fix a misspelled employee name was to create a
--   new profile. We want manager+ to be able to edit `employees.full_name`
--   (legal name) and `employees.work_name` directly from the profile page,
--   with a light audit trail in case HR ever needs to reconstruct who was
--   on payroll under what name.
--
-- Permission rules enforced in the RPC:
--   - owner / admin            → can edit anyone
--   - manager                  → can edit only when target.title IN ('agent','team_lead')
--                                (i.e. managers cannot rename other managers,
--                                 admins, or the owner)
--   - team_lead / agent / etc. → forbidden (they ask a manager directly)
--
-- All writes go through `public.update_employee_name`. There is no direct
-- INSERT/UPDATE policy on the audit table — the RPC is SECURITY DEFINER and
-- is the only writer.
-- ============================================================================

-- 1. employee_name_changes audit table -------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_name_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  changed_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  old_full_name   text,
  new_full_name   text NOT NULL,
  old_work_name   text,
  new_work_name   text,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_name_changes_employee
  ON public.employee_name_changes (employee_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_name_changes_changed_by
  ON public.employee_name_changes (changed_by);
CREATE INDEX IF NOT EXISTS idx_employee_name_changes_org
  ON public.employee_name_changes (organization_id);

COMMENT ON TABLE public.employee_name_changes IS
  'Audit log of legal/work name changes made via update_employee_name RPC. '
  'No UI yet — kept purely so HR can reconstruct historical names if needed.';

ALTER TABLE public.employee_name_changes ENABLE ROW LEVEL SECURITY;

-- 2. RLS — read-only via leadership; writes happen only via the SECURITY
--    DEFINER RPC below.
DROP POLICY IF EXISTS "leadership_select_employee_name_changes"
  ON public.employee_name_changes;
CREATE POLICY "leadership_select_employee_name_changes"
  ON public.employee_name_changes FOR SELECT TO authenticated
  USING (public.is_leadership());

-- 3. update_employee_name RPC ----------------------------------------------
CREATE OR REPLACE FUNCTION public.update_employee_name(
  p_employee_id uuid,
  p_full_name   text,
  p_work_name   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role  text;
  v_target       record;
  v_clean_full   text;
  v_clean_work   text;
  v_changed      boolean;
BEGIN
  -- ── Authorization ──────────────────────────────────────────────────────
  -- Pull caller's role from user_profiles. Anonymous / missing → reject.
  SELECT role INTO v_caller_role
    FROM public.user_profiles
   WHERE id = auth.uid();

  IF v_caller_role IS NULL
     OR v_caller_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Forbidden: only manager+ may rename employees'
      USING ERRCODE = '42501';
  END IF;

  -- Load target employee.
  SELECT id, full_name, work_name, title, organization_id
    INTO v_target
    FROM public.employees
   WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'P0002';
  END IF;

  -- Managers cannot rename other managers, admins, or the owner.
  IF v_caller_role = 'manager'
     AND v_target.title IN ('manager', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Forbidden: managers cannot rename other managers, admins, or the owner'
      USING ERRCODE = '42501';
  END IF;

  -- ── Validation ─────────────────────────────────────────────────────────
  v_clean_full := trim(coalesce(p_full_name, ''));
  v_clean_work := NULLIF(trim(coalesce(p_work_name, '')), '');

  IF length(v_clean_full) < 2 THEN
    RAISE EXCEPTION 'Legal name must be at least 2 characters'
      USING ERRCODE = '22023';
  END IF;

  -- No-op short-circuit: nothing changed → just return current values.
  v_changed := (v_clean_full IS DISTINCT FROM v_target.full_name)
               OR (v_clean_work IS DISTINCT FROM v_target.work_name);

  IF NOT v_changed THEN
    RETURN jsonb_build_object(
      'employee_id', v_target.id,
      'full_name',   v_target.full_name,
      'work_name',   v_target.work_name,
      'changed',     false
    );
  END IF;

  -- ── Apply update ───────────────────────────────────────────────────────
  UPDATE public.employees
     SET full_name = v_clean_full,
         work_name = v_clean_work
   WHERE id = v_target.id;

  -- ── Audit ──────────────────────────────────────────────────────────────
  INSERT INTO public.employee_name_changes (
    employee_id,
    changed_by,
    old_full_name,
    new_full_name,
    old_work_name,
    new_work_name,
    organization_id
  ) VALUES (
    v_target.id,
    auth.uid(),
    v_target.full_name,
    v_clean_full,
    v_target.work_name,
    v_clean_work,
    v_target.organization_id
  );

  RETURN jsonb_build_object(
    'employee_id', v_target.id,
    'full_name',   v_clean_full,
    'work_name',   v_clean_work,
    'changed',     true
  );
END;
$$;

COMMENT ON FUNCTION public.update_employee_name(uuid, text, text) IS
  'Update employees.full_name (legal) and employees.work_name with an audit '
  'row. Owner/admin can edit anyone; manager can edit only agents and team '
  'leads; everyone else forbidden. Writes one row to employee_name_changes '
  'per actual change.';

-- Block direct access from anon; only authenticated app users can call.
REVOKE ALL ON FUNCTION public.update_employee_name(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_employee_name(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_employee_name(uuid, text, text) TO authenticated;
