-- ============================================================
-- AzFinance – Tax Settings migration
-- Run this in the Supabase SQL Editor AFTER auth_migration.sql
-- ============================================================

CREATE TABLE tax_settings (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID REFERENCES auth.users(id) UNIQUE NOT NULL DEFAULT auth.uid(),
  tax_regime          TEXT NOT NULL DEFAULT 'simplified'
                        CHECK (tax_regime IN ('simplified', 'profit_tax', 'income_tax')),
  business_type       TEXT NOT NULL DEFAULT 'general'
                        CHECK (business_type IN ('general', 'trade_food')),
  vat_registered      BOOLEAN NOT NULL DEFAULT false,
  simplified_eligible BOOLEAN NOT NULL DEFAULT false,
  payroll_sector      TEXT NOT NULL DEFAULT 'private_non_oil'
                        CHECK (payroll_sector IN ('private_non_oil', 'oil_gas_public')),
  employee_count      INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_settings_updated_at
  BEFORE UPDATE ON tax_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_tax_settings" ON tax_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
