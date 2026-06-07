-- 049: Add missing columns to company_settings
--
-- Migration 043 used CREATE TABLE IF NOT EXISTS, but the table already
-- existed from an earlier migration, so accounting_method and industry
-- were never added. Fix with ADD COLUMN IF NOT EXISTS.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS accounting_method TEXT NOT NULL DEFAULT 'accrual',
  ADD COLUMN IF NOT EXISTS industry          TEXT;
