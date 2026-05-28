-- Mark all procurement expenses as paid and clear next_due_date
-- Procurement costs are tracked via PO confirmations, not as payables
UPDATE expenses
SET
  next_due_date  = NULL,
  payment_status = 'paid'
WHERE source = 'procurement'
  AND (next_due_date IS NOT NULL OR payment_status IS DISTINCT FROM 'paid');
