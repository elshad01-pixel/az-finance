-- Add vat_applied flag to invoices
-- Run in Supabase SQL Editor

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
