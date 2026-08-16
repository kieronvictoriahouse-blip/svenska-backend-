-- ═══════════════════════════════════════════════════════════════
--  037 — Moteur de commandes d'achat
--
--  Constat mesure sur 93 jours d'historique reel :
--   · 484 jours-produit de rupture sur 15 produits ;
--   · 8 produits dont la demande est sous-estimee d'au moins 50 % —
--     on ne vend pas les jours de rupture, donc la moyenne calendaire
--     s'effondre, donc on recommande trop peu, donc on est de nouveau
--     en rupture. C'est la spirale a casser ;
--   · aucun lien produit -> fournisseur : chaque reappro etait une
--     enquete pour savoir ou racheter quoi.
--
--  Le meme article s'achete chez PLUSIEURS magasins, a des prix
--  differents — GEKAS, grossiste pour particuliers, est presque
--  toujours le moins cher : 1,28 € contre 2,17 € chez WILLYS sur le
--  Piffi, 0,60 contre 0,86 sur les melanges pour dip. Le lien est donc
--  une table de couples, pas une colonne sur le produit.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Conditionnement par defaut ────────────────────────────────
-- Un fournisseur ne livre pas 37 pots : toute l'interface raisonne en
-- cartons, l'unite n'est qu'un derive.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pack_size INTEGER NOT NULL DEFAULT 1;

-- ─── 2. Ou acheter quoi, et a quel prix ───────────────────────────
CREATE TABLE IF NOT EXISTS product_suppliers (
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Prix constate au dernier achat. En euros HT parce que c'est ce que
  -- portent les lignes de commande ; le prix en couronnes est renseigne
  -- quand on l'a, pour afficher le montant tel que le magasin l'affiche.
  cost_eur     NUMERIC(10,4),
  cost_sek     NUMERIC(10,2),

  -- Le conditionnement peut differer d'une enseigne a l'autre.
  pack_size    INTEGER,

  times_bought INTEGER NOT NULL DEFAULT 0,
  last_bought_at TIMESTAMPTZ,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  notes        TEXT,

  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS product_suppliers_prod ON product_suppliers (product_id);
CREATE INDEX IF NOT EXISTS product_suppliers_sup  ON product_suppliers (supplier_id);

ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_product_suppliers" ON product_suppliers;
CREATE POLICY "admin_product_suppliers" ON product_suppliers FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON TABLE product_suppliers IS
  'Un article s''achete chez plusieurs magasins a des prix differents — le moins cher n''est pas toujours le dernier utilise';

-- ─── 3. Reprise depuis l'historique d'achat ───────────────────────
-- 54 couples produit-magasin sont deja connus des commandes passees,
-- dont 12 produits vus chez plusieurs enseignes. Autant ne pas les
-- ressaisir.
-- Une ligne au moins porte un product_id vide : ''::uuid ferait echouer
-- toute la migration. Le NULLIF est la garde, et le cast n'a lieu qu'une
-- fois la ligne filtree — l'ordre d'evaluation d'un SELECT n'est pas
-- garanti a l'interieur d'un meme niveau de requete.
WITH brut AS (
  SELECT po.supplier_id,
         NULLIF(btrim(j.line->>'product_id'), '') AS product_txt,
         COALESCE(
           NULLIF(j.line->>'unit_cost_eur', '')::numeric,
           NULLIF(j.line->>'unit_cost', '')::numeric,
           NULLIF(j.line->>'price', '')::numeric
         ) AS cout,
         po.created_at
  FROM purchase_orders po
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE
           WHEN po.lines IS NOT NULL AND btrim(po.lines::text) LIKE '[%'
             THEN po.lines::jsonb
           ELSE '[]'::jsonb
         END
       ) AS j(line)
  WHERE po.status <> 'cancelled'
    AND po.supplier_id IS NOT NULL
),
lignes AS (
  SELECT supplier_id, product_txt::uuid AS product_id, cout, created_at
  FROM brut
  WHERE product_txt IS NOT NULL
    AND product_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
agrege AS (
  SELECT product_id, supplier_id,
         COUNT(*)                                        AS n,
         MAX(created_at)                                 AS derniere,
         (ARRAY_AGG(cout ORDER BY created_at DESC))[1]   AS dernier_cout
  FROM lignes
  WHERE cout IS NOT NULL AND cout > 0
  GROUP BY product_id, supplier_id
)
INSERT INTO product_suppliers (product_id, supplier_id, cost_eur, times_bought, last_bought_at)
SELECT a.product_id, a.supplier_id, ROUND(a.dernier_cout, 4), a.n, a.derniere
FROM agrege a
JOIN products p ON p.id = a.product_id
ON CONFLICT (product_id, supplier_id) DO UPDATE
SET cost_eur = EXCLUDED.cost_eur,
    times_bought = EXCLUDED.times_bought,
    last_bought_at = EXCLUDED.last_bought_at;

-- Le magasin habituel : celui ou l'on a le plus souvent achete. Ce
-- n'est pas forcement le moins cher — l'ecran le signalera.
WITH habituel AS (
  SELECT DISTINCT ON (product_id) product_id, supplier_id
  FROM product_suppliers
  ORDER BY product_id, times_bought DESC, last_bought_at DESC
)
UPDATE product_suppliers ps
SET is_preferred = true
FROM habituel h
WHERE ps.product_id = h.product_id AND ps.supplier_id = h.supplier_id;

-- ─── 4. Conditions d'achat par fournisseur ────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS free_shipping_sek NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS min_order_sek NUMERIC(10,2);

-- Delai mesure entre commande et reception, plutot que declare.
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

-- ─── 5. Velocite de vente, corrigee des ruptures ──────────────────
-- Recalculee chaque nuit par /api/cron/velocity : la calculer a la
-- volee sur tout le catalogue a chaque ouverture serait lent, et le
-- handoff l'interdit explicitement.
CREATE TABLE IF NOT EXISTS product_velocity (
  product_id     UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  units_sold     INTEGER NOT NULL DEFAULT 0,
  days_in_stock  INTEGER NOT NULL DEFAULT 0,
  days_window    INTEGER NOT NULL DEFAULT 0,
  days_out       INTEGER NOT NULL DEFAULT 0,
  weekly          NUMERIC(10,3) NOT NULL DEFAULT 0,
  weekly_calendar NUMERIC(10,3) NOT NULL DEFAULT 0,
  computed_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_velocity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_product_velocity" ON product_velocity;
CREATE POLICY "admin_product_velocity" ON product_velocity FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON COLUMN product_velocity.weekly IS
  'Ventes hebdo rapportees aux jours de disponibilite : commander sur la moyenne calendaire reproduit la rupture';

-- ─── 6. Brouillons de commande d'achat ────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS coverage_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS exchange_rate_used NUMERIC(10,6);
