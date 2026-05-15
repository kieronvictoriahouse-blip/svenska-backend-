-- Migration 018 : suivi de stock sur les produits
-- Ajoute track_stock et stock sur la table products
-- Corrige decrement_stock pour mettre à jour products.stock

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT NULL;

-- Corriger la fonction decrement_stock pour pointer sur products.stock
-- (l'ancienne version mettait à jour margin_products.stock_qty, qui n'est pas lu par le front)
CREATE OR REPLACE FUNCTION decrement_stock(p_id UUID, qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET stock = GREATEST(0, COALESCE(stock, 0) - qty),
      updated_at = NOW()
  WHERE id = p_id
    AND track_stock = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
