# Système email — ce qui reste à construire

État au 13/08/2026. Les décisions ci-dessous ont été prises par Kieron ;
elles ne sont plus à rouvrir.

## Déjà en place

- Les six gabarits du handoff sont dans `src/emails/templates/`, repris tels
  quels (HTML en tables, styles inline). **Ce ne sont pas des maquettes** : on
  ne les redessine pas, on les alimente.
- `src/lib/email-templates.ts` — moteur de rendu. Syntaxe dans des commentaires
  HTML (`<!--#each-->`, `<!--#if-->`) plus `{{ var }}` / `{{{ brut }}}`, pour que
  chaque fichier reste ouvrable dans un navigateur avec ses valeurs de
  démonstration.
- `src/lib/customer-emails.ts` — seul endroit qui traduit une commande ou une
  facture en variables de gabarit.
- **Branchés** : confirmation de commande (webhook Stripe) et facture
  (`send-invoice-email`, PDF joint).
- Les gabarits sont déclarés dans `outputFileTracingIncludes` (`next.config.js`).
  Sans cette ligne, toute route qui envoie un mail plante en production alors
  que tout marche en local.

## 1. Avoir / remboursement — à brancher

Le gabarit et le contexte (`avoirEmail`) sont prêts. Il manque l'appel dans le
flux de remboursement, là où l'avoir est créé. Variables de ligne :
`nom`, `qte`, `pu`, `montant`, `motif`.

## 2. Parcours de remplacement — décidé : parcours complet

Le gabarit `email-message-libre` est bâti pour une rupture de stock avec choix
de remplacement, un lien par option. Le client clique **depuis sa boîte mail,
sans être connecté** : les routes sont donc publiques, et c'est là qu'est tout
le risque.

À construire :

- Table `order_line_choices` : commande, ligne concernée, options proposées
  (produit, prix, écart), choix retenu, date, jeton.
- **Jeton signé par ligne** (HMAC de `order_id|line_ref|nonce` avec un secret
  serveur), à durée de vie limitée. Un identifiant devinable exposerait les
  commandes des autres clients.
- Route publique `GET /api/remplacement?token=…&choix=…` : vérifie le jeton,
  enregistre le choix, affiche une page de confirmation.
- **Recalcul du montant côté serveur, jamais depuis le lien.** Le prix affiché
  dans l'email est informatif ; seul le catalogue fait foi au moment du clic.
- Trois issues à gérer : remplacement, retrait + remboursement partiel (réutiliser
  `/api/orders/[id]/refund`, attention au piège `order_modified`), attente du
  réassort.
- Le choix doit être idempotent : un client qui reclique ne doit pas déclencher
  deux remboursements.
- Écran back-office : composer le message depuis la fiche commande, choisir
  l'article en rupture et les produits de remplacement proposés.

## 3. Édition des emails depuis le back-office

- Table `email_templates` : `key`, `subject`, `html`, `updated_at`. Le fichier de
  `src/emails/templates/` reste la **valeur par défaut** ; la base ne contient
  que ce qui a été modifié, avec un bouton « revenir au modèle d'origine ».
- `renderEmail()` lit la base d'abord, le fichier ensuite.
- Écran d'édition : liste des variables disponibles par gabarit, prévisualisation
  avec une vraie commande, envoi d'un test à soi-même.
- Garde-fou : refuser d'enregistrer un gabarit dont le rendu laisse une balise
  `{{ }}` non résolue sur un jeu de données de test. C'est ce contrôle qui a
  rattrapé le nom d'article resté en dur dans l'avoir.

## 4. Boîte mail — décidé : IMAP sur `hej@swedishcravings.fr`

**Le handoff complet est versionné** dans `docs/handoff/boite-mail.md` (spec) et
`docs/handoff/boite-mail-reference.html` (prototype interactif à ouvrir dans un
navigateur). Fidélité demandée : au pixel près.

Ce n'est pas un écran, c'est un client de messagerie : trois panneaux
(dossiers 228 px / liste 392 px, 340 sous 1320 px / lecture), fenêtre de
rédaction 660 × 640 en surimpression, bascule mobile sous 1000 px — seuils
calculés en JS, pas en media query. Plus : lu/non lu, étoiles, brouillons,
programmés, archives, corbeille, indésirables, étiquettes, actions groupées,
recherche, réponse / répondre à tous / transfert, quota IMAP, signature,
pièces jointes.

Ordre de construction conseillé, pour que chaque étape soit vérifiable :
1. connexion IMAP + table de cache `inbox_messages` + cron de synchronisation ;
2. panneau liste et lecture en lecture seule ;
3. actions (lu/non lu, étoile, classement, corbeille) ;
4. rédaction et envoi (l'envoi passe par SMTP/Resend, pas par IMAP) ;
5. brouillons, programmés, pièces jointes.

Variable d'environnement : `IMAP_PASSWORD` (mot de passe d'application), plus
l'hôte et le port du fournisseur. Jamais en base, jamais en dur.

### Notes d'origine

Pas de changement DNS : les MX restent où ils sont et le webmail actuel continue
de fonctionner. Le back-office se connecte en IMAP à `contact@swedishcravings.fr`.

- Mot de passe d'application à créer côté fournisseur, à stocker en variable
  d'environnement — **jamais en base ni en dur**.
- Synchronisation par cron (`/api/cron/inbox`), messages mis en cache dans une
  table `inbox_messages` pour que l'écran reste rapide.
- Rapprochement automatique : un message dont l'expéditeur correspond à un client
  est rattaché à sa fiche et à ses commandes.
- Boîte d'envoi : historique de tous les emails partis, avec les statuts
  ouverts / cliqués / en échec que le webhook Resend remonte déjà
  (`/api/webhook/resend`), et renvoi en un clic.
- L'envoi continue de passer par SMTP/Resend — IMAP sert uniquement à lire.

## À fournir avant le premier envoi

- Le **logo Mondial Relay officiel** : le fichier du zip est un placeholder
  (cadre pointillé). Son usage est encadré par leur charte partenaire.
- Les **mentions légales** des pieds de page sont des placeholders réalistes.
  Le SIRET qui y figure n'est pas celui de Swedish Cravings.
