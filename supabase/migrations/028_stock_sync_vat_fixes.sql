-- ================================================================
-- 028_stock_sync_vat_fixes.sql
-- Fix 4 audit bugs:
--   BUG 1: Trigger keeps products.stock_qty in sync with warehouse_stock
--   BUG 2+3: Create missing Kreslo product_batch, fix negative warehouse_stock,
--            recalculate DEL-2026-002 cogs_amount
--   BUG 4: Add vat_amount/subtotal to invoices; backfill vat_applied; fix
--           confirm_delivery to propagate SO VAT fields to the invoice
-- ================================================================

-- ─── BUG 1: warehouse_stock → products.stock_qty sync trigger ──────────────

CREATE OR REPLACE FUNCTION fn_sync_product_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_prod_id UUID;
BEGIN
  v_prod_id := CASE TG_OP WHEN 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;
  UPDATE products
    SET stock_qty  = COALESCE(
          (SELECT SUM(quantity) FROM warehouse_stock WHERE product_id = v_prod_id),
          0),
        updated_at = now()
  WHERE id = v_prod_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_stock ON warehouse_stock;
CREATE TRIGGER trg_sync_product_stock
  AFTER INSERT OR UPDATE OR DELETE ON warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION fn_sync_product_stock();

-- Replace confirm_goods_receipt: remove explicit products.stock_qty update;
-- the trigger handles it via warehouse_stock.
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

      -- Update warehouse_stock; trigger syncs products.stock_qty automatically
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

-- Replace consume_stock_fifo: remove explicit products.stock_qty update;
-- the trigger handles it via warehouse_stock.
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

  INSERT INTO stock_movements (
    company_id, product_id, warehouse_id, movement_type,
    quantity, reference_type, notes, created_by
  ) VALUES (
    v_cid, p_product_id, v_wh_id, 'out',
    -p_qty, 'sales_order', p_notes, v_uid
  );

  -- Update warehouse_stock; trigger syncs products.stock_qty automatically
  IF v_wh_id IS NOT NULL THEN
    UPDATE warehouse_stock
      SET quantity = quantity - p_qty, last_updated = now()
    WHERE product_id = p_product_id AND warehouse_id = v_wh_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'consumed', p_qty);
END;
$$;
GRANT EXECUTE ON FUNCTION consume_stock_fifo(UUID, NUMERIC, TEXT) TO authenticated;

-- Replace adjust_stock: remove explicit products.stock_qty update;
-- the trigger handles it via warehouse_stock.
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id  UUID,
  p_new_qty     NUMERIC,
  p_notes       TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cid     UUID := get_my_company_id();
  v_uid     UUID := auth.uid();
  v_wh_id   UUID;
  v_old_qty NUMERIC;
  v_delta   NUMERIC;
BEGIN
  SELECT stock_qty INTO v_old_qty FROM products WHERE id = p_product_id AND company_id = v_cid;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Product not found'); END IF;

  v_delta := p_new_qty - v_old_qty;
  IF v_delta = 0 THEN RETURN jsonb_build_object('ok', true); END IF;

  SELECT id INTO v_wh_id FROM warehouses WHERE company_id = v_cid AND is_default = true LIMIT 1;

  INSERT INTO stock_movements (
    company_id, product_id, warehouse_id, movement_type,
    quantity, reference_type, notes, created_by
  ) VALUES (
    v_cid, p_product_id, v_wh_id, 'adjustment',
    v_delta, 'adjustment', p_notes, v_uid
  );

  -- Update warehouse_stock; trigger syncs products.stock_qty automatically
  IF v_wh_id IS NOT NULL THEN
    INSERT INTO warehouse_stock (company_id, product_id, warehouse_id, quantity)
    VALUES (v_cid, p_product_id, v_wh_id, p_new_qty)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = p_new_qty, last_updated = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'delta', v_delta);
END;
$$;
GRANT EXECUTE ON FUNCTION adjust_stock(UUID, NUMERIC, TEXT) TO authenticated;

-- One-time resync: bring all products.stock_qty in line with warehouse_stock
UPDATE products p
SET stock_qty  = COALESCE(
      (SELECT SUM(ws.quantity) FROM warehouse_stock ws WHERE ws.product_id = p.id),
      0),
    updated_at = now();


-- ─── BUG 2+3: Kreslo product_batch + negative warehouse_stock + COGS ────────

DO $$
DECLARE
  v_kreslo_id UUID;
  v_gr_id     UUID;
  v_wh_id     UUID;
  v_cid       UUID;
  v_qty       NUMERIC;
  v_cost      NUMERIC;
  v_po_number TEXT;
  v_recv_date DATE;
  v_batch_num TEXT;
  v_del_id    UUID;
  v_in_qty    NUMERIC;
  v_out_qty   NUMERIC;
  v_correct   NUMERIC;
  v_batch_rem NUMERIC;
  v_cogs      NUMERIC;
