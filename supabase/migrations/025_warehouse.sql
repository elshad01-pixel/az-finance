-- ================================================================
-- 025_warehouse.sql
-- Product Register & Warehouse module
-- Run in Supabase SQL Editor
-- ================================================================

-- 1. Products
CREATE TABLE IF NOT EXISTS products (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku              text          NOT NULL,
  name             text          NOT NULL,
  description      text,
  category         text,
  unit             text          NOT NULL DEFAULT 'əd'
    CHECK (unit IN ('əd','kq','q','litr','ml','m','m²','m³','qutu','dəst')),
  cost_price       numeric(12,2) NOT NULL DEFAULT 0,
  sale_price       numeric(12,2) NOT NULL DEFAULT 0,
  stock_qty        numeric(12,3) NOT NULL DEFAULT 0,
  min_stock_level  numeric(12,3) NOT NULL DEFAULT 0,
  status           text          NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  UNIQUE(company_id, sku)
);

-- 2. Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  location    text,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Stock movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id     uuid          NOT NULL REFERENCES products(id),
  warehouse_id   uuid          REFERENCES warehouses(id),
  movement_type  text          NOT NULL
    CHECK (movement_type IN ('in','out','adjustment','transfer')),
  quantity       numeric(12,3) NOT NULL,
  unit_cost      numeric(12,2),
  total_cost     numeric(12,2),
  reference_type text
    CHECK (reference_type IN ('purchase_order','sales_order','adjustment','opening')),
  reference_id   uuid,
  notes          text,
  created_by     uuid          REFERENCES auth.users(id),
  created_at     timestamptz   NOT NULL DEFAULT now()
);

-- 4. Warehouse stock (per-warehouse balance)
CREATE TABLE IF NOT EXISTS warehouse_stock (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id    uuid          NOT NULL REFERENCES products(id),
  warehouse_id  uuid          NOT NULL REFERENCES warehouses(id),
  quantity      numeric(12,3) NOT NULL DEFAULT 0,
  avg_cost      numeric(12,2) NOT NULL DEFAULT 0,
  last_updated  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_id)
);

-- 5. RLS
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_company ON products
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY warehouses_company ON warehouses
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY stock_movements_company ON stock_movements
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY warehouse_stock_company ON warehouse_stock
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- 6. Auto-set company_id triggers
CREATE TRIGGER trg_products_company_id
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

CREATE TRIGGER trg_warehouses_company_id
  BEFORE INSERT ON warehouses
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

CREATE TRIGGER trg_stock_movements_company_id
  BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

CREATE TRIGGER trg_warehouse_stock_company_id
  BEFORE INSERT ON warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

-- 7. Updated_at trigger for products
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_products_updated_at();

-- 8. Auto-create default warehouse for existing companies
INSERT INTO warehouses (company_id, name, is_default)
SELECT id, 'Əsas Anbar', true
FROM companies
WHERE id NOT IN (SELECT DISTINCT company_id FROM warehouses);

-- 9. Update confirm_goods_receipt to also write stock movements
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

  -- Stock movements: process each GR item that has a product_id
  SELECT id INTO v_wh_id
  FROM warehouses WHERE company_id = v_cid AND is_default = true LIMIT 1;

  IF v_gr.items IS NOT NULL AND v_wh_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_gr.items) LOOP
      v_prod_id := (v_item->>'product_id')::uuid;
      CONTINUE WHEN v_prod_id IS NULL;

      v_qty  := COALESCE((v_item->>'received_qty')::numeric, (v_item->>'quantity')::numeric, 0);
      v_cost := COALESCE((v_item->>'unit_price')::numeric, 0);
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

-- 10. Function for stock adjustment (called from client)
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id  UUID,
  p_new_qty     NUMERIC,
  p_notes       TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cid       UUID := get_my_company_id();
  v_uid       UUID := auth.uid();
  v_wh_id     UUID;
  v_old_qty   NUMERIC;
  v_delta     NUMERIC;
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

  UPDATE products SET stock_qty = p_new_qty, updated_at = now()
  WHERE id = p_product_id AND company_id = v_cid;

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
