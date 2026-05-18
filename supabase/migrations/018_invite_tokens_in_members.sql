-- ================================================================
-- 018_invite_tokens_in_members.sql
-- Run in Supabase SQL Editor
-- ================================================================
-- Replaces the separate company_invitations flow with a simpler
-- approach: pending invitations are rows in company_members with
-- user_id = NULL and status = 'pending'. A token column is added
-- for the signup link. No auth.admin, no email sending.
--
-- Flow:
--   Admin fills form → pending row inserted → Copy Link shown
--   Invited user opens /signup?invite=TOKEN → signs up
--   CompanyContext calls accept_invitation(token) → row activated
-- ================================================================

-- ── 1. Add token column to company_members ────────────────────────

ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS token TEXT;

-- Unique index (NULLs are excluded, so active members are fine)
CREATE UNIQUE INDEX IF NOT EXISTS company_members_token_unique
  ON company_members(token)
  WHERE token IS NOT NULL;

-- Auto-generate token for pending rows on INSERT
CREATE OR REPLACE FUNCTION set_invitation_token()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.token IS NULL THEN
    NEW.token := encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_company_members_token
  BEFORE INSERT ON company_members
  FOR EACH ROW EXECUTE FUNCTION set_invitation_token();

-- ── 2. Allow user_id to be NULL for pending invitations ───────────

ALTER TABLE company_members
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop old FK (required before re-adding as nullable)
ALTER TABLE company_members
  DROP CONSTRAINT IF EXISTS company_members_user_id_fkey;

ALTER TABLE company_members
  ADD CONSTRAINT company_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Replace the unique constraint with a partial index
-- (NULL = NULL is not unique in Postgres, but this makes intent explicit)
ALTER TABLE company_members
  DROP CONSTRAINT IF EXISTS company_members_company_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS company_members_company_user_unique
  ON company_members(company_id, user_id)
  WHERE user_id IS NOT NULL;

-- Prevent duplicate pending invitations for the same email per company
CREATE UNIQUE INDEX IF NOT EXISTS company_members_pending_email_unique
  ON company_members(company_id, LOWER(invited_email))
  WHERE status = 'pending';

-- ── 3. RLS: allow admins to insert pending rows ───────────────────

DROP POLICY IF EXISTS "members_admin_invite" ON company_members;

CREATE POLICY "members_admin_invite" ON company_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL
    AND status = 'pending'
    AND company_id = get_my_company_id()
    AND (
      SELECT cm.role FROM company_members cm
      WHERE cm.company_id = company_members.company_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
      LIMIT 1
    ) = 'admin'
  );

-- ── 4. RLS: allow invited users to read their own pending row ─────
-- (needed so CompanyContext can find the token on first login)

DROP POLICY IF EXISTS "members_read" ON company_members;

CREATE POLICY "members_read" ON company_members
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR (
      status = 'pending'
      AND LOWER(invited_email) = LOWER(auth.jwt() ->> 'email')
    )
  );

-- ── 5. Update accept_invitation() to use company_members ──────────

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

  -- Activate the pending row: set real user_id, clear token
  UPDATE company_members
  SET user_id = auth.uid(),
      status  = 'active',
      token   = NULL
  WHERE token = p_token;

  RETURN jsonb_build_object('ok', true, 'company_id', v_row.company_id);
END;
$$;

-- ── 6. Update get_invitation_by_token() to use company_members ────

CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token TEXT)
RETURNS TABLE(company_name TEXT, role TEXT, invited_email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT c.name, cm.role, cm.invited_email
  FROM company_members cm
  JOIN companies c ON c.id = cm.company_id
  WHERE cm.token = p_token
    AND cm.status = 'pending'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_invitation_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT)        TO authenticated;
