-- ═══════════════════════════════════════════════════════════════
--  032 — Parcours de remplacement (rupture de stock)
--
--  Un article manque : on propose au client des remplacements qu'il
--  choisit en un clic depuis son email, sans être connecté. Le lien
--  porte un jeton signé (lib/replacement-token) ; cette table garde
--  l'état de la demande et la trace du choix.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS order_line_choices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Ligne concernée, telle qu'elle figure dans orders.lines
  product_id  UUID,
  line_ref    TEXT,
  line_name   TEXT NOT NULL,
  line_qty    INTEGER NOT NULL DEFAULT 1,
  line_price  NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Propositions envoyées : [{ product_id, nom, prix, note }]
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Décision du client
  -- pending | replaced | refund_requested | waiting
  status      TEXT NOT NULL DEFAULT 'pending',
  chosen_product_id UUID,
  chosen_label      TEXT,
  -- Écart de prix constaté au moment du clic, recalcule cote serveur.
  -- Positif = la boutique offre la difference ; negatif = du a rembourser.
  price_delta NUMERIC(10,2),
  decided_at  TIMESTAMPTZ,

  sent_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_line_choices_order ON order_line_choices (order_id, created_at DESC);
-- Sert l'ecran back-office : les demandes qui attendent encore une reponse.
CREATE INDEX IF NOT EXISTS order_line_choices_status ON order_line_choices (status) WHERE status = 'pending';

ALTER TABLE order_line_choices ENABLE ROW LEVEL SECURITY;
-- Aucune politique publique : la route de reponse passe par la cle service
-- apres verification du jeton. Le client n'a jamais d'acces direct.
DROP POLICY IF EXISTS "admin_order_line_choices" ON order_line_choices;
CREATE POLICY "admin_order_line_choices" ON order_line_choices FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON COLUMN order_line_choices.price_delta IS
  'Ecart recalcule cote serveur au moment du clic — jamais repris du lien';
