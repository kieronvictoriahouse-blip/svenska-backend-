-- ═══════════════════════════════════════════════════════════════
--  046 — La marque quitte le code (SAAS/02-DEBRANDING.md)
--
--  Trois informations d'identité vivaient en constantes dans le code
--  (« EI Victoria Vallet », « Romans-sur-Isère », « Marcq-en-Barœul »).
--  Elles deviennent des colonnes de white_label_config, comme le reste
--  de l'identité du marchand.
--
--  Le SEED renseigne les valeurs actuelles de Swedish Cravings : cette
--  instance doit produire exactement les mêmes documents avant et
--  après. Une instance neuve remplira ces champs au provisionnement.
--
--  Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE white_label_config
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS rcs_city   TEXT,
  ADD COLUMN IF NOT EXISTS shop_city  TEXT;

COMMENT ON COLUMN white_label_config.legal_name IS 'Dénomination légale (ex. « EI Prénom Nom ») — figure sur les factures';
COMMENT ON COLUMN white_label_config.rcs_city   IS 'Ville du greffe RCS — mention de bas de facture';
COMMENT ON COLUMN white_label_config.shop_city  IS 'Ville de l''atelier/boutique — citée dans les emails clients';

UPDATE white_label_config SET
  legal_name = COALESCE(legal_name, 'EI Victoria Vallet'),
  rcs_city   = COALESCE(rcs_city,   'Romans-sur-Isère'),
  shop_city  = COALESCE(shop_city,  'Marcq-en-Barœul');
