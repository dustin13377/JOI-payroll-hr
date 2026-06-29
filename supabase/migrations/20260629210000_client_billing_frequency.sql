-- Per-client billing frequency: 'weekly' (default) or 'monthly'.
--
-- Monthly clients (e.g. HFB Tech) are billed once per calendar month, up front,
-- with the prior month reconciled on the same invoice (missed-day credits +
-- prior-month spiffs). They are EXCLUDED from the weekly batch generator so the
-- same month never gets double-tracked as weeklies + a monthly invoice.
--
-- This migration only adds the flag and sets HFB. The weekly-generator exclusion
-- and the monthly RPCs ship in follow-up migrations.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'weekly'
  CHECK (billing_frequency IN ('weekly', 'monthly'));

-- HFB Tech bills monthly.
UPDATE public.clients
   SET billing_frequency = 'monthly'
 WHERE name = 'HFB Tech';
