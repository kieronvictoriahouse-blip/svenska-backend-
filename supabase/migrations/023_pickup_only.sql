-- Produits "retrait uniquement" (frais, fragiles, non expédiables)
-- Un panier contenant un tel produit passe automatiquement en Click & Collect.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pickup_only BOOLEAN NOT NULL DEFAULT false;
