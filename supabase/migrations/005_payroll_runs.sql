-- Payroll runs + entries tables
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payroll_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month       int    NOT NULL CHECK (month BETWEEN 1 AND 12),
  year        int    NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  status      text   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  approved_at timestamptz,
  expense_id  bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month, year)
);

CREATE TABLE IF NOT EXISTS payroll_entries (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id               bigint NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id          bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Inputs
  base_salary          numeric(12,2) NOT NULL,
  vacation_days        numeric(5,2)  NOT NULL DEFAULT 0,
  sick_days            numeric(5,2)  NOT NULL DEFAULT 0,
  overtime_hours       numeric(6,2)  NOT NULL DEFAULT 0,
  bonus                numeric(12,2) NOT NULL DEFAULT 0,
  other_additions      numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions     numeric(12,2) NOT NULL DEFAULT 0,
  -- Computed (stored for history)
  adjusted_gross       numeric(12,2) NOT NULL,
  pit_deduction        numeric(12,2) NOT NULL,
  pit                  numeric(12,2) NOT NULL,
  emp_social           numeric(12,2) NOT NULL,
  emp_health           numeric(12,2) NOT NULL,
  emp_unemployment     numeric(12,2) NOT NULL,
  total_emp_deductions numeric(12,2) NOT NULL,
  net_salary           numeric(12,2) NOT NULL,
  emplr_social         numeric(12,2) NOT NULL,
  emplr_health         numeric(12,2) NOT NULL,
  emplr_unemployment   numeric(12,2) NOT NULL,
  total_employer_cost  numeric(12,2) NOT NULL,
  -- Snapshot of employee settings at run time
  payroll_sector       text NOT NULL,
  is_main_workplace    boolean NOT NULL,
  UNIQUE (run_id, employee_id)
);

ALTER TABLE payroll_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own payroll runs" ON payroll_runs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own payroll entries" ON payroll_entries
  FOR ALL TO authenticated
  USING  (run_id IN (SELECT id FROM payroll_runs WHERE user_id = auth.uid()))
  WITH CHECK (run_id IN (SELECT id FROM payroll_runs WHERE user_id = auth.uid()));
