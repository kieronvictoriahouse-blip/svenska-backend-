-- ═══════════════════════════════════════════════════════════════
-- Migration 029 — Opération « livraison offerte » limitée dans le temps
-- Abaisse temporairement le seuil de franco de port (ex : 25 € au lieu
-- de 50 €) sur une fenêtre de dates, sans code promo à saisir.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE white_label_config
  ADD COLUMN IF NOT EXISTS ship_promo_active         BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS ship_promo_threshold      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ship_promo_threshold_intl NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ship_promo_from           DATE,
  ADD COLUMN IF NOT EXISTS ship_promo_until          DATE,
  ADD COLUMN IF NOT EXISTS ship_promo_label_fr       TEXT,
  ADD COLUMN IF NOT EXISTS ship_promo_label_sv       TEXT,
  ADD COLUMN IF NOT EXISTS ship_promo_label_en       TEXT;

COMMENT ON COLUMN white_label_config.ship_promo_active         IS 'Opération franco de port activée (encore soumise aux dates)';
COMMENT ON COLUMN white_label_config.ship_promo_threshold      IS 'Seuil France pendant l''opération (NULL = pas d''opération FR)';
COMMENT ON COLUMN white_label_config.ship_promo_threshold_intl IS 'Seuil international pendant l''opération (NULL = seuil normal maintenu)';
COMMENT ON COLUMN white_label_config.ship_promo_from           IS 'Début inclus (NULL = pas de borne)';
COMMENT ON COLUMN white_label_config.ship_promo_until          IS 'Fin incluse (NULL = pas de borne)';
