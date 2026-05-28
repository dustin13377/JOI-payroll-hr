/*
 * Fix: my_team_member_ids() now UNIONs team_lead_campaigns
 *
 * Background
 * ----------
 * The cross-campaign TL system (team_lead_campaigns join table, added
 * 2026-05-18) updated my_tl_campaign_ids() to UNION both the legacy
 * campaigns.team_lead_id and the new join table, but the matching
 * my_team_member_ids() function was missed.
 *
 * Result: TLs whose only campaign linkage is via team_lead_campaigns
 * (e.g. Adrian Arechiga — 3 Torro campaigns via join table, 0 via
 * reports_to, 0 via primary team_lead_id) saw an empty roster in every
 * TL view — Today's Roster, Attendance counts, Missing-yesterday EOD,
 * EOD Week table, Alerts, Pending Time Off, Nudges, Underperformer Trend.
 *
 * Fix
 * ---
 * Add a second branch: include any active 'agent' whose campaign_id is
 * in my_tl_campaign_ids(). Excludes other TLs/managers in shared campaigns
 * to keep team counts meaningful (Adrian's roster shouldn't include
 * Javier just because they share SLOC Weekday).
 *
 * CREATE OR REPLACE — no downtime, no destructive change.
 * Apply via MCP SQL editor (per project convention).
 */

CREATE OR REPLACE FUNCTION public.my_team_member_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Branch 1: direct reports (legacy, primary path)
  SELECT e.id
  FROM public.employees e
  WHERE e.reports_to = public.my_employee_id()
    AND e.organization_id = public.my_org_id()

  UNION

  -- Branch 2: agents in any campaign this TL leads
  -- (via campaigns.team_lead_id OR team_lead_campaigns join — that union
  -- is already resolved inside my_tl_campaign_ids()).
  SELECT e.id
  FROM public.employees e
  WHERE e.campaign_id IN (SELECT public.my_tl_campaign_ids())
    AND e.organization_id = public.my_org_id()
    AND e.title = 'agent';
$$;

NOTIFY pgrst, 'reload schema';
