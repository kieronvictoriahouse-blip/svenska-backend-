-- ═══════════════════════════════════════════════════════════════
--  038 — Langue du client
--
--  Constat sur les 109 commandes existantes : 106 France, 2 Royaume-Uni,
--  1 Espagne. Aucune n'est indéterminable, mais le pays n'est ecrit nulle
--  part : il est enfoui dans l'adresse de livraison, sous deux formes
--  differentes (49 objets JSON, 60 chaines de texte libre). Une colonne
--  explicite met fin a cette devinette.
--
--  La colonne accepte NULL et c'est voulu : NULL veut dire « deduite du
--  pays », une valeur veut dire « choisie a la main ». Sans cette
--  distinction, un choix manuel serait ecrase au prochain recalcul.
--
--  Aucune reprise de donnees ici. La 037 avait tente la sienne en SQL et
--  inserait zero ligne sans rien signaler, parce que la colonne `lines`
--  contient une chaine JSON et non un tableau. La reprise se fait donc
--  par `node scripts/reprise-langue-client.js`, qui montre son resultat
--  avant d'ecrire.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Langue portee par la commande ─────────────────────────────
-- Sur la commande et non seulement sur le contact : un meme client peut
-- se faire livrer en Suede une fois et en France la suivante, et le
-- document doit suivre l'envoi, pas la fiche.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS lang TEXT,
  -- Le pays est extrait une fois pour toutes, plutot que reanalyse a
  -- chaque affichage a partir d'une adresse en texte libre.
  ADD COLUMN IF NOT EXISTS shipping_country TEXT;

-- ─── 2. Langue preferee du contact ────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lang TEXT;

-- Trois langues seulement : ce sont celles des gabarits et des
-- documents. Une valeur hors liste passerait le repli sans qu'on le
-- voie, et le client recevrait du francais sans explication.
ALTER TABLE orders   DROP CONSTRAINT IF EXISTS orders_lang_valide;
ALTER TABLE orders   ADD  CONSTRAINT orders_lang_valide
  CHECK (lang IS NULL OR lang IN ('fr', 'en', 'sv'));

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_lang_valide;
ALTER TABLE contacts ADD  CONSTRAINT contacts_lang_valide
  CHECK (lang IS NULL OR lang IN ('fr', 'en', 'sv'));

COMMENT ON COLUMN orders.lang IS
  'Langue des documents et emails de cette commande. NULL = deduite du pays de livraison ; une valeur = choix manuel, jamais ecrase par un recalcul.';
COMMENT ON COLUMN orders.shipping_country IS
  'Code ISO a deux lettres extrait de l''adresse de livraison, qui existe en deux formats incompatibles.';

-- ─── 3. Gabarits d'email par langue ───────────────────────────────
-- Jusqu'ici un gabarit par cle. Il en faut un par cle ET par langue,
-- sinon personnaliser la version francaise ecraserait la suedoise.
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'fr';

ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_lang_valide;
ALTER TABLE email_templates ADD  CONSTRAINT email_templates_lang_valide
  CHECK (lang IN ('fr', 'en', 'sv'));

-- La cle seule ne suffit plus a identifier une ligne.
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_key_key;
DROP INDEX IF EXISTS email_templates_key_lang;
CREATE UNIQUE INDEX email_templates_key_lang ON email_templates (key, lang);

COMMENT ON COLUMN email_templates.lang IS
  'Un gabarit par cle ET par langue : personnaliser le francais ne doit pas toucher au suedois.';
