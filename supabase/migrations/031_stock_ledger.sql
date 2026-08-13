-- ═══════════════════════════════════════════════════════════════
--  031 — Journal de stock complet
--
--  Constat de l'audit du 13/08/2026 : products.stock avait dérivé de
--  +77 unités sur 22 produits. Trois causes cumulées :
--
--  1. decrement_stock (migration 018) ne fait rien quand
--     track_stock = false. Une vente sur un produit non suivi est
--     perdue en silence. Trois produits sont encore dans cet état.
--  2. Aucune vente n'écrivait de mouvement de stock : sur les 126
--     mouvements existants, zéro n'est rattaché à une commande. Seules
--     les réceptions étaient tracées, donc la dérive était invisible.
--  3. Une réception ajoute la quantité reçue au stock courant. Toute
--     déduction perdue devient donc du stock fantôme définitif.
--
--  Cette migration ne touche pas aux quantités : elle prépare le
--  journal. La remise à niveau des quantités se fait depuis l'écran
--  Stocks › Contrôle, produit par produit.
--
--  Rejouable sans risque : chaque étape est gardée.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. La table existe déjà (créée à la main, jamais versionnée) ──
-- Colonnes d'origine : product_id, quantity, type, reason, order_id.
-- On la crée pour les environnements neufs ; ailleurs c'est un no-op.
CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER,
  type        TEXT,
  reason      TEXT,
  order_id    UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Colonnes du nouveau journal ───────────────────────────────
-- delta signé + photo avant/après : c'est ce qui rend un écart
-- explicable après coup, ce qui manquait jusqu'ici.
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS delta      INTEGER,
  ADD COLUMN IF NOT EXISTS qty_before INTEGER,
  ADD COLUMN IF NOT EXISTS qty_after  INTEGER,
  ADD COLUMN IF NOT EXISTS reference  TEXT,
  ADD COLUMN IF NOT EXISTS note       TEXT,
  ADD COLUMN IF NOT EXISTS order_id   UUID;

-- Les anciennes colonnes deviennent facultatives : le code écrit
-- désormais les deux jeux, mais un environnement neuf n'a pas à les
-- remplir. Gardé colonne par colonne — DROP NOT NULL échoue si la
-- colonne n'existe pas, et le contenu réel de la table n'a jamais été
-- versionné.
DO $$
DECLARE
  c TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY['quantity', 'type', 'reason'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = c
    ) THEN
      EXECUTE format('ALTER TABLE stock_movements ALTER COLUMN %I DROP NOT NULL', c);
    END IF;
  END LOOP;
END $$;

-- ─── 3. Reprise de l'historique ───────────────────────────────────
-- delta signé déduit du couple (type, quantity) des mouvements
-- existants, pour que le journal soit lisible d'un bout à l'autre.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'quantity'
  ) THEN
    EXECUTE $q$
      UPDATE stock_movements
      SET delta = CASE
            WHEN type = 'out' THEN -ABS(quantity)
            WHEN type = 'in'  THEN  ABS(quantity)
            ELSE quantity
          END
      WHERE delta IS NULL AND quantity IS NOT NULL
    $q$;
  END IF;
END $$;

-- ─── 4. Index ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS stock_movements_product ON stock_movements (product_id, created_at DESC);
-- Sert la garde d'idempotence : on ne déduit jamais deux fois la même
-- ligne de commande, même si le webhook Stripe est rejoué.
CREATE INDEX IF NOT EXISTS stock_movements_order   ON stock_movements (order_id, product_id);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_stock_movements" ON stock_movements;
CREATE POLICY "admin_stock_movements" ON stock_movements FOR ALL USING (auth.role() = 'authenticated');

-- ─── 5. decrement_stock : ne plus jamais perdre une vente ─────────
-- La garde « AND track_stock = true » disparaît. Un produit non suivi
-- passe simplement en stock négatif, ce qui est un signal visible,
-- alors que l'ancien comportement était silencieux.
--
-- DROP obligatoire : la version 018 renvoie VOID, et Postgres refuse
-- un CREATE OR REPLACE qui change le type de retour
-- (42P13 « cannot change return type of existing function »).
DROP FUNCTION IF EXISTS decrement_stock(UUID, INTEGER);

CREATE FUNCTION decrement_stock(p_id UUID, qty INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_stock INTEGER;
BEGIN
  UPDATE products
  SET stock = COALESCE(stock, 0) - qty,
      updated_at = NOW()
  WHERE id = p_id
  RETURNING stock INTO new_stock;
  RETURN new_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN stock_movements.delta IS 'Variation signée : négative pour une sortie';
COMMENT ON COLUMN stock_movements.order_id IS 'Commande client à l''origine de la sortie — sert de garde anti-doublon';
