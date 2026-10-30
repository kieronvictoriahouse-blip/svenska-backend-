-- ═══════════════════════════════════════════════════════════════
-- Migration 066 — Plusieurs boutiques sur la même base
--
-- Une seule micro-entreprise, deux vitrines : Swedish Cravings (« sc »,
-- en euros) et une boutique d'épicerie française pour la Suède (« fc »,
-- en couronnes, à venir). Une seule base pour garder UNE numérotation
-- de factures, UN chiffre d'affaires URSSAF et UN suivi du seuil
-- européen de vente à distance.
--
-- Étape 1 du plan (french-cravings/PLAN-MULTI-BOUTIQUE.md) : on ne fait
-- QU'AJOUTER. Chaque colonne a pour défaut 'sc' : tout l'existant et
-- tout ce que le code actuel crée reste rattaché à Swedish Cravings,
-- sans rien changer à son fonctionnement. Aucune contrainte d'unicité
-- n'est modifiée ici (elles le seront quand la 2e boutique aura des
-- données). Ré-exécutable sans risque (IF NOT EXISTS partout).
--
-- ⚠️ Base BOUTIQUE (projet Supabase fdagtzhodyxulhqbkkoz).
--    À appliquer AVANT de déployer le code de l'étape 1.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS boutiques (
  code             TEXT PRIMARY KEY CHECK (code ~ '^[a-z]{2,8}$'),
  nom              TEXT NOT NULL,
  devise           TEXT NOT NULL DEFAULT 'EUR' CHECK (devise ~ '^[A-Z]{3}$'),
  langue           TEXT NOT NULL DEFAULT 'fr',
  front_url        TEXT,                    -- NULL = NEXT_PUBLIC_FRONT_URL / white_label_config.front_url
  prefixe_commande TEXT,                    -- NULL = préfixe actuel
  retrait_sur_place BOOLEAN NOT NULL DEFAULT TRUE,
  actif            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO boutiques (code, nom, devise, langue)
VALUES ('sc', 'Swedish Cravings', 'EUR', 'fr')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE boutiques IS 'Vitrines d''une même entreprise (sc = Swedish Cravings). Une ligne par boutique.';

-- Configuration de marque : une ligne par boutique.
ALTER TABLE white_label_config
  ADD COLUMN IF NOT EXISTS boutique_code TEXT NOT NULL DEFAULT 'sc' REFERENCES boutiques(code);
CREATE UNIQUE INDEX IF NOT EXISTS white_label_config_boutique_code_key ON white_label_config (boutique_code);

-- Rattachement à une boutique. Défaut 'sc' : l'existant et le code actuel
-- restent sur Swedish Cravings.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'categories', 'promo_codes', 'orders', 'invoices', 'accounting_entries',
    'cms_home', 'cms_pages', 'home_slides', 'homepage_sections',
    'cart_recovery_offers', 'newsletter_hebdo', 'email_templates',
    'product_suggestions', 'contacts', 'product_reviews'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS boutique_id TEXT NOT NULL DEFAULT %L REFERENCES boutiques(code)',
        t, 'sc');
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (boutique_id)', t || '_boutique_id_idx', t);
    END IF;
  END LOOP;
END $$;

-- Devise des montants. Tout l'existant est en euros.
ALTER TABLE orders             ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE invoices           ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';

COMMENT ON COLUMN orders.boutique_id   IS 'Vitrine d''origine de la commande (boutiques.code)';
COMMENT ON COLUMN orders.currency      IS 'Devise des montants de la commande (EUR par défaut)';
COMMENT ON COLUMN invoices.currency    IS 'Devise de la facture (EUR par défaut)';
