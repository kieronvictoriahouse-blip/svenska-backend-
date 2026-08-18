-- ═══════════════════════════════════════════════════════════════
--  041 — Relance des demandes de remplacement
--
--  Deux manques constates en voulant verifier qu'un email etait bien
--  parti chez une cliente :
--
--  1. `sent_at` est rempli par DEFAULT a l'insertion de la ligne, donc
--     AVANT l'envoi. Il dit « une demande a ete creee », pas « un email
--     est parti ». On ne pouvait donc rien confirmer.
--
--  2. Aucun moyen de relancer. Une demande sans reponse restait en
--     attente sans qu'on puisse rien faire d'autre que la recreer — ce
--     qui aurait invalide le premier lien recu par la cliente.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE order_line_choices
  -- Horodatage pose APRES un envoi reussi, contrairement a `sent_at`.
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  -- 0 = premier envoi seulement. Chaque relance incremente.
  ADD COLUMN IF NOT EXISTS relances INTEGER NOT NULL DEFAULT 0,
  -- Trace du canal et de l'echec eventuel, pour ne plus avoir a deviner.
  ADD COLUMN IF NOT EXISTS last_send_error TEXT;

COMMENT ON COLUMN order_line_choices.sent_at IS
  'Date de CREATION de la demande (valeur par defaut). Ne prouve pas qu''un email est parti — voir last_sent_at.';
COMMENT ON COLUMN order_line_choices.last_sent_at IS
  'Date du dernier envoi REUSSI. NULL = aucun envoi confirme.';
COMMENT ON COLUMN order_line_choices.relances IS
  'Nombre de relances apres le premier envoi.';

-- Reprise : les demandes existantes ont bien donne lieu a un envoi, la
-- route levait une erreur en cas d'echec. On considere donc leur
-- creation comme un envoi reussi, sans quoi elles apparaitraient toutes
-- comme jamais envoyees.
UPDATE order_line_choices
SET last_sent_at = sent_at
WHERE last_sent_at IS NULL AND sent_at IS NOT NULL;
