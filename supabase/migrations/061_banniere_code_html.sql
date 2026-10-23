-- ═══════════════════════════════════════════════════════════════
--  061 — Bannière d'accueil : type « Code HTML »
--  (appliquée le 23/10/2026 sous le nom 060, renumérotée : 060 est
--  pris par 060_fabricant.sql)
--
--  html : on colle le code d'un design (HTML + <style>), on envoie ses
--         images. La vitrine l'affiche dans un cadre isolé (iframe
--         sandbox, sans scripts, sans accès aux cookies ni au panier) :
--         son CSS ne peut pas casser le site, ses liens restent de
--         vrais liens.
--
--  html_fr/en/sv : le code, par langue (repli sur le français)
--  html_fit      : contain = design de taille fixe (html_width ×
--                  html_height), mis à l'échelle de l'écran ;
--                  fill    = code adaptatif, remplit la bannière
--  image_url     : facultative pour ce type (vignette / repli)
--
--  À appliquer AVANT de déployer le back-office qui lit ces colonnes.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE home_slides DROP CONSTRAINT IF EXISTS home_slides_kind_check;
ALTER TABLE home_slides ADD CONSTRAINT home_slides_kind_check
  CHECK (kind IN ('default', 'custom', 'image', 'split', 'html'));

ALTER TABLE home_slides
  ADD COLUMN IF NOT EXISTS html_fr     TEXT,
  ADD COLUMN IF NOT EXISTS html_en     TEXT,
  ADD COLUMN IF NOT EXISTS html_sv     TEXT,
  ADD COLUMN IF NOT EXISTS html_fit    TEXT NOT NULL DEFAULT 'contain'
    CHECK (html_fit IN ('contain', 'fill')),
  ADD COLUMN IF NOT EXISTS html_width  INT  NOT NULL DEFAULT 1920
    CHECK (html_width BETWEEN 320 AND 4000),
  ADD COLUMN IF NOT EXISTS html_height INT  NOT NULL DEFAULT 720
    CHECK (html_height BETWEEN 200 AND 4000);
