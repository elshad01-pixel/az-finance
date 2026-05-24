-- ================================================================
-- 039_cancel_so_delivery.sql
-- Cancel support for deliveries and sales orders
-- Apply in Supabase SQL Editor
-- ================================================================

-- 1. Add cancel audit columns
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by  UUID REFERENCES auth.users(id);

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by  UUID REFERENCES auth.users(id);

-- 2. Expand deliveries.status CHECK to allow 'cancelled'
DO $$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM   pg_constraint
  WHERE  conrelid = 'deliveries'::regclass AND contype = 'c'
    AND  pg_get_constraintdef(oid) LIKE '%confirmed%';
  IF v_con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE deliveries DROP CONSTRAINT ' || quote_ident(v_con);
  END IF;
END;
$$;

ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('draft', 'confirmed', 'cancelled'));

-- 3. cancel_delivery RPC
--    • Reverses stock OUT movements (ADJUSTMENT + restores product_qty)
--    • Resets linked invoice to Draft
--    • Sets SO back to 'confirmed'
--    • Sets delivery status to 'cancelled'
CREATE OR REPLACE FUNCTION cancel_delivery(p_delivery_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del     RECORD;
  v_cid     UUID := get_my_company_id();
  v_uid     UUID := auth.uid();
  v_mv      RECORD;
  v_inv_id  BIGINT;
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
    -- Reverse each OUT movement created by this delivery
    FOR v_mv IN
      SELECT * FROM stock_movements
      WHERE  notes = 'DEL: ' || v_del.delivery_number
        AND  movement_type = 'out'
        AND  company_id    = v_cid
    LOOP
      INSERT INTO stock_movements (
        company_id, product_id, warehouse_id, movement_type,
        quantity, unit_cost, total_cost, reference_type, notes, created_by
      ) VALUES (
        v_cid, v_mv.product_id, v_mv.warehouse_id, 'adjustment',
        ABS(v_mv.quantity), v_mv.unit_cost,
        ABS(COALESCE(v_mv.total_cost, 0)),
        'sales_order', 'CANCEL: ' || v_del.delivery_number, v_uid
      );

      UPDATE products
        SET stock_qty = stock_qty + ABS(v_mv.quantity)
      WHERE id = v_mv.product_id AND company_id = v_cid;

      IF v_mv.warehouse_id IS NOT NULL THEN
        UPDATE warehouse_stock
          SET quantity = quantity + ABS(v_mv.quantity), last_updated = now()
        WHERE product_id = v_mv.product_id AND warehouse_id = v_mv.warehouse_id;
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
