-- 043: Company setup flow — tax_id + company_settings

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS tax_id TEXT;

CREATE TABLE IF NOT EXISTS company_settings (
  company_id        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  currency          TEXT NOT NULL DEFAULT 'AZN',
  accounting_method TEXT NOT NULL DEFAULT 'accrual',   -- 'accrual' | 'cash'
  industry          TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own company settings"
  ON company_settings FOR SELECT
  USING (company_id = get_my_company_id());

CREATE POLICY "Admins can manage company settings"
  ON company_settings FOR ALL
  USING (company_id = get_my_company_id());

-- Backfill defaults for companies that existed before this migration
INSERT INTO company_settings (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;
