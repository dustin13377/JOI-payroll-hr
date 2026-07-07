-- Add applied_position: the exact "Position you are applying for" value from
-- the application form, stored verbatim.
--
-- Why: role_interest is a fixed 5-value legacy set (b2b_setter, funding_activation,
-- customer_reactivation, ai_automation, ai_operations). Any newer role fed in from
-- the Job Postings plugin (Production Designer, Project Manager, etc.) had no valid
-- enum value, so the parser dropped it to NULL and the candidate's applied role
-- showed blank. applied_position accepts ANY role text and is the source of truth
-- for the applied-for role shown in the recruiting UI.
--
-- Backfilled from raw_email_body for existing rows at deploy time.

ALTER TABLE public.recruiting_candidates
  ADD COLUMN IF NOT EXISTS applied_position text;

COMMENT ON COLUMN public.recruiting_candidates.applied_position IS
  'Exact "Position you are applying for" value from the application form, stored verbatim. Unlike role_interest (fixed 5-value legacy set), accepts any role so new Job Postings roles are never dropped. Source of truth for the applied-for role in the recruiting UI.';
