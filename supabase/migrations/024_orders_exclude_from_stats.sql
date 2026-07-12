-- Colonne "exclure des stats" attendue par le code (page Commandes + bouton
-- « Hors stats ») mais jamais créée en base → le bouton plantait silencieusement.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS exclude_from_stats BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_exclude_from_stats
  ON orders (exclude_from_stats) WHERE exclude_from_stats = true;
