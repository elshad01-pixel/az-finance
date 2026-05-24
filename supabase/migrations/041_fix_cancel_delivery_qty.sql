-- ================================================================
-- 041_fix_cancel_delivery_qty.sql
-- Fix cancel_delivery() to reverse the FIFO-consumed quantity
-- (total_cost / unit_cost) instead of the raw OUT movement qty.
--
-- Root cause: consume_stock_fifo writes -p_qty as movement.quantity
-- regardless of how many batches were available. The actual units
-- consumed = total_cost / unit_cost (e.g. DEL-2026-002: qty=-4 but
-- total_cost=30, unit_cost=30 → 1 unit actually consumed).
-- ================================================================

CREATE OR REPLACE FUNCTION cancel_delivery(p_delivery_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del        RECORD;
  v_cid        UUID    := get_my_company_id();
  v_uid        UUID    := auth.uid();
  v_mv         RECORD;
  v_actual_qty NUMERIC;
  v_inv_id     BIGINT;
BEGIN
  SELECT * INTO v_del FROM deliveries WHERE id = p_delivery_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Delivery not found');
  END IF;
  IF v_del.company_id IS DISTINCT FROM v_cid THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;
  IF v_del.status = 'cancelled' THEN
    RETURN jsonb_build_object('error', 'Already cancelled');
  END IF;

  IF v_del.status = 'confirmed' THEN
    FOR v_mv IN
      SELECT * FROM stock_movements
      WHERE  notes         = 'DEL: ' || v_del.delivery_number
        AND  movement_type = 'out'
        AND  company_id    = v_cid
    LOOP
      -- Use FIFO-consumed qty (total_cost / unit_cost) rather than
      -- the raw movement quantity, which records the requested qty
      -- and can exceed what FIFO actually removed from batches.
      v_actual_qty := CASE
        WHEN v_mv.unit_cost IS NOT NULL AND v_mv.unit_cost > 0
          THEN ROUND(v_mv.total_cost / v_mv.unit_cost, 6)
        ELSE ABS(v_mv.quantity)
      END;

      INSERT INTO stock_movements (
        company_id, product_id, warehouse_id, movement_type,
        quantity, unit_cost, total_cost, reference_type, notes, created_by
      ) VALUES (
        v_cid, v_mv.product_id, v_mv.warehouse_id, 'adjustment',
        v_actual_qty, v_mv.unit_cost,
        COALESCE(v_mv.total_cost, 0),
        'sales_order', 'CANCEL: ' || v_del.delivery_number, v_uid
      );

      UPDATE products
        SET stock_qty = stock_qty + v_actual_qty
      WHERE id = v_mv.product_id AND company_id = v_cid;

      IF v_mv.warehouse_id IS NOT NULL THEN
        UPDATE warehouse_stock
          SET quantity     = quantity + v_actual_qty,
              last_updated = now()
        WHERE product_id  = v_mv.product_id
          AND warehouse_id = v_mv.warehouse_id;
      END IF;
    END LOOP;

    -- Reset invoice to Draft
    SELECT invoice_id INTO v_inv_id FROM sales_orders WHERE id = v_del.so_id;
    IF v_inv_id IS NOT NULL THEN
      UPDATE invoices SET status = 'Draft' WHERE id = v_inv_id;
    END IF;

    -- Set SO back to confirmed, clear invoice link
    UPDATE sales_orders
      SET status     = 'confirmed',
          invoice_id = NULL,
          updated_at = now()
    WHERE id = v_del.so_id;
  END IF;

  UPDATE deliveries
    SET status       = 'cancelled',
        cancelled_at = now(),
        cancelled_by = v_uid
  WHERE id = p_delivery_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_delivery(UUID) TO authenticated;
