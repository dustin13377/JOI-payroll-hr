/**
 * I2: 30-day review notifications + day-29 escalation
 *
 * Phase 2 of the 30-day review feature. Phase 1 (i1) created the data model;
 * this adds the email plumbing.
 *
 * Pieces:
 *   1. agent_review_notifications_sent — dedupe table per (review, type, recipient, date).
 *   2. find_pending_tl_review_emails() — returns rows the edge function should
 *      send to TLs today (one per pending review, grouped client-side by TL).
 *   3. find_pending_escalation_emails() — returns rows for day-29 escalation
 *      to manager + HR + owner.
 *   4. mark_review_notification_sent() — single insert helper used by the edge
 *      function to stamp dedupe rows after a successful send.
 *   5. Two pg_cron jobs:
 *        - 9 AM CDMX daily → TL re-pings (15:00 UTC)
 *        - 6 PM CDMX daily → week-4 escalation (00:00 UTC next day)
 *
 * Both crons hit the same edge function `review-notifications` with different
 * `mode` body params, mirroring the compliance-notifications pattern.
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Dedupe table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.review_notification_type AS ENUM (
  'tl_due',           -- daily reminder to the TL while a review is pending
  'escalation_day29'  -- one-time ping to manager/HR/owner when week-4 still pending
);

CREATE TABLE public.agent_review_notifications_sent (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id             uuid NOT NULL REFERENCES public.agent_reviews(id) ON DELETE CASCADE,
  notification_type     public.review_notification_type NOT NULL,
  recipient_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  recipient_email       text NOT NULL,
  send_date             date NOT NULL,                          -- the CDMX-local send date
  sent_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, notification_type, recipient_employee_id, send_date)
);

CREATE INDEX idx_review_notifs_review ON public.agent_review_notifications_sent (review_id);
CREATE INDEX idx_review_notifs_lookup
  ON public.agent_review_notifications_sent (notification_type, send_date);

-- Service role only. RLS enabled but no authenticated policies (only edge fn writes).
ALTER TABLE public.agent_review_notifications_sent ENABLE ROW LEVEL SECURITY;

-- Leadership can read for audit/debugging; nothing else has access.
CREATE POLICY "leadership_read_review_notifications"
  ON public.agent_review_notifications_sent FOR SELECT TO authenticated
  USING (public.is_leadership());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. find_pending_tl_review_emails — drives the daily TL re-ping
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Returns one row per (pending review, today) that hasn't been sent yet to
-- the TL today. Edge function groups by TL and sends one digest email each.
--
-- A "pending" review = completed_at IS NULL AND due_date <= p_send_date.
-- Skipping reviews whose campaign has no team_lead_id set (orphaned).

CREATE OR REPLACE FUNCTION public.find_pending_tl_review_emails(p_send_date date)
RETURNS TABLE (
  review_id        uuid,
  employee_id      uuid,
  employee_name    text,
  employee_work_name text,
  week_number      smallint,
  due_date         date,
  days_overdue     int,
  campaign_id      uuid,
  campaign_name    text,
  tl_id            uuid,
  tl_name          text,
  tl_email         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id                     AS review_id,
    e.id                     AS employee_id,
    e.full_name              AS employee_name,
    e.work_name              AS employee_work_name,
    r.week_number,
    r.due_date,
    GREATEST(0, p_send_date - r.due_date) AS days_overdue,
    c.id                     AS campaign_id,
    c.name                   AS campaign_name,
    tl.id                    AS tl_id,
    tl.full_name             AS tl_name,
    tl.email                 AS tl_email
  FROM public.agent_reviews r
  JOIN public.employees e   ON r.employee_id = e.id
  JOIN public.campaigns c   ON r.campaign_id = c.id
  JOIN public.employees tl  ON c.team_lead_id = tl.id
  WHERE r.completed_at IS NULL
    AND r.due_date <= p_send_date
    AND tl.email IS NOT NULL
    AND e.employment_status = 'active'        -- don't email about already-departed agents
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_review_notifications_sent s
       WHERE s.review_id = r.id
         AND s.notification_type = 'tl_due'
         AND s.recipient_employee_id = tl.id
         AND s.send_date = p_send_date
    )
  ORDER BY tl.id, r.due_date;
$$;

REVOKE ALL ON FUNCTION public.find_pending_tl_review_emails(date) FROM PUBLIC;
-- Edge function calls this with the service role key, so no GRANT needed for
-- authenticated users. SECURITY DEFINER + REVOKE keeps it locked down.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. find_pending_escalation_emails — drives the day-29 evening escalation
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Returns one row per (pending week-4 review × leadership recipient) that
-- hasn't been emailed yet. Recipients = anyone with title in
-- (owner, admin, manager). Edge function sends one email per recipient.
--
-- Dedupe is "any send ever" (not per-day) — escalation fires exactly once per
-- review per recipient, ever. send_date is recorded for debugging only.

CREATE OR REPLACE FUNCTION public.find_pending_escalation_emails(p_send_date date)
RETURNS TABLE (
  review_id        uuid,
  employee_id      uuid,
  employee_name    text,
  due_date         date,
  campaign_id      uuid,
  campaign_name    text,
  tl_id            uuid,
  tl_name          text,
  recipient_id     uuid,
  recipient_name   text,
  recipient_title  text,
  recipient_email  text,
  -- Prior weekly scores for context in the escalation email
  prior_attendance_avg numeric,
  prior_kpi_avg        numeric,
  prior_attitude_avg   numeric,
  completed_weeks      int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH prior_scores AS (
    SELECT employee_id,
           AVG(attendance_score)::numeric(3,1) AS att_avg,
           AVG(kpi_score)::numeric(3,1)        AS kpi_avg,
           AVG(attitude_score)::numeric(3,1)   AS atd_avg,
           COUNT(*)                            AS done_count
      FROM public.agent_reviews
     WHERE completed_at IS NOT NULL
     GROUP BY employee_id
  )
  SELECT
    r.id                     AS review_id,
    e.id                     AS employee_id,
    e.full_name              AS employee_name,
    r.due_date,
    c.id                     AS campaign_id,
    c.name                   AS campaign_name,
    tl.id                    AS tl_id,
    tl.full_name             AS tl_name,
    rec.id                   AS recipient_id,
    rec.full_name            AS recipient_name,
    rec.title                AS recipient_title,
    rec.email                AS recipient_email,
    ps.att_avg,
    ps.kpi_avg,
    ps.atd_avg,
    COALESCE(ps.done_count, 0)::int AS completed_weeks
  FROM public.agent_reviews r
  JOIN public.employees e   ON r.employee_id = e.id
  JOIN public.campaigns c   ON r.campaign_id = c.id
  LEFT JOIN public.employees tl ON c.team_lead_id = tl.id
  CROSS JOIN LATERAL (
    SELECT id, full_name, title, email
      FROM public.employees
     WHERE title IN ('owner', 'admin', 'manager')
       AND email IS NOT NULL
       AND employment_status = 'active'
  ) rec
  LEFT JOIN prior_scores ps ON ps.employee_id = e.id
  WHERE r.week_number = 4
    AND r.completed_at IS NULL
    AND r.due_date <= p_send_date
    AND e.employment_status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_review_notifications_sent s
       WHERE s.review_id = r.id
         AND s.notification_type = 'escalation_day29'
         AND s.recipient_employee_id = rec.id
    )
  ORDER BY r.due_date, e.full_name, rec.title;
$$;

REVOKE ALL ON FUNCTION public.find_pending_escalation_emails(date) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. mark_review_notification_sent — stamp dedupe row after successful send
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Called by the edge function after a real (or dry-run) send completes.
-- Returns the inserted row id so the function can log it.

CREATE OR REPLACE FUNCTION public.mark_review_notification_sent(
  p_review_id             uuid,
  p_notification_type     public.review_notification_type,
  p_recipient_employee_id uuid,
  p_recipient_email       text,
  p_send_date             date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.agent_review_notifications_sent
    (review_id, notification_type, recipient_employee_id, recipient_email, send_date)
  VALUES (p_review_id, p_notification_type, p_recipient_employee_id, p_recipient_email, p_send_date)
  ON CONFLICT (review_id, notification_type, recipient_employee_id, send_date) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;  -- NULL if conflict (already sent)
END;
$$;

REVOKE ALL ON FUNCTION public.mark_review_notification_sent(uuid, public.review_notification_type, uuid, text, date) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. pg_cron schedules
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Both jobs hit the same edge function with different `mode` body params,
-- following the compliance-notifications pattern. CRON_SECRET stored in
-- public.app_config (same as compliance/holiday) — no plaintext secrets in DDL.
--
-- Times:
--   review-notifications-tl-daily         9 AM CDMX = 15:00 UTC
--   review-notifications-escalation-eve   6 PM CDMX = 00:00 UTC (next UTC day)

SELECT cron.schedule(
  'review-notifications-tl-daily',
  '0 15 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://jpaihltkrohdqkqlbqkf.supabase.co/functions/v1/review-notifications',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', app_config_value('cron_secret')
      ),
      body    := '{"mode": "tl_daily"}'::jsonb
    ) AS request_id;
  $$
);

SELECT cron.schedule(
  'review-notifications-escalation-eve',
  '0 0 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://jpaihltkrohdqkqlbqkf.supabase.co/functions/v1/review-notifications',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', app_config_value('cron_secret')
      ),
      body    := '{"mode": "escalation"}'::jsonb
    ) AS request_id;
  $$
);
