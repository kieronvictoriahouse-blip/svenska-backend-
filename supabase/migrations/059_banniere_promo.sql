-- ═══════════════════════════════════════════════════════════════
--  059 — Bannière d'accueil : type « Bannière promo » et 2e bouton
--
--  split : texte et boutons à gauche sur un fond aux couleurs de la
--          marque, photo (sans texte) à droite ; empilés sur téléphone.
--          Les vrais boutons remplacent ceux qu'on dessinait dans
--          l'image : chacun son lien, traduits, lisibles sur mobile.
--
--  tagline_*    : ligne d'accroche en italique sous le titre (split)
--  cta2_label_* : texte du second bouton (custom, split)
--  link2_url    : lien du second bouton
--  theme        : fond du panneau — moss (mousse), ink (encre), sand (sable)
--
--  À appliquer AVANT de déployer le back-office qui lit ces colonnes.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE home_slides DROP CONSTRAINT IF EXISTS home_slides_kind_check;
ALTER TABLE home_slides ADD CONSTRAINT home_slides_kind_check
  CHECK (kind IN ('default', 'custom', 'image', 'split'));

ALTER TABLE home_slides
  ADD COLUMN IF NOT EXISTS tagline_fr    TEXT,
  ADD COLUMN IF NOT EXISTS tagline_en    TEXT,
  ADD COLUMN IF NOT EXISTS tagline_sv    TEXT,
  ADD COLUMN IF NOT EXISTS cta2_label_fr TEXT,
  ADD COLUMN IF NOT EXISTS cta2_label_en TEXT,
  ADD COLUMN IF NOT EXISTS cta2_label_sv TEXT,
  ADD COLUMN IF NOT EXISTS link2_url     TEXT,
  ADD COLUMN IF NOT EXISTS theme         TEXT NOT NULL DEFAULT 'moss'
    CHECK (theme IN ('moss', 'ink', 'sand'));
