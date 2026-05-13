-- Vendors (Supplier Register)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS vendors (
  id         bigserial    PRIMARY KEY,
  user_id    uuid         NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  name       text         NOT NULL,
  voen       text,
  category   text,
  phone      text,
  email      text,
  address    text,
  notes      text,
  created_at timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own vendors"
  ON vendors FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
