-- ================================================================
-- 038_vat_threshold_table_price_stock_cost.sql
--
-- 1. tax_settings: add vat_threshold_exceeded flag + next filing
--    date; sync employee_count with actual active employees.
--
-- 2. Fix Table product sale_price (was 0).
--    UPDATE products SET sale_price = cost_price × 1.3
--    WHERE sale_price = 0 AND name ILIKE '%table%'
--
-- 3. Backfill unit_cost / total_cost on OUT movements for
--    DEL-2026-004 (500 Kreslo × ₼30) and
--    DEL-2026-005 (798 Table × ₼8).
-- ================================================================

-- ─── 1. tax_settings: VAT threshold flag ─────────────────────────────────────

ALTER TABLE tax_settings
  ADD COLUMN IF NOT EXISTS vat_threshold_exceeded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vat_next_filing_date   DATE;

-- Revenue = 210,280 AZN > 200,000 AZN — flag the threshold and record
-- the next quarterly VAT filing deadline (20th of the following month).
UPDATE tax_settings
SET    vat_threshold_exceeded = TRUE,
       vat_next_filing_date   = '2026-06-20',
       employee_count         = 6
WHERE  vat_registered = TRUE;

-- ─── 2. Table product sale_price ─────────────────────────────────────────────

UPDATE products
SET    sale_price = ROUND(cost_price * 1.3, 2)
WHERE  sale_price = 0
  AND  name ILIKE '%table%';

-- ─── 3. Backfill unit_cost on DEL-2026-004 and DEL-2026-005 ──────────────────

-- DEL-2026-004: 500 Kreslo × ₼30 FIFO = ₼15,000
-- Match by notes if available; fall back to qty + product name.
UPDATE stock_movements
SET    unit_cost  = 30,
       total_cost = 15000
WHERE  movement_type = 'out'
  AND  unit_cost IS NULL
  AND  notes = 'DEL: DEL-2026-004';

-- Fallback: match by quantity and product in case notes format differs
UPDATE stock_movements sm
SET    unit_cost  = 30,
       total_cost = 15000
WHERE  sm.movement_type = 'out'
  AND  sm.unit_cost IS NULL
  AND  sm.quantity = -500
  AND  EXISTS (
    SELECT 1 FROM products p
    WHERE  p.id = sm.product_id AND p.name ILIKE '%kreslo%'
  );

-- DEL-2026-005: 798 Table × ₼8 FIFO = ₼6,384
UPDATE stock_movements
SET    unit_cost  = 8,
       total_cost = 6384
WHERE  movement_type = 'out'
  AND  unit_cost IS NULL
  AND  notes = 'DEL: DEL-2026-005';

-- Fallback: match by quantity and product
UPDATE stock_movements sm
SET    unit_cost  = 8,
       total_cost = 6384
WHERE  sm.movement_type = 'out'
  AND  sm.unit_cost IS NULL
  AND  sm.quantity = -798
  AND  EXISTS (
    SELECT 1 FROM products p
    WHERE  p.id = sm.product_id AND p.name ILIKE '%table%'
  );
