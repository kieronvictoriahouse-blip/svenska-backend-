CREATE TABLE IF NOT EXISTS cms_pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  title_fr      text DEFAULT '',
  title_sv      text DEFAULT '',
  title_en      text DEFAULT '',
  nav_label_fr  text DEFAULT '',
  nav_label_sv  text DEFAULT '',
  nav_label_en  text DEFAULT '',
  hero_image    text DEFAULT '',
  hero_title_fr text DEFAULT '',
  hero_title_sv text DEFAULT '',
  hero_title_en text DEFAULT '',
  hero_subtitle_fr text DEFAULT '',
  hero_subtitle_sv text DEFAULT '',
  hero_subtitle_en text DEFAULT '',
  blocks        jsonb DEFAULT '[]',
  show_in_nav   boolean DEFAULT true,
  is_active     boolean DEFAULT true,
  sort_order    int DEFAULT 99,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Seed the existing pages as CMS pages
INSERT INTO cms_pages (slug, title_fr, title_sv, title_en, nav_label_fr, nav_label_sv, nav_label_en, sort_order, show_in_nav)
VALUES
  ('a-propos', 'Notre histoire', 'Vår historia', 'Our story', 'Notre histoire', 'Vår historia', 'Our story', 1, true)
ON CONFLICT (slug) DO NOTHING;
