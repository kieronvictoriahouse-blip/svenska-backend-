-- ═══════════════════════════════════════════════════════════════
--  036 — Reference produit (SKU)
--
--  Les ecrans affichaient « SC-0042 » derive du sort_order : la
--  reference changeait donc des qu'on reordonnait le catalogue, alors
--  qu'elle finit sur un bon de commande et un bon de livraison.
--
--  Constat en base : 45 produits sur 57 ont sort_order = 0. La premiere
--  version de ce fichier leur donnait tous « SC-0000 », d'ou l'echec de
--  l'index unique. On numerote donc sequentiellement.
--
--  Rejouable : chaque etape est gardee.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;

-- Valeurs non exploitables laissees par un essai precedent.
UPDATE products SET sku = NULL WHERE sku = 'SC-0000' OR btrim(COALESCE(sku, '')) = '';

-- ─── Numerotation ─────────────────────────────────────────────────
-- Les produits qui ont un sort_order exploitable gardent leur numero :
-- c'est celui qui s'affiche aujourd'hui a l'ecran. Les autres sont
-- numerotes a la suite, par ordre alphabetique — lisible, contrairement
-- a un fragment d'identifiant.
WITH numerotes AS (
  SELECT
    id,
    CASE
      WHEN sort_order IS NOT NULL AND sort_order > 0 THEN sort_order
      ELSE (SELECT COALESCE(MAX(sort_order), 0) FROM products WHERE sort_order > 0)
           + ROW_NUMBER() OVER (
               PARTITION BY (sort_order IS NULL OR sort_order <= 0)
               ORDER BY name_fr, id
             )
    END AS numero
  FROM products
  WHERE sku IS NULL
)
UPDATE products p
SET sku = 'SC-' || LPAD(n.numero::text, 4, '0')
FROM numerotes n
WHERE p.id = n.id;

-- ─── Filet anti-collision ─────────────────────────────────────────
-- Si deux lignes se retrouvaient malgre tout avec la meme reference,
-- on suffixe plutot que de faire echouer la migration entiere.
WITH doublons AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY sku ORDER BY created_at, id) AS n
  FROM products WHERE sku IS NOT NULL
)
UPDATE products p
SET sku = p.sku || '-' || d.n
FROM doublons d
WHERE p.id = d.id AND d.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON products (sku) WHERE sku IS NOT NULL;

COMMENT ON COLUMN products.sku IS
  'Reference stable. Ne jamais la recalculer depuis sort_order : elle sert sur les documents.';
