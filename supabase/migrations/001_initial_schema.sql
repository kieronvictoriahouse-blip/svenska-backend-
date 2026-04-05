-- ═══════════════════════════════════════════════════════════════
-- SVENSKA DELIKATESSEN — Supabase Schema v1
-- Coller dans Supabase > SQL Editor > Run
-- ═══════════════════════════════════════════════════════════════

-- ─── EXTENSION ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── CATEGORIES ─────────────────────────────────────────────────
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        TEXT UNIQUE NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '📦',
  name_sv     TEXT NOT NULL,
  name_fr     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRODUCTS ───────────────────────────────────────────────────
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,

  -- Traductions
  name_sv       TEXT NOT NULL,
  name_fr       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  subtitle_sv   TEXT,
  subtitle_fr   TEXT,
  subtitle_en   TEXT,
  desc_sv       TEXT,
  desc_fr       TEXT,
  desc_en       TEXT,

  -- Prix & stock
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  weight        TEXT,                      -- "250g", "30 sachets"
  origin_sv     TEXT,
  origin_fr     TEXT,
  origin_en     TEXT,

  -- Image
  image_url     TEXT,                      -- URL Supabase Storage

  -- Badges
  badge         TEXT CHECK (badge IN ('badge-new','badge-pop','badge-org','badge-must') OR badge IS NULL),
  is_bestseller BOOLEAN DEFAULT false,
  is_new        BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,

  -- Notation (simulée)
  rating        NUMERIC(3,1) DEFAULT 4.5,
  reviews_count INTEGER DEFAULT 0,

  -- Tags (array PostgreSQL)
  tags          TEXT[] DEFAULT '{}',

  -- Contenus accordéon (usage/ingrédients/conservation)
  usage_sv      TEXT,
  usage_fr      TEXT,
  usage_en      TEXT,
  ingredients_sv TEXT,
  ingredients_fr TEXT,
  ingredients_en TEXT,
  storage_sv    TEXT,
  storage_fr    TEXT,
  storage_en    TEXT,

  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── VARIANTS ───────────────────────────────────────────────────
CREATE TABLE product_variants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,              -- "50g", "100g", "Kit 4 sachets"
  price       NUMERIC(10,2) NOT NULL,
  is_default  BOOLEAN DEFAULT false,
  sort_order  INTEGER DEFAULT 0
);

