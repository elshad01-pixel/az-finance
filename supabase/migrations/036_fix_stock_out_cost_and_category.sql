-- ================================================================
-- 036_fix_stock_out_cost_and_category.sql
--
-- 1. Fix consume_stock_fifo: accumulate FIFO cost during batch
--    loop and write unit_cost + total_cost to the OUT movement.
--
-- 2. Backfill unit_cost / total_cost on existing OUT movements
--    that were inserted without cost data:
--      DEL-2026-001  Windows  1 m²  × ₼34   = ₼34
--      DEL-2026-002  Kreslo   4 əd  × ₼30   = ₼120  (historical seed)
--      DEL-2026-003  Windows  80 m² × ₼34   = ₼2,720
--
-- 3. Fix expenses with NULL / empty category → 'Other' so they
--    appear in P&L instead of being silently dropped.
-- ================================================================

-- ─── 1. Fix consume_stock_fifo ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION consume_stock_fifo(
  p_product_id UUID,
  p_qty        NUMERIC,
  p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cid        UUID    := get_my_company_id();
  v_uid        UUID    := auth.uid();
  v_wh_id      UUID;
  v_batch      RECORD;
  v_remaining  NUMERIC := p_qty;
  v_current    NUMERIC;
  v_take       NUMERIC;
  v_total_cost NUMERIC := 0;
  v_unit_cost  NUMERIC;
BEGIN
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('error', 'Quantity must be positive');
  END IF;

  SELECT stock_qty INTO v_current FROM products
  WHERE id = p_product_id AND company_id = v_cid;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Product not found'); END IF;
  IF v_current < p_qty THEN RETURN jsonb_build_object('error', 'Insufficient stock'); END IF;

  SELECT id INTO v_wh_id FROM warehouses
  WHERE company_id = v_cid AND is_default = true LIMIT 1;

  -- Consume oldest batches first (FIFO) and accumulate cost
  FOR v_batch IN
    SELECT * FROM product_batches
    WHERE product_id = p_product_id AND company_id = v_cid
      AND status = 'active' AND quantity_remaining > 0
    ORDER BY received_date ASC, created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_batch.quantity_remaining, v_remaining);

    UPDATE product_batches
      SET quantity_remaining = quantity_remaining - v_take,
          status = CASE WHEN (quantity_remaining - v_take) <= 0 THEN 'consumed' ELSE 'active' END
    WHERE id = v_batch.id;

    v_total_cost := v_total_cost + (v_take * v_batch.unit_cost);
    v_remaining  := v_remaining - v_take;
  END LOOP;

  v_unit_cost := CASE WHEN p_qty > 0 THEN ROUND(v_total_cost / p_qty, 4) ELSE 0 END;

  -- OUT movement now carries FIFO cost
  INSERT INTO stock_movements (
    company_id, product_id, warehouse_id, movement_type,
    quantity, unit_cost, total_cost, reference_type, notes, created_by
  ) VALUES (
    v_cid, p_product_id, v_wh_id, 'out',
    -p_qty, v_unit_cost, v_total_cost, 'sales_order', p_notes, v_uid
  );

  IF v_wh_id IS NOT NULL THEN
    UPDATE warehouse_stock
      SET quantity = quantity - p_qty, last_updated = now()
    WHERE product_id = p_product_id AND warehouse_id = v_wh_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'consumed',   p_qty,
    'unit_cost',  v_unit_cost,
    'total_cost', v_total_cost
  );
END;
$$;
GRANT EXECUTE ON FUNCTION consume_stock_fifo(UUID, NUMERIC, TEXT) TO authenticated;

-- ─── 2. Backfill existing OUT movements ───────────────────────────────────────

-- DEL-2026-001: 1 Windows m² × ₼34 unit cost
UPDATE stock_movements
SET    unit_cost  = 34,
       total_cost = 34
WHERE  movement_type = 'out'
  AND  notes        = 'DEL: DEL-2026-001'
  AND  unit_cost IS NULL;

-- DEL-2026-002: 4 Kreslo əd × ₼30 unit cost (historical seed data)
UPDATE stock_movements
SET    unit_cost  = 30,
       total_cost = 120
WHERE  movement_type = 'out'
  AND  notes        = 'DEL: DEL-2026-002'
  AND  unit_cost IS NULL;

-- DEL-2026-003: 80 Windows m² × ₼34 unit cost
UPDATE stock_movements
SET    unit_cost  = 34,
       total_cost = 2720
WHERE  movement_type = 'out'
  AND  notes        = 'DEL: DEL-2026-003'
  AND  unit_cost IS NULL;

-- ─── 3. Fix null / empty expense categories ───────────────────────────────────

UPDATE expenses
SET    category = 'Other'
WHERE  (category IS NULL OR trim(category) = '');
