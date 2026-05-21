-- ================================================================
-- 027_sales_orders.sql
-- Sales Orders and Deliveries (linked to warehouse FIFO)
-- Run in Supabase SQL Editor
-- ================================================================

-- 1. sales_orders table
CREATE TABLE IF NOT EXISTS sales_orders (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  so_number      text          NOT NULL,
  client_id      bigint        NOT NULL REFERENCES clients(id),
  items          jsonb         NOT NULL DEFAULT '[]',
  subtotal       numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount     numeric(12,2) NOT NULL DEFAULT 0,
  total_amount   numeric(12,2) NOT NULL DEFAULT 0,
  status         text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','delivered','invoiced','cancelled')),
  delivery_date  date,
  notes          text,
  invoice_id     bigint        REFERENCES invoices(id),
  created_by     uuid          REFERENCES auth.users(id),
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  UNIQUE(company_id, so_number)
);

ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_orders_company ON sales_orders
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE TRIGGER trg_sales_orders_company_id
  BEFORE INSERT ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

-- 2. deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  delivery_number text          NOT NULL,
  so_id           uuid          NOT NULL REFERENCES sales_orders(id),
  delivered_by    uuid          REFERENCES auth.users(id),
  delivery_date   date          NOT NULL DEFAULT CURRENT_DATE,
  items           jsonb         NOT NULL DEFAULT '[]',
  status          text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed')),
  notes           text,
  cogs_amount     numeric(12,2) NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE(company_id, delivery_number)
);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY deliveries_company ON deliveries
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE TRIGGER trg_deliveries_company_id
  BEFORE INSERT ON deliveries
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

-- 3. confirm_delivery RPC
--    Deducts stock FIFO, records COGS, auto-creates draft invoice, updates SO status
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

  -- Process each stock item
  IF v_del.items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_del.items) LOOP
      v_prod_id := NULLIF(trim(v_item->>'product_id'), '')::uuid;
      CONTINUE WHEN v_prod_id IS NULL;

      v_qty := COALESCE((v_item->>'delivered_qty')::numeric, 0);
      CONTINUE WHEN v_qty <= 0;

      -- Calculate COGS (FIFO) before consuming
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

      -- Deduct stock via FIFO (reuses existing function)
      v_result := consume_stock_fifo(v_prod_id, v_qty, 'DEL: ' || v_del.delivery_number);
      IF v_result->>'error' IS NOT NULL THEN
        RETURN v_result;
      END IF;
    END LOOP;
  END IF;

  -- Generate invoice number (same format as frontend: INV-{maxNum+1})
  SELECT COALESCE(MAX((regexp_replace(number, '[^0-9]', '', 'g'))::int), 1000) + 1
  INTO v_inv_seq FROM invoices WHERE company_id = v_cid;
  v_inv_number := 'INV-' || v_inv_seq::text;

  -- Auto-create draft invoice linked to this SO
  INSERT INTO invoices (
    user_id, company_id, number, client, client_id, client_email, client_address,
    date, due_date, amount, status, line_items, vat_applied
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
    (v_so.vat_amount > 0)
  ) RETURNING id INTO v_inv_id;

  -- Confirm delivery + record COGS
  UPDATE deliveries
    SET status = 'confirmed', cogs_amount = v_total_cogs
  WHERE id = p_delivery_id;

  -- Update SO: delivered + link invoice
  UPDATE sales_orders
    SET status = 'delivered', invoice_id = v_inv_id, updated_at = now()
  WHERE id = v_del.so_id;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_inv_id, 'invoice_number', v_inv_number);
END;
$$;
GRANT EXECUTE ON FUNCTION confirm_delivery(UUID) TO authenticated;