BEGIN
  -- Locate Kreslo product (case-insensitive; any company)
  SELECT id, company_id INTO v_kreslo_id, v_cid
  FROM products WHERE name ILIKE '%kreslo%' LIMIT 1;

  IF v_kreslo_id IS NULL THEN
    RAISE NOTICE 'BUG 2+3: Kreslo product not found — skipping (no data to fix)';
    RETURN;
  END IF;

  SELECT id INTO v_wh_id
  FROM warehouses WHERE company_id = v_cid AND is_default = true LIMIT 1;

  -- Find the confirmed GR that contains Kreslo
  SELECT gr.id, gr.received_date, po.po_number,
         (item->>'received_qty')::numeric,
         (item->>'unit_price')::numeric
  INTO v_gr_id, v_recv_date, v_po_number, v_qty, v_cost
  FROM goods_receipts gr
  JOIN purchase_orders po ON po.id = gr.po_id
  CROSS JOIN LATERAL jsonb_array_elements(gr.items) AS item
  WHERE gr.company_id = v_cid
    AND gr.status = 'confirmed'
    AND (item->>'product_id')::uuid = v_kreslo_id
  ORDER BY gr.received_date
  LIMIT 1;

  -- Fallbacks when GR data is incomplete
  IF v_qty IS NULL OR v_qty <= 0 THEN v_qty := 10; END IF;
  IF v_cost IS NULL OR v_cost <= 0 THEN
    SELECT cost_price INTO v_cost FROM products WHERE id = v_kreslo_id;
  END IF;
  IF v_cost IS NULL OR v_cost <= 0 THEN v_cost := 1; END IF;
  IF v_recv_date IS NULL THEN v_recv_date := CURRENT_DATE - INTERVAL '30 days'; END IF;
  IF v_po_number IS NULL THEN v_po_number := 'UNKNOWN'; END IF;

  -- Create product_batch for Kreslo if missing
  IF NOT EXISTS (
    SELECT 1 FROM product_batches
    WHERE product_id = v_kreslo_id AND company_id = v_cid
  ) THEN
    SELECT COALESCE(SUM(ABS(quantity)), 0) INTO v_out_qty
    FROM stock_movements
    WHERE product_id = v_kreslo_id AND company_id = v_cid AND movement_type = 'out';

    v_batch_rem := GREATEST(0, v_qty - v_out_qty);
    v_batch_num := generate_batch_number(v_cid, v_recv_date);

    INSERT INTO product_batches (
      company_id, product_id, warehouse_id, batch_number,
      gr_id, po_number, received_date,
      quantity_received, quantity_remaining, unit_cost, status
    ) VALUES (
      v_cid, v_kreslo_id, v_wh_id, v_batch_num,
      v_gr_id, v_po_number, v_recv_date,
      v_qty, v_batch_rem, v_cost,
      CASE WHEN v_batch_rem > 0 THEN 'active' ELSE 'consumed' END
    );

    RAISE NOTICE 'BUG 2: Kreslo batch created (%), received=%, remaining=%, cost=%',
      v_batch_num, v_qty, v_batch_rem, v_cost;
  ELSE
    RAISE NOTICE 'BUG 2: Kreslo batch already exists — skipping';
  END IF;

  -- Recompute correct warehouse_stock from stock_movements (authoritative ledger)
  SELECT COALESCE(SUM(quantity), 0) INTO v_in_qty
  FROM stock_movements
  WHERE product_id = v_kreslo_id AND company_id = v_cid AND movement_type = 'in';

  SELECT COALESCE(SUM(ABS(quantity)), 0) INTO v_out_qty
  FROM stock_movements
  WHERE product_id = v_kreslo_id AND company_id = v_cid AND movement_type = 'out';

  v_correct := v_in_qty - v_out_qty;

  IF EXISTS (
    SELECT 1 FROM warehouse_stock
    WHERE product_id = v_kreslo_id AND warehouse_id = v_wh_id
  ) THEN
    UPDATE warehouse_stock
      SET quantity = v_correct, last_updated = now()
    WHERE product_id = v_kreslo_id AND warehouse_id = v_wh_id;
  ELSE
    INSERT INTO warehouse_stock (company_id, product_id, warehouse_id, quantity)
    VALUES (v_cid, v_kreslo_id, v_wh_id, v_correct);
  END IF;
  -- The trigger trg_sync_product_stock fires here and syncs products.stock_qty
  RAISE NOTICE 'BUG 3: Kreslo warehouse_stock corrected to % (in=%, out=%)',
    v_correct, v_in_qty, v_out_qty;

  -- Recalculate DEL-2026-002 cogs_amount: add Kreslo's contribution
  SELECT d.id INTO v_del_id
  FROM deliveries d
  WHERE d.company_id = v_cid AND d.delivery_number = 'DEL-2026-002';

  IF v_del_id IS NOT NULL THEN
    SELECT ROUND((item->>'delivered_qty')::numeric * v_cost, 2) INTO v_cogs
    FROM deliveries d
    CROSS JOIN LATERAL jsonb_array_elements(d.items) AS item
    WHERE d.id = v_del_id
      AND (item->>'product_id')::uuid = v_kreslo_id
    LIMIT 1;

    IF v_cogs IS NOT NULL AND v_cogs > 0 THEN
      -- Add Kreslo's COGS to the delivery (other items' COGS already recorded)
      UPDATE deliveries
        SET cogs_amount = cogs_amount + v_cogs
      WHERE id = v_del_id;
      RAISE NOTICE 'BUG 3: DEL-2026-002 cogs_amount += %', v_cogs;
    END IF;
  ELSE
    RAISE NOTICE 'BUG 3: DEL-2026-002 not found — skipping COGS fix';
  END IF;
