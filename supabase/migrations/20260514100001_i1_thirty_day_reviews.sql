/**
 * I1: 30-day probationary reviews (weekly cadence)
 *
 * Why: New agents need a structured probation review. By day 29 the TL must
 * decide keep / let go / extend. To prevent that decision from being a vibe
 * call, we capture WEEKLY check-ins (days 7, 14, 21, 29) so the final
 * decision is grounded in three prior documented data points.
 *
 * Design:
 *   - One agent_reviews row per (employee, week_number 1-4).
 *   - Trigger auto-creates the 4 rows whenever an employee with hire_date
 *     is inserted (or hire_date is set on an existing employee).
 *   - due_date = hire_date + (week_number * 7) days, with the final review
 *     due on hire_date + 29 days (so TL has buffer before day 30).
 *   - Final decision (keep / let_go / extend) ONLY allowed on week 4.
 *   - "Extend" creates a follow-up record N days out (TL picks N, 1-60).
 *   - Let-go is NOT auto-actioned. TL files the recommendation; HR confirms
 *     via confirm_review_termination — only then is the employee terminated.
 *   - RLS: leadership full, TL scoped to own team, agents read their OWN
 *     completed reviews (with pending let-go hidden until HR confirms).
 *
 * NOTE: Notification triggers + day-29 escalation live in a separate
 * follow-up migration (i2) so this one stays focused on data model.
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.review_decision AS ENUM (
  'keep',
  'let_go',
  'extend'
);

-- Termination workflow status. Only meaningful when decision = 'let_go'.
--   pending     → TL filed let-go, waiting on HR/leadership confirmation
--   confirmed   → HR confirmed; employee was flipped to 'terminated'
--   denied      → HR rejected the let-go; employee stays active
CREATE TYPE public.review_termination_status AS ENUM (
  'pending',
  'confirmed',
  'denied'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. agent_reviews table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.agent_reviews (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  campaign_id     uuid          NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,

  -- Which weekly check-in this row represents (1=day7, 2=day14, 3=day21, 4=day29).
  -- 5+ reserved for "extend" follow-up reviews.
  week_number     smallint      NOT NULL CHECK (week_number BETWEEN 1 AND 8),

  -- When the TL needs to have this filled out by.
  due_date        date          NOT NULL,

  -- 1-5 scale. NULL until the review is filled.
  attendance_score   smallint   CHECK (attendance_score   BETWEEN 1 AND 5),
  kpi_score          smallint   CHECK (kpi_score          BETWEEN 1 AND 5),
  attitude_score     smallint   CHECK (attitude_score     BETWEEN 1 AND 5),

  notes           text,

  -- Only populated on the final (week 4 / extension) review.
  decision        public.review_decision,
  decision_reason text,

  -- HR confirmation flow for let_go decisions.
  -- NULL when decision IS NOT 'let_go'. Set to 'pending' the moment the TL
  -- files a let-go recommendation, then HR moves it to confirmed/denied.
  termination_status     public.review_termination_status,
  hr_decided_by          uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  hr_decided_at          timestamptz,
  hr_decision_notes      text,

  -- For 'extend' decisions: how many days the TL chose to extend.
  -- Lets us audit "what extension length was picked" later.
  extension_days  smallint CHECK (extension_days IS NULL OR extension_days BETWEEN 1 AND 60),

  -- Audit
  reviewed_by     uuid          REFERENCES public.employees(id) ON DELETE SET NULL,
  completed_at    timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (employee_id, week_number)
);

CREATE INDEX idx_agent_reviews_employee     ON public.agent_reviews (employee_id, week_number);
CREATE INDEX idx_agent_reviews_due_pending  ON public.agent_reviews (due_date) WHERE completed_at IS NULL;
CREATE INDEX idx_agent_reviews_campaign     ON public.agent_reviews (campaign_id);

CREATE TRIGGER trg_agent_reviews_updated_at
  BEFORE UPDATE ON public.agent_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Constraint: decision only allowed on final/extension reviews
--    (week_number = 4 OR week_number > 4)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent_reviews
  ADD CONSTRAINT agent_reviews_decision_only_on_final
  CHECK (decision IS NULL OR week_number >= 4);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger: auto-create the 4 weekly rows on employee insert / hire_date set
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Fires on INSERT (if hire_date already set) and on UPDATE when hire_date
-- transitions from NULL to a value. Idempotent: ON CONFLICT DO NOTHING means
-- re-running won't duplicate.

CREATE OR REPLACE FUNCTION public.seed_agent_reviews()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_due_offsets int[] := ARRAY[7, 14, 21, 29];
  v_week int;
BEGIN
  -- Only seed for active hires with a campaign + hire_date.
  IF NEW.hire_date IS NULL OR NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only seed when hire_date is being set for the first time.
  IF TG_OP = 'UPDATE' AND OLD.hire_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

  FOR v_week IN 1..4 LOOP
    INSERT INTO public.agent_reviews (employee_id, campaign_id, week_number, due_date)
    VALUES (NEW.id, NEW.campaign_id, v_week, NEW.hire_date + v_due_offsets[v_week])
    ON CONFLICT (employee_id, week_number) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_agent_reviews ON public.employees;
CREATE TRIGGER trg_seed_agent_reviews
  AFTER INSERT OR UPDATE OF hire_date ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_agent_reviews();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: extend_agent_review
--    Creates a follow-up review N days out when TL picks "extend".
--    Keeps logic out of the client — the client just calls this and gets a
--    new row to fill out later.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.extend_agent_review(
  p_employee_id uuid,
  p_extra_days  int DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
  v_max_week    int;
  v_last_due    date;
  v_new_id      uuid;
BEGIN
  IF p_extra_days <= 0 OR p_extra_days > 60 THEN
    RAISE EXCEPTION 'p_extra_days must be 1-60' USING ERRCODE = 'P0001';
  END IF;

  -- Permission: leadership OR TL of this employee's campaign.
  IF NOT (public.is_leadership() OR public.tl_employee_on_my_team(p_employee_id)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT MAX(week_number), MAX(due_date)
    INTO v_max_week, v_last_due
    FROM public.agent_reviews
   WHERE employee_id = p_employee_id;

  IF v_max_week IS NULL THEN
    RAISE EXCEPTION 'no existing reviews to extend' USING ERRCODE = 'P0002';
  END IF;

  IF v_max_week >= 8 THEN
    RAISE EXCEPTION 'already extended the maximum number of times' USING ERRCODE = 'P0003';
  END IF;

  SELECT campaign_id INTO v_campaign_id FROM public.employees WHERE id = p_employee_id;

  INSERT INTO public.agent_reviews (employee_id, campaign_id, week_number, due_date)
  VALUES (p_employee_id, v_campaign_id, v_max_week + 1, v_last_due + p_extra_days)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_agent_review(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_agent_review(uuid, int) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: complete_agent_review
--    Single entry point for filling out a review. Validates that decision
--    is only set on week >= 4. If decision = 'let_go', flips employee
--    to terminated (UI must confirm before calling this).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_agent_review(
  p_review_id        uuid,
  p_attendance_score smallint,
  p_kpi_score        smallint,
  p_attitude_score   smallint,
  p_notes            text     DEFAULT NULL,
  p_decision         public.review_decision DEFAULT NULL,
  p_decision_reason  text     DEFAULT NULL,
  p_extension_days   smallint DEFAULT NULL  -- required when p_decision = 'extend'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_week        int;
  v_reviewer    uuid;
BEGIN
  SELECT employee_id, week_number INTO v_employee_id, v_week
    FROM public.agent_reviews WHERE id = p_review_id;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_leadership() OR public.tl_employee_on_my_team(v_employee_id)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NOT NULL AND v_week < 4 THEN
    RAISE EXCEPTION 'decision only allowed on final review (week 4+)' USING ERRCODE = 'P0001';
  END IF;

  IF p_decision = 'extend' AND (p_extension_days IS NULL OR p_extension_days < 1 OR p_extension_days > 60) THEN
    RAISE EXCEPTION 'extension requires p_extension_days between 1 and 60' USING ERRCODE = 'P0001';
  END IF;

  v_reviewer := public.my_employee_id();

  UPDATE public.agent_reviews
     SET attendance_score   = p_attendance_score,
         kpi_score          = p_kpi_score,
         attitude_score     = p_attitude_score,
         notes              = p_notes,
         decision           = p_decision,
         decision_reason    = p_decision_reason,
         extension_days     = CASE WHEN p_decision = 'extend' THEN p_extension_days END,
         termination_status = CASE WHEN p_decision = 'let_go' THEN 'pending'::public.review_termination_status END,
         reviewed_by        = v_reviewer,
         completed_at       = now()
   WHERE id = p_review_id;

  -- Side effects:
  --   keep    → no-op, just close the review
  --   let_go  → no-op on employees table; HR confirms via confirm_review_termination
  --   extend  → create follow-up review N days after the last due_date
  IF p_decision = 'extend' THEN
    PERFORM public.extend_agent_review(v_employee_id, p_extension_days::int);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_agent_review(uuid, smallint, smallint, smallint, text, public.review_decision, text, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_agent_review(uuid, smallint, smallint, smallint, text, public.review_decision, text, smallint) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6b. RPC: confirm_review_termination
--    HR / leadership only. When the TL files a 'let_go' decision, the
--    employee is NOT auto-terminated. HR reviews and either confirms (which
--    flips the employee to 'terminated') or denies (which leaves the agent
--    active and stamps a denial reason on the review).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_review_termination(
  p_review_id     uuid,
  p_confirm       boolean,                -- true = approve termination, false = deny
  p_hr_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id  uuid;
  v_decision     public.review_decision;
  v_status       public.review_termination_status;
  v_reason       text;
  v_review_notes text;
BEGIN
  -- Only leadership can confirm/deny. TLs cannot self-approve their own let-go calls.
  IF NOT public.is_leadership() THEN
    RAISE EXCEPTION 'only HR / leadership can confirm terminations' USING ERRCODE = '42501';
  END IF;

  SELECT employee_id, decision, termination_status, decision_reason, notes
    INTO v_employee_id, v_decision, v_status, v_reason, v_review_notes
    FROM public.agent_reviews WHERE id = p_review_id;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_decision <> 'let_go' THEN
    RAISE EXCEPTION 'review decision is not let_go — nothing to confirm' USING ERRCODE = 'P0001';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'termination already %', v_status USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.agent_reviews
     SET termination_status = CASE WHEN p_confirm THEN 'confirmed'::public.review_termination_status
                                                   ELSE 'denied'::public.review_termination_status END,
         hr_decided_by      = public.my_employee_id(),
         hr_decided_at      = now(),
         hr_decision_notes  = p_hr_notes
   WHERE id = p_review_id;

  IF p_confirm THEN
    UPDATE public.employees
       SET employment_status  = 'terminated',
           termination_reason = 'failed_30_day_review',
           termination_notes  = COALESCE(p_hr_notes, v_reason, v_review_notes)
     WHERE id = v_employee_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_review_termination(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_review_termination(uuid, boolean, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS — mirrors agent_coaching_notes pattern
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent_reviews ENABLE ROW LEVEL SECURITY;

-- Leadership: full access (owner / admin / manager / HR all included via is_leadership)
CREATE POLICY "leadership_all_agent_reviews"
  ON public.agent_reviews FOR ALL TO authenticated
  USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

-- TL: read all reviews for agents on their campaigns
CREATE POLICY "tl_select_agent_reviews"
  ON public.agent_reviews FOR SELECT TO authenticated
  USING (public.is_team_lead() AND public.tl_employee_on_my_team(employee_id));

-- TL: update reviews for own team (writes go through complete_agent_review RPC,
-- but allow direct UPDATE as an escape hatch for typo fixes etc.)
CREATE POLICY "tl_update_agent_reviews"
  ON public.agent_reviews FOR UPDATE TO authenticated
  USING (public.is_team_lead() AND public.tl_employee_on_my_team(employee_id))
  WITH CHECK (public.is_team_lead() AND public.tl_employee_on_my_team(employee_id));

-- Agent: read own COMPLETED reviews. Hides any pending let-go (decision filed
-- but HR hasn't confirmed yet) so the agent isn't tipped off prematurely.
-- Once HR confirms the let_go, the agent can see the full review.
CREATE POLICY "agent_select_own_completed_reviews"
  ON public.agent_reviews FOR SELECT TO authenticated
  USING (
    employee_id = public.my_employee_id()
    AND completed_at IS NOT NULL
    AND (
      decision IS DISTINCT FROM 'let_go'
      OR termination_status = 'confirmed'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Backfill: any active employee with a hire_date but no reviews gets seeded
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Only seeds for employees still within their probation window (hire_date
-- within the last 30 days). Older employees have already passed probation —
-- seeding reviews for them would create a flood of overdue alerts.

INSERT INTO public.agent_reviews (employee_id, campaign_id, week_number, due_date)
SELECT e.id, e.campaign_id, w.week_number, e.hire_date + w.offset_days
  FROM public.employees e
 CROSS JOIN (VALUES (1::smallint, 7), (2, 14), (3, 21), (4, 29)) AS w(week_number, offset_days)
 WHERE e.employment_status = 'active'
   AND e.hire_date IS NOT NULL
   AND e.campaign_id IS NOT NULL
   AND e.hire_date >= (CURRENT_DATE - INTERVAL '30 days')
ON CONFLICT (employee_id, week_number) DO NOTHING;
