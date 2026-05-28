-- Adds a per-campaign toggle to automatically include all active employees
-- assigned to the campaign in the daily EOD digest recipient list.
--
-- Off by default to preserve existing behavior (other clients may not want
-- their JOI agents on the digest chain). Flip on per campaign for clients
-- like Torro/SLOC where the client (Cameron) wants everyone visible.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS include_agents_in_eod_digest BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.include_agents_in_eod_digest IS
  'When true, the daily EOD digest auto-includes all active employees on this campaign (excluding is_system_user). Manual entries in campaign_eod_recipients are still sent. Default false.';
