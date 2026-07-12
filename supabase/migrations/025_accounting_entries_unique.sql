-- Empêche définitivement les doublons d'écritures comptables automatiques
-- (cause du CA gonflé : une même commande comptée plusieurs fois).

-- 1) Dédoublonnage préalable : garder la plus ancienne écriture par clé métier
--    (toutes les écritures rattachées à une référence : commande, réception,
--    coût logistique, remboursement). Les écritures manuelles (reference_id
--    NULL) ne sont pas touchées.
DELETE FROM accounting_entries
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY reference_type, reference_id, type, coalesce(category, '')
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM accounting_entries
    WHERE reference_id IS NOT NULL
  ) t
  WHERE t.rn > 1
);

-- 2) Index unique partiel : un seul (type_de_référence, référence, type, catégorie)
--    possible dès qu'une référence existe. Les écritures manuelles restent libres.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_accounting_entry_ref
  ON accounting_entries (reference_type, reference_id, type, coalesce(category, ''))
  WHERE reference_id IS NOT NULL;
