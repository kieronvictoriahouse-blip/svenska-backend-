-- ═══════════════════════════════════════════════════════════════
-- 062 · Alertes « retour en stock »
--
-- Sur la fiche d'un produit épuisé, le client laisse son e-mail ; il
-- reçoit UN message quand le produit redevient disponible (cron
-- relance-paniers, lib/alertes-stock). Aucune autre utilisation.
--
-- Conservation : l'alerte envoyée est effacée 90 jours après l'envoi,
-- l'alerte jamais servie au bout d'un an (même passage).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email       text NOT NULL,                 -- toujours en minuscules
  lang        text NOT NULL DEFAULT 'fr',
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz                    -- NULL = en attente
);

-- Une seule alerte en attente par produit et par adresse
CREATE UNIQUE INDEX IF NOT EXISTS stock_alerts_une_en_attente
  ON stock_alerts (product_id, email) WHERE notified_at IS NULL;
CREATE INDEX IF NOT EXISTS stock_alerts_attente
  ON stock_alerts (product_id) WHERE notified_at IS NULL;

-- Données personnelles : lecture et écriture par le serveur seulement
-- (clé service_role), aucune politique pour anon / authenticated.
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE stock_alerts FROM anon, authenticated;
