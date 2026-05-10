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

-- 2. Insert all seed data inside a DO block so we can
--    a) look up the real auth user id
--    b) capture inserted client ids for invoice foreign keys
DO $$
DECLARE
  v_uid uuid;
  cid1  bigint;
  cid2  bigint;
  cid3  bigint;
  cid4  bigint;
  cid5  bigint;
  cid6  bigint;
BEGIN
  -- resolve the app user (must have logged in at least once)
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No user found in auth.users. Log into the app first, then re-run this script.';
  END IF;

  -- ── CLIENTS ────────────────────────────────────────────────
  INSERT INTO clients (user_id, company, contact, email, phone, address)
    VALUES (v_uid, 'Kapital Bank ASC', 'Rauf Əliyev',
            'rauf.aliyev@kapitalbank.az', '+994 12 310 0000',
            'Nizami küç. 77, Bakı')
    RETURNING id INTO cid1;

  INSERT INTO clients (user_id, company, contact, email, phone, address)
    VALUES (v_uid, 'Azercell Telecom MMC', 'Nigar Hüseynova',
            'nigar.h@azercell.com', '+994 12 498 0000',
            'H. Əliyev pr. 165, Bakı')
    RETURNING id INTO cid2;

  INSERT INTO clients (user_id, company, contact, email, phone, address)
    VALUES (v_uid, 'SOCAR IT Department', 'Əli Rəhimov',
            'ali.rahimov@socar.az', '+994 12 596 0000',
            'Neftçilər pr. 73, Bakı')
    RETURNING id INTO cid3;

  INSERT INTO clients (user_id, company, contact, email, phone, address)
    VALUES (v_uid, 'Baku Steel Company', 'Vüsal Məmmədov',
            'vusal@bakusteel.az', '+994 12 404 1234',
            'Sabunçu şos. 34, Bakı')
    RETURNING id INTO cid4;

  INSERT INTO clients (user_id, company, contact, email, phone, address)
    VALUES (v_uid, 'ABB Bank', 'Sevinc Quliyeva',
            'sevinc.q@abb-bank.az', '+994 12 493 0000',
            'Xaqani küç. 33, Bakı')
    RETURNING id INTO cid5;

  INSERT INTO clients (user_id, company, contact, email, phone, address)
    VALUES (v_uid, 'Baku Metro MMC', 'Kamran Nəsirov',
            'k.nasirov@metro.gov.az', '+994 12 492 0000',
            'Tbilisi pr. 54, Bakı')
    RETURNING id INTO cid6;

  -- ── INVOICES ───────────────────────────────────────────────
  INSERT INTO invoices (user_id, number, client, client_id, client_email, client_address,
                        date, due_date, amount, status, line_items)
  VALUES
    (v_uid, 'INV-1001', 'Kapital Bank ASC', cid1,
     'rauf.aliyev@kapitalbank.az', 'Nizami küç. 77, Bakı',
     '2026-04-05', '2026-04-20', 8500.00, 'Paid',
     '[{"description":"Core Banking System Integration","quantity":1,"unit_price":6000},
       {"description":"API Documentation","quantity":1,"unit_price":1500},
       {"description":"Quality Assurance & Testing","quantity":1,"unit_price":1000}]'::jsonb),

    (v_uid, 'INV-1002', 'Azercell Telecom MMC', cid2,
     'nigar.h@azercell.com', 'H. Əliyev pr. 165, Bakı',
     '2026-04-18', '2026-05-03', 12000.00, 'Paid',
     '[{"description":"CRM Platform Development","quantity":1,"unit_price":9000},
       {"description":"Mobile App Module","quantity":1,"unit_price":2000},
       {"description":"Deployment & Setup","quantity":1,"unit_price":1000}]'::jsonb),

    (v_uid, 'INV-1003', 'SOCAR IT Department', cid3,
     'ali.rahimov@socar.az', 'Neftçilər pr. 73, Bakı',
     '2026-05-02', '2026-05-17', 15000.00, 'Paid',
     '[{"description":"ERP Custom Module Development","quantity":3,"unit_price":4000},
       {"description":"Data Migration Services","quantity":1,"unit_price":3000}]'::jsonb),

    (v_uid, 'INV-1004', 'Baku Steel Company', cid4,
     'vusal@bakusteel.az', 'Sabunçu şos. 34, Bakı',
     '2026-05-07', '2026-05-22', 18500.00, 'Paid',
     '[{"description":"Production Management System","quantity":1,"unit_price":14000},
       {"description":"Staff Training (5 days)","quantity":5,"unit_price":900}]'::jsonb),

    (v_uid, 'INV-1005', 'ABB Bank', cid5,
     'sevinc.q@abb-bank.az', 'Xaqani küç. 33, Bakı',
     '2026-05-10', '2026-05-25', 9200.00, 'Unpaid',
     '[{"description":"Loan Processing Automation","quantity":1,"unit_price":7200},
       {"description":"Reporting Dashboard","quantity":1,"unit_price":2000}]'::jsonb),

    (v_uid, 'INV-1006', 'Baku Metro MMC', cid6,
     'k.nasirov@metro.gov.az', 'Tbilisi pr. 54, Bakı',
     '2026-05-10', '2026-05-31', 4500.00, 'Draft',
     '[{"description":"Passenger Analytics System — Phase 1","quantity":1,"unit_price":4500}]'::jsonb);

  -- ── EXPENSES ───────────────────────────────────────────────
  -- #1 & #2 have past next_due_date → Recurring Alert will flag them
  -- #6 has next_due_date in 4 days   → Recurring Alert flags it too
  INSERT INTO expenses (user_id, date, description, category, subcategory,
                        amount, is_recurring, frequency, next_due_date)
  VALUES
    (v_uid, '2026-04-01', 'Ofis İcarəsi — Aprel',     'Office',                'Rent',
     3500.00, true,  'monthly',   '2026-05-01'),

    (v_uid, '2026-04-01', 'İnternet və Mobil — Aprel', 'Utilities',             'Internet',
      350.00, true,  'monthly',   '2026-05-10'),

    (v_uid, '2026-04-01', 'Mühasibatlıq Xidməti Q2',  'Professional Services', 'Accounting',
      800.00, true,  'quarterly', '2026-07-01'),

    (v_uid, '2026-05-03', 'Google Ads Kampaniyası',    'Marketing',             'Online Ads',
     1200.00, true,  'monthly',   '2026-06-03'),

    (v_uid, '2026-05-07', 'Kompüter Avadanlığı',       'Office',                'Equipment',
     2800.00, false, null,        null),

    (v_uid, '2026-05-09', 'Bank Köçürmə Komissiyası',  'Bank & Finance',        'Bank Fees',
      185.00, true,  'monthly',   '2026-05-14');

  -- ── EMPLOYEES (no user_id — policy is USING true) ──────────
  INSERT INTO employees (full_name, position, gross_salary, employment_type,
                         status, start_date, is_main_workplace, payroll_sector)
  VALUES
    ('Nihat Əliyev',   'Senior Software Developer', 3500.00, 'full-time', 'active', '2023-03-01', true, 'private_non_oil'),
    ('Leyla Həsənova', 'Project Manager',            2800.00, 'full-time', 'active', '2023-06-15', true, 'private_non_oil'),
    ('Elmin Məmmədov', 'Junior Developer',           1800.00, 'full-time', 'active', '2024-09-01', true, 'private_non_oil'),
    ('Günel Quliyeva', 'Sales Manager',              2200.00, 'full-time', 'active', '2024-01-10', true, 'private_non_oil'),
    ('Fərid Rüstəmov', 'DevOps Engineer',            3000.00, 'full-time', 'active', '2023-11-01', true, 'private_non_oil'),
    ('Aytaç Nəsirov',  'Accountant',                 2000.00, 'full-time', 'active', '2024-04-01', true, 'private_non_oil');

END $$;

-- ── Expected summary ───────────────────────────────────────────
-- Clients:   6
-- Invoices:  6  (Paid ×4 = ₼53,500 | Unpaid ×1 = ₼9,200 | Draft ×1 = ₼4,500)
-- Expenses:  6  (April ₼4,650 | May ₼4,185)
-- Employees: 6  (₼15,300 gross/month)
--
-- P&L — May 2026:  Revenue ₼33,500 | Expenses ₼4,185 | Net ₼29,315
-- P&L — Apr 2026:  Revenue ₼20,500 | Expenses ₼4,650 | Net ₼15,850
--
-- Dashboard Recurring Alert (3 items):
--   Office Rent  next_due 2026-05-01 → overdue
--   Internet     next_due 2026-05-10 → due today
--   Bank Fees    next_due 2026-05-14 → due in 4 days
