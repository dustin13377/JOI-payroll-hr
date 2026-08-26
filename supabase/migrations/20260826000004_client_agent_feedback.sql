-- Client-to-JOI feedback about a specific agent. Populated from the client
-- portal's Team drilldown. Three flavors:
--   * note  — client just wants to leave context ("Juan is doing great")
--   * question  — client is asking about the agent ("why was Ana out Tuesday?")
--   * write_up_request  — client wants JOI to formally write the agent up
-- Read on JOI's internal side is HR-owned (leadership sees everything);
-- clients can only see their own submissions.

CREATE TYPE public.client_agent_feedback_type AS ENUM (
  'note',
  'question',
  'write_up_request'
);

CREATE TYPE public.client_agent_feedback_status AS ENUM (
  'open',
  'acknowledged',
  'resolved'
);

CREATE TABLE IF NOT EXISTS public.client_agent_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type         public.client_agent_feedback_type NOT NULL,
  body         text NOT NULL,
  status       public.client_agent_feedback_status NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  CONSTRAINT client_agent_feedback_body_nonblank CHECK (length(btrim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS client_agent_feedback_client_id_idx
  ON public.client_agent_feedback (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_agent_feedback_employee_id_idx
  ON public.client_agent_feedback (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_agent_feedback_open_idx
  ON public.client_agent_feedback (status, created_at DESC)
  WHERE status <> 'resolved';

ALTER TABLE public.client_agent_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_agent_feedback_leadership_all
  ON public.client_agent_feedback
  FOR ALL TO authenticated
  USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

CREATE POLICY client_agent_feedback_client_read
  ON public.client_agent_feedback
  FOR SELECT TO authenticated
  USING (public.is_client() AND client_id = public.my_client_id());

CREATE POLICY client_agent_feedback_client_insert
  ON public.client_agent_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_client()
    AND client_id = public.my_client_id()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.employees_client_view v
      WHERE v.id::text = client_agent_feedback.employee_id::text
    )
  );

COMMENT ON TABLE public.client_agent_feedback IS
  'Client-submitted note/question/write-up-request about a specific agent, targeted from the client portal Team drilldown. HR reads on the internal side.';
