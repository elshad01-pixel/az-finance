-- ============================================================
-- AzFinance – Company Settings migration
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE company_settings (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) UNIQUE NOT NULL DEFAULT auth.uid(),
  company_name    TEXT NOT NULL DEFAULT '',
  company_address TEXT NOT NULL DEFAULT '',
  city            TEXT NOT NULL DEFAULT '',
  tax_id          TEXT NOT NULL DEFAULT '',   -- VÖEN
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  bank_name       TEXT NOT NULL DEFAULT '',
  bank_account    TEXT NOT NULL DEFAULT '',
  swift_code      TEXT NOT NULL DEFAULT '',   -- SWIFT / BIK
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reuse the update_updated_at function (already created in tax_settings_migration.sql)
CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_company_settings" ON company_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
