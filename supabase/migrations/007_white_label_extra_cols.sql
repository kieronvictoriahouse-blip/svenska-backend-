-- Colonnes manquantes dans white_label_config (envoyées par la page admin mais absentes du schéma initial)
ALTER TABLE white_label_config
  ADD COLUMN IF NOT EXISTS pinterest          text DEFAULT '',
  ADD COLUMN IF NOT EXISTS announcement_fr    text DEFAULT 'Livraison gratuite dès 50€ · Produits authentiques · Paiement sécurisé',
  ADD COLUMN IF NOT EXISTS announcement_sv    text DEFAULT 'Fri frakt från 50€ · Autentiska produkter · Säker betalning',
  ADD COLUMN IF NOT EXISTS announcement_en    text DEFAULT 'Free delivery from €50 · Authentic products · Secure payment',
  ADD COLUMN IF NOT EXISTS footer_desc_fr     text DEFAULT '',
  ADD COLUMN IF NOT EXISTS footer_desc_sv     text DEFAULT '',
  ADD COLUMN IF NOT EXISTS footer_desc_en     text DEFAULT '',
  ADD COLUMN IF NOT EXISTS footer_tagline_fr  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS footer_tagline_sv  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS footer_tagline_en  text DEFAULT '';
