-- ================================================================
-- 016_fix_member_insert_policy.sql
-- Run in Supabase SQL Editor
-- ================================================================
-- Adds a direct INSERT policy so CompanyContext can create the
-- initial company + membership without depending solely on the
-- SECURITY DEFINER RPC (which may fail in some Supabase configs).
-- ================================================================

-- Allow a user to insert themselves as admin into a company they own.
-- Safe because: (1) user_id must equal auth.uid(), (2) role must be 'admin',
-- (3) the company's owner_id must match the calling user.
DROP POLICY IF EXISTS "members_owner_self_insert" ON company_members;

CREATE POLICY "members_owner_self_insert" ON company_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'admin'
    AND EXISTS (
      SELECT 1 FROM companies
      WHERE id = company_members.company_id
        AND owner_id = auth.uid()
    )
  );

-- Also allow reading pending invitations by token so the signup page
-- can call get_invitation_by_token() even before the user is in a company.
-- (The function is already SECURITY DEFINER + GRANT TO anon, this is belt-and-suspenders.)
GRANT EXECUTE ON FUNCTION get_invitation_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ensure_user_has_company()      TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_company_id()            TO authenticated;
