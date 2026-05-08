-- ============================================================
-- AzFinance – Auth migration
-- Run this in the Supabase SQL Editor AFTER running schema.sql
-- ============================================================

-- ── 1. Add user_id column to all three tables ─────────────────
-- DEFAULT auth.uid() means Supabase auto-fills it on every INSERT
-- when the user is authenticated — no client-side changes needed.

ALTER TABLE clients  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- ── 2. Replace open policies with per-user policies ───────────

DROP POLICY IF EXISTS "anon_all" ON clients;
DROP POLICY IF EXISTS "anon_all" ON invoices;
DROP POLICY IF EXISTS "anon_all" ON expenses;

CREATE POLICY "users_own_clients"  ON clients  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_invoices" ON invoices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_expenses" ON expenses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. Claim the existing seed data ──────────────────────────
-- The seed data has user_id = NULL so it won't appear after login.
-- To transfer it to your account:
--   a) Sign up in the app first
--   b) Find your user ID: Supabase Dashboard → Authentication → Users
--   c) Run the three UPDATE statements below, replacing <YOUR-USER-ID>

-- UPDATE clients  SET user_id = '<YOUR-USER-ID>' WHERE user_id IS NULL;
-- UPDATE invoices SET user_id = '<YOUR-USER-ID>' WHERE user_id IS NULL;
-- UPDATE expenses SET user_id = '<YOUR-USER-ID>' WHERE user_id IS NULL;
