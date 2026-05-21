-- ================================================================
-- 024_expense_sources.sql
-- Extend expenses.source CHECK constraint to include new source types:
-- recurring, petty_cash, bank_charge
-- Run in Supabase SQL Editor
-- ================================================================

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_source_check;

ALTER TABLE expenses ADD CONSTRAINT expenses_source_check
  CHECK (source IN ('manual', 'procurement', 'payroll', 'recurring', 'petty_cash', 'bank_charge'));
