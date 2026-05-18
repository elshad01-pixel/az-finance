-- ================================================================
-- 020_subscriptions.sql
-- Run in Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS company_subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  package       TEXT        NOT NULL DEFAULT 'light' CHECK (package IN ('light', 'mid', 'enterprise')),
  status        TEXT        NOT NULL DEFAULT 'trial'  CHECK (status  IN ('trial', 'active', 'expired', 'cancelled')),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  paid_until    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_read" ON company_subscriptions
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "subscription_update" ON company_subscriptions
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- Keep updated_at current on every update
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscription_updated_at();

-- Auto-create a trial subscription whenever a company is created
CREATE OR REPLACE FUNCTION auto_create_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO company_subscriptions (company_id)
  VALUES (NEW.id)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_companies_subscription
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION auto_create_subscription();

-- Backfill existing companies that don't have a subscription yet
INSERT INTO company_subscriptions (company_id)
SELECT id FROM companies
WHERE id NOT IN (SELECT company_id FROM company_subscriptions)
ON CONFLICT (company_id) DO NOTHING;
