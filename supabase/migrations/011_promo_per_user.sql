-- ═══════════════════════════════════════════════════════════════
-- SVENSKA DELIKATESSEN — Migration 011
-- Codes promo : limite d'usage par client + table de suivi
-- ═══════════════════════════════════════════════════════════════

-- Colonne sur promo_codes : 1 utilisation max par client (email)
ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS single_use_per_customer BOOLEAN NOT NULL DEFAULT false;

-- Table de suivi des utilisations par client
CREATE TABLE IF NOT EXISTS promo_code_usages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_code_id   UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  customer_email  TEXT NOT NULL,
  used_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promo_code_id, customer_email)
);

CREATE INDEX IF NOT EXISTS idx_promo_usages_email ON promo_code_usages (customer_email);
