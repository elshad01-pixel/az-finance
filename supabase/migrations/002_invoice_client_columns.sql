-- Store client FK and auto-filled contact details on each invoice
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_id      bigint REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_email   text,
  ADD COLUMN IF NOT EXISTS client_address text;
