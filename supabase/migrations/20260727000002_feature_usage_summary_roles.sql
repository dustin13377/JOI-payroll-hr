-- ============================================================================
-- Feature usage: per-role breakdown + active-user count
--
-- Extends get_feature_usage_summary with a `roles` jsonb ({role: distinct_users})
-- so the Usage dashboard can show WHO uses each feature (by role), and adds
-- get_feature_usage_active_users for headcount context ("used by 3 of 41").
-- Both owner-guarded, same as before.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_feature_usage_summary(integer);

CREATE FUNCTION public.get_feature_usage_summary(days_back integer DEFAULT 30)
RETURNS TABLE (
  path text,
  opens bigint,
  unique_users bigint,
  last_used timestamptz,
  roles jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH ev AS (
    SELECT e.path, e.user_id, COALESCE(e.role, 'unknown') AS role, e.created_at
    FROM public.feature_usage_events e
    WHERE e.created_at >= now() - make_interval(days => days_back)
      AND e.event_type = 'page_view'
  )
  SELECT
    ev.path,
    count(*)::bigint                          AS opens,
    count(DISTINCT ev.user_id)::bigint        AS unique_users,
    max(ev.created_at)                         AS last_used,
    (
      SELECT jsonb_object_agg(r.role, r.cnt)
      FROM (
        SELECT ev2.role, count(DISTINCT ev2.user_id) AS cnt
        FROM ev ev2
        WHERE ev2.path = ev.path
        GROUP BY ev2.role
      ) r
    )                                          AS roles
  FROM ev
  GROUP BY ev.path
  ORDER BY count(DISTINCT ev.user_id) ASC, count(*) ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_feature_usage_summary(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_feature_usage_summary(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_feature_usage_active_users(days_back integer DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT count(DISTINCT user_id) INTO n
  FROM public.feature_usage_events
  WHERE created_at >= now() - make_interval(days => days_back)
    AND event_type = 'page_view';
  RETURN COALESCE(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_feature_usage_active_users(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_feature_usage_active_users(integer) TO authenticated;
