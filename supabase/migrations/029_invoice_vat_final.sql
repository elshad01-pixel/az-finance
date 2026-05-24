-- ================================================================
-- 029_invoice_vat_final.sql
-- Fix remaining VAT gaps after 028:
--   A) INV-1007 had vat_applied=true already, so 028 backfill skipped it
--      → set subtotal=amount, vat_amount=amount×0.18
--   B) SO-linked invoices (INV-1009, INV-1010) got vat_amount=0 because
--      their parent SOs had vat_amount=0
--      → backfill any remaining invoice where vat_amount=0 and amount>0
--   C) Update confirm_delivery to always compute 18% VAT from SO subtotal
--      so future deliveries produce invoices with correct vat fields
-- ================================================================

-- ─── A+B: Backfill all remaining invoices with vat_amount=0 ─────────────────

UPDATE invoices
SET
  subtotal    = CASE WHEN subtotal > 0 THEN subtotal ELSE amount END,
  vat_amount  = ROUND(
                  CASE WHEN subtotal > 0 THEN subtotal ELSE amount END
                  * 0.18, 2),
  vat_applied = true
WHERE amount > 0
  AND vat_amount = 0;


-- ─── C: confirm_delivery — always apply 18% VAT from SO subtotal ─────────────

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
  v_subtotal   NUMERIC;
  v_vat_amount NUMERIC;
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

  -- Use SO's VAT if set; otherwise calculate 18% from subtotal
  v_subtotal   := v_so.subtotal;
  v_vat_amount := CASE
    WHEN v_so.vat_amount > 0 THEN v_so.vat_amount
    ELSE ROUND(v_so.subtotal * 0.18, 2)
  END;

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
    v_subtotal,
    v_vat_amount,
    (v_vat_amount > 0)
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
