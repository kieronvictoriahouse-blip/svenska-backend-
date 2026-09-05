-- ═══════════════════════════════════════════════════════════════════
--  Migration 048 — autorise le fournisseur « bridge »
--  Le 047 limitait bank_connections.provider à gocardless/stripe/import/
--  manual. L'adaptateur Bridge insère provider='bridge' → on étend le CHECK.
--  Idempotent.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_provider_check;
ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_provider_check
  CHECK (provider IN ('gocardless','stripe','import','manual','bridge'));
