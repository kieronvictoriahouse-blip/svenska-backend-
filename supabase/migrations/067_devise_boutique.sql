-- ═══════════════════════════════════════════════════════════════
-- Migration 067 — L'argent dans la devise de la boutique (étape 3)
--
-- Une vitrine en couronnes (« fc », à venir) encaisse en SEK sur le
-- même compte Stripe. La comptabilité, le chiffre d'affaires URSSAF,
-- le FEC et le seuil européen restent EN EUROS : on enregistre le
-- montant réellement crédité par Stripe (balance_transaction : amount,
-- fee, exchange_rate), à défaut le taux BCE.
--
-- Contrat : accounting_entries.amount est TOUJOURS en euros.
-- amount_currency / currency / fx_rate ne sont qu'informatifs.
-- fx_rate = valeur en EUR d'UNE unité de la devise (SEK × fx_rate = EUR),
-- même sens que balance_transaction.exchange_rate de Stripe.
--
-- On ne fait QU'AJOUTER : toutes les colonnes sont NULL par défaut et
-- ne sont remplies que pour une devise ≠ EUR. Swedish Cravings (EUR)
-- n'écrit aucune de ces colonnes : ses lignes restent identiques.
-- Ré-exécutable sans risque (IF NOT EXISTS / garde pg_constraint).
--
-- ⚠️ Base BOUTIQUE (projet Supabase fdagtzhodyxulhqbkkoz).
--    À appliquer AVANT de déployer le code de l'étape 3.
--    Prérequis : migration 066 (boutiques, boutique_id, currency).
--    Lancer scripts/audit-facturation.js AVANT et APRÈS.
-- ═══════════════════════════════════════════════════════════════

-- 0) Garde du premier passage : l'empreinte d'une facture hors EUR va
--    désormais sceller sa devise. Une facture (ou une écriture) hors EUR
--    déjà présente changerait d'empreinte ou violerait les contraintes
--    ci-dessous : on s'arrête AVANT toute modification.
--    (Au 2e passage, la colonne orders.total_eur existe : garde sautée.)
DO $$
DECLARE n_inv INT; n_ae INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_eur'
  ) THEN
    SELECT count(*) INTO n_inv FROM invoices WHERE currency <> 'EUR';
    SELECT count(*) INTO n_ae  FROM accounting_entries WHERE currency <> 'EUR';
    IF n_inv > 0 OR n_ae > 0 THEN
      RAISE EXCEPTION 'Migration 067 interrompue : % facture(s) et % écriture(s) hors EUR existent déjà. Les examiner (audit-facturation.js) avant de poursuivre.', n_inv, n_ae;
    END IF;
  END IF;
END $$;

-- 1) Règles de livraison par boutique, dans SA devise.
--    Swedish Cravings (sc) : toujours NULL, ses règles restent celles de
--    src/lib/shipping.ts. Autre boutique : livraison_pays ET livraison_cout
--    OBLIGATOIRES, sinon le checkout refuse (SHIPPING_NOT_CONFIGURED).
ALTER TABLE boutiques
  ADD COLUMN IF NOT EXISTS livraison_pays   TEXT[],
  ADD COLUMN IF NOT EXISTS livraison_cout   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS livraison_franco NUMERIC(10,2);

COMMENT ON COLUMN boutiques.livraison_pays   IS 'Pays livrés (ISO-2), le 1er = pays par défaut. Ignoré pour sc. Obligatoire pour toute autre boutique (sinon checkout refusé)';
COMMENT ON COLUMN boutiques.livraison_cout   IS 'Frais de port, dans la devise de la boutique. Ignoré pour sc. Obligatoire pour toute autre boutique';
COMMENT ON COLUMN boutiques.livraison_franco IS 'Seuil de livraison offerte, dans la devise de la boutique (NULL = jamais offerte)';

-- 2) Commandes : contre-valeur EUR relevée au paiement.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS total_eur            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS montant_regle_devise NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fx_rate              NUMERIC(18,10),
  ADD COLUMN IF NOT EXISTS fx_rate_bce          NUMERIC(18,10),
  ADD COLUMN IF NOT EXISTS fx_source            TEXT,
  ADD COLUMN IF NOT EXISTS fx_date              DATE,
  ADD COLUMN IF NOT EXISTS stripe_fee_eur       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS stripe_balance_tx    TEXT;

COMMENT ON COLUMN orders.total_eur            IS 'EUR encaissé au paiement (Stripe balance_transaction.amount, sinon montant_regle_devise × taux BCE). Jamais réécrit par un remboursement. NULL pour une commande en EUR';
COMMENT ON COLUMN orders.montant_regle_devise IS 'Montant réglé dans orders.currency au moment du paiement : total_eur en est la contre-valeur (orders.total peut baisser ensuite)';
COMMENT ON COLUMN orders.fx_rate              IS 'Valeur en EUR d''une unité de orders.currency (taux Stripe exchange_rate, sinon BCE)';
COMMENT ON COLUMN orders.fx_rate_bce          IS 'Taux BCE du jour du paiement, informatif (contrôle de la marge de change Stripe)';
COMMENT ON COLUMN orders.fx_source            IS 'stripe | bce | taux_vente';
COMMENT ON COLUMN orders.fx_date              IS 'Jour (Paris) du paiement retenu pour la contre-valeur ; date de la recette hors EUR';
COMMENT ON COLUMN orders.stripe_fee_eur       IS 'Frais Stripe réels en EUR (balance_transaction.fee)';
COMMENT ON COLUMN orders.stripe_balance_tx    IS 'Identifiant txn_… de la balance transaction de la charge';

