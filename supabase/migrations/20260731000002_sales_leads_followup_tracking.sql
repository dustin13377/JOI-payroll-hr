-- Sales leads: follow-up email sequence tracking.
--
-- Adds the fields the "run the leads" assistant writes as it works each lead
-- through the 4-email BPO follow-up sequence, so the /sales pipeline shows
-- which email a lead is on (and flags live replies) instead of just "contacted".
--
-- All additive. Nothing here is destructive; existing rows default to step 0.

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS followup_step         smallint NOT NULL DEFAULT 0
    CHECK (followup_step BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS followup_last_sent_at date,
  ADD COLUMN IF NOT EXISTS followup_paused       boolean  NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales_leads.followup_step IS
  'Last follow-up email sent in the 4-email BPO sequence (0 = none, 1-4).';
COMMENT ON COLUMN public.sales_leads.followup_last_sent_at IS
  'Date the last follow-up email went out.';
COMMENT ON COLUMN public.sales_leads.followup_paused IS
  'True when the lead replied and a human should take over; pauses the sequence.';
