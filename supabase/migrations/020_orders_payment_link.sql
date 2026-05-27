-- Migration 020 : lien de paiement sur les commandes manuelles
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_url       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_sent_at   TIMESTAMPTZ;
