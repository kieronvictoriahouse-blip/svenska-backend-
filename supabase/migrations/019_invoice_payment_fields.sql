-- Migration 019 : champs paiement sur les factures (conformité légale)
-- À exécuter dans Supabase SQL Editor

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN invoices.paid_at        IS 'Date de paiement effective';
COMMENT ON COLUMN invoices.payment_method IS 'Moyen de paiement : card | transfer | paypal | stripe | other';

-- Rétro-remplir paid_at pour les factures déjà payées (approximation : date de création)
UPDATE invoices
SET paid_at = created_at
WHERE status = 'paid' AND paid_at IS NULL;
