-- Add vendor_id FK to expenses (run AFTER 010_vendors.sql)
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS vendor_id bigint REFERENCES vendors(id) ON DELETE SET NULL;
