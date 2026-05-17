-- ================================================================
-- 015_multi_user.sql — Multi-user / Team support
-- Run in Supabase SQL Editor
-- ================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. Core tables
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT         NOT NULL,
  owner_id   UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS company_members (
  id            SERIAL      PRIMARY KEY,
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL CHECK (role IN ('admin', 'manager', 'finance', 'employee')),
  invited_email TEXT,
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS company_invitations (
  id            SERIAL      PRIMARY KEY,
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_email TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('admin', 'manager', 'finance', 'employee')),
  token         TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by    UUID        REFERENCES auth.users(id),
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);

ALTER TABLE company_invitations ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- 2. Helper: get caller's company_id (used in all RLS policies)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT company_id FROM company_members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3. Add company_id column to all data tables
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE invoices            ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE expenses            ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE clients             ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE vendors             ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE employees           ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE payroll_runs        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE payroll_wd_overrides ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE company_settings    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE tax_settings        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE expense_templates   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- ─────────────────────────────────────────────────────────────────
-- 4. Migrate existing single-user data → create companies
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  cid UUID;
BEGIN
  FOR rec IN
    SELECT DISTINCT user_id FROM company_settings WHERE user_id IS NOT NULL
  LOOP
    -- Create a company using the stored company name
    INSERT INTO companies (name, owner_id)
    SELECT COALESCE(NULLIF(TRIM(company_name), ''), 'My Company'), rec.user_id
    FROM company_settings
    WHERE user_id = rec.user_id
    RETURNING id INTO cid;

    -- Add the user as admin
    INSERT INTO company_members (company_id, user_id, role, status)
    VALUES (cid, rec.user_id, 'admin', 'active')
    ON CONFLICT (company_id, user_id) DO NOTHING;

    -- Stamp company_id on all their records
    UPDATE company_settings    SET company_id = cid WHERE user_id = rec.user_id;
    UPDATE tax_settings        SET company_id = cid WHERE user_id = rec.user_id;
    UPDATE invoices            SET company_id = cid WHERE user_id = rec.user_id;
    UPDATE expenses            SET company_id = cid WHERE user_id = rec.user_id;
    UPDATE clients             SET company_id = cid WHERE user_id = rec.user_id;
    UPDATE vendors             SET company_id = cid WHERE user_id = rec.user_id;
    UPDATE payroll_runs        SET company_id = cid WHERE user_id = rec.user_id;
    UPDATE expense_templates   SET company_id = cid WHERE user_id = rec.user_id;
  END LOOP;

  -- employees and payroll_wd_overrides have no user_id → assign to the sole company
  UPDATE employees
  SET company_id = (SELECT id FROM companies LIMIT 1)
  WHERE company_id IS NULL;

  UPDATE payroll_wd_overrides
  SET company_id = (SELECT id FROM companies LIMIT 1)
  WHERE company_id IS NULL;
END;
$$;

-- Unique indexes so upsert works on company_id
CREATE UNIQUE INDEX IF NOT EXISTS company_settings_company_id_key
  ON company_settings(company_id) WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tax_settings_company_id_key
  ON tax_settings(company_id) WHERE company_id IS NOT NULL;

-- payroll_wd_overrides: drop old global unique, add company-scoped one
ALTER TABLE payroll_wd_overrides
  DROP CONSTRAINT IF EXISTS payroll_wd_overrides_year_month_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_wd_overrides_company_year_month_key'
  ) THEN
    ALTER TABLE payroll_wd_overrides
      ADD CONSTRAINT payroll_wd_overrides_company_year_month_key
      UNIQUE (company_id, year, month);
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. Auto-set company_id on INSERT via trigger
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_set_company_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := get_my_company_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_invoices_company_id
  BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_expenses_company_id
  BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_clients_company_id
  BEFORE INSERT ON clients FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_vendors_company_id
  BEFORE INSERT ON vendors FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_employees_company_id
  BEFORE INSERT ON employees FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_payroll_runs_company_id
  BEFORE INSERT ON payroll_runs FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_payroll_wd_company_id
  BEFORE INSERT ON payroll_wd_overrides FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_company_settings_company_id
  BEFORE INSERT ON company_settings FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_tax_settings_company_id
  BEFORE INSERT ON tax_settings FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
