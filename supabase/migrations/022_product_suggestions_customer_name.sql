-- Ajout du champ customer_name sur product_suggestions
-- Nom + email deviennent obligatoires côté formulaire (non NOT NULL en DB pour compatibilité données existantes)
ALTER TABLE product_suggestions
  ADD COLUMN IF NOT EXISTS customer_name text;
