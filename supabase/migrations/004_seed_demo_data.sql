-- ============================================================
-- Demo seed data — AzTech Solutions IT consulting company
-- Run in Supabase SQL Editor
-- ============================================================

-- 0. Widen the category CHECK constraint to match lib/categories.ts
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'Office', 'Utilities', 'Salaries', 'Transport', 'Marketing',
    'Professional Services', 'Bank & Finance', 'Other'
  ));

-- 1. Clear everything and reset identity sequences
TRUNCATE TABLE expense_templates, expenses, invoices, employees, clients
  RESTART IDENTITY CASCADE;

-- ============================================================
-- 2. CLIENTS  (6 records)
-- ============================================================
INSERT INTO clients (company, contact, email, phone, address) VALUES
  ('Kapital Bank ASC',     'Rauf Əliyev',    'rauf.aliyev@kapitalbank.az',  '+994 12 310 0000', 'Nizami küç. 77, Bakı'),
  ('Azercell Telecom MMC', 'Nigar Hüseynova', 'nigar.h@azercell.com',        '+994 12 498 0000', 'H. Əliyev pr. 165, Bakı'),
  ('SOCAR IT Department',  'Əli Rəhimov',    'ali.rahimov@socar.az',         '+994 12 596 0000', 'Neftçilər pr. 73, Bakı'),
  ('Baku Steel Company',   'Vüsal Məmmədov',  'vusal@bakusteel.az',           '+994 12 404 1234', 'Sabunçu şos. 34, Bakı'),
  ('ABB Bank',             'Sevinc Quliyeva', 'sevinc.q@abb-bank.az',         '+994 12 493 0000', 'Xaqani küç. 33, Bakı'),
  ('Baku Metro MMC',       'Kamran Nəsirov',  'k.nasirov@metro.gov.az',       '+994 12 492 0000', 'Tbilisi pr. 54, Bakı');

-- ============================================================
-- 3. INVOICES  (6 records — mix of Paid / Unpaid / Draft)
-- After TRUNCATE RESTART IDENTITY, clients get ids 1–6
-- ============================================================
INSERT INTO invoices (number, client, client_id, client_email, client_address, date, due_date, amount, status, line_items) VALUES

  -- INV-1001  Kapital Bank  Paid  April
  ('INV-1001', 'Kapital Bank ASC', 1,
   'rauf.aliyev@kapitalbank.az', 'Nizami küç. 77, Bakı',
   '2026-04-05', '2026-04-20', 8500.00, 'Paid',
   '[{"description":"Core Banking System Integration","quantity":1,"unit_price":6000},
     {"description":"API Documentation","quantity":1,"unit_price":1500},
     {"description":"Quality Assurance & Testing","quantity":1,"unit_price":1000}]'::jsonb),

  -- INV-1002  Azercell  Paid  April
  ('INV-1002', 'Azercell Telecom MMC', 2,
   'nigar.h@azercell.com', 'H. Əliyev pr. 165, Bakı',
   '2026-04-18', '2026-05-03', 12000.00, 'Paid',
   '[{"description":"CRM Platform Development","quantity":1,"unit_price":9000},
     {"description":"Mobile App Module","quantity":1,"unit_price":2000},
     {"description":"Deployment & Setup","quantity":1,"unit_price":1000}]'::jsonb),

  -- INV-1003  SOCAR  Paid  May
  ('INV-1003', 'SOCAR IT Department', 3,
   'ali.rahimov@socar.az', 'Neftçilər pr. 73, Bakı',
   '2026-05-02', '2026-05-17', 15000.00, 'Paid',
   '[{"description":"ERP Custom Module Development","quantity":3,"unit_price":4000},
     {"description":"Data Migration Services","quantity":1,"unit_price":3000}]'::jsonb),

  -- INV-1004  Baku Steel  Paid  May
  ('INV-1004', 'Baku Steel Company', 4,
   'vusal@bakusteel.az', 'Sabunçu şos. 34, Bakı',
   '2026-05-07', '2026-05-22', 18500.00, 'Paid',
   '[{"description":"Production Management System","quantity":1,"unit_price":14000},
     {"description":"Staff Training (5 days)","quantity":5,"unit_price":900}]'::jsonb),

  -- INV-1005  ABB Bank  Unpaid  May
  ('INV-1005', 'ABB Bank', 5,
   'sevinc.q@abb-bank.az', 'Xaqani küç. 33, Bakı',
   '2026-05-10', '2026-05-25', 9200.00, 'Unpaid',
   '[{"description":"Loan Processing Automation","quantity":1,"unit_price":7200},
     {"description":"Reporting Dashboard","quantity":1,"unit_price":2000}]'::jsonb),

  -- INV-1006  Baku Metro  Draft  May
  ('INV-1006', 'Baku Metro MMC', 6,
   'k.nasirov@metro.gov.az', 'Tbilisi pr. 54, Bakı',
   '2026-05-10', '2026-05-31', 4500.00, 'Draft',
   '[{"description":"Passenger Analytics System — Phase 1","quantity":1,"unit_price":4500}]'::jsonb);

