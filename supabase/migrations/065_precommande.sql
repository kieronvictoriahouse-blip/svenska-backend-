-- ═══════════════════════════════════════════════════════════════
-- Migration 065 — Pré-commande
--
-- Un produit (ou une box) en pré-commande se vend SANS stock jusqu'à
-- sa date de fin incluse (preorder_end, vide = sans fin) : on achète
-- la marchandise d'après les pré-commandes reçues, puis on expédie à
-- partir de preorder_ship_date. Passé la date de fin, le produit
-- redevient un produit ordinaire (vendu selon son stock).
--
-- Les pré-commandes payées comptent dans le « réservé » comme toute
-- commande due : le disponible du produit devient négatif d'autant,
-- ce qui donne directement la quantité à acheter.
--
-- ⚠️ Base BOUTIQUE (projet Supabase fdagtzhodyxulhqbkkoz) — à exécuter
-- dans le SQL editor de CE projet.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS preorder           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preorder_ship_date DATE,      -- expédition prévue à partir du…
  ADD COLUMN IF NOT EXISTS preorder_end       DATE;      -- dernier jour pour pré-commander (inclus)

COMMENT ON COLUMN products.preorder           IS 'Pré-commande : vendable sans stock jusqu''à preorder_end (incluse)';
COMMENT ON COLUMN products.preorder_ship_date IS 'Pré-commande : expédition prévue à partir de cette date';
COMMENT ON COLUMN products.preorder_end       IS 'Pré-commande : dernier jour pour commander (NULL = sans fin)';