-- ─── HOMEPAGE CONFIG ────────────────────────────────────────────
-- Permet de configurer dynamiquement la page d'accueil
CREATE TABLE homepage_sections (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT UNIQUE NOT NULL,        -- 'hero', 'featured_band', 'promo_bar', etc.
  title_sv    TEXT,
  title_fr    TEXT,
  title_en    TEXT,
  subtitle_sv TEXT,
  subtitle_fr TEXT,
  subtitle_en TEXT,
  body_sv     TEXT,
  body_fr     TEXT,
  body_en     TEXT,
  image_url   TEXT,
  cta_label_sv TEXT,
  cta_label_fr TEXT,
  cta_label_en TEXT,
  cta_url     TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FEATURED PRODUCTS ──────────────────────────────────────────
-- Produits mis en avant sur la home (best-sellers, nouveautés, etc.)
CREATE TABLE homepage_featured (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section     TEXT NOT NULL,              -- 'bestsellers', 'new_arrivals', 'xmas'
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true
);

-- ─── MEDIA LIBRARY ──────────────────────────────────────────────
CREATE TABLE media (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename    TEXT NOT NULL,
  url         TEXT NOT NULL,
  size        INTEGER,
  mime_type   TEXT,
  alt_text    TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ADMIN USERS ────────────────────────────────────────────────
-- Géré par Supabase Auth (table auth.users native)
-- On crée juste un profil admin
CREATE TABLE admin_profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT NOT NULL,
  full_name TEXT,
  role      TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TRIGGERS: updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER homepage_sections_updated_at
  BEFORE UPDATE ON homepage_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────
-- Lecture publique pour les produits et catégories (front)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE homepage_featured ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- Lecture publique (front HTML)
CREATE POLICY "public_read_categories"    ON categories    FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_products"      ON products      FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_variants"      ON product_variants FOR SELECT USING (true);
CREATE POLICY "public_read_homepage"      ON homepage_sections FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_featured"      ON homepage_featured FOR SELECT USING (is_active = true);

-- Écriture admin uniquement (authenticated)
CREATE POLICY "admin_all_categories"   ON categories    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_products"     ON products      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_variants"     ON product_variants FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_homepage"     ON homepage_sections FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_featured"     ON homepage_featured FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_media"        ON media         FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_own_profile"      ON admin_profiles FOR ALL USING (auth.uid() = id);

-- ─── STORAGE BUCKET ─────────────────────────────────────────────
-- À créer dans Supabase > Storage > New bucket
-- Nom: "svenska-media"
-- Public: true
-- Coller ces policies dans Supabase > Storage > Policies:

-- INSERT INTO storage.buckets (id, name, public) VALUES ('svenska-media', 'svenska-media', true);
-- CREATE POLICY "Public read media" ON storage.objects FOR SELECT USING (bucket_id = 'svenska-media');
-- CREATE POLICY "Auth upload media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'svenska-media' AND auth.role() = 'authenticated');
-- CREATE POLICY "Auth delete media" ON storage.objects FOR DELETE USING (bucket_id = 'svenska-media' AND auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA — Catégories initiales
-- ═══════════════════════════════════════════════════════════════
INSERT INTO categories (slug, emoji, name_sv, name_fr, name_en, sort_order) VALUES
('epices',             '🌶️', 'Épices & Aromates',   'Épices & Aromates',      'Spices & Herbs',      1),
('snacks-chips',       '🍟', 'Snacks & Chips',       'Snacks & Chips',         'Snacks & Crisps',     2),
('confiseries',        '🍬', 'Godis & Konfektyr',    'Confiseries',            'Candy & Sweets',      3),
('patisserie-basics',  '🥐', 'Bakning & Basics',     'Pâtisserie & Essentiels','Baking & Basics',     4),
('melanges',           '🎄', 'Blandningar',           'Mélanges suédois',       'Swedish Blends',      5),
('thes-tisanes',       '🫖', 'Thés & Tisanes',       'Thés & Tisanes',         'Teas & Infusions',    6),
('baies-sechees',      '🫐', 'Baies séchées',        'Baies séchées',          'Dried Berries',       7),
('flocons-cereales',   '🌾', 'Flocons & Céréales',  'Flocons & Céréales',     'Oats & Cereals',      8),
('sucres-sirops',      '🍯', 'Sucres & Sirops',      'Sucres & Sirops',        'Sugars & Syrups',     9),
('farines-graines',    '🌻', 'Farines & Graines',   'Farines & Graines',      'Flours & Seeds',     10);

-- ─── SEED Homepage sections ─────────────────────────────────────
INSERT INTO homepage_sections (key, title_sv, title_fr, title_en, subtitle_sv, subtitle_fr, subtitle_en, body_sv, body_fr, body_en, cta_label_fr, cta_url, sort_order) VALUES
('hero',
  'La saveur suédoise chez vous', 'La saveur suédoise chez vous', 'The Swedish taste at home',
  'Épicerie suédoise authentique', 'Épicerie suédoise authentique', 'Authentic Swedish grocery',
  'Épices, chips OLW, Daim, Ahlgrens bilar — tout ce qui manque aux Suédois en exil.',
  'Épices nordiques, chips OLW, Daim, Ahlgrens bilar — tout ce qui manque aux Suédois en exil.',
  'Nordic spices, OLW crisps, Daim — everything missing for Swedes abroad.',
  'Explorer la boutique', 'boutique.html', 1
),
('featured_band',
  'Kryddorna till Sverige', 'Les épices de Suède', 'The spices of Sweden',
  'Säsongens urval', 'Sélection signature', 'Signature selection',
  'Cardamome, kanel, anis — aromerna som definierar det svenska köket.',
  'Cardamome pour le kanelbulle, cannelle pour le glögg — les arômes de Suède.',
  'Cardamom, cinnamon, star anise — the aromas that define Swedish cooking.',
  'Découvrir les épices →', 'boutique.html?cat=epices', 2
),
('fredagsmys_band',
  'OLW · Daim · Ahlgrens · Polkagris', 'OLW · Daim · Ahlgrens · Polkagris', 'OLW · Daim · Ahlgrens · Polkagris',
  'Le fredagsmys suédois', 'Le fredagsmys suédois', 'Swedish fredagsmys',
  'Den svenska fredagstraditionen med chips, godis och film.',
  'La tradition suédoise du vendredi soir avec chips, bonbons et film.',
  'The Swedish Friday tradition with crisps, candy and a film.',
  'Tous les snacks →', 'boutique.html?cat=snacks-chips', 3
);