-- ============================================================
-- 4. EXPENSES  (6 records — April & May, recurring & one-off)
--    Recurring alert fires when next_due_date <= today+7.
--    Items #1, #2, #6 will appear in the dashboard alert.
-- ============================================================
INSERT INTO expenses (date, description, category, subcategory, amount, is_recurring, frequency, next_due_date) VALUES

  -- April recurring (next due overdue → shows in Recurring Alert)
  ('2026-04-01', 'Ofis İcarəsi — Aprel',    'Office',                'Rent',       3500.00, true,  'monthly',   '2026-05-01'),
  ('2026-04-01', 'İnternet və Mobil — Aprel','Utilities',             'Internet',    350.00, true,  'monthly',   '2026-05-10'),

  -- April quarterly (next due July — not in alert)
  ('2026-04-01', 'Mühasibatlıq Xidməti Q2', 'Professional Services', 'Accounting',  800.00, true,  'quarterly', '2026-07-01'),

  -- May expenses already recorded
  ('2026-05-03', 'Google Ads Kampaniyası',   'Marketing',             'Online Ads', 1200.00, true,  'monthly',   '2026-06-03'),
  ('2026-05-07', 'Kompüter Avadanlığı',      'Office',                'Equipment',  2800.00, false, null,        null),

  -- May bank fee due soon → shows in Recurring Alert
  ('2026-05-09', 'Bank Köçürmə Komissiyası', 'Bank & Finance',        'Bank Fees',   185.00, true,  'monthly',   '2026-05-14');

-- ============================================================
-- 5. EMPLOYEES  (6 records — private non-oil, main workplace)
-- ============================================================
INSERT INTO employees (full_name, position, gross_salary, employment_type, status, start_date, is_main_workplace, payroll_sector) VALUES
  ('Nihat Əliyev',    'Senior Software Developer', 3500.00, 'full-time',  'active',   '2023-03-01', true, 'private_non_oil'),
  ('Leyla Həsənova',  'Project Manager',            2800.00, 'full-time',  'active',   '2023-06-15', true, 'private_non_oil'),
  ('Elmin Məmmədov',  'Junior Developer',           1800.00, 'full-time',  'active',   '2024-09-01', true, 'private_non_oil'),
  ('Günel Quliyeva',  'Sales Manager',              2200.00, 'full-time',  'active',   '2024-01-10', true, 'private_non_oil'),
  ('Fərid Rüstəmov',  'DevOps Engineer',            3000.00, 'full-time',  'active',   '2023-11-01', true, 'private_non_oil'),
  ('Aytaç Nəsirov',   'Accountant',                 2000.00, 'full-time',  'active',   '2024-04-01', true, 'private_non_oil');

-- Done. Expected summary:
-- Clients:   6
-- Invoices:  6  (Paid: 4 = ₼53,500 | Unpaid: 1 = ₼9,200 | Draft: 1 = ₼4,500)
-- Expenses:  6  (April total: ₼4,650 | May total: ₼4,185)
-- Employees: 6  (Gross payroll: ₼15,300/month)
--
-- P&L current month (May 2026):
--   Revenue:  ₼33,500
--   Expenses: ₼4,185
--   Net:      ₼29,315
--
-- Recurring Alert shows 3 items:
--   Office Rent (next_due 2026-05-01) — overdue
--   Internet   (next_due 2026-05-10) — due today
--   Bank Fees  (next_due 2026-05-14) — due in 4 days
