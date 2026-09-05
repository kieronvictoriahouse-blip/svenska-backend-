-- 048_journal_erreurs.sql
-- Journal des erreurs MÉTIER d'une instance : les échecs qu'on anticipe et
-- qu'on veut requêtables, rattachés à une commande (« le webhook Stripe de
-- #1234 a échoué », « l'email de confirmation n'est pas parti »).
--
-- Vit dans la base de CHAQUE instance : la donnée reste chez le client
-- (cloisonnement respecté). Sentry, lui, reçoit une copie SANS donnée client
-- pour l'alerte transverse. Les deux sont complémentaires — voir lib/system-events.ts.
CREATE TABLE IF NOT EXISTS system_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  level        TEXT NOT NULL DEFAULT 'error',   -- 'error' | 'warn' | 'info'
  source       TEXT NOT NULL,                   -- ex. 'stripe-webhook', 'email-send'
  message      TEXT NOT NULL,
  context      JSONB NOT NULL DEFAULT '{}'::jsonb, -- détails techniques libres
  order_number TEXT,                            -- commande concernée si applicable
  fingerprint  TEXT,                            -- regroupe les occurrences identiques
  resolved     BOOLEAN NOT NULL DEFAULT false,
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_events_created  ON system_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_unresolved ON system_events (resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_source   ON system_events (source);

-- Écrit uniquement par le backend (clé service_role), jamais exposé au public.
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON system_events;
CREATE POLICY "service_role_all" ON system_events FOR ALL TO service_role USING (true) WITH CHECK (true);
