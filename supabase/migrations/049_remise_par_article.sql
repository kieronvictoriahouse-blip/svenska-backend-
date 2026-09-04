-- ═══════════════════════════════════════════════════════════════
-- Migration 049 — Remise par article (promo sur la fiche produit)
--
-- Une remise se pose directement sur le produit : pourcentage ou
-- montant fixe, sur le prix de vente TTC, avec une fenêtre de dates
-- optionnelle (début/fin, bornes inclusives). Le prix effectif n'est
-- JAMAIS stocké : il est recalculé (front pour l'affichage, serveur
-- pour le checkout qui fait foi) depuis ces colonnes.
--
-- ⚠️ Base BOUTIQUE (projet Supabase joznctfeujgnfydbpsbm) — à exécuter
-- dans le SQL editor de CE projet, pas via le MCP.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS discount_type  TEXT,             -- 'percent' | 'fixed' | NULL
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2),    -- 20 (=20 %) ou 1.50 (=-1,50 €)
  ADD COLUMN IF NOT EXISTS discount_start DATE,             -- NULL = actif tout de suite
  ADD COLUMN IF NOT EXISTS discount_end   DATE;             -- NULL = pas de fin

-- Garde-fou : seuls les deux types attendus sont acceptés.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_discount_type_chk;
ALTER TABLE products
  ADD CONSTRAINT products_discount_type_chk
  CHECK (discount_type IS NULL OR discount_type IN ('percent', 'fixed'));

COMMENT ON COLUMN products.discount_type  IS 'Remise article : percent | fixed | NULL';
COMMENT ON COLUMN products.discount_value IS 'Valeur de la remise (pourcentage ou montant fixe en €), sur le prix TTC';
COMMENT ON COLUMN products.discount_start IS 'Début de la promo (inclus). NULL = immédiat';
COMMENT ON COLUMN products.discount_end   IS 'Fin de la promo (inclus). NULL = sans fin';
