-- Add avans (advance salary) fields to payroll_entries
-- Run in Supabase SQL Editor

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS avans_amount  numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avans_paid    boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avans_paid_at timestamptz;
