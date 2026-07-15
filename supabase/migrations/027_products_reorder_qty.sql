-- Quantité de réapprovisionnement minimum par produit (ex. carton de 50).
-- Utilisée comme plancher dans les suggestions d'achat. NULL/0 = défaut 10.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS reorder_qty INTEGER;
