-- ═══════════════════════════════════════════════════════════════
--  039 — Langue portee par le profil client
--
--  `customer_profiles` est indexee par email et survit d'une commande a
--  l'autre : c'est le bon endroit pour la preference de langue d'un
--  client de la boutique. `contacts` reste le carnet d'adresses, utile
--  pour les fournisseurs et la facturation, mais un client web n'y est
--  pas toujours.
--
--  DELIBEREMENT SANS VALEUR PAR DEFAUT.
--
--  La colonne `country` de cette meme table porte DEFAULT 'FR', et le
--  resultat se mesure : sur 19 profils, 12 affichent country='FR' sans
--  aucune adresse — ni ville, ni code postal, ni rue. Ce 'FR' n'est pas
--  une information sur le client, c'est la valeur par defaut qui s'est
--  ecrite toute seule, et rien ne permet ensuite de distinguer les deux.
--  Une langue par defaut reproduirait exactement la meme confusion : on
--  ne saurait plus qui a choisi le francais et qui n'a rien dit.
--
--  NULL veut donc dire « on ne sait pas », et la langue se deduit alors
--  du pays de livraison de la commande.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS lang TEXT;

ALTER TABLE customer_profiles DROP CONSTRAINT IF EXISTS customer_profiles_lang_valide;
ALTER TABLE customer_profiles ADD  CONSTRAINT customer_profiles_lang_valide
  CHECK (lang IS NULL OR lang IN ('fr', 'en', 'sv'));

COMMENT ON COLUMN customer_profiles.lang IS
  'Langue preferee du client. NULL = inconnue, on deduit du pays de livraison. Volontairement sans DEFAULT : voir country, dont le DEFAULT ''FR'' rend 12 profils sur 19 indistinguables entre « francais » et « non renseigne ».';

COMMENT ON COLUMN customer_profiles.country IS
  'ATTENTION : DEFAULT ''FR''. Un profil sans adresse affiche FR sans que le client l''ait jamais indique — ne pas s''en servir comme source de pays sans verifier qu''une adresse existe.';
