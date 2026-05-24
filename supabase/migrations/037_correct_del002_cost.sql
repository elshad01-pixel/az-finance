-- ================================================================
-- 037_correct_del002_cost.sql
-- Migration 036 backfilled DEL-2026-002 with total_cost=120
-- (4 Kreslo × ₼30) based on the delivery qty.
-- The actual FIFO consumption was 1 unit × ₼30 = ₼30 because
-- only 1 Kreslo was in stock at the time of delivery.
-- Correct the OUT movement to reflect actual FIFO cost.
-- ================================================================

UPDATE stock_movements
SET    total_cost = 30,
       unit_cost  = 30
WHERE  movement_type = 'out'
  AND  notes        = 'DEL: DEL-2026-002';

-- Also ensure DEL-2026-001 and DEL-2026-003 are correct
-- (idempotent — safe to re-run if 036 was not applied)

UPDATE stock_movements
SET    unit_cost  = 34,
       total_cost = 34
WHERE  movement_type = 'out'
  AND  notes        = 'DEL: DEL-2026-001';

UPDATE stock_movements
SET    unit_cost  = 34,
       total_cost = 2720
WHERE  movement_type = 'out'
  AND  notes        = 'DEL: DEL-2026-003';
