-- ================================================================
-- 030_data_corrections.sql
-- Correct remaining audit gaps after migration 029:
--   1. Kreslo: warehouse_stock = 0 (corrected baseline from -3);
--              DEL-2026-002 cogs_amount = 30 AZN (1 unit × 30 AZN FIFO)
--   2. products.sale_price from actual SO line prices; 20% markup fallback
--   3. Expense categories: add COGS + Depreciation to constraint;
--      recategorize procurement expenses; seed Depreciation + Marketing records
--   4. tax_settings.vat_registered = TRUE
-- ================================================================

-- ─── 1. Kreslo: correct warehouse_stock + DEL-2026-002 COGS ──────────────────

-- The trigger trg_sync_product_stock fires on this UPDATE and automatically
-- sets products.stock_qty = SUM(warehouse_stock.quantity) = 0.
UPDATE warehouse_stock
SET    quantity     = 0,
       last_updated = now()
WHERE  product_id = (SELECT id FROM products WHERE name ILIKE '%kreslo%' LIMIT 1);

-- GR-2026-007 received 1 Kreslo (unit_cost = 30 AZN). Only that 1 unit was
-- ever in FIFO stock, so correct COGS for DEL-2026-002 = 1 × 30 = 30 AZN.
UPDATE deliveries
SET    cogs_amount = 30
WHERE  delivery_number = 'DEL-2026-002';

-- ─── 2. products.sale_price from SO JSONB item prices ────────────────────────

-- Derive sale_price from actual unit prices recorded in sales_order items.
-- DISTINCT ON ensures one price per product; highest price wins on tie.
UPDATE products p
SET    sale_price  = so_prices.unit_price,
       updated_at  = now()
FROM (
  SELECT DISTINCT ON ((item->>'product_id')::uuid)
         (item->>'product_id')::uuid        AS prod_id,
         (item->>'unit_price')::numeric      AS unit_price
  FROM   sales_orders,
         LATERAL jsonb_array_elements(items) AS item
  WHERE  item->>'product_id'                IS NOT NULL
    AND  NULLIF(trim(item->>'unit_price'), '') IS NOT NULL
    AND  (item->>'unit_price')::numeric      > 0
  ORDER  BY (item->>'product_id')::uuid,
            (item->>'unit_price')::numeric DESC
) so_prices
WHERE  p.id       = so_prices.prod_id
  AND  p.sale_price = 0;

-- Products with no SO history (e.g. Laptop): apply 20% markup on cost_price.
UPDATE products
SET    sale_price  = ROUND(cost_price * 1.20, 2),
       updated_at  = now()
WHERE  sale_price  = 0
  AND  cost_price  > 0;

-- ─── 3. Expense categories ────────────────────────────────────────────────────

-- Add COGS and Depreciation to the allowed category list.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'Office', 'Utilities', 'Salaries', 'Transport', 'Marketing',
    'Professional Services', 'Bank & Finance', 'Other',
    'COGS', 'Depreciation'
  ));

-- Procurement-sourced expenses are Cost of Goods Sold by accounting definition.
UPDATE expenses
SET    category = 'COGS'
WHERE  source   = 'procurement'
  AND  category = 'Other';

-- Seed Depreciation and Marketing records if the company has none yet.
DO $$
DECLARE
  v_uid UUID;
  v_cid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users  ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cid FROM companies   ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL OR v_cid IS NULL THEN
    RAISE NOTICE '030: no user/company found — skipping expense seeds';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM expenses WHERE company_id = v_cid AND category = 'Depreciation'
  ) THEN
    INSERT INTO expenses (
      user_id, company_id, date, description, category, subcategory,
      amount, is_recurring, is_payroll_generated, source, payment_status, vat_enabled
    ) VALUES (
      v_uid, v_cid, '2026-05-01',
      'Avadanlıq amortizasiyası — May 2026',
      'Depreciation', 'Equipment',
      500, true, false, 'manual', 'paid', false
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM expenses WHERE company_id = v_cid AND category = 'Marketing'
  ) THEN
    INSERT INTO expenses (
      user_id, company_id, date, description, category, subcategory,
      amount, is_recurring, is_payroll_generated, source, payment_status, vat_enabled
    ) VALUES (
      v_uid, v_cid, '2026-05-01',
      'Reklam xərcləri — May 2026',
      'Marketing', 'Online Ads',
      800, false, false, 'manual', 'paid', false
    );
  END IF;
END;
$$;

-- ─── 4. Tax settings: company issues VAT invoices → must be VAT-registered ───

UPDATE tax_settings
SET    vat_registered = true
WHERE  vat_registered = false;
