-- Migration 015 : colonnes manquantes sur invoices + table accounting_entries

-- Colonnes manquantes sur invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS order_id       UUID,
  ADD COLUMN IF NOT EXISTS legal_mention  TEXT DEFAULT 'TVA non applicable, art. 293 B du CGI',
  ADD COLUMN IF NOT EXISTS seller_name    TEXT,
  ADD COLUMN IF NOT EXISTS seller_siret   TEXT,
  ADD COLUMN IF NOT EXISTS seller_address TEXT,
  ADD COLUMN IF NOT EXISTS seller_email   TEXT,
  ADD COLUMN IF NOT EXISTS seller_phone   TEXT;

-- Table accounting_entries pour la comptabilité
CREATE TABLE IF NOT EXISTS accounting_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date             DATE NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('income','expense')),
  category         TEXT NOT NULL DEFAULT 'autre',
  description      TEXT,
  amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  reference_type   TEXT,   -- 'order', 'invoice', 'reception', 'landed_cost'
  reference_id     UUID,
  reference_number TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_ref ON accounting_entries (reference_type, reference_id);

-- RLS
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_accounting" ON accounting_entries;
CREATE POLICY "admin_accounting" ON accounting_entries FOR ALL USING (auth.role() = 'authenticated');
