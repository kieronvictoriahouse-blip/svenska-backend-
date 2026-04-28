-- ── 006_cms_home.sql ─────────────────────────────────────────────────────────
-- Ensure cms_home table exists and populate all 4 image + 3 text rows

CREATE TABLE IF NOT EXISTS cms_home (
  key        TEXT PRIMARY KEY,
  label      TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL DEFAULT 'text',
  value_fr   TEXT NOT NULL DEFAULT '',
  value_sv   TEXT NOT NULL DEFAULT '',
  value_en   TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cms_home ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cms_home' AND policyname = 'cms_home_public_read'
  ) THEN
    CREATE POLICY "cms_home_public_read" ON cms_home FOR SELECT USING (true);
  END IF;
END $$;

-- Insert all expected rows — idempotent, won't overwrite existing values
INSERT INTO cms_home (key, label, type, value_fr, value_sv, value_en) VALUES
  ('hero_eyebrow',     'Hero – Eyebrow',                      'text',
    'British & Nordic Pantry',
    'British & Nordic Pantry',
    'British & Nordic Pantry'),
  ('hero_title',       'Hero – Titre',                        'text',
    'L''épicerie <em>du Nord</em>',
    'Nordisk & brittisk <em>delikatessen</em>',
    'The Nordic & British <em>pantry</em>'),
  ('hero_subtitle',    'Hero – Sous-titre',                   'text',
    'Le meilleur de la Scandinavie et des îles britanniques — épices, conserves, biscuits iconiques et spécialités authentiques, livrés en France.',
    'Det bästa från Skandinavien och de brittiska öarna — kryddor, konserver, klassiska kex och autentiska specialiteter, levererade till Frankrike.',
    'The best of Scandinavia and the British Isles — spices, preserves, iconic biscuits and authentic specialities, delivered across France.'),
  ('hero_image',       'Hero – Photo de fond',                'image', '', '', ''),
  ('editorial_image',  'Section produits – Photo éditoriale', 'image',
    'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85',
    'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85',
    'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85'),
  ('feature_image',    'Feature band – Photo de fond',        'image',
    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85',
    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85',
    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&q=85'),
  ('about_image',      'Section histoire – Photo',            'image',
    'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85',
    'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85',
    'https://images.unsplash.com/photo-1551183053-bf91798d047c?w=900&q=85')
ON CONFLICT (key) DO NOTHING;
