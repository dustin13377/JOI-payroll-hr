-- ============================================================================
-- Migration: 20260619000002_clock_in_alerts_cron
-- Purpose:   Schedule the clock-in-alerts edge function via pg_cron.
--            Runs every 5 min (same cadence as the EOD digest jobs); the
--            function itself decides which campaigns are due and which stage
--            to fire using campaigns_clock_in_alert_times() + clock_in_alert_log.
--
--            Safe to deploy before going live: the function defaults to
--            DRY_RUN (DRY_RUN_CLOCK_IN unset) and will only log, never email,
--            until DRY_RUN_CLOCK_IN=false is set in the function secrets.
-- ============================================================================

-- Idempotent: drop a prior copy of the job if it exists, then (re)create.
SELECT cron.unschedule('clock-in-alerts-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clock-in-alerts-check');

SELECT cron.schedule(
  'clock-in-alerts-check',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://jpaihltkrohdqkqlbqkf.supabase.co/functions/v1/clock-in-alerts',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', app_config_value('cron_secret')
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
