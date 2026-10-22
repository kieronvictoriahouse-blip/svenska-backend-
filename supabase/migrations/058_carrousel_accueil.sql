-- ═══════════════════════════════════════════════════════════════
--  058 — Carrousel du haut de la page d'accueil
--
--  Le haut de l'accueil affiche soit une image fixe (cms_home.hero_image,
--  comme avant), soit un carrousel de diapositives. Le choix et le délai
--  de défilement vivent dans cms_home (type 'setting', jamais réécrits
--  par le reseed de /api/cms qui ne touche que les lignes 'text').
--
--  Une diapositive est de l'un de trois types :
--    default → la photo change, le texte reste celui de l'accueil ;
--    custom  → texte propre (surtitre, titre, sous-titre, bouton + lien) ;
--    image   → visuel seul, texte déjà dans l'image, cliquable en entier.
--
--  starts_on / ends_on : bornes INCLUSES, en date de Paris. NULL = sans
--  limite. Toute la logique vit dans src/app/api/hero/route.ts.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS home_slides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order       INT  NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  kind             TEXT NOT NULL DEFAULT 'default' CHECK (kind IN ('default', 'custom', 'image')),
  image_url        TEXT NOT NULL,
  image_mobile_url TEXT,                 -- visuel recadré pour téléphone (surtout pour 'image')
  alt_fr           TEXT, alt_en TEXT, alt_sv TEXT,
  eyebrow_fr       TEXT, eyebrow_en TEXT, eyebrow_sv TEXT,
  title_fr         TEXT, title_en TEXT, title_sv TEXT,      -- HTML limité : <em>, <br>
  subtitle_fr      TEXT, subtitle_en TEXT, subtitle_sv TEXT,
  cta_label_fr     TEXT, cta_label_en TEXT, cta_label_sv TEXT,
  link_url         TEXT,
  starts_on        DATE,
  ends_on          DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT home_slides_dates_check CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);

CREATE INDEX IF NOT EXISTS home_slides_ordre_idx ON home_slides (sort_order);

-- Lue et écrite uniquement par le serveur (clé service) : aucune
-- politique = aucun accès via la clé anonyme. La vitrine passe par
-- GET /api/hero, qui ne renvoie que les diapositives visibles.
ALTER TABLE home_slides ENABLE ROW LEVEL SECURITY;

-- Réglages : image fixe par défaut, donc rien ne change en ligne tant
-- qu'on n'a pas choisi « Carrousel » dans le back-office.
INSERT INTO cms_home (key, label, type, value_fr, value_sv, value_en) VALUES
  ('hero_mode',     'Hero – Affichage (image | carousel)', 'setting', 'image', 'image', 'image'),
  ('hero_interval', 'Hero – Délai du carrousel (s)',       'setting', '5',     '5',     '5')
ON CONFLICT (key) DO NOTHING;
