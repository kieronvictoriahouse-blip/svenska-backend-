-- Add allergens and nutrition columns to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS allergens_sv TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS allergens_fr TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS allergens_en TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS nutrition    JSONB DEFAULT '{}';
