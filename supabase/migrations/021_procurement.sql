-- ================================================================
-- 021_procurement.sql
-- Run in Supabase SQL Editor
-- ================================================================

-- ── Add source column to expenses ────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'procurement', 'payroll'));

-- ── purchase_requests ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_requests (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_number   TEXT          NOT NULL,
  requested_by     UUID          NOT NULL REFERENCES auth.users(id),
  title            TEXT          NOT NULL,
  description      TEXT,
  vendor_id        BIGINT        REFERENCES vendors(id),
  items            JSONB         NOT NULL DEFAULT '[]',
  total_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','ordered')),
  priority         TEXT          NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  needed_by        DATE,
  approved_by      UUID          REFERENCES auth.users(id),
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── purchase_orders ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_number      TEXT          NOT NULL,
  request_id     UUID          REFERENCES purchase_requests(id),
  vendor_id      BIGINT        NOT NULL REFERENCES vendors(id),
  items          JSONB         NOT NULL DEFAULT '[]',
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','confirmed','partially_received','received','cancelled')),
  payment_terms  TEXT,
  delivery_date  DATE,
  notes          TEXT,
  created_by     UUID          NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── goods_receipts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goods_receipts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_number TEXT        NOT NULL,
  po_id          UUID        NOT NULL REFERENCES purchase_orders(id),
  received_by    UUID        NOT NULL REFERENCES auth.users(id),
  received_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  items          JSONB       NOT NULL DEFAULT '[]',
  notes          TEXT,
  status         TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed')),
  expense_id     BIGINT      REFERENCES expenses(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_company_policy" ON purchase_requests FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "po_company_policy" ON purchase_orders FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "gr_company_policy" ON goods_receipts FOR ALL TO authenticated
  USING  (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── updated_at triggers ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_proc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_pr_updated_at
  BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_proc_updated_at();

CREATE OR REPLACE TRIGGER trg_po_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_proc_updated_at();

-- ── Auto-number RPCs ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_next_pr_number(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM purchase_requests
  WHERE company_id = p_company_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());
  RETURN 'PR-' || to_char(now(), 'YYYY') || '-' || LPAD((v_count + 1)::text, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_pr_number(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION get_next_po_number(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM purchase_orders
  WHERE company_id = p_company_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());
  RETURN 'PO-' || to_char(now(), 'YYYY') || '-' || LPAD((v_count + 1)::text, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_po_number(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION get_next_gr_number(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM goods_receipts
  WHERE company_id = p_company_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());
  RETURN 'GR-' || to_char(now(), 'YYYY') || '-' || LPAD((v_count + 1)::text, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_gr_number(UUID) TO authenticated;

-- ── Confirm goods receipt → auto-create expense ──────────────────
CREATE OR REPLACE FUNCTION confirm_goods_receipt(p_gr_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_gr         RECORD;
  v_po         RECORD;
  v_expense_id BIGINT;
  v_uid        UUID := auth.uid();
  v_cid        UUID := get_my_company_id();
BEGIN
  SELECT * INTO v_gr FROM goods_receipts WHERE id = p_gr_id AND company_id = v_cid;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Receipt not found'); END IF;
  IF v_gr.status = 'confirmed' THEN RETURN jsonb_build_object('error', 'Already confirmed'); END IF;

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
    'paid', false
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
