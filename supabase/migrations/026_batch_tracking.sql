-- ================================================================
-- 026_batch_tracking.sql
-- Batch number tracking for warehouse
-- Run in Supabase SQL Editor
-- ================================================================

-- 1. product_batches table
CREATE TABLE IF NOT EXISTS product_batches (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id         uuid          NOT NULL REFERENCES products(id),
  warehouse_id       uuid          REFERENCES warehouses(id),
  batch_number       text          NOT NULL,
  gr_id              uuid          REFERENCES goods_receipts(id),
  po_number          text,
  received_date      date          NOT NULL DEFAULT CURRENT_DATE,
  expiry_date        date,
  quantity_received  numeric(12,3) NOT NULL,
  quantity_remaining numeric(12,3) NOT NULL,
  unit_cost          numeric(12,2) NOT NULL DEFAULT 0,
  status             text          NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','consumed','expired')),
  created_at         timestamptz   NOT NULL DEFAULT now(),
  UNIQUE(company_id, batch_number)
);

-- 2. RLS
ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_batches_company ON product_batches
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE TRIGGER trg_product_batches_company_id
  BEFORE INSERT ON product_batches
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

-- 3. Batch number generator: BATCH-YYYYMMDD-001
CREATE OR REPLACE FUNCTION generate_batch_number(p_company_id UUID, p_date DATE)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prefix TEXT := 'PAR-' || to_char(p_date, 'YYYYMMDD') || '-';
  v_seq    INT;
BEGIN
  SELECT COALESCE(MAX((split_part(batch_number, '-', 3))::int), 0) + 1
  INTO v_seq
  FROM product_batches
  WHERE company_id = p_company_id
    AND batch_number LIKE v_prefix || '%';

  RETURN v_prefix || lpad(v_seq::text, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION generate_batch_number(UUID, DATE) TO authenticated;

-- 4. Updated confirm_goods_receipt: stock movements + batch creation
CREATE OR REPLACE FUNCTION confirm_goods_receipt(p_gr_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_gr         RECORD;
  v_po         RECORD;
  v_expense_id BIGINT;
  v_uid        UUID := auth.uid();
  v_cid        UUID;
  v_wh_id      UUID;
  v_item       JSONB;
  v_prod_id    UUID;
  v_qty        NUMERIC;
  v_cost       NUMERIC;
  v_expiry     DATE;
  v_exist_qty  NUMERIC;
  v_exist_avg  NUMERIC;
  v_new_avg    NUMERIC;
BEGIN
  SELECT * INTO v_gr FROM goods_receipts WHERE id = p_gr_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Receipt not found'); END IF;

  v_cid := v_gr.company_id;

  IF v_cid IS DISTINCT FROM get_my_company_id() THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;

  IF v_gr.status = 'confirmed' THEN
    RETURN jsonb_build_object('error', 'Already confirmed');
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_gr.po_id;

  -- Create accrual expense (paid later when bank transfer done)
  INSERT INTO expenses (
    user_id, company_id, date, description, category,
    amount, is_recurring, is_payroll_generated, source, vendor_id,
    payment_status, vat_enabled
  ) VALUES (
    v_uid, v_cid,
    v_gr.received_date,
    'Satınalma: ' || v_po.po_number,
    'Other',
    v_po.total_amount,
    false, false, 'procurement', v_po.vendor_id,
    'pending', false
  ) RETURNING id INTO v_expense_id;

  UPDATE goods_receipts
    SET status = 'confirmed', expense_id = v_expense_id
  WHERE id = p_gr_id;

  UPDATE purchase_orders
    SET status = 'received', updated_at = now()
  WHERE id = v_gr.po_id;

  IF v_po.request_id IS NOT NULL THEN
    UPDATE purchase_requests
      SET status = 'ordered', updated_at = now()
    WHERE id = v_po.request_id;
  END IF;

  -- Stock movements + batch creation for each product line
  SELECT id INTO v_wh_id
  FROM warehouses WHERE company_id = v_cid AND is_default = true LIMIT 1;

  IF v_gr.items IS NOT NULL AND v_wh_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_gr.items) LOOP
      v_prod_id := (v_item->>'product_id')::uuid;
      CONTINUE WHEN v_prod_id IS NULL;

      v_qty    := COALESCE((v_item->>'received_qty')::numeric, (v_item->>'quantity')::numeric, 0);
      v_cost   := COALESCE((v_item->>'unit_price')::numeric, 0);
      v_expiry := NULLIF(trim(v_item->>'expiry_date'), '')::date;
      CONTINUE WHEN v_qty <= 0;

      -- Stock movement
      INSERT INTO stock_movements (
        company_id, product_id, warehouse_id, movement_type,
        quantity, unit_cost, total_cost,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        v_cid, v_prod_id, v_wh_id, 'in',
        v_qty, v_cost, v_qty * v_cost,
        'purchase_order', v_gr.po_id,
        'GR: ' || v_gr.receipt_number,
        v_uid
      );

      -- Batch record (one per product line per GR)
      INSERT INTO product_batches (
        company_id, product_id, warehouse_id, batch_number,
        gr_id, po_number, received_date, expiry_date,
        quantity_received, quantity_remaining, unit_cost
      ) VALUES (
        v_cid, v_prod_id, v_wh_id,
        generate_batch_number(v_cid, v_gr.received_date),
        p_gr_id, v_po.po_number, v_gr.received_date, v_expiry,
        v_qty, v_qty, v_cost
      );

      -- Weighted average cost update
      SELECT quantity, avg_cost INTO v_exist_qty, v_exist_avg
      FROM warehouse_stock WHERE product_id = v_prod_id AND warehouse_id = v_wh_id;

      IF FOUND THEN
        v_new_avg := CASE
          WHEN (v_exist_qty + v_qty) > 0
          THEN ((v_exist_qty * v_exist_avg) + (v_qty * v_cost)) / (v_exist_qty + v_qty)
          ELSE v_cost
        END;
        UPDATE warehouse_stock
          SET quantity = v_exist_qty + v_qty, avg_cost = v_new_avg, last_updated = now()
        WHERE product_id = v_prod_id AND warehouse_id = v_wh_id;
      ELSE
        INSERT INTO warehouse_stock (company_id, product_id, warehouse_id, quantity, avg_cost)
        VALUES (v_cid, v_prod_id, v_wh_id, v_qty, v_cost);
      END IF;

      UPDATE products
        SET stock_qty = stock_qty + v_qty, updated_at = now()
      WHERE id = v_prod_id AND company_id = v_cid;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'expense_id', v_expense_id);
