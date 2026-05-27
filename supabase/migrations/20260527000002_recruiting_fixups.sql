-- Recruiting tables fixups: trigger function hardening + inbound message status.

-- 1. Re-define trigger functions with SECURITY DEFINER + locked search_path.
CREATE OR REPLACE FUNCTION public.recruiting_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recruiting_set_stage_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Replace status CHECK constraint to add 'received' for inbound messages.
ALTER TABLE public.recruiting_messages
  DROP CONSTRAINT IF EXISTS recruiting_messages_status_check;

ALTER TABLE public.recruiting_messages
  ADD CONSTRAINT recruiting_messages_status_check
  CHECK (status IN ('sent','failed','link_generated','received'));
