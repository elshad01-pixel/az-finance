-- ================================================================
-- 042_product_resale_flag.sql
-- 1. Add is_for_resale flag to products (default TRUE)
-- 2. Rewrite confirm_goods_receipt() to split COGS vs OpEx
--    by each item's is_for_resale flag
-- ================================================================

-- ─── 1. Schema change ─────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_for_resale BOOLEAN DEFAULT TRUE;

-- Explicit set for known resale products (they already get TRUE from default)
UPDATE products
SET is_for_resale = TRUE
WHERE name IN ('Kreslo', 'Windows', 'Lap top', 'Table', 'Castor VD-40');

-- ─── 2. Rewrite confirm_goods_receipt() ───────────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_goods_receipt(p_gr_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_gr          RECORD;
  v_po          RECORD;
  v_expense_id  BIGINT;
  v_expense_id2 BIGINT;
  v_uid         UUID := auth.uid();
  v_cid         UUID;
  v_wh_id       UUID;
  v_item        JSONB;
  v_prod_id     UUID;
  v_qty         NUMERIC;
  v_cost        NUMERIC;
  v_expiry      DATE;
  v_exist_qty   NUMERIC;
  v_exist_avg   NUMERIC;
  v_new_avg     NUMERIC;
  v_is_resale   BOOLEAN;
  v_resale_amt  NUMERIC := 0;
  v_opex_amt    NUMERIC := 0;
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

  -- ── Pass 1: compute resale vs non-resale amounts from GR items ─────────────
  IF v_gr.items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_gr.items) LOOP
      v_prod_id := (v_item->>'product_id')::uuid;
      v_qty     := COALESCE((v_item->>'received_qty')::numeric, (v_item->>'quantity')::numeric, 0);
      v_cost    := COALESCE((v_item->>'unit_price')::numeric, 0);
      CONTINUE WHEN v_qty <= 0;

      IF v_prod_id IS NOT NULL THEN
        SELECT COALESCE(is_for_resale, TRUE) INTO v_is_resale
        FROM products WHERE id = v_prod_id;
        IF COALESCE(v_is_resale, TRUE) THEN
          v_resale_amt := v_resale_amt + (v_qty * v_cost);
        ELSE
          v_opex_amt := v_opex_amt + (v_qty * v_cost);
        END IF;
      ELSE
        -- Free-text line item (no product_id) → treat as resale
        v_resale_amt := v_resale_amt + (v_qty * v_cost);
      END IF;
    END LOOP;
  END IF;

  -- Fallback: no items parsed → use PO total as COGS
  IF v_resale_amt = 0 AND v_opex_amt = 0 THEN
    v_resale_amt := v_po.total_amount;
  END IF;

  -- ── Create COGS expense for resale goods ───────────────────────────────────
  IF v_resale_amt > 0 THEN
    INSERT INTO expenses (
      user_id, company_id, date, description, category,
      amount, is_recurring, is_payroll_generated, source, vendor_id,
      payment_status, vat_enabled
    ) VALUES (
      v_uid, v_cid, v_gr.received_date,
      'Satınalma: ' || v_po.po_number, 'COGS',
      v_resale_amt, false, false, 'procurement', v_po.vendor_id,
      'pending', false
    ) RETURNING id INTO v_expense_id;
  END IF;

  -- ── Create Office expense for non-resale (internal use) goods ─────────────
  IF v_opex_amt > 0 THEN
    INSERT INTO expenses (
      user_id, company_id, date, description, category,
      amount, is_recurring, is_payroll_generated, source, vendor_id,
      payment_status, vat_enabled
    ) VALUES (
      v_uid, v_cid, v_gr.received_date,
      'Satınalma (daxili): ' || v_po.po_number, 'Office',
      v_opex_amt, false, false, 'procurement', v_po.vendor_id,
      'pending', false
    ) RETURNING id INTO v_expense_id2;
    -- Link GR to whichever expense was created first
    IF v_expense_id IS NULL THEN
      v_expense_id := v_expense_id2;
    END IF;
  END IF;

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

  -- ── Pass 2: stock movements + batches ──────────────────────────────────────
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
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'expense_id', v_expense_id);
END;
$$;
GRANT EXECUTE ON FUNCTION confirm_goods_receipt(UUID) TO authenticated;
