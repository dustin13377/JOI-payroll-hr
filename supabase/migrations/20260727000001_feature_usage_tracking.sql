-- ============================================================================
-- Feature usage tracking
--
-- Goal: know which parts of the app get used, underused, or never touched, so
-- we can trim dead features with data instead of guesswork.
--
-- One row per page opened. We store WHICH section was opened, WHO opened it
-- (user + employee + role, stamped server-side so it can't be spoofed), and
-- WHEN. We deliberately do NOT store the sensitive contents of a page (e.g.
-- salary amounts) — only that the route was visited. Dynamic ids are collapsed
-- client-side (/empleados/JOI-0136 -> /empleados/:id) before insert, so this
-- table never records which specific employee/invoice someone looked at.
--
-- Writes come from a direct client INSERT (fire-and-forget in a React hook), so
-- the table carries an INSERT policy. Reads are owner-only (is_owner()), same
-- as the rest of the /admin analytics surface.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Auth user who triggered the event (stamped from auth.uid() by the trigger).
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Employee behind that auth user, for role/tenure slicing later.
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  -- Title/role at the time of the event (denormalized so reports don't re-join).
  role text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Normalized route, e.g. '/empleados/:id'. Bounded to keep junk out.
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 300),
  -- 'page_view' today; leaves room for 'action' (specific button) in phase 2.
  event_type text NOT NULL DEFAULT 'page_view',
  -- Optional key for action events (unused for page views).
  action_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fue_path_created
  ON public.feature_usage_events (path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fue_created
  ON public.feature_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fue_event_type
  ON public.feature_usage_events (event_type);

-- ── Server-side identity stamping ───────────────────────────────────────────
-- Mirrors sda_fill_defaults: the client sends only { path, event_type }. We
-- fill user/employee/role/org from the caller's profile so none of it can be
-- forged, and the org can't be spoofed.
CREATE OR REPLACE FUNCTION public.fue_fill_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.user_id := auth.uid();

  SELECT up.employee_id, e.organization_id, e.title
    INTO NEW.employee_id, NEW.organization_id, NEW.role
  FROM public.user_profiles up
  LEFT JOIN public.employees e ON e.id = up.employee_id
  WHERE up.id = auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fue_fill_defaults ON public.feature_usage_events;
CREATE TRIGGER trg_fue_fill_defaults
  BEFORE INSERT ON public.feature_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.fue_fill_defaults();

ALTER TABLE public.feature_usage_events ENABLE ROW LEVEL SECURITY;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- INSERT: any authenticated user may log their own events. The trigger has
-- already set user_id = auth.uid() by the time this WITH CHECK runs.
DROP POLICY IF EXISTS "user_insert_own_usage_event" ON public.feature_usage_events;
CREATE POLICY "user_insert_own_usage_event"
  ON public.feature_usage_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SELECT: owner only (analytics is an owner-level concern). Individual users
-- do NOT get to read their own trail here — it isn't shown to them anywhere.
DROP POLICY IF EXISTS "owner_select_usage_events" ON public.feature_usage_events;
CREATE POLICY "owner_select_usage_events"
  ON public.feature_usage_events FOR SELECT TO authenticated
  USING (public.is_owner());

-- No UPDATE/DELETE policies — usage events are append-only.

COMMENT ON TABLE public.feature_usage_events IS
  'Append-only page-view log for feature-usage analytics. Records that a route '
  'was opened (never the sensitive contents). Reads are owner-only.';

-- ── Summary RPC ─────────────────────────────────────────────────────────────
-- Per-feature rollup for the Usage dashboard. SECURITY DEFINER + explicit owner
-- guard so the aggregation runs regardless of row-level policies but stays
-- owner-only. days_back windows the report (e.g. last 30 days).
CREATE OR REPLACE FUNCTION public.get_feature_usage_summary(days_back integer DEFAULT 30)
RETURNS TABLE (
  path text,
  opens bigint,
  unique_users bigint,
  last_used timestamptz
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
  SELECT
    fue.path,
    count(*)::bigint                        AS opens,
    count(DISTINCT fue.user_id)::bigint     AS unique_users,
    max(fue.created_at)                      AS last_used
  FROM public.feature_usage_events fue
  WHERE fue.created_at >= now() - make_interval(days => days_back)
    AND fue.event_type = 'page_view'
  GROUP BY fue.path
  ORDER BY opens DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_feature_usage_summary(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_feature_usage_summary(integer) TO authenticated;
