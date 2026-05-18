-- ================================================================
-- 017_fix_invitation_rls.sql
-- Run in Supabase SQL Editor
-- ================================================================
-- The invitations_read and invitations_update policies contained:
--   (SELECT email FROM auth.users WHERE id = auth.uid())
-- The `authenticated` role lacks SELECT on auth.users, so any
-- INSERT...RETURNING that evaluates the SELECT policy fails with
-- "permission denied for table users".
--
-- Fix: use auth.jwt() ->> 'email' which reads the caller's email
-- directly from the JWT claims — no table access required.
-- ================================================================

DROP POLICY IF EXISTS "invitations_read"   ON company_invitations;
DROP POLICY IF EXISTS "invitations_update" ON company_invitations;

CREATE POLICY "invitations_read" ON company_invitations
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR invited_email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "invitations_update" ON company_invitations
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    OR invited_email = (auth.jwt() ->> 'email')
  );
