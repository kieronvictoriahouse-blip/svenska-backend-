-- ═══════════════════════════════════════════════════════════════
--  045 — Intégrité de la facturation
--
--  Deux protections que le code seul ne peut pas garantir :
--
--  1. UNICITÉ du numéro de pièce. La numérotation est calculée en
--     lisant le plus grand numéro existant : deux créations simultanées
--     pouvaient lire la même valeur et produire deux FAC-2026-0050.
--     L'index unique transforme cette course en erreur franche, que le
--     code rattrape en re-numérotant.
--
--  2. CHAÎNAGE cryptographique. Chaque facture finalisée porte
--     l'empreinte SHA-256 de son contenu ET de l'empreinte de la
--     facture précédente. Modifier ou supprimer une pièce après coup
--     casse toutes les empreintes suivantes : l'altération ne peut
--     plus être silencieuse. C'est le principe d'inaltérabilité de
--     l'art. 286-I-3° bis du CGI (la franchise en base en dispense
--     aujourd'hui, mais la dispense tombe avec la franchise — et un
--     historique inaltérable ne se construit pas rétroactivement).
--
--  Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Numéro unique ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_unique ON invoices (number);

-- ─── 2. Colonnes de chaînage ───────────────────────────────────────
-- chain_hash  : empreinte SHA-256 du contenu canonique + chain_prev
-- chain_prev  : empreinte de la pièce précédente ('GENESIS' pour la 1re)
-- finalized_at: date de scellement — une pièce scellée ne change plus
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS chain_hash   TEXT,
  ADD COLUMN IF NOT EXISTS chain_prev   TEXT,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

-- L'ordre de la chaîne est l'ordre de scellement.
CREATE INDEX IF NOT EXISTS invoices_finalized ON invoices (finalized_at);

COMMENT ON COLUMN invoices.chain_hash IS 'SHA-256 du contenu canonique + chain_prev — inaltérabilité (art. 286-I-3° bis CGI)';
COMMENT ON COLUMN invoices.chain_prev IS 'chain_hash de la pièce précédente, GENESIS pour la première';
COMMENT ON COLUMN invoices.finalized_at IS 'Scellement : après cette date, le contenu facturé ne change plus (avoir uniquement)';