CREATE OR REPLACE TRIGGER trg_expense_templates_company_id
  BEFORE INSERT ON expense_templates FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

-- ─────────────────────────────────────────────────────────────────
-- 6. Replace all RLS policies with company-based ones
-- ─────────────────────────────────────────────────────────────────

-- Drop old policies (names from previous migrations)
DROP POLICY IF EXISTS "users_own_invoices"              ON invoices;
DROP POLICY IF EXISTS "users_own_expenses"              ON expenses;
DROP POLICY IF EXISTS "users_own_clients"               ON clients;
DROP POLICY IF EXISTS "Users manage own vendors"        ON vendors;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON employees;
DROP POLICY IF EXISTS "users_manage_payroll_runs"       ON payroll_runs;
DROP POLICY IF EXISTS "payroll_entries_auth"            ON payroll_entries;
DROP POLICY IF EXISTS "wd_overrides_select"             ON payroll_wd_overrides;
DROP POLICY IF EXISTS "wd_overrides_insert"             ON payroll_wd_overrides;
DROP POLICY IF EXISTS "wd_overrides_update"             ON payroll_wd_overrides;
DROP POLICY IF EXISTS "users_own_company_settings"      ON company_settings;
DROP POLICY IF EXISTS "users_own_tax_settings"          ON tax_settings;
DROP POLICY IF EXISTS "Users manage own templates"      ON expense_templates;
-- Also drop any expense-specific policies added in later migrations
DROP POLICY IF EXISTS "users_own_expenses_v2"           ON expenses;

-- New company-scoped policies
CREATE POLICY "company_invoices"
  ON invoices FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_expenses"
  ON expenses FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_clients"
  ON clients FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_vendors"
  ON vendors FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_employees"
  ON employees FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_payroll_runs"
  ON payroll_runs FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_payroll_entries"
  ON payroll_entries FOR ALL TO authenticated
  USING  (run_id IN (SELECT id FROM payroll_runs WHERE company_id = get_my_company_id()))
  WITH CHECK (run_id IN (SELECT id FROM payroll_runs WHERE company_id = get_my_company_id()));

CREATE POLICY "company_wd_overrides"
  ON payroll_wd_overrides FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_settings_policy"
  ON company_settings FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_tax_settings"
  ON tax_settings FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "company_templates"
  ON expense_templates FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ─────────────────────────────────────────────────────────────────
-- 7. RLS for the three new tables
-- ─────────────────────────────────────────────────────────────────

-- companies
CREATE POLICY "companies_read" ON companies
  FOR SELECT TO authenticated
  USING (id = get_my_company_id());

CREATE POLICY "companies_insert" ON companies
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "companies_update" ON companies
  FOR UPDATE TO authenticated
  USING (
    id = get_my_company_id() AND
    EXISTS (SELECT 1 FROM company_members WHERE company_id = companies.id AND user_id = auth.uid() AND role = 'admin')
  );

-- company_members: SELECT only; mutations via SECURITY DEFINER functions
CREATE POLICY "members_read" ON company_members
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

-- Allow admin to remove members (DELETE)
CREATE POLICY "members_delete" ON company_members
  FOR DELETE TO authenticated
  USING (
    company_id = get_my_company_id() AND (
      user_id = auth.uid()  -- removing self
      OR (SELECT role FROM company_members cm2 WHERE cm2.company_id = company_members.company_id AND cm2.user_id = auth.uid() AND cm2.id != company_members.id LIMIT 1) = 'admin'
    )
  );

