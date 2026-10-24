-- ═══════════════════════════════════════════════════════════════
-- 063 · Adresse des fiches figée en base
--
-- Le site calculait /produit/<slug> à partir du nom français : renommer un
-- produit changeait son URL (pages indexées par Google, liens d'e-mails,
-- flux Merchant Center). products.slug fige l'adresse ; le site et le
-- build l'utilisent quand elle est renseignée, et retombent sur le calcul
-- depuis le nom sinon (produits créés ensuite).
--
-- Le remplissage (slug actuel de chaque produit) est fait par le script
-- SQL livré avec cette migration, produit par produit.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON products (slug) WHERE slug IS NOT NULL;
