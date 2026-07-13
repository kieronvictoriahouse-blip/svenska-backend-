-- Colonne téléphone client (attendue par l'admin Commandes + l'étiquette
-- Mondial Relay, mais jamais créée). Sans elle, l'UPDATE du webhook qui
-- écrivait customer_phone était rejeté → commande jamais passée "payée".
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;