-- company_invitations
CREATE POLICY "invitations_read" ON company_invitations
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "invitations_insert" ON company_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id() AND
    EXISTS (SELECT 1 FROM company_members WHERE company_id = company_invitations.company_id AND user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "invitations_update" ON company_invitations
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "invitations_delete" ON company_invitations
  FOR DELETE TO authenticated
  USING (
    company_id = get_my_company_id() AND
    EXISTS (SELECT 1 FROM company_members WHERE company_id = company_invitations.company_id AND user_id = auth.uid() AND role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────
-- 8. Helper functions callable from the frontend
-- ─────────────────────────────────────────────────────────────────

-- Accept an invitation by token; called by CompanyContext after login
CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_inv   RECORD;
  v_email TEXT;
BEGIN
  SELECT ci.*, c.name AS company_name INTO v_inv
  FROM company_invitations ci
  JOIN companies c ON c.id = ci.company_id
  WHERE ci.token = p_token AND ci.status = 'pending' AND ci.expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  IF LOWER(v_inv.invited_email) != LOWER(v_email) THEN
    RETURN jsonb_build_object('error', 'Email mismatch');
  END IF;

  -- Already a member → just mark accepted
  IF EXISTS (SELECT 1 FROM company_members WHERE company_id = v_inv.company_id AND user_id = auth.uid()) THEN
    UPDATE company_invitations SET status = 'accepted' WHERE token = p_token;
    RETURN jsonb_build_object('ok', true, 'already_member', true);
  END IF;

  INSERT INTO company_members (company_id, user_id, role, invited_email, status)
  VALUES (v_inv.company_id, auth.uid(), v_inv.role, v_inv.invited_email, 'active');

  UPDATE company_invitations SET status = 'accepted' WHERE token = p_token;

  RETURN jsonb_build_object('ok', true, 'company_id', v_inv.company_id);
END;
$$;

-- Auto-create a company for a first-time user with no membership
CREATE OR REPLACE FUNCTION ensure_user_has_company()
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company_id   UUID;
  v_company_name TEXT;
BEGIN
  -- Already a member?
  SELECT company_id INTO v_company_id
  FROM company_members WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF FOUND THEN RETURN v_company_id; END IF;

  -- Use existing company_settings name if available
  SELECT company_name INTO v_company_name
  FROM company_settings WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO companies (name, owner_id)
  VALUES (COALESCE(NULLIF(TRIM(v_company_name), ''), 'My Company'), auth.uid())
  RETURNING id INTO v_company_id;

  INSERT INTO company_members (company_id, user_id, role, status)
  VALUES (v_company_id, auth.uid(), 'admin', 'active');

  -- Link existing settings rows if any
  UPDATE company_settings SET company_id = v_company_id WHERE user_id = auth.uid() AND company_id IS NULL;
  UPDATE tax_settings     SET company_id = v_company_id WHERE user_id = auth.uid() AND company_id IS NULL;
  UPDATE invoices         SET company_id = v_company_id WHERE user_id = auth.uid() AND company_id IS NULL;
  UPDATE expenses         SET company_id = v_company_id WHERE user_id = auth.uid() AND company_id IS NULL;
  UPDATE clients          SET company_id = v_company_id WHERE user_id = auth.uid() AND company_id IS NULL;
  UPDATE vendors          SET company_id = v_company_id WHERE user_id = auth.uid() AND company_id IS NULL;
  UPDATE payroll_runs     SET company_id = v_company_id WHERE user_id = auth.uid() AND company_id IS NULL;
  UPDATE expense_templates SET company_id = v_company_id WHERE user_id = auth.uid() AND company_id IS NULL;

  RETURN v_company_id;
END;
$$;

-- Public lookup by token for signup page pre-fill (callable by anon)
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token TEXT)
RETURNS TABLE(company_name TEXT, role TEXT, invited_email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT c.name, ci.role, ci.invited_email
  FROM company_invitations ci
  JOIN companies c ON c.id = ci.company_id
  WHERE ci.token = p_token
    AND ci.status = 'pending'
    AND ci.expires_at > NOW()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_invitation_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_user_has_company()      TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_company_id()            TO authenticated;
