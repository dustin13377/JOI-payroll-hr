-- Client-portal-facing applicants view. Locked-down columns only — no notes,
-- no CURP, no phone, no assessment metadata, no assigned_to. Same pattern as
-- employees_client_view / eod_logs_client_view: explicitly enumerated, never
-- SELECT * so a future sensitive column added to recruiting_candidates cannot
-- silently leak.
--
-- Scoping: applied_position must match a role_name in recruiting_role_clients
-- whose client_id equals the caller's my_client_id(). Non-clients see all rows
-- (preserving existing internal-side query behavior).
--
-- Source (ft_source/ft_channel): pulled from the FIRST recruiting_applications
-- row per candidate — that's the first-touch attribution the ad platform
-- receives credit for.

CREATE OR REPLACE VIEW public.recruiting_candidates_client_view
WITH (security_invoker = off) AS
SELECT
  c.id,
  c.full_name,
  c.applied_position,
  c.stage,
  c.created_at,
  c.cv_url,
  ft.ft_source,
  ft.ft_channel,
  rrc.client_id
FROM public.recruiting_candidates c
JOIN public.recruiting_role_clients rrc
  ON rrc.role_name = c.applied_position
LEFT JOIN LATERAL (
  SELECT ft_source, ft_channel
    FROM public.recruiting_applications ra
   WHERE ra.candidate_id = c.id
   ORDER BY ra.received_at ASC
   LIMIT 1
) ft ON TRUE
WHERE
  public.is_leadership()
  OR (public.is_client() AND rrc.client_id = public.my_client_id());

COMMENT ON VIEW public.recruiting_candidates_client_view IS
  'Client-portal applicants view. Rows filtered to the caller''s client via recruiting_role_clients.role_name = applied_position. Non-clients (leadership) see all rows.';
