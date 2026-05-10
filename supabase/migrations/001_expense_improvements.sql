-- Add new columns to expenses table
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS subcategory   text,
  ADD COLUMN IF NOT EXISTS is_recurring  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frequency     text CHECK (frequency IN ('monthly', 'quarterly', 'annual')),
  ADD COLUMN IF NOT EXISTS next_due_date date;

-- Expense templates table
CREATE TABLE IF NOT EXISTS expense_templates (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text   NOT NULL,
  description  text   NOT NULL DEFAULT '',
  category     text   NOT NULL,
  subcategory  text,
  amount       numeric(12, 2) NOT NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  frequency    text CHECK (frequency IN ('monthly', 'quarterly', 'annual')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS for expense_templates
ALTER TABLE expense_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own templates"
  ON expense_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
