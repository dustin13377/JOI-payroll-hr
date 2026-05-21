-- =============================================================================
-- Payroll Phase 4c — Owner-initiated UNLOCK for PAID periods
-- =============================================================================
-- Need: if a pay period was marked PAID and a mistake is found (wrong rate,
-- missed bonus, fat-fingered missed-day), today there is no UI to reopen it.
-- This migration adds:
--
--   1. is_owner() helper — owner-only role check (matches is_leadership pattern)
--   2. Updated payroll_records_paid_lock trigger — honors a transaction-local
--      config flag `jpayroll.unlocking='true'` to allow the unlock function to
--      revert PAID records. Backwards compatible: without the flag, behavior
--      is identical to before.
--   3. pay_unlock_period(p_period_id, p_reason) RPC — owner-only. Reverses
--      the lock cascade and writes an UNLOCK_PAID row to payroll_audit_log.
--
-- IMPORTANT: previous COMPLETE/UNPAID status on weeks and records is NOT
-- preserved when locking, so unlock reverts everything to UNPAID. Users can
-- re-mark weeks COMPLETE afterward if needed.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. is_owner() helper
--    Same shape as is_leadership(), narrower scope.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.employees     e  ON up.employee_id = e.id
    WHERE up.id = auth.uid()
      AND e.organization_id = public.my_org_id()
      AND e.title = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. Update payroll_records_paid_lock trigger to honor an unlock flag.
--    Behavior:
--      - Default (flag unset / 'false'): blocks PAID-row updates as before.
--      - When `jpayroll.unlocking = 'true'` is set with set_config(..., true)
--        (transaction-local), updates are allowed. This is set ONLY inside
--        pay_unlock_period, never exposed to clients.
--
--    Why a session var vs. ALTER TABLE DISABLE TRIGGER:
--      DISABLE TRIGGER requires owner-of-table privileges and persists
--      across statements until re-enabled. A transaction-local
--      set_config(..., true) scopes the bypass to exactly the transaction
--      that's doing the unlock — surgical and safe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_records_paid_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'PAID'
     AND COALESCE(current_setting('jpayroll.unlocking', true), 'false') <> 'true' THEN
    RAISE EXCEPTION
      'Cannot modify a PAID payroll record. Unlock the pay period first.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. pay_unlock_period(p_period_id, p_reason)
--    Owner-only. Reverses a PAID-locked period:
--      payroll_periods : LOCKED → OPEN, locked_at/locked_by cleared
--      payroll_weeks   : PAID   → UNPAID
--      payroll_records : PAID   → UNPAID  (via session-var bypass)
--    Inserts one UNLOCK_PAID row into payroll_audit_log capturing actor,
--    reason, and counts.
--
--    Returns:
--    {
--      period_id, period_code,
--      weeks_unlocked, records_unlocked,
--      reason, actor, at
--    }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_unlock_period(
  p_period_id  uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period           payroll_periods%ROWTYPE;
  v_actor            uuid := auth.uid();
  v_weeks_unlocked   int  := 0;
  v_records_unlocked int  := 0;
  v_audit_before     jsonb;
  v_audit_after      jsonb;
BEGIN
  -- Owner-only
  IF NOT is_owner() THEN
    RAISE EXCEPTION 'pay_unlock_period: requires owner role'
      USING ERRCODE = '42501';
  END IF;

  -- Reason is required (short audit string)
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'pay_unlock_period: reason is required'
      USING ERRCODE = '22023';
  END IF;

  -- Fetch the period
  SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_unlock_period: payroll period % not found', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Only LOCKED periods can be unlocked
  IF v_period.status <> 'LOCKED' THEN
    RAISE EXCEPTION
      'pay_unlock_period: period % is not LOCKED (current status: %)',
      p_period_id, v_period.status
      USING ERRCODE = '22023';
  END IF;

  -- Build audit BEFORE snapshot
  v_audit_before := jsonb_build_object(
    'period_status', v_period.status,
    'locked_at',     v_period.locked_at,
    'locked_by',     v_period.locked_by
  );

  -- ── 1. Records: flip PAID → UNPAID with the session-var bypass.
  --    set_config(..., true) = transaction-local; it auto-clears at COMMIT.
  PERFORM set_config('jpayroll.unlocking', 'true', true);

  WITH affected AS (
    UPDATE payroll_records pr
    SET status = 'UNPAID'
    FROM payroll_weeks pw
    WHERE pw.id = pr.week_id
      AND pw.period_id = p_period_id
      AND pr.status = 'PAID'
    RETURNING pr.id
  )
  SELECT count(*)::int INTO v_records_unlocked FROM affected;

  -- Clear the bypass immediately after the records update
  PERFORM set_config('jpayroll.unlocking', 'false', true);

  -- ── 2. Weeks: flip PAID → UNPAID
  WITH affected AS (
    UPDATE payroll_weeks
    SET status            = 'UNPAID',
        status_changed_at = now(),
        status_changed_by = v_actor
    WHERE period_id = p_period_id
      AND status    = 'PAID'
    RETURNING id
  )
  SELECT count(*)::int INTO v_weeks_unlocked FROM affected;

  -- ── 3. Period: flip LOCKED → OPEN, clear lock metadata
  UPDATE payroll_periods
  SET status    = 'OPEN',
      locked_at = NULL,
      locked_by = NULL
  WHERE id = p_period_id;

  -- ── 4. Audit row (period-level: record_id NULL)
  v_audit_after := jsonb_build_object(
    'period_status',    'OPEN',
    'reason',           btrim(p_reason),
    'weeks_unlocked',   v_weeks_unlocked,
    'records_unlocked', v_records_unlocked
  );

  INSERT INTO payroll_audit_log (
    record_id, action, before, after, actor, organization_id
  ) VALUES (
    NULL,
    'UNLOCK_PAID',
    v_audit_before,
    v_audit_after,
    v_actor,
    v_period.organization_id
  );

  RETURN jsonb_build_object(
    'period_id',        p_period_id,
    'period_code',      v_period.period_code,
    'weeks_unlocked',   v_weeks_unlocked,
    'records_unlocked', v_records_unlocked,
    'reason',           btrim(p_reason),
    'actor',            v_actor,
    'at',               now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_unlock_period(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_unlock_period(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- Notes:
--   - The lock trigger change is backwards compatible: clients have no way to
--     set jpayroll.unlocking from the application — the only setter is inside
--     pay_unlock_period (SECURITY DEFINER, owner-gated).
--   - The audit row captures the actor's auth.uid() and the reason text, so
--     forensic queries can answer "who unlocked period X and why" via:
--         SELECT * FROM payroll_audit_log
--          WHERE action = 'UNLOCK_PAID' AND organization_id = '...' ORDER BY at;
-- ---------------------------------------------------------------------------
