-- ================================================================
-- 050_vendor_portal.sql
--
-- Vendor Portal V1: two new tables + Supabase storage bucket.
--
-- NOTE: vendors.id is bigserial (BIGINT) — FKs must match.
-- ================================================================

-- ── vendor_portal_access ─────────────────────────────────────────────────────
-- One record per invited vendor email. Tracks invite + login state.

CREATE TABLE IF NOT EXISTS vendor_portal_access (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID    NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  vendor_id  BIGINT  NOT NULL REFERENCES vendors(id)    ON DELETE CASCADE,
  email      TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended')),
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  last_login   TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id),
  UNIQUE(company_id, vendor_id, email)
);

-- ── vendor_invoices ──────────────────────────────────────────────────────────
-- Invoices submitted by vendors through the portal against confirmed GRs.
-- Includes 3-way match fields (PO vs GR vs Invoice).

CREATE TABLE IF NOT EXISTS vendor_invoices (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id      BIGINT  NOT NULL REFERENCES vendors(id),
  po_id          UUID    REFERENCES purchase_orders(id),
  gr_id          UUID    REFERENCES goods_receipts(id),
  invoice_number TEXT    NOT NULL,
  invoice_date   DATE    NOT NULL,
  due_date       DATE,
  subtotal       DECIMAL(12,2) NOT NULL,
  vat_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount   DECIMAL(12,2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'AZN',
  status         TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'paid')),
  pdf_url          TEXT,
  rejection_reason TEXT,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    UUID REFERENCES auth.users(id),
  approved_at    TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ,
  notes          TEXT,
  -- 3-way match
  po_amount      DECIMAL(12,2),
  gr_amount      DECIMAL(12,2),
  match_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('pending', 'matched', 'discrepancy')),
  match_notes    TEXT,
  UNIQUE(company_id, vendor_id, invoice_number)
);

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Private bucket for vendor invoice PDFs (max 5 MB, PDF only).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-invoices',
  'vendor-invoices',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE vendor_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_invoices      ENABLE ROW LEVEL SECURITY;

-- Company staff see their own company's records
DROP POLICY IF EXISTS "company_vendor_access"   ON vendor_portal_access;
DROP POLICY IF EXISTS "company_vendor_invoices" ON vendor_invoices;
DROP POLICY IF EXISTS "vendor_invoice_upload"   ON storage.objects;
DROP POLICY IF EXISTS "vendor_invoice_read"     ON storage.objects;

CREATE POLICY "company_vendor_access" ON vendor_portal_access
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "company_vendor_invoices" ON vendor_invoices
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id());

-- Storage: authenticated users can upload/read vendor invoice PDFs
CREATE POLICY "vendor_invoice_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-invoices');

CREATE POLICY "vendor_invoice_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-invoices');
