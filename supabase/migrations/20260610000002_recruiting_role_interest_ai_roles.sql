-- Form dropdowns added 2026-06-10 include two new AI roles.
-- Widen role_interest to accept them.
-- (Already applied to production via MCP on 2026-06-10.)
ALTER TABLE recruiting_candidates
  DROP CONSTRAINT recruiting_candidates_role_interest_check;

ALTER TABLE recruiting_candidates
  ADD CONSTRAINT recruiting_candidates_role_interest_check
  CHECK (
    role_interest = ANY (ARRAY[
      'b2b_setter'::text,
      'funding_activation'::text,
      'customer_reactivation'::text,
      'ai_automation'::text,
      'ai_operations'::text
    ]) OR role_interest IS NULL
  );
