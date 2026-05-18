-- ================================================================
-- 019_fix_accept_invitation.sql
-- Run in Supabase SQL Editor
-- ================================================================
-- Adds the "already a member" guard back to accept_invitation().
-- Without it, if the user already has an active membership in the
-- same company (edge case), the UPDATE hits the unique index on
-- (company_id, user_id) and throws a constraint error.
-- ================================================================

CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT cm.*, c.name AS company_name INTO v_row
  FROM company_members cm
  JOIN companies c ON c.id = cm.company_id
  WHERE cm.token = p_token AND cm.status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation');
  END IF;

  IF LOWER(v_row.invited_email) != LOWER(auth.jwt() ->> 'email') THEN
    RETURN jsonb_build_object('error', 'Email mismatch');
  END IF;

  -- If already an active member of this company, just delete the pending row
  IF EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = v_row.company_id
      AND user_id    = auth.uid()
      AND status     = 'active'
  ) THEN
    DELETE FROM company_members WHERE token = p_token;
    RETURN jsonb_build_object('ok', true, 'already_member', true, 'company_id', v_row.company_id);
  END IF;

  -- Activate the pending row: set real user_id, clear token
  UPDATE company_members
  SET user_id = auth.uid(),
      status  = 'active',
      token   = NULL
  WHERE token = p_token;

  RETURN jsonb_build_object('ok', true, 'company_id', v_row.company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invitation(TEXT) TO authenticated;
