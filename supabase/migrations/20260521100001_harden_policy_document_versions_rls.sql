-- Harden policy_document_versions SELECT policy.
--
-- Previous policy (from 20260420700001_c1_tighten_rls.sql) relied on
-- policy_documents RLS to filter by org:
--
--   USING (is_leadership() OR policy_document_id IN (SELECT id FROM policy_documents))
--
-- This is correct but fragile — a future change to policy_documents RLS could
-- silently break the cross-org guarantee here.  Replace with a direct org
-- check so this table stands on its own.

DROP POLICY IF EXISTS "authenticated_select_versions_inherit" ON public.policy_document_versions;

CREATE POLICY "authenticated_select_versions_hardened"
  ON public.policy_document_versions FOR SELECT TO authenticated
  USING (
    public.is_leadership()
    OR EXISTS (
      SELECT 1
      FROM public.policy_documents pd
      JOIN public.user_profiles up ON up.organization_id = pd.organization_id
      WHERE pd.id = policy_document_versions.policy_document_id
        AND up.id = auth.uid()
    )
  );
