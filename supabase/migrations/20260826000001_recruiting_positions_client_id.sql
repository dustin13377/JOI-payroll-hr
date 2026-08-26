-- Attach recruiting positions to a client so applicants can be routed to
-- the right client portal automatically. Nullable — internal-only roles
-- (Recruiter, HR, etc.) stay unassigned.

ALTER TABLE public.recruiting_positions
  ADD COLUMN IF NOT EXISTS client_id uuid
    REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS recruiting_positions_client_id_idx
  ON public.recruiting_positions (client_id);

COMMENT ON COLUMN public.recruiting_positions.client_id IS
  'Client this position recruits for. NULL = internal role. Drives which applicants show up in the client portal via applied_position match.';
