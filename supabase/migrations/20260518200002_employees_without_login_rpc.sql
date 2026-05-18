-- ============================================================================
-- employees_without_login(p_campaign_id) RPC
--
-- Returns the IDs of active employees on a campaign who do NOT have a
-- user_profiles row (i.e. no Supabase Auth account yet). Used by the TL
-- dashboard to flag agents the TL needs to cover via submit-eod-for-agent /
-- edit-time-clock.
--
-- Why an RPC instead of a direct query: user_profiles RLS only allows
-- leadership to read all profiles, and users to read their own. A TL querying
-- user_profiles directly would get an empty result for their team. This RPC
-- runs SECURITY DEFINER so it can check membership, but applies its own
-- scope check up front.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.employees_without_login(p_campaign_id uuid)
RETURNS TABLE(employee_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_caller_emp uuid;
  v_authorized boolean := false;
BEGIN
  -- Pull caller's profile
  SELECT role, user_profiles.employee_id
    INTO v_caller_role, v_caller_emp
  FROM public.user_profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'No user_profile for caller';
  END IF;

  -- Leadership can call for any campaign.
  IF v_caller_role IN ('owner', 'admin', 'manager') THEN
    v_authorized := true;
  ELSIF v_caller_role = 'team_lead' THEN
    -- TL must own this campaign via employees.campaign_id OR team_lead_campaigns.
    IF EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = v_caller_emp AND e.campaign_id = p_campaign_id
    ) OR EXISTS (
      SELECT 1 FROM public.team_lead_campaigns tlc
      WHERE tlc.team_lead_id = v_caller_emp AND tlc.campaign_id = p_campaign_id
    ) THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized for this campaign';
  END IF;

  RETURN QUERY
    SELECT e.id
    FROM public.employees e
    LEFT JOIN public.user_profiles up ON up.employee_id = e.id
    WHERE e.campaign_id = p_campaign_id
      AND e.is_active = true
      AND up.id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.employees_without_login(uuid) TO authenticated;
