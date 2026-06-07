-- ================================================================
-- 048_create_company_rpc.sql
--
-- Two-part fix for new-tenant creation failures:
--
-- Part A: Nuclear RLS cleanup — drop ALL INSERT policies on the
--   four tables touched during company setup, then recreate simple
--   permissive ones. This handles any variant of policy names left
--   behind by earlier migrations.
--
-- Part B: create_company_for_user() SECURITY DEFINER RPC — does
--   all four inserts in one atomic call that bypasses RLS entirely
--   (auth.uid() is still available inside SECURITY DEFINER).
-- ================================================================

-- ── Part A: nuclear policy cleanup ────────────────────────────────────────────

-- companies: drop every INSERT policy, recreate
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE tablename = 'companies' AND schemaname = 'public' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', r.policyname);
    RAISE NOTICE 'Dropped companies INSERT policy: %', r.policyname;
  END LOOP;
END $$;

CREATE POLICY "companies_insert" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- company_members: drop every INSERT policy, recreate
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE tablename = 'company_members' AND schemaname = 'public' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_members', r.policyname);
    RAISE NOTICE 'Dropped company_members INSERT policy: %', r.policyname;
  END LOOP;
END $$;

CREATE POLICY "members_insert" ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- company_settings: drop every ALL/INSERT policy, recreate
-- The old WITH CHECK (company_id = get_my_company_id()) blocks the
-- setup-flow insert because the member row doesn't exist yet.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE tablename = 'company_settings' AND schemaname = 'public'
      AND cmd IN ('INSERT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_settings', r.policyname);
    RAISE NOTICE 'Dropped company_settings policy: %', r.policyname;
  END LOOP;
END $$;

CREATE POLICY "company_settings_policy" ON public.company_settings
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (
    company_id = get_my_company_id()
    OR EXISTS (
      SELECT 1 FROM public.companies
      WHERE id = company_settings.company_id AND owner_id = auth.uid()
    )
  );

-- tax_settings: same fix
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE tablename = 'tax_settings' AND schemaname = 'public'
      AND cmd IN ('INSERT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tax_settings', r.policyname);
    RAISE NOTICE 'Dropped tax_settings policy: %', r.policyname;
  END LOOP;
END $$;

CREATE POLICY "company_tax_settings" ON public.tax_settings
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (
    company_id = get_my_company_id()
    OR EXISTS (
      SELECT 1 FROM public.companies
      WHERE id = tax_settings.company_id AND owner_id = auth.uid()
    )
  );

-- ── Part B: atomic SECURITY DEFINER RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION create_company_for_user(
  p_name             TEXT,
  p_industry         TEXT    DEFAULT NULL,
  p_tax_id           TEXT    DEFAULT NULL,
  p_tax_regime       TEXT    DEFAULT 'profit_tax',
  p_vat_registered   BOOLEAN DEFAULT false,
  p_accounting_method TEXT   DEFAULT 'accrual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_email      TEXT;
  v_company_id UUID;
BEGIN
  -- Must be authenticated
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Guard: user must not already have a company
  IF EXISTS (
    SELECT 1 FROM company_members
    WHERE user_id = v_uid AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'User already has a company');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- 1. Create company
  INSERT INTO companies (name, owner_id, tax_id)
  VALUES (p_name, v_uid, NULLIF(trim(COALESCE(p_tax_id, '')), ''))
  RETURNING id INTO v_company_id;

  -- 2. Add caller as admin member
  INSERT INTO company_members (company_id, user_id, role, status, invited_email)
  VALUES (v_company_id, v_uid, 'admin', 'active', v_email);

  -- 3. Company settings
  INSERT INTO company_settings (company_id, currency, accounting_method, industry)
  VALUES (v_company_id, 'AZN', p_accounting_method, NULLIF(trim(COALESCE(p_industry, '')), ''));

  -- 4. Tax settings
  INSERT INTO tax_settings (
    company_id, tax_regime, business_type, vat_registered,
    simplified_eligible, payroll_sector, employee_count
  )
  VALUES (
    v_company_id, p_tax_regime, 'general', p_vat_registered,
    false, 'private_non_oil', 1
  );

  RETURN jsonb_build_object('ok', true, 'company_id', v_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_company_for_user TO authenticated;