END;
$$;


-- ─── BUG 4: Invoice VAT — add columns, backfill, fix confirm_delivery ────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS subtotal   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) NOT NULL DEFAULT 0;

-- Backfill invoices generated by confirm_delivery (linked via sales_orders.invoice_id)
UPDATE invoices i
SET
  subtotal    = so.subtotal,
  vat_amount  = so.vat_amount,
  vat_applied = (so.vat_amount > 0)
FROM sales_orders so
WHERE so.invoice_id = i.id
  AND i.vat_applied = false;

-- Backfill seed / manually created invoices (amount = pre-VAT subtotal, 18% VAT)
UPDATE invoices i
SET
  subtotal    = i.amount,
  vat_amount  = ROUND(i.amount * 0.18, 2),
  vat_applied = true
WHERE i.vat_applied = false
  AND i.amount > 0
  AND NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.invoice_id = i.id);

-- Fix confirm_delivery: populate subtotal + vat_amount on the auto-created invoice
CREATE OR REPLACE FUNCTION confirm_delivery(p_delivery_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del        RECORD;
  v_so         RECORD;
  v_client     RECORD;
  v_cid        UUID    := get_my_company_id();
  v_uid        UUID    := auth.uid();
  v_item       JSONB;
  v_prod_id    UUID;
  v_qty        NUMERIC;
  v_batch      RECORD;
  v_remaining  NUMERIC;
  v_take       NUMERIC;
  v_item_cogs  NUMERIC;
  v_total_cogs NUMERIC := 0;
  v_result     JSONB;
  v_inv_id     BIGINT;
  v_inv_number TEXT;
  v_inv_seq    INT;
BEGIN
  SELECT * INTO v_del FROM deliveries WHERE id = p_delivery_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Delivery not found'); END IF;
  IF v_del.company_id IS DISTINCT FROM v_cid THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;
  IF v_del.status = 'confirmed' THEN
    RETURN jsonb_build_object('error', 'Already confirmed');
  END IF;

  SELECT * INTO v_so FROM sales_orders WHERE id = v_del.so_id;
  SELECT * INTO v_client FROM clients WHERE id = v_so.client_id;

  IF v_del.items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_del.items) LOOP
      v_prod_id := NULLIF(trim(v_item->>'product_id'), '')::uuid;
      CONTINUE WHEN v_prod_id IS NULL;

      v_qty := COALESCE((v_item->>'delivered_qty')::numeric, 0);
      CONTINUE WHEN v_qty <= 0;

      v_item_cogs := 0;
      v_remaining := v_qty;
      FOR v_batch IN
        SELECT * FROM product_batches
        WHERE product_id = v_prod_id AND company_id = v_cid
          AND status = 'active' AND quantity_remaining > 0
        ORDER BY received_date ASC, created_at ASC
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := LEAST(v_batch.quantity_remaining, v_remaining);
        v_item_cogs := v_item_cogs + (v_take * v_batch.unit_cost);
        v_remaining := v_remaining - v_take;
      END LOOP;
      v_total_cogs := v_total_cogs + v_item_cogs;

      v_result := consume_stock_fifo(v_prod_id, v_qty, 'DEL: ' || v_del.delivery_number);
      IF v_result->>'error' IS NOT NULL THEN
        RETURN v_result;
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(MAX((regexp_replace(number, '[^0-9]', '', 'g'))::int), 1000) + 1
  INTO v_inv_seq FROM invoices WHERE company_id = v_cid;
  v_inv_number := 'INV-' || v_inv_seq::text;

  INSERT INTO invoices (
    user_id, company_id, number, client, client_id, client_email, client_address,
    date, due_date, amount, status, line_items,
    subtotal, vat_amount, vat_applied
  ) VALUES (
    v_uid, v_cid, v_inv_number,
    COALESCE(v_client.company, ''),
    v_so.client_id,
    COALESCE(v_client.email, ''),
    COALESCE(v_client.address, ''),
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_so.total_amount,
    'Draft',
    v_so.items,
    v_so.subtotal,
    v_so.vat_amount,
    (v_so.vat_amount > 0)
  ) RETURNING id INTO v_inv_id;

  UPDATE deliveries
    SET status = 'confirmed', cogs_amount = v_total_cogs
  WHERE id = p_delivery_id;

  UPDATE sales_orders
    SET status = 'delivered', invoice_id = v_inv_id, updated_at = now()
  WHERE id = v_del.so_id;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_inv_id, 'invoice_number', v_inv_number);
END;
$$;
GRANT EXECUTE ON FUNCTION confirm_delivery(UUID) TO authenticated;
