-- ================================================================
-- 035_cancel_gr_003.sql
-- GR-2026-003 is a duplicate draft GR against PO-2026-003.
-- GR-2026-004 is the valid confirmed receipt for that PO.
-- The over-receipt guard (migration 034) already blocks confirming
-- this draft, but leaving it as 'draft' creates audit noise.
-- 1. Extend the status CHECK constraint to allow 'cancelled'.
-- 2. Cancel GR-2026-003.
-- ================================================================

-- ─── 1. Add 'cancelled' to the goods_receipts status constraint ──────────────

ALTER TABLE goods_receipts
  DROP CONSTRAINT IF EXISTS goods_receipts_status_check;

ALTER TABLE goods_receipts
  ADD CONSTRAINT goods_receipts_status_check
  CHECK (status IN ('draft', 'confirmed', 'cancelled'));

-- ─── 2. Cancel GR-2026-003 ───────────────────────────────────────────────────

UPDATE goods_receipts
SET    status = 'cancelled',
       notes  = COALESCE(notes || ' ', '')
                || '[CANCELLED — duplicate GR against PO-2026-003; '
                || 'GR-2026-004 is the valid confirmed receipt]'
WHERE  receipt_number = 'GR-2026-003'
  AND  status         = 'draft';
