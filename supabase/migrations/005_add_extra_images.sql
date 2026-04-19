-- Store multiple image URLs for product gallery thumbnails
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS extra_images JSONB DEFAULT '[]';
