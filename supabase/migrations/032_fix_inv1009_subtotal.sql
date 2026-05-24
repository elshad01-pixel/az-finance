-- ================================================================
-- 032_fix_inv1009_subtotal.sql
-- INV-1009 has amount=100 (corrected in UI) but subtotal=10 / vat_amount=1.8
-- from the original SO confirmation (old unit_price=10 before backfill).
-- Migration 031 updated SO items unit_price→100 but could not update the
-- already-created invoice. Fix both the invoice and the SO's own totals.
-- ================================================================

-- ─── 1. INV-1009: align subtotal + vat_amount with amount=100 ────────────────

UPDATE invoices
SET    subtotal    = amount,
       vat_amount  = ROUND(amount * 0.18, 2),
       vat_applied = true
WHERE  number    = 'INV-1009'
  AND  amount    = 100
  AND  subtotal  = 10;

-- ─── 2. SO-2026-001: align subtotal + total_amount with backfilled item price ─

UPDATE sales_orders
SET    subtotal     = 100,
       total_amount = 100,
       updated_at   = now()
WHERE  so_number   = 'SO-2026-001'
  AND  total_amount < 100;
