CREATE TABLE IF NOT EXISTS employees (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name         text    NOT NULL,
  position          text    NOT NULL,
  gross_salary      numeric(12,2) NOT NULL,
  employment_type   text    NOT NULL DEFAULT 'full-time'
                    CHECK (employment_type IN ('full-time', 'part-time', 'contractor')),
  status            text    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
  start_date        date    NOT NULL,
  is_main_workplace boolean NOT NULL DEFAULT true,
  payroll_sector    text    NOT NULL DEFAULT 'private_non_oil'
                    CHECK (payroll_sector IN ('private_non_oil', 'oil_gas_public')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users"
  ON employees FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
