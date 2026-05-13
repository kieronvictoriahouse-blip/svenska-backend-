-- ═══════════════════════════════════════════════════════════════
-- SVENSKA DELIKATESSEN — Migration 012
-- Mise à jour white_label_config : SIREN + TVA intracommunautaire
-- ═══════════════════════════════════════════════════════════════
-- SIREN : 105003537
-- TVA intracommunautaire : FR19105003537
--   Clé = (12 + 3 × (SIREN mod 97)) mod 97 = (12 + 3×67) mod 97 = 19
-- Note : SIRET = SIREN (9 chiffres) + NIC (5 chiffres, obtenu de l'INSEE)
--        Mettre à jour le champ siret dès réception du SIRET complet.

UPDATE white_label_config
SET
  siret      = '105003537',
  tva        = 'FR19105003537',
  updated_at = NOW()
WHERE id = (SELECT id FROM white_label_config LIMIT 1);
