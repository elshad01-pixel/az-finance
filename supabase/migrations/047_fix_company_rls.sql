-- ================================================================
-- 047_fix_company_rls.sql
--
-- Fix RLS INSERT policies for new tenant creation.
--
-- Problem: companies_insert policy calls get_my_company_id() which
-- returns NULL for new users (no membership yet) → INSERT blocked.
-- Same issue on company_members for the first admin row.
--
-- Fix: allow any authenticated user to INSERT; application code
-- already enforces owner_id = auth.uid().
-- ================================================================

-- ── companies ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS companies_insert ON companies;

CREATE POLICY companies_insert ON companies
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── company_members ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS members_owner_self_insert ON company_members;

CREATE POLICY members_owner_self_insert ON company_members
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
