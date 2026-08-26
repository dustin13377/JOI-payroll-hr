-- Maps a role name (candidate.applied_position — the exact string from the
-- ad URL's ?position=… param) to the client it recruits for. Drives the
-- client portal: an applicant becomes visible to a client when their
-- applied_position matches a row here for that client.
--
-- Kept separate from recruiting_positions on purpose: recruiting_positions
-- is the free-form tag list for position_fits (recruiter categorization),
-- while this table is the source of truth for role→client routing.

CREATE TABLE IF NOT EXISTS public.recruiting_role_clients (
  role_name  text PRIMARY KEY,
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recruiting_role_clients_client_id_idx
  ON public.recruiting_role_clients (client_id);

CREATE OR REPLACE FUNCTION public.recruiting_role_clients_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recruiting_role_clients_touch ON public.recruiting_role_clients;
CREATE TRIGGER recruiting_role_clients_touch
  BEFORE UPDATE ON public.recruiting_role_clients
  FOR EACH ROW EXECUTE FUNCTION public.recruiting_role_clients_touch_updated_at();

ALTER TABLE public.recruiting_role_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY recruiting_role_clients_leadership_all
  ON public.recruiting_role_clients
  FOR ALL TO authenticated
  USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

CREATE POLICY recruiting_role_clients_client_read
  ON public.recruiting_role_clients
  FOR SELECT TO authenticated
  USING (public.is_client() AND client_id = public.my_client_id());

COMMENT ON TABLE public.recruiting_role_clients IS
  'Maps applied_position role name -> client. Presence = assigned to that client. Absence = unassigned. Drives applicant visibility in the client portal.';
