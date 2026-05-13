-- Expense improvements: supplier, payment method, VAT, notes, receipt
-- Run in Supabase SQL Editor

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS supplier        text,
  ADD COLUMN IF NOT EXISTS payment_method  text,
  ADD COLUMN IF NOT EXISTS vat_enabled     boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_amount      numeric(12,2),
  ADD COLUMN IF NOT EXISTS notes           text,
  ADD COLUMN IF NOT EXISTS receipt_url     text;
