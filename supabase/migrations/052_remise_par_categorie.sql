-- ═══════════════════════════════════════════════════════════════
-- Migration 052 — Remise par CATÉGORIE (promo sur toute une catégorie)
--
-- Même modèle que la remise par article (049), mais posée sur la
-- catégorie : elle s'applique à TOUS ses produits automatiquement.
-- Précédence : une remise posée directement sur un produit l'emporte
-- toujours sur la remise de sa catégorie (cf. resolveDiscount dans
-- src/lib/product-price.ts). Le prix effectif n'est JAMAIS stocké : il
-- est recalculé (front pour l'affichage, serveur pour le checkout qui
-- fait foi) à partir de ces colonnes.
--
-- ⚠️ Base BOUTIQUE (projet Supabase joznctfeujgnfydbpsbm) — à exécuter
-- dans le SQL editor de CE projet, pas via le MCP.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS discount_type  TEXT,             -- 'percent' | 'fixed' | NULL
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2),    -- 10 (=10 %) ou 1.50 (=-1,50 €)
  ADD COLUMN IF NOT EXISTS discount_start DATE,             -- NULL = actif tout de suite
  ADD COLUMN IF NOT EXISTS discount_end   DATE;             -- NULL = pas de fin

-- Garde-fou : seuls les deux types attendus sont acceptés.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_discount_type_chk;
ALTER TABLE categories
  ADD CONSTRAINT categories_discount_type_chk
  CHECK (discount_type IS NULL OR discount_type IN ('percent', 'fixed'));

COMMENT ON COLUMN categories.discount_type  IS 'Remise catégorie : percent | fixed | NULL (héritée par tous les produits de la catégorie, sauf remise produit prioritaire)';
COMMENT ON COLUMN categories.discount_value IS 'Valeur de la remise (pourcentage ou montant fixe en €), sur le prix TTC';
COMMENT ON COLUMN categories.discount_start IS 'Début de la promo (inclus). NULL = immédiat';
COMMENT ON COLUMN categories.discount_end   IS 'Fin de la promo (inclus). NULL = sans fin';
