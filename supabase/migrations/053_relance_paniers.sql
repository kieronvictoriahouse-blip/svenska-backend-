-- ═══════════════════════════════════════════════════════════════
--  053 — Relance des paniers abandonnés
--
--  Le panier demande désormais l'email avant Stripe. Quand le paiement
--  n'est pas finalisé, deux relances partent : ~3 h après (expiration de
--  la session Stripe) puis le lendemain matin (cron quotidien).
--
--  Le geste commercial n'est pas codé en dur : chaque semaine, l'équipe
--  choisit dans l'admin un code promo existant (remise, port offert,
--  cadeau…) ou rien, et à quelle relance il s'applique.
-- ═══════════════════════════════════════════════════════════════

-- Suivi de la relance, porté par la commande brouillon elle-même.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS recovery_token       TEXT,         -- jeton du lien « reprendre mon panier »
  ADD COLUMN IF NOT EXISTS recovery_1_sent_at   TIMESTAMPTZ,  -- 1re relance (~3 h)
  ADD COLUMN IF NOT EXISTS recovery_2_sent_at   TIMESTAMPTZ,  -- 2e relance (lendemain matin)
  ADD COLUMN IF NOT EXISTS recovery_skip_reason TEXT,         -- pourquoi on n'a pas relancé (désinscrit, a commandé entre-temps…)
  ADD COLUMN IF NOT EXISTS recovered_at         TIMESTAMPTZ,  -- le client est revenu payer
  ADD COLUMN IF NOT EXISTS recovered_order_id   UUID;         -- la commande payée qui l'a récupéré

CREATE INDEX IF NOT EXISTS orders_relance_idx
  ON orders (status, created_at)
  WHERE status IN ('pending', 'abandoned');

-- Désinscription : une adresse qui a dit non n'est plus jamais relancée.
CREATE TABLE IF NOT EXISTS email_optouts (
  email      TEXT PRIMARY KEY,           -- toujours en minuscules
  source     TEXT,                       -- 'relance_panier', …
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Geste commercial de la semaine (lundi = début de semaine).
-- promo_code_id NULL = pas de geste cette semaine-là.
CREATE TABLE IF NOT EXISTS cart_recovery_offers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start    DATE NOT NULL UNIQUE,
  promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
  apply_to      TEXT NOT NULL DEFAULT 'r2' CHECK (apply_to IN ('r1', 'r2', 'both')),
  message_fr    TEXT,
  message_en    TEXT,
  message_sv    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tables lues/écrites uniquement par le serveur (clé service) : aucune
-- politique = aucun accès public via la clé anonyme.
ALTER TABLE email_optouts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_recovery_offers ENABLE ROW LEVEL SECURITY;

-- Ajout (25/09) : le geste peut aussi être un PRODUIT OFFERT, choisi dans
-- le catalogue. Le moteur de codes promo ne sait offrir un produit que
-- sur tout le site ; ici le cadeau est réservé aux paniers relancés et
-- vérifié au checkout par le jeton du brouillon.
ALTER TABLE cart_recovery_offers
  ADD COLUMN IF NOT EXISTS gift_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
