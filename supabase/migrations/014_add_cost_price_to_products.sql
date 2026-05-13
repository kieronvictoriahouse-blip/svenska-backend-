-- Migration 014 : prix d'achat sur les produits pour calcul de marge
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0;
