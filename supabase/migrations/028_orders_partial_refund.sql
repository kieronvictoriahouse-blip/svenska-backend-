-- ═══════════════════════════════════════════════════════════════
-- Migration 028 — Remboursements partiels
-- Permet de rembourser une partie d'une commande (ligne retirée,
-- geste commercial, retenue de frais de port…) sans passer la
-- commande entière au statut 'refunded'.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at     TIMESTAMPTZ,
  -- Historique : [{ date, amount, shipping_kept, reason, stripe_refund_id, avoir_number, items }]
  ADD COLUMN IF NOT EXISTS refunds         JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN orders.refunded_amount IS 'Cumul TTC déjà remboursé au client (partiel ou total)';
COMMENT ON COLUMN orders.refunds          IS 'Historique détaillé des remboursements';
