-- ═══════════════════════════════════════════════════════════════
--  043 — Cadeau déclenché par une quantité achetée
--
--  L'offre cadeau existante se déclenche sur un MONTANT (min_order) :
--  « à partir de 50 €, un produit offert ». Il manquait la mécanique la
--  plus courante en épicerie : « 2 Piffi achetés, 1 dip offert ».
--
--  On garde le seuil en euros — il reste utile — et on ajoute un second
--  déclencheur, par quantité d'un ou plusieurs produits. Une offre
--  utilise l'un OU l'autre : si `gift_trigger_qty` est renseigné, c'est
--  la quantité qui compte, sinon c'est le montant.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE promo_codes
  -- Les produits qui COMPTENT pour déclencher (les Piffi).
  ADD COLUMN IF NOT EXISTS gift_trigger_product_ids JSONB,
  -- Combien il en faut pour un cadeau.
  ADD COLUMN IF NOT EXISTS gift_trigger_qty INTEGER,
  -- Plafond de cadeaux par commande. NULL = l'offre se répète sans
  -- limite (4 Piffi donnent 2 dips). Mettre 1 pour la borner.
  ADD COLUMN IF NOT EXISTS gift_max INTEGER;

COMMENT ON COLUMN promo_codes.gift_trigger_product_ids IS
  'Produits dont l''achat declenche le cadeau. NULL = l''offre se declenche sur le montant (min_order).';
COMMENT ON COLUMN promo_codes.gift_trigger_qty IS
  'Quantite a acheter pour obtenir un cadeau. 2 = « 2 achetes, 1 offert ».';
COMMENT ON COLUMN promo_codes.gift_max IS
  'Nombre maximum de cadeaux par commande. NULL = repetition sans limite.';
