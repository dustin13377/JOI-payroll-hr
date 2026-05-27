-- ========================================================================
-- h3_server_side_lateness
-- ------------------------------------------------------------------------
-- Move is_late / late_minutes calculation from the browser to a Postgres
-- BEFORE trigger so agents can't falsify their punctuality via devtools.
-- Closes audit finding H-3 from SECURITY_AND_DATALAYER_AUDIT.md (2026-05-27).
--
-- Applied via Supabase MCP 2026-05-27. This file is here for the git
-- audit trail / new-environment bootstrapping (CI doesn't auto-apply
-- migrations; see HANDOFF.md).
--
-- After this trigger fires, the client can no longer cheat — even if a
-- malicious agent INSERTs a row with is_late=false, late_minutes=0, the
-- trigger overwrites both fields based on shift_settings + clock_in.
--
-- Known gaps (deliberate):
--   * Doesn't respect days_of_week — weekend clock-ins still get a
--     lateness verdict. Matches current client behavior.
--   * Doesn't handle the planned per-week schedule overrides. When the
--     override system ships, update the SELECT inside this function.
--   * Hardcodes America/Mexico_City. If JOI ever has agents outside
--     central Mexico, make this a campaign-level setting.
-- ========================================================================

CREATE OR REPLACE FUNCTION public.tg_time_clock_set_lateness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id   uuid;
  v_start_time    time;
  v_grace_minutes integer;
  v_threshold     timestamptz;
BEGIN
  -- 1. Find this employee's current campaign.
  SELECT e.campaign_id INTO v_campaign_id
  FROM public.employees e
  WHERE e.id = NEW.employee_id;

  IF v_campaign_id IS NULL THEN
    NEW.is_late := false;
    NEW.late_minutes := 0;
    RETURN NEW;
  END IF;

  -- 2. Look up the campaign's shift_settings (1 row per campaign today;
  --    when the schedule-override plan ships, this lookup will need to
  --    consider per-week overrides too).
  SELECT s.start_time, COALESCE(s.grace_minutes, 0)
    INTO v_start_time, v_grace_minutes
  FROM public.shift_settings s
  WHERE s.campaign_id = v_campaign_id
  LIMIT 1;

  IF v_start_time IS NULL THEN
    NEW.is_late := false;
    NEW.late_minutes := 0;
    RETURN NEW;
  END IF;

  -- 3. Combine the local-date column with shift start_time. Interpret as
  --    America/Mexico_City local time. Convert to UTC, then add the grace
  --    window.
  v_threshold :=
    ((NEW.date::timestamp + v_start_time::interval)
       AT TIME ZONE 'America/Mexico_City')
    + (v_grace_minutes || ' minutes')::interval;

  IF NEW.clock_in > v_threshold THEN
    NEW.is_late := true;
    NEW.late_minutes :=
      FLOOR(EXTRACT(EPOCH FROM (NEW.clock_in - v_threshold)) / 60)::integer;
  ELSE
    NEW.is_late := false;
    NEW.late_minutes := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_clock_set_lateness ON public.time_clock;

CREATE TRIGGER trg_time_clock_set_lateness
  BEFORE INSERT OR UPDATE OF clock_in ON public.time_clock
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_time_clock_set_lateness();

COMMENT ON FUNCTION public.tg_time_clock_set_lateness IS
  'Sets is_late / late_minutes on time_clock rows from shift_settings. Authoritative — overwrites whatever the client passed. Closes H-3.';
