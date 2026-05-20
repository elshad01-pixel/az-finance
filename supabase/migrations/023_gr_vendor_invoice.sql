-- ================================================================
-- 023_gr_vendor_invoice.sql
-- Add vendor invoice fields to goods_receipts
-- Fix: expense payment_status = 'pending' (accrual, not yet cash)
-- Run in Supabase SQL Editor
-- ================================================================

ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS vendor_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS vendor_invoice_date   DATE,
  ADD COLUMN IF NOT EXISTS vendor_invoice_amount NUMERIC(12,2);

-- Fix: expense should be 'pending' at receipt time (accrual accounting).
-- Finance marks it 'paid' when the bank transfer is done.
CREATE OR REPLACE FUNCTION confirm_goods_receipt(p_gr_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_gr         RECORD;
  v_po         RECORD;
  v_expense_id BIGINT;
  v_uid        UUID := auth.uid();
  v_cid        UUID;
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

  RETURN jsonb_build_object('ok', true, 'expense_id', v_expense_id);
END;
$$;
GRANT EXECUTE ON FUNCTION confirm_goods_receipt(UUID) TO authenticated;
