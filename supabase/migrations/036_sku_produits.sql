-- ═══════════════════════════════════════════════════════════════
--  036 — Reference produit (SKU)
--
--  Les ecrans affichaient « SC-0042 » derive du sort_order : la
--  reference d'un produit changeait donc des qu'on reordonnait le
--  catalogue. Une reference qui bouge n'est pas une reference — elle
--  finit sur un bon de commande, un bon de livraison, un inventaire.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;

-- Reprise : on fige la valeur actuellement affichee, pour que les
-- documents deja imprimes restent coherents avec l'ecran.
UPDATE products
SET sku = 'SC-' || LPAD(sort_order::text, 4, '0')
WHERE sku IS NULL AND sort_order IS NOT NULL;

-- Les produits sans sort_order prennent un identifiant stable derive
-- de leur id, faute de mieux — mais au moins il ne bougera plus.
UPDATE products
SET sku = 'SC-' || UPPER(SUBSTRING(id::text, 1, 6))
WHERE sku IS NULL;

-- Unique, mais seulement sur les valeurs renseignees.
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON products (sku) WHERE sku IS NOT NULL;

COMMENT ON COLUMN products.sku IS
  'Reference stable. Ne jamais la recalculer depuis sort_order : elle sert sur les documents.';
