-- Phase: client holidays
-- Per-client US/foreign holiday calendar so agents on closed-client days
-- aren't marked missed. LFT statutory holidays stay in company_holidays /
-- mexican_holidays. No premium pay if worked — just suppresses absence.
--
-- Applied 2026-05-25 via Supabase MCP apply_migration (this file added
-- after-the-fact for source-control parity).

CREATE TABLE public.client_holidays (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  name            text        NOT NULL,
  organization_id uuid        NOT NULL,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, date)
);

CREATE INDEX idx_client_holidays_date ON public.client_holidays (date);
CREATE INDEX idx_client_holidays_client ON public.client_holidays (client_id);

ALTER TABLE public.client_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_holidays_read" ON public.client_holidays
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "client_holidays_leadership_write" ON public.client_holidays
  FOR ALL USING (public.is_leadership())
  WITH CHECK (public.is_leadership());

-- Seed today's holiday: Memorial Day for Torro
INSERT INTO public.client_holidays (client_id, date, name, organization_id)
SELECT id, '2026-05-25', 'Memorial Day (US)', organization_id
FROM public.clients
WHERE name = 'Torro'
ON CONFLICT (client_id, date) DO NOTHING;
