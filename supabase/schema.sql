-- ============================================================
-- AzFinance – Supabase schema
-- Run this once in the Supabase SQL Editor
-- ============================================================

-- ── Tables ────────────────────────────────────────────────────

CREATE TABLE clients (
  id         BIGSERIAL PRIMARY KEY,
  company    TEXT NOT NULL,
  contact    TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoices (
  id         BIGSERIAL PRIMARY KEY,
  number     TEXT NOT NULL UNIQUE,
  client     TEXT NOT NULL,
  date       DATE NOT NULL,
  due_date   DATE NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'Draft'
               CHECK (status IN ('Paid', 'Unpaid', 'Draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expenses (
  id          BIGSERIAL PRIMARY KEY,
  date        DATE NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL
                CHECK (category IN ('Office', 'Utilities', 'Salaries', 'Transport', 'Other')),
  amount      NUMERIC(12, 2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Row Level Security ────────────────────────────────────────
-- Allows the anon key (used in the browser) to read and write.
-- Tighten these policies when you add authentication.

ALTER TABLE clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON clients  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON invoices FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON expenses FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Seed data ─────────────────────────────────────────────────

INSERT INTO clients (company, contact, email, phone, address) VALUES
  ('Baku Tech LLC',    'Ali Mammadov',    'ali@bakutech.az',     '+994 50 123 4567', '12 Nizami St, Baku'),
  ('Caspian Energy',   'Leyla Hasanova',  'leyla@caspian.az',    '+994 55 234 5678', '45 Istiqlaliyyat Ave, Baku'),
  ('Atlas Group',      'Farid Aliyev',    'farid@atlas.az',      '+994 70 345 6789', '8 Rashid Behbudov St, Baku'),
  ('Silk Road Hotels', 'Nigar Rzayeva',   'nigar@silkroad.az',   '+994 51 456 7890', '20 Neftchilar Ave, Baku'),
  ('Azerenerji',       'Tural Ismayilov', 'tural@azerenerji.az', '+994 55 567 8901', '73 Hasan Aliyev St, Baku'),
  ('Socar Trading',    'Elchin Quliyev',  'elchin@socar.az',     '+994 70 678 9012', 'SOCAR Tower, Baku'),
  ('Kapital Bank',     'Sevinc Agayeva',  'sevinc@kapital.az',   '+994 50 789 0123', '15 Landau St, Baku');

INSERT INTO invoices (number, client, date, due_date, amount, status) VALUES
  ('INV-1001', 'Baku Tech LLC',    '2026-04-15', '2026-05-15',  4200, 'Paid'),
  ('INV-1002', 'Caspian Energy',   '2026-04-22', '2026-05-22',  7800, 'Paid'),
  ('INV-1003', 'Atlas Group',      '2026-05-01', '2026-05-31',  3500, 'Unpaid'),
  ('INV-1004', 'Silk Road Hotels', '2026-05-03', '2026-06-03',  9200, 'Unpaid'),
  ('INV-1005', 'Azerenerji',       '2026-05-05', '2026-06-05',  1850, 'Unpaid'),
  ('INV-1006', 'Socar Trading',    '2026-05-06', '2026-06-06', 12400, 'Draft'),
  ('INV-1007', 'Kapital Bank',     '2026-04-10', '2026-05-10',  2500, 'Paid');

INSERT INTO expenses (date, description, category, amount) VALUES
  ('2026-05-01', 'Office rent',        'Office',    3500),
  ('2026-05-02', 'Electricity bill',   'Utilities',  320),
  ('2026-05-03', 'Staff salaries',     'Salaries', 18500),
  ('2026-05-04', 'Office supplies',    'Office',     450),
  ('2026-05-05', 'Taxi & fuel',        'Transport',  180),
  ('2026-05-06', 'Internet & phone',   'Utilities',  210),
  ('2026-05-06', 'Courier delivery',   'Other',       85),
  ('2026-05-07', 'Printer cartridges', 'Office',     120);
