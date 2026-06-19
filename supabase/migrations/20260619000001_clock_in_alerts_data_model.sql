-- ============================================================================
-- Migration: 20260619000001_clock_in_alerts_data_model
-- Purpose:   Data model for the "missing clock-in" alert system.
--
--            When agents have not clocked in after their shift starts, the
--            clock-in-alerts edge function emails the campaign's team lead(s)
--            and the managers a single consolidated list. If anyone is STILL
--            not clocked in later, it escalates to managers (the accountability
--            lever — the TL was already told and the team still isn't in).
--
--            This migration adds (all additive, no destructive ops):
--              1. campaigns.clock_in_alert_enabled  (per-campaign on/off)
--              2. clock_in_alert_log                (audit + double-send guard)
--              3. app_config delay keys             (timing, tunable without deploy)
--              4. campaigns_clock_in_alert_times()  (per-campaign fire times)
--
--            Mirrors the EOD-digest infrastructure (eod_digest_log +
--            campaigns_digest_fire_times) so the operational patterns match.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Per-campaign enable flag
-- ============================================================================
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS clock_in_alert_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.campaigns.clock_in_alert_enabled
  IS 'When true, the clock-in-alerts function sends missing-clock-in alerts for this campaign. Defaults true.';

-- ============================================================================
-- 2. clock_in_alert_log  (audit + double-send guard)
--    One row per (campaign, date, stage). stage is initial | escalation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.clock_in_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  alert_date date NOT NULL,
  stage text NOT NULL CHECK (stage IN ('initial', 'escalation')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient_count int NOT NULL DEFAULT 0,
  missing_count int NOT NULL DEFAULT 0,
  missing_agents jsonb,
  dry_run boolean NOT NULL DEFAULT true,
  smtp_message_id text,
  error text,
  UNIQUE (campaign_id, alert_date, stage)
);

CREATE INDEX IF NOT EXISTS idx_clock_in_alert_log_campaign_date
  ON public.clock_in_alert_log (campaign_id, alert_date DESC);

-- RLS — matches the eod_digest_log model: leadership full, TL read-only on
-- their own campaigns, agents none.
ALTER TABLE public.clock_in_alert_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.clock_in_alert_log'::regclass
      AND polname = 'leadership_all_clock_in_alert_log'
  ) THEN
    CREATE POLICY "leadership_all_clock_in_alert_log"
      ON public.clock_in_alert_log FOR ALL TO authenticated
      USING (public.is_leadership())
      WITH CHECK (public.is_leadership());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.clock_in_alert_log'::regclass
      AND polname = 'tl_select_own_campaign_clock_in_alert_log'
  ) THEN
    CREATE POLICY "tl_select_own_campaign_clock_in_alert_log"
      ON public.clock_in_alert_log FOR SELECT TO authenticated
      USING (
        public.is_team_lead()
        AND campaign_id IN (SELECT public.my_tl_campaign_ids())
      );
  END IF;
END
$$;

-- ============================================================================
-- 3. Timing config (tunable without redeploying the function)
--    Delays are measured from when the shift's grace period expires
--    (shift start_time + grace_minutes).
-- ============================================================================
INSERT INTO public.app_config (key, value) VALUES
  ('clock_in_alert_initial_delay_min', '15'),
  ('clock_in_alert_escalation_delay_min', '60')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 4. campaigns_clock_in_alert_times()
--    For every active, alert-enabled campaign that has a shift scheduled today
--    (in the campaign's timezone), returns the two fire times for today.
--    Multi-shift campaigns use the EARLIEST shift start of the day.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.campaigns_clock_in_alert_times()
RETURNS TABLE(
  campaign_id uuid,
  campaign_name text,
  tz text,
  earliest_shift_start time,
  grace_minutes int,
  initial_fire_time time,
  escalation_fire_time time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT
      COALESCE(NULLIF(app_config_value('clock_in_alert_initial_delay_min'), '')::int, 15)
        AS initial_delay,
      COALESCE(NULLIF(app_config_value('clock_in_alert_escalation_delay_min'), '')::int, 60)
        AS escalation_delay
  )
  SELECT
    c.id AS campaign_id,
    c.name AS campaign_name,
    COALESCE(c.eod_digest_timezone, 'America/Denver') AS tz,
    MIN(ss.start_time) AS earliest_shift_start,
    MIN(COALESCE(ss.grace_minutes, 10))::int AS grace_minutes,
    (MIN(ss.start_time + make_interval(mins => COALESCE(ss.grace_minutes, 10)))
      + make_interval(mins => (SELECT initial_delay FROM cfg)))::time
      AS initial_fire_time,
    (MIN(ss.start_time + make_interval(mins => COALESCE(ss.grace_minutes, 10)))
      + make_interval(mins => (SELECT escalation_delay FROM cfg)))::time
      AS escalation_fire_time
  FROM campaigns c
  JOIN shift_settings ss ON ss.campaign_id = c.id
  WHERE c.is_active = true
    AND COALESCE(c.clock_in_alert_enabled, true) = true
    AND EXTRACT(DOW FROM (now() AT TIME ZONE COALESCE(c.eod_digest_timezone, 'America/Denver')))::int
        = ANY(ss.days_of_week)
  GROUP BY c.id, c.name, c.eod_digest_timezone;
$$;

GRANT EXECUTE ON FUNCTION public.campaigns_clock_in_alert_times()
  TO postgres, authenticated, service_role;

COMMIT;
