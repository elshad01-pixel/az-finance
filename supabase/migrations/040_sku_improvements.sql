-- ================================================================
-- 040_sku_improvements.sql
-- Add SKU tracking columns + migrate existing SKUs to new format
-- Apply in Supabase SQL Editor
-- ================================================================

-- 1. Add new columns
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku_manually_set  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sku_generated_at  TIMESTAMPTZ          DEFAULT NOW();

-- Backfill sku_generated_at from created_at for existing products
UPDATE products
SET    sku_generated_at = created_at
WHERE  sku_generated_at IS NULL;

-- 2. Named unique constraint on (company_id, sku)
--    Migration 025 already has an inline UNIQUE(company_id, sku).
--    This adds a named alias so the app can detect "duplicate SKU" errors
--    by constraint name rather than parsing the error message.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname = 'products_sku_unique'
      AND  conrelid = 'products'::regclass
  ) THEN
    -- No-op if a functionally identical constraint already covers (company_id, sku).
    -- PostgreSQL will refuse a duplicate unique constraint on the same column set;
    -- wrap in BEGIN/EXCEPTION to silently skip that case.
    BEGIN
      ALTER TABLE products
        ADD CONSTRAINT products_sku_unique UNIQUE (company_id, sku);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- constraint already exists under an auto-generated name
    END;
  END IF;
END;
$$;

-- 3. Migrate existing product SKUs to new format
--    Only updates rows where sku_manually_set = FALSE (all existing rows qualify
--    since the column defaults to FALSE).
--    Supplier code defaults to 'DIG' (no vendor info on existing products).
DO $$
DECLARE
  v      RECORD;
  pfx    TEXT;
  seq    INT;
  yymm   TEXT;
  nums   TEXT;
  ssum   INT;
  chk    INT;
  nsku   TEXT;
  i      INT;
BEGIN
  yymm := to_char(NOW(), 'YYMM');  -- e.g. '2605'

  FOR v IN
    SELECT id, company_id, category, sku, created_at
    FROM   products
    WHERE  sku_manually_set = FALSE
    ORDER  BY company_id, created_at
  LOOP
    -- Map category → prefix (mirrors lib/sku.ts)
    pfx := CASE
      WHEN COALESCE(v.category,'') ILIKE '%electron%' OR COALESCE(v.category,'') ILIKE '%elektron%' OR COALESCE(v.category,'') ILIKE '%IT%' THEN 'ELEC'
      WHEN COALESCE(v.category,'') ILIKE '%office%'   OR COALESCE(v.category,'') ILIKE '%ofis%'                                               THEN 'OFIS'
      WHEN COALESCE(v.category,'') ILIKE '%construct%' OR COALESCE(v.category,'') ILIKE '%tikin%' OR COALESCE(v.category,'') ILIKE '%build%'  THEN 'CONS'
      WHEN COALESCE(v.category,'') ILIKE '%food%'     OR COALESCE(v.category,'') ILIKE '%ərzaq%' OR COALESCE(v.category,'') ILIKE '%qida%'    THEN 'FOOD'
      WHEN COALESCE(v.category,'') ILIKE '%medic%'    OR COALESCE(v.category,'') ILIKE '%tibb%'                                               THEN 'MEDC'
      WHEN COALESCE(v.category,'') ILIKE '%cloth%'    OR COALESCE(v.category,'') ILIKE '%geyim%' OR COALESCE(v.category,'') ILIKE '%apparel%' THEN 'GEYG'
      WHEN COALESCE(v.category,'') ILIKE '%furni%'    OR COALESCE(v.category,'') ILIKE '%mebel%'                                              THEN 'MEBEL'
      WHEN COALESCE(v.category,'') ILIKE '%auto%'     OR COALESCE(v.category,'') ILIKE '%avtom%'                                              THEN 'AUTO'
      WHEN COALESCE(v.category,'') ILIKE '%chem%'     OR COALESCE(v.category,'') ILIKE '%kimya%'                                              THEN 'KIMY'
      ELSE 'DIGR'
    END;

    -- Next sequence: max existing new-format seq for this prefix+company
    SELECT COALESCE(MAX(
      CASE
        WHEN sku ~ ('^' || pfx || '-[A-Z0-9]+-[0-9]{4}-([0-9]{4})-[0-9]$')
        THEN split_part(sku, '-', 4)::int
        ELSE 0
      END
    ), 0) + 1
    INTO seq
    FROM products
    WHERE company_id = v.company_id
      AND id         <> v.id;

    nums := yymm || lpad(seq::text, 4, '0');

    -- Luhn check digit (same algorithm as lib/sku.ts)
    DECLARE
      s      INT := 0;
      dbl    BOOLEAN := FALSE;
      d      INT;
    BEGIN
      FOR i IN REVERSE length(nums)..1 LOOP
        d := substring(nums, i, 1)::int;
        IF dbl THEN d := d * 2; IF d > 9 THEN d := d - 9; END IF; END IF;
        s   := s + d;
        dbl := NOT dbl;
      END LOOP;
      chk := (10 - (s % 10)) % 10;
    END;

    nsku := pfx || '-DIG-' || yymm || '-' || lpad(seq::text, 4, '0') || '-' || chk::text;

    -- Only update when there's no collision
    IF NOT EXISTS (
      SELECT 1 FROM products
      WHERE  company_id = v.company_id AND sku = nsku AND id <> v.id
    ) THEN
      UPDATE products
      SET    sku               = nsku,
             sku_generated_at  = NOW()
      WHERE  id = v.id;
    END IF;
  END LOOP;
END;
$$;
