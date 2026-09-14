-- ═══════════════════════════════════════════════════════════════
-- AVIS PRODUITS — la preuve sociale qui manquait
--
-- Constat du 14/09/2026 : 0 avis sur 80 produits. Un inconnu qui
-- découvre une boutique inconnue, avec des marques qu'il ne connaît
-- pas, et aucune note, n'achète pas. Les colonnes products.rating et
-- products.reviews_count existaient déjà mais n'étaient alimentées
-- par rien.
--
-- Un avis n'est acceptable QUE s'il est rattaché à une commande
-- réelle contenant le produit : c'est la seule défense contre les
-- faux avis, et c'est aussi ce qu'exige Google pour afficher des
-- étoiles dans ses résultats (avis vérifiés).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  order_id       UUID REFERENCES orders (id) ON DELETE SET NULL,
  customer_name  TEXT,
  customer_email TEXT,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  lang           TEXT NOT NULL DEFAULT 'fr',
  -- Publié par défaut : un avis vérifié n'a pas à attendre une
  -- validation. La modération sert à retirer, pas à autoriser.
  is_published   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un seul avis par produit et par commande.
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_unique_par_commande
  ON product_reviews (product_id, order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_reviews_produit
  ON product_reviews (product_id, is_published, created_at DESC);

ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON product_reviews;
CREATE POLICY "service_role_all" ON product_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Recalcule la note et le nombre d'avis du produit concerné.
-- products.rating et products.reviews_count restent la source lue par
-- la fiche produit, le flux Shopping et le JSON-LD : ils doivent donc
-- refléter la table à tout instant, sans dépendre d'un cron.
CREATE OR REPLACE FUNCTION maj_note_produit() RETURNS TRIGGER AS $$
DECLARE
  cible UUID;
BEGIN
  cible := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE products p SET
    rating = COALESCE((
      SELECT ROUND(AVG(r.rating)::numeric, 1)
      FROM product_reviews r
      WHERE r.product_id = cible AND r.is_published
    ), 0),
    reviews_count = COALESCE((
      SELECT COUNT(*) FROM product_reviews r
      WHERE r.product_id = cible AND r.is_published
    ), 0)
  WHERE p.id = cible;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maj_note_produit ON product_reviews;
CREATE TRIGGER trg_maj_note_produit
  AFTER INSERT OR UPDATE OR DELETE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION maj_note_produit();
