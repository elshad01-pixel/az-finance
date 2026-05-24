-- ================================================================
-- 031_backfill_so_unit_prices.sql
-- Update sales_orders.items[].unit_price to match current
-- products.sale_price for every item that has a product_id.
-- This fixes the Gross Margin Report showing stale prices from
-- the original SO creation time rather than the current sale price.
-- ================================================================

UPDATE sales_orders so
SET    items = (
  SELECT jsonb_agg(
    CASE
      WHEN NULLIF(trim(item->>'product_id'), '') IS NOT NULL
           AND p.sale_price > 0
      THEN item || jsonb_build_object('unit_price', p.sale_price)
      ELSE item
    END
    ORDER BY ordinality
  )
  FROM   jsonb_array_elements(so.items) WITH ORDINALITY AS t(item, ordinality)
  LEFT   JOIN products p
    ON   p.id = (NULLIF(trim(item->>'product_id'), ''))::uuid
),
updated_at = now()
WHERE  items IS NOT NULL
  AND  jsonb_array_length(items) > 0;
