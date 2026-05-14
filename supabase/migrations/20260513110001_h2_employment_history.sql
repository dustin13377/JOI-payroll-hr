/**
 * H2: Employment history (audit trail)
 *
 * employees.employment_status only knows the *current* state. If we terminate
 * → reactivate → terminate again, the new row overwrites the old story. This
 * table keeps every transition so we can answer "have we fired this person
 * before?" or "show me everyone terminated in Q1."
 *
 * Trigger writes a row automatically on every employment_status change
 * (including the initial INSERT, which gets logged as a "hire").
 *
 * Backfill: one HIRE row per existing employee (using created_at), plus a
 * TERMINATION row for everyone currently in a non-active state (using
 * terminated_at / last_worked_day / created_at as best-effort timestamp).
 *
 * Applied via MCP 2026-05-13.
 */

-- 1. The table -------------------------------------------------------------

CREATE TABLE public.employment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  from_status public.employment_status,                -- NULL on hire
  to_status   public.employment_status NOT NULL,
  reason text,
  notes text,
  rehire_eligible boolean,
  last_worked_day date,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.employment_history IS
  'Append-only audit log of employment_status transitions on the employees table.';

CREATE INDEX idx_employment_history_employee_changed
  ON public.employment_history (employee_id, changed_at DESC);

-- 2. Trigger: append on every employment_status change --------------------

CREATE OR REPLACE FUNCTION public.log_employment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from public.employment_status;
  v_to   public.employment_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_from := NULL;
    v_to   := NEW.employment_status;
  ELSE
    -- UPDATE: only log if status actually changed
    IF NEW.employment_status IS NOT DISTINCT FROM OLD.employment_status THEN
      RETURN NEW;
    END IF;
    v_from := OLD.employment_status;
    v_to   := NEW.employment_status;
  END IF;

  INSERT INTO public.employment_history (
    employee_id,
    from_status,
    to_status,
    reason,
    notes,
    rehire_eligible,
    last_worked_day,
    changed_by,
    changed_at
  ) VALUES (
    NEW.id,
    v_from,
    v_to,
    NEW.termination_reason,
    NEW.termination_notes,
    NEW.rehire_eligible,
    NEW.last_worked_day,
    COALESCE(NEW.terminated_by, auth.uid()),
    COALESCE(NEW.terminated_at, NOW())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_employment_status ON public.employees;
CREATE TRIGGER trg_log_employment_status
  AFTER INSERT OR UPDATE OF employment_status ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.log_employment_status_change();

-- 3. Backfill -------------------------------------------------------------

-- Hire rows for everyone who currently exists.
INSERT INTO public.employment_history (
  employee_id, from_status, to_status, reason, changed_at
)
SELECT id, NULL, 'active', 'Backfilled from existing record',
       COALESCE(created_at, NOW())
  FROM public.employees;

-- Termination rows for anyone currently inactive.
INSERT INTO public.employment_history (
  employee_id, from_status, to_status,
  reason, notes, rehire_eligible, last_worked_day,
  changed_by, changed_at
)
SELECT id, 'active', employment_status,
       termination_reason, termination_notes, rehire_eligible, last_worked_day,
       terminated_by,
       COALESCE(terminated_at, last_worked_day::timestamptz, created_at, NOW())
  FROM public.employees
 WHERE employment_status <> 'active';

-- 4. RLS — leadership only ------------------------------------------------

ALTER TABLE public.employment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employment_history_leadership_read"
  ON public.employment_history FOR SELECT TO authenticated
  USING (public.is_leadership());

-- Writes happen via the trigger only — and the trigger function is
-- SECURITY DEFINER so it bypasses RLS to do the INSERT. No INSERT/UPDATE/
-- DELETE policies = nobody can hand-edit the audit log even from the SQL
-- editor; the only path in is through a real employment_status change on
-- the employees table.

GRANT SELECT ON public.employment_history TO authenticated;
