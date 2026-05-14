-- Expense payment status and payment date
-- Run in Supabase SQL Editor

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS payment_date   date;