-- 3) Factures : devise de la commande + contre-valeur figée.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS total_ttc_eur NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fx_rate_eur   NUMERIC(18,10),
  ADD COLUMN IF NOT EXISTS fx_source     TEXT,
  ADD COLUMN IF NOT EXISTS fx_date       DATE,
  ADD COLUMN IF NOT EXISTS buyer_country TEXT;

COMMENT ON COLUMN invoices.total_ttc_eur IS 'Contre-valeur EUR du total (signée comme total_ttc). Scellée dans l''empreinte si currency <> EUR';
COMMENT ON COLUMN invoices.fx_rate_eur   IS 'Valeur en EUR d''une unité de invoices.currency. Scellée si currency <> EUR';
COMMENT ON COLUMN invoices.fx_source     IS 'stripe | bce | taux_vente';
COMMENT ON COLUMN invoices.buyer_country IS 'Pays de l''acheteur (ISO-2, pays de livraison en B2C), Factur-X BT-55 ; rempli hors EUR';

-- 4) Écritures : amount reste en EUR ; l'original en devise à côté.
ALTER TABLE accounting_entries
  ADD COLUMN IF NOT EXISTS amount_currency     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fx_rate             NUMERIC(18,10),
  ADD COLUMN IF NOT EXISTS fx_source           TEXT,
  ADD COLUMN IF NOT EXISTS stripe_balance_tx   TEXT,
  ADD COLUMN IF NOT EXISTS destination_country TEXT;

COMMENT ON COLUMN accounting_entries.amount              IS 'Montant en EUROS, toujours (URSSAF, FEC, livre des recettes)';
COMMENT ON COLUMN accounting_entries.amount_currency     IS 'Montant d''origine dans accounting_entries.currency (NULL si EUR)';
COMMENT ON COLUMN accounting_entries.fx_rate             IS 'Valeur en EUR d''une unité de la devise d''origine';
COMMENT ON COLUMN accounting_entries.stripe_balance_tx   IS 'txn_… Stripe : clé du rapprochement des versements (hors EUR)';
COMMENT ON COLUMN accounting_entries.destination_country IS 'Pays d''arrivée de la marchandise (ISO-2), rempli hors EUR. Le seuil européen se calcule depuis orders';

-- 5) Garde-fous (la garde 0 assure que toutes les lignes existantes sont en EUR).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boutiques_livraison_montants_chk') THEN
    ALTER TABLE boutiques ADD CONSTRAINT boutiques_livraison_montants_chk
      CHECK ((livraison_cout IS NULL OR livraison_cout >= 0) AND (livraison_franco IS NULL OR livraison_franco >= 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_currency_format_chk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_currency_format_chk CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_currency_format_chk') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_currency_format_chk CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_entries_currency_format_chk') THEN
    ALTER TABLE accounting_entries ADD CONSTRAINT accounting_entries_currency_format_chk CHECK (currency ~ '^[A-Z]{3}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_fx_source_chk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_fx_source_chk
      CHECK (fx_source IS NULL OR fx_source IN ('stripe', 'bce', 'taux_vente'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_fx_source_chk') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_fx_source_chk
      CHECK (fx_source IS NULL OR fx_source IN ('stripe', 'bce', 'taux_vente'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_entries_fx_source_chk') THEN
    ALTER TABLE accounting_entries ADD CONSTRAINT accounting_entries_fx_source_chk
      CHECK (fx_source IS NULL OR fx_source IN ('stripe', 'bce', 'taux_vente'));
  END IF;

  -- Une écriture hors EUR doit porter son original : impossible d'y
  -- glisser des couronnes comme si c'étaient des euros sans le dire.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_entries_devise_tracee_chk') THEN
    ALTER TABLE accounting_entries ADD CONSTRAINT accounting_entries_devise_tracee_chk
      CHECK (currency = 'EUR' OR (amount_currency IS NOT NULL AND fx_rate IS NOT NULL));
  END IF;
  -- Une facture hors EUR naît avec sa contre-valeur (elle est scellée).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_contre_valeur_chk') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_contre_valeur_chk
      CHECK (currency = 'EUR' OR (total_ttc_eur IS NOT NULL AND fx_rate_eur IS NOT NULL));
  END IF;
END $$;

-- 6) Index : rapprochement par référence Stripe, repérage du non-EUR.
CREATE INDEX IF NOT EXISTS orders_stripe_balance_tx_idx
  ON orders (stripe_balance_tx) WHERE stripe_balance_tx IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounting_entries_stripe_balance_tx_idx
  ON accounting_entries (stripe_balance_tx) WHERE stripe_balance_tx IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_currency_hors_eur_idx
  ON orders (currency) WHERE currency <> 'EUR';
CREATE INDEX IF NOT EXISTS accounting_entries_currency_hors_eur_idx
  ON accounting_entries (currency) WHERE currency <> 'EUR';

-- Exemple (NON exécuté) pour une prévisualisation de la 2e boutique :
-- INSERT INTO boutiques (code, nom, devise, langue, retrait_sur_place, livraison_pays, livraison_cout, livraison_franco, actif)
-- VALUES ('fc', 'French Cravings', 'SEK', 'sv', FALSE, ARRAY['SE'], 149.00, 795.00, FALSE)
-- ON CONFLICT (code) DO NOTHING;
