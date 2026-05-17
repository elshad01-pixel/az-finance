-- Add is_payroll_generated flag to expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_payroll_generated boolean NOT NULL DEFAULT false;

-- Unique partial index: only one auto-generated payroll expense per user per month
-- (keyed on the first day of the month as the date)
CREATE UNIQUE INDEX IF NOT EXISTS expenses_payroll_generated_unique
  ON expenses (user_id, date)
  WHERE is_payroll_generated = true;
