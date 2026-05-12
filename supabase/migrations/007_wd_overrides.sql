-- Working-days override table: stores manual adjustments (+ or -) per month/year
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payroll_wd_overrides (
  id         serial      PRIMARY KEY,
  year       integer     NOT NULL,
  month      integer     NOT NULL CHECK (month BETWEEN 1 AND 12),
  adjustment integer     NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year, month)
);

ALTER TABLE payroll_wd_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wd_overrides_select" ON payroll_wd_overrides
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "wd_overrides_insert" ON payroll_wd_overrides
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "wd_overrides_update" ON payroll_wd_overrides
  FOR UPDATE USING (auth.uid() IS NOT NULL);
