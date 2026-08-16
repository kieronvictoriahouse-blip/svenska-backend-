-- ═══════════════════════════════════════════════════════════════
--  037 — Moteur de commandes d'achat
--
--  Constat mesure sur 93 jours d'historique :
--   · 484 jours-produit de rupture sur 15 produits ;
--   · 8 produits dont la demande reelle est sous-estimee d'au moins
--     50 % — on ne vend pas les jours ou l'on est en rupture, donc la
--     velocite calendaire s'effondre, donc on recommande trop peu,
--     donc on est de nouveau en rupture. C'est la spirale a casser ;
--   · aucun lien produit -> fournisseur en base : chaque reappro etait
--     une enquete pour savoir ou racheter quoi.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. D'ou vient le produit, et sous quel conditionnement ───────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  -- Un fournisseur ne livre pas 37 pots : toute l'interface raisonne
  -- en cartons, l'unite n'est qu'un derive.
  ADD COLUMN IF NOT EXISTS pack_size INTEGER NOT NULL DEFAULT 1,
  -- Prix d'achat en couronnes, moms comprise, tel qu'il figure sur le
  -- ticket suedois. La conversion en euros HT se fait a l'affichage.
  ADD COLUMN IF NOT EXISTS cost_sek NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS products_supplier ON products (supplier_id) WHERE supplier_id IS NOT NULL;

-- Reprise : le fournisseur habituel se deduit de l'historique d'achat,
-- exploitable pour 42 des 57 produits.
WITH dernier_achat AS (
  SELECT DISTINCT ON (l.product_id)
         (l.product_id)::uuid AS product_id,
         po.supplier_id
  FROM purchase_orders po
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE jsonb_typeof(po.lines::jsonb)
           WHEN 'array' THEN po.lines::jsonb
           ELSE '[]'::jsonb
         END) AS j(line)
       CROSS JOIN LATERAL (SELECT j.line->>'product_id' AS product_id) AS l
  WHERE po.status <> 'cancelled'
    AND po.supplier_id IS NOT NULL
    AND l.product_id IS NOT NULL
  ORDER BY l.product_id, po.created_at DESC
)
UPDATE products p
SET supplier_id = d.supplier_id
FROM dernier_achat d
WHERE p.id = d.product_id AND p.supplier_id IS NULL;

-- ─── 2. Conditions d'achat par fournisseur ────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS free_shipping_sek NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS min_order_sek NUMERIC(10,2);

-- Delai reel, mesure entre la commande et sa reception. Mieux vaut le
-- constate que le declare.
WITH delais AS (
  SELECT po.supplier_id,
         ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (r.received_at - po.created_at)) / 86400)))::int AS jours
  FROM receptions r
  JOIN purchase_orders po ON po.id = r.purchase_order_id
  WHERE r.status <> 'cancelled' AND po.supplier_id IS NOT NULL
  GROUP BY po.supplier_id
)
UPDATE contacts c
SET lead_time_days = GREATEST(1, d.jours)
FROM delais d
WHERE c.id = d.supplier_id AND c.lead_time_days IS NULL;

-- ─── 3. Velocite de vente, corrigee des ruptures ──────────────────
-- Recalculee chaque nuit par /api/cron/velocity : la calculer a la
-- volee sur tout le catalogue a chaque ouverture de l'ecran serait
-- lent et inutile.
CREATE TABLE IF NOT EXISTS product_velocity (
  product_id     UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,

  -- Ventes de la fenetre et jours ou le produit etait REELLEMENT
  -- disponible. Le rapport des deux est la seule velocite honnete.
  units_sold     INTEGER NOT NULL DEFAULT 0,
  days_in_stock  INTEGER NOT NULL DEFAULT 0,
  days_window    INTEGER NOT NULL DEFAULT 0,
  days_out       INTEGER NOT NULL DEFAULT 0,

  -- Unites par semaine. `weekly` est la valeur retenue par le moteur ;
  -- `weekly_calendar` sert a montrer l'ecart, donc la demande perdue.
  weekly          NUMERIC(10,3) NOT NULL DEFAULT 0,
  weekly_calendar NUMERIC(10,3) NOT NULL DEFAULT 0,

  computed_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_velocity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_product_velocity" ON product_velocity;
CREATE POLICY "admin_product_velocity" ON product_velocity FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON COLUMN product_velocity.weekly IS
  'Ventes hebdo rapportees aux jours de disponibilite : commander sur la moyenne calendaire reproduit la rupture';

-- ─── 4. Brouillons de commande d'achat ────────────────────────────
-- L'ecran enregistre a chaque modification, et le numero est reserve
-- des l'ouverture pour que deux brouillons ne se telescopent pas.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS coverage_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS exchange_rate_used NUMERIC(10,6);
