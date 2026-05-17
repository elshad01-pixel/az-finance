-- ============================================================
-- AzFinance — Explicit Grants Migration
-- Run in Supabase SQL Editor (once, idempotent)
--
-- Roles:
--   anon          → unauthenticated requests (PostgREST)
--   authenticated → signed-in users (all app data is user-owned via RLS)
--   service_role  → server-side admin / test agent (bypasses RLS)
-- ============================================================

-- ── Schema usage ─────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── Core financial tables ────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_templates   TO authenticated;

GRANT ALL ON public.invoices            TO service_role;
GRANT ALL ON public.expenses            TO service_role;
GRANT ALL ON public.clients             TO service_role;
GRANT ALL ON public.vendors             TO service_role;
GRANT ALL ON public.expense_templates   TO service_role;

-- ── Payroll tables ───────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_entries     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_wd_overrides TO authenticated;

GRANT ALL ON public.employees           TO service_role;
GRANT ALL ON public.payroll_runs        TO service_role;
GRANT ALL ON public.payroll_entries     TO service_role;
GRANT ALL ON public.payroll_wd_overrides TO service_role;

-- ── Settings tables ──────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_settings        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings    TO authenticated;

GRANT ALL ON public.tax_settings        TO service_role;
GRANT ALL ON public.company_settings    TO service_role;

-- ── Sequences (bigserial / serial primary keys) ───────────────
-- Allows authenticated users to call nextval() on INSERT

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ── anon role ────────────────────────────────────────────────
-- All app tables are private (RLS requires auth.uid()).
-- anon gets no table grants — unauthenticated requests are blocked.
-- (PostgREST will return 401 before RLS even runs.)

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