END;
$$;
GRANT EXECUTE ON FUNCTION confirm_goods_receipt(UUID) TO authenticated;

-- 5. FIFO stock consumption (for future sales/stock-out)
CREATE OR REPLACE FUNCTION consume_stock_fifo(
  p_product_id UUID,
  p_qty        NUMERIC,
  p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cid       UUID    := get_my_company_id();
  v_uid       UUID    := auth.uid();
  v_wh_id     UUID;
  v_batch     RECORD;
  v_remaining NUMERIC := p_qty;
  v_current   NUMERIC;
  v_take      NUMERIC;
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

  -- Consume oldest batches first (FIFO)
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

    v_remaining := v_remaining - v_take;
  END LOOP;

  -- Stock movement record (negative quantity = outgoing)
  INSERT INTO stock_movements (
    company_id, product_id, warehouse_id, movement_type,
    quantity, reference_type, notes, created_by
  ) VALUES (
    v_cid, p_product_id, v_wh_id, 'out',
    -p_qty, 'sales_order', p_notes, v_uid
  );

  UPDATE products
    SET stock_qty = stock_qty - p_qty, updated_at = now()
  WHERE id = p_product_id AND company_id = v_cid;

  IF v_wh_id IS NOT NULL THEN
    UPDATE warehouse_stock
      SET quantity = quantity - p_qty, last_updated = now()
    WHERE product_id = p_product_id AND warehouse_id = v_wh_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'consumed', p_qty);
END;
$$;
GRANT EXECUTE ON FUNCTION consume_stock_fifo(UUID, NUMERIC, TEXT) TO authenticated;
