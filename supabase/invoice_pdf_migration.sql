-- ============================================================
-- AzFinance – Invoice PDF migration
-- Run in Supabase SQL Editor AFTER tax_settings_migration.sql
-- ============================================================

-- Add line items (JSONB array) to invoices
-- Each item: { description: string, quantity: number, unit_price: number }
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Add company profile fields to tax_settings (used for invoice PDF header)
ALTER TABLE tax_settings
  ADD COLUMN IF NOT EXISTS company_name    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_email   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vat_number      TEXT NOT NULL DEFAULT '';
