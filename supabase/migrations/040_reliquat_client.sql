-- ═══════════════════════════════════════════════════════════════
--  040 — Reliquat client (expedition partielle)
--
--  Jusqu'ici une commande partait entiere ou ne partait pas : l'ecran de
--  preparation refusait de valider tant que tout n'etait pas scanne. Il
--  manquait donc le cas le plus banal — il manque un article, on envoie
--  le reste tout de suite et on garde le reliquat.
--
--  Le bon de livraison portait deja deux colonnes « Commande » et
--  « Livre », mais l'ecran les remplissait avec la MEME valeur : le
--  client lisait toujours « commande 3 / livre 3 », meme avec deux
--  articles dans le carton. La structure existait, elle mentait.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Statuts reellement autorises ──────────────────────────────
-- La contrainte datait de la 010 et n'a jamais suivi l'interface : les
-- boutons « Confirmee » et « En preparation » existent a l'ecran mais
-- sont REFUSES par la base. Le clic affichait « ✅ » sans que rien ne
-- change. On aligne la contrainte sur ce que l'interface propose, et on
-- y ajoute le nouveau statut.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD  CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending', 'paid', 'confirmed', 'preparing',
    'partial',            -- une partie est partie, le reste est du
    'shipped', 'delivered', 'cancelled', 'refunded', 'abandoned'
  ));

-- ─── 2. Ce qui est reellement parti ───────────────────────────────
-- Deux mesures distinctes, et il faut les deux :
--  · le CUMUL expedie sert a calculer ce qui reste du ;
--  · le DERNIER COLIS sert au bon de livraison, qui decrit un colis et
--    non un historique — sinon le second bon annoncerait 3 articles
--    livres alors qu'il n'en contient qu'un.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipped_qty   JSONB,
  ADD COLUMN IF NOT EXISTS last_shipment JSONB,
  ADD COLUMN IF NOT EXISTS backorder_at  TIMESTAMPTZ;

COMMENT ON COLUMN orders.shipped_qty IS
  'Cumul des quantites reellement expediees, par product_id. Le reste du = quantite commandee moins cette valeur.';
COMMENT ON COLUMN orders.last_shipment IS
  'Quantites du dernier colis, par product_id. Alimente le bon de livraison, qui decrit un colis et non un cumul.';
COMMENT ON COLUMN orders.backorder_at IS
  'Date de creation du reliquat. NULL tant qu''aucune expedition partielle n''a eu lieu.';

-- Repli pour l'historique : une commande deja expediee ou livree l'a ete
-- entierement, puisque le partiel n'existait pas. Sans cette reprise,
-- leurs bons de livraison afficheraient zero article livre.
UPDATE orders
SET shipped_qty = picking
WHERE shipped_qty IS NULL
  AND picking IS NOT NULL
  AND status IN ('shipped', 'delivered');

-- ─── 3. Retrouver les reliquats en attente ────────────────────────
CREATE INDEX IF NOT EXISTS orders_backorder ON orders (status) WHERE status = 'partial';
