-- ================================================================
-- 046_invoice_void_credit_note.sql
--
-- Add void and credit-note support to invoices:
--   voided_at / voided_reason / voided_by  — set when invoice is voided
--   credit_note_for_id                     — links CN back to original
--   Extend status check to include CreditNote
-- ================================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS voided_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_reason      TEXT,
  ADD COLUMN IF NOT EXISTS voided_by          UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS credit_note_for_id INTEGER REFERENCES invoices(id);

-- Drop old constraint (name may vary) and recreate with CreditNote
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY[
    'Paid', 'Unpaid', 'Draft', 'Cancelled',
    'Overdue', 'CreditNote'
  ]));
