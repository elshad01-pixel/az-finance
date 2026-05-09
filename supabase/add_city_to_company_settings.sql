-- Run this ONLY if you already ran company_settings_migration.sql
-- Adds the city field to an existing company_settings table

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
