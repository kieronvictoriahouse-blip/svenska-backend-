# Back-office Swedish Cravings — capacités complètes

Inventaire technique relevé le 17 août 2026 sur le dépôt `svenska-backend`
et sur la base de production. Les nombres de lignes sont ceux des fichiers,
les nombres d'enregistrements ceux de la base au moment du relevé.

| | |
|---|---:|
| Lignes de code applicatif (TS/TSX) | 32 906 |
| Écrans d'administration | 32 |
| Routes d'API | 99 |
| Modules métier | 32 |
| Migrations de base | 41 |
| Tables | 30 |
| Tâches planifiées | 6 |
| Gabarits d'email | 18 (6 × 3 langues) |
| Documents A4 | 7 |
| Clés de traduction | 665 |
| Services externes connectés | 11 |
| Variables d'environnement | 37 |

---

## 1. Socle technique

**Cadre.** Next.js 14.2 App Router, React 18, TypeScript. Rendu client pour
l'administration, routes serveur pour l'API. Déployé sur Vercel.

**Données.** Supabase / PostgreSQL. Accès serveur par clé `service_role`,
RLS activée sur les tables sensibles. Fichiers dans Supabase Storage, avec
redimensionnement d'images à la volée par l'endpoint de transformation.

**Authentification.** Deux domaines séparés :

- **Admin** — JWT, `requireAuth` appelé dans *chaque* handler d'API, pas
  seulement dans le middleware. Le middleware protège les pages, le
  handler protège la donnée.
- **Client** — JWT distinct pour l'espace compte.
- **Machine à machine** — secret interne pour les appels entre routes
  (le webhook Stripe appelle l'envoi de facture sans porteur).
- **Liens publics** — jetons signés HMAC-SHA256 comparés en temps
  constant, pour les liens de remplacement cliqués depuis la boîte mail
  du client sans connexion.

**Internationalisation.** FR / EN / SV sur l'interface, les documents et
les emails. La langue de l'interface (celle de l'opérateur) et la langue
du client (celle du destinataire) sont **indépendantes** : on peut
travailler en français et envoyer du suédois.

---

## 2. Les 32 écrans

### Boutique

| Écran | Lignes | Ce qu'il fait |
|---|---:|---|
| Tableau de bord | 298 | Chiffres du jour, alertes de stock, dernières commandes, raccourcis. Aucune valeur figée. |
| Produits | 456 | Table dense, filtres cumulatifs, sélection groupée, modification de prix en masse par pourcentage, dépublication groupée, duplication, affichage coût/marge à la demande, rendu carte sur mobile. |
| Fiche produit | 194 | Quatre onglets : identité, contenu multilingue, prix et stock, images. Champs FR/SV/EN pour nom, sous-titre, description, origine, usage, ingrédients, allergènes, conservation. |
| Création d'article | 158 | Même formulaire complet. Création possible par scan de code-barres. |
| Catégories | 248 | Table réordonnable, noms trilingues, slug, visibilité, compteur de produits. |
| Stocks | 494 | Quatre cartes de synthèse, tri par urgence, ajustement direct dans la liste avec enregistrement automatique, inventaire par scan, contrôle théorique contre réel, export CSV. |
| Commandes | 1 743 | Le plus gros écran. Statuts, suivi transporteur, coûts réels et marge, remboursement total ou partiel, avoir, lien de paiement Stripe, étiquette transporteur, exclusion des statistiques, marquage test, langue du client, création manuelle. |
| Préparation | 345 | File d'attente, scan au téléphone, plafonnement des quantités, refus des articles hors commande, barre de progression, décrément du stock à la validation, feuille de picking. |
| Ruptures | 295 | Signalement d'une rupture, proposition de remplacements par email avec choix en un clic sans connexion, suivi des réponses. |
| Import URL | 442 | Analyse d'une page produit distante : nom, prix, poids, ingrédients, allergènes, images. Sélection des visuels et création de la fiche. |
| Suggestions | 227 | Idées de produits envoyées par les clients, avec langue, contact et suivi. |

### Achats

| Écran | Lignes | Ce qu'il fait |
|---|---:|---|
| Commandes d'achat | 872 | Liste, statuts, saisie manuelle, réception, envoi du bon par email, conversion de devise avec taux daté. |
| Nouvelle commande | 612 | Composition par **durée de couverture** plutôt que par quantité. Cartes fournisseur, curseur 2 à 12 semaines, suggestions calculées, remplissage automatique, jauge de franco, liste de contrôle avant envoi, panier en cartons. |
| Conditionnements | 273 | Saisie des unités par carton en un seul passage clavier, par produit et par magasin. |
| Saisie ticket | 658 | Photo du ticket avec lecture automatique, ou saisie rapide. Déduction de la TVA suédoise **avant** conversion en euros, rapprochement au catalogue, contrôle de l'écart avec le total lu. |
| Réceptions | 360 | Attendu contre reçu ligne par ligne, reliquats, coûts logistiques répartis sur les articles choisis avec mise à jour du prix de revient moyen. |

### Finance

| Écran | Lignes | Ce qu'il fait |
|---|---:|---|
| Facturation | 1 009 | Factures, numérotation à préfixe, échéances, statuts, achats fournisseurs, simulation de répartition de transport au poids ou à parts égales, calcul de marge produit, paramètres d'émetteur et mentions légales. |
| Éditeur de facture | 419 | Édition ligne à ligne d'une facture rattachée à une commande, avec aperçu et export. |
| Comptabilité | 484 | Écritures, catégories, synchronisation depuis commandes et achats, cotisations et seuils, export tableur et export FEC. |

### Relation client

| Écran | Lignes | Ce qu'il fait |
|---|---:|---|
| Boîte mail | 527 | Client IMAP complet en trois panneaux. Lecture, réponse, réponse à tous, transfert, brouillons, envois programmés, étiquettes, pièces jointes, corbeille, recherche, marquage lu/non lu. |
| Modèles d'email | 214 | Édition des gabarits depuis le back-office. Le fichier livré reste la référence, seule la modification est stockée. |
| Campagnes | 761 | Campagnes avec segment cible et statistiques ; codes promo (pourcentage, montant fixe, livraison offerte, produit offert au-dessus d'un seuil) ; paniers abandonnés avec relances. |
| Éditeur de campagne | 624 | Composition visuelle du contenu envoyé. |
| Automations | 263 | Séquences déclencheur → délai → action. |

### Contenu et réglages

| Écran | Lignes | Ce qu'il fait |
|---|---:|---|
| White label | 546 | Nom, slogan, couleurs, trois polices, logo, favicon, bandeau d'annonce avec aperçu, coordonnées, réseaux sociaux, devise, taux de TVA, seuil de franco, pied de page, réglages SMTP, import de données. |
| Paramètres | 133 | Grille d'accès aux six blocs de configuration. |
| Pages | 566 | Pages libres trilingues : slug, ordre, libellé de navigation, section héro, blocs de contenu avec images et citations. |
| Textes d'accueil | 241 | Clés de contenu de la page d'accueil. |
| Sections d'accueil | 290 | Bandes thématiques et sélections de produits mis en avant. |
| Médiathèque | 159 | Dépôt par glisser-déposer, grille de fichiers avec dimensions, réhébergement d'images externes. |
| Contacts | 338 | Clients et fournisseurs dans un seul écran : coordonnées, segment, total dépensé, délai de livraison, franco, minimum de commande, export. |
| Documents A4 | 324 | Rendu à l'écran identique au PDF, impression directe. |

---

## 3. Les 99 routes d'API

| Domaine | N | Routes |
|---|---:|---|
| Commandes | 11 | `orders`, `orders/[id]`, `/public`, `/refund`, `/restock`, `/rupture`, `/payment-link`, `/mark-test`, `/exclude-stats`, `orders/session/[id]`, `remplacement` |
| Catalogue | 9 | `products`, `products/[id]`, `categories`, `categories/[id]`, `stock`, `stock/movement`, `stock/reconcile`, `scan`, `product-suggestions` |
| Achats | 11 | `purchase-orders` (+ `/[id]`, `/pdf`, `/send-pdf`, `/composer`), `purchase-planner`, `purchase-suggestions`, `purchases`, `receptions` (+ `/[id]`), `landed-costs`, `pack-sizes` |
| Tickets de caisse | 2 | `tickets`, `tickets/ocr` |
| Facturation | 4 | `invoices`, `invoices/[id]`, `invoices/[id]/pdf`, `send-invoice-email` |
| Comptabilité | 5 | `accounting/entries`, `/summary`, `/sync`, `/export-excel`, `/fec` |
| Boîte mail | 9 | `inbox`, `/sync`, `/send`, `/folders`, `/drafts`, `/scheduled`, `/attachment`, `/contacts`, `email` |
| Marketing | 6 | `marketing`, `/automations`, `/promo-email`, `promo/validate`, `gift-offer`, `newsletter` |
| Emails | 2 | `email-templates`, `webhook/resend` |
| Transport | 5 | `mondial-relay/points`, `/label`, `/settings`, `logspher/relay-points`, `/debug` |
| Paiement | 4 | `checkout`, `webhook/stripe`, `snipcart/webhook`, `snipcart/[sort_order]` |
| Espace client | 4 | `customer/auth`, `/create-account`, `/orders`, `/profile` |
| Contenu public | 7 | `cms`, `pages`, `pages/[slug]`, `homepage`, `public-config`, `white-label`, `google-reviews` |
| Tâches planifiées | 6 | `cron/velocity`, `/stock-audit`, `/inbox`, `/marketing`, `/scheduled-emails`, `/sync` |
| Outils et maintenance | 10 | `upload`, `import`, `scrape`, `exchange-rate`, `contacts` (+ `/[id]`), `admin/reconcile-orders`, `/reconcile-report`, `/rehost-images`, `/replay-orders` |
| Authentification | 2 | `auth/login`, `auth/refresh` |

---

## 4. Les 32 modules métier

| Module | L. | Responsabilité |
|---|---:|---|
| `invoice-pdf` | 390 | Facture PDF, polices embarquées, mise en page identique à la maquette A4. |
| `imap` | 372 | Connexion IMAP, résolution des dossiers spéciaux, synchronisation, drapeaux, déplacement, pièces jointes, dépôt en brouillons et en envoyés. |
| `purchase-order-pdf` | 318 | Bon de commande fournisseur trilingue avec vignettes produit redimensionnées. |
| `customer-emails` | 315 | Traduction d'une commande en variables de gabarit, dans la langue du client. |
| `logspher` | 247 | Transporteur multi-réseau : points relais, étiquettes, suivi. |
| `admin-nav` | 240 | Source unique de la navigation : huit groupes, état actif, barre mobile. |
| `admin-i18n` | 213 | Langue de l'interface, dictionnaires, formats de date et de monnaie. |
| `email-send` | 208 | Expédition SMTP avec configuration en base. |
| `email-brief` | 206 | Résumé quotidien d'activité par email. |
| `invoice-utils` | 195 | Numérotation, calculs de totaux, mentions légales. |
| `mail-send` | 193 | Composition, signature, brouillons, file d'envois programmés. |
| `stock` | 190 | Point d'écriture unique du stock, idempotent par commande et produit. |
| `velocity` | 181 | Reconstruction du stock jour par jour et vélocité corrigée des ruptures. |
| `langue-client` | 178 | Pays de livraison, langue du client, choix manuel prioritaire. |
| `email-templates` | 178 | Moteur de gabarits : variables, boucles, conditions, surcharges par langue. |
| `pdf-doc` | 168 | Primitives partagées de tous les PDF : conversion d'unités, palette, en-tête, bandeau, pied. |
| `emails-i18n` | 158 | Textes calculés des emails dans les trois langues. |
| `ticket-match` | 145 | Rapprochement des libellés de ticket au catalogue, avec alias appris. |
| `reappro` | 142 | Assemblage des données de réapprovisionnement. |
| `admin-theme` | 122 | Jetons de couleur, badges, vignettes. |
| `mailer` | 109 | Transport d'envoi. |
| `landed` | 94 | Répartition du port sur les articles, par unité ou au prorata de la valeur. |
| `supabase` | 87 | Clients de base, service et anonyme. |
| `shipping` | 86 | Seuils de franco et frais de port. |
| `rehost-image` | 81 | Rapatriement d'images externes dans le stockage. |
| `replacement-token` | 77 | Jetons signés HMAC pour les liens publics de remplacement. |
| `auth-client` | 75 | Appels authentifiés côté navigateur, téléchargement protégé. |
| `mondial-relay` | 71 | Recherche de points relais et création d'étiquettes. |
| `promo` | 54 | Validation des codes promo et calcul de la remise. |
| `reception-utils` | 33 | Utilitaires de réception. |
| `email-catalog` | 18 | Liste des gabarits disponibles. |
| `auth` | 14 | Vérification du jeton sur chaque route. |

---

## 5. Les 30 tables

| Table | Lignes | Col. | Contenu |
|---|---:|---:|---|
| `orders` | 109 | 50 | Client, adresses, lignes, montants, promo, remboursements, relais, suivi, coûts réels, picking, langue. |
| `products` | 57 | 50 | Catalogue trilingue : textes, prix, coût, stock, seuil, EAN, SKU, conditionnement, images, nutrition. |
| `inbox_messages` | 206 | 25 | Messages synchronisés depuis IMAP. |
| `stock_movements` | 177 | 12 | Journal de tous les mouvements, avec motif et référence. |
| `accounting_entries` | 94 | 10 | Écritures comptables. |
| `cms_home` | 68 | 8 | Clés de contenu de la page d'accueil. |
| `product_suppliers` | 54 | 10 | Prix d'achat par produit et par magasin, historique, magasin habituel. |
| `product_velocity` | 52 | 8 | Ventes hebdomadaires, jours disponibles, jours de rupture. |
| `invoices` | 51 | 22 | Factures et avoirs, émetteur, mentions, paiement. |
| `contacts` | 25 | 28 | Clients et fournisseurs, délai, franco, minimum de commande, langue. |
| `customer_profiles` | 19 | 10 | Profil boutique indexé par email. |
| `purchase_orders` | 15 | 20 | Commandes d'achat, devise, taux appliqué, couverture visée. |
| `categories` | 13 | 9 | Rayons trilingues. |
| `receptions` | 11 | 11 | Réceptions et reliquats. |
| `promo_codes` | 5 | 14 | Codes, type, valeur, validité, produits offerts. |
| `product_suggestions` | 5 | 9 | Idées clients. |
| `cms_pages` | 4 | 27 | Pages libres trilingues. |
| `order_line_choices` | 3 | 15 | Choix de remplacement proposés au client. |
| `inbox_sync_state` | 3 | 7 | État de synchronisation par dossier. |
| `marketing_campaigns` | 2 | 21 | Campagnes et statistiques. |
| `white_label_config` | 1 | 51 | Toute la configuration de marque et de boutique. |
| `landed_costs` | 1 | 8 | Coûts logistiques imputés. |
| `product_variants` | 1 | 6 | Déclinaisons. |

Sept tables sont créées mais encore vides : `email_templates`,
`scheduled_emails`, `email_drafts`, `promo_code_usages`,
`purchase_tickets`, `ticket_aliases`, `marketing_automations`.

---

## 6. Les 11 services externes

| Service | Rôle | Ce qui passe par lui |
|---|---|---|
| Stripe | Paiement | Encaissement, webhook de confirmation, liens de paiement, remboursements totaux et partiels. Clés de test et de production séparées. |
| Supabase | Données | Base PostgreSQL, stockage des fichiers, redimensionnement d'images. |
| IONOS IMAP/SMTP | Email | Boîte `hej@` : réception, envoi, brouillons, dossiers. |
| Resend | Email | Envoi transactionnel et webhook d'événements. |
| Mondial Relay | Transport | Points relais, étiquettes, numéro de suivi. |
| Logspher | Transport | Multi-transporteur : points relais, expéditions, étiquettes, suivi. |
| Mindee | Lecture | Reconnaissance des tickets de caisse photographiés. |
| Frankfurter | Change | Taux de change **historiques**, à la date du paiement. |
| Open Food Facts | Catalogue | Recherche produit par code-barres à la création. |
| Google Places | Avis | Récupération des avis de la fiche établissement. |
| Snipcart | Paiement | Ancien tunnel d'achat, webhook conservé pour l'historique. |

---

## 7. Les 6 tâches planifiées

| Tâche | Heure | Ce qu'elle fait |
|---|---|---|
| `cron/sync` | 03 h 00 | Synchronisation générale des données. |
| `cron/stock-audit` | 03 h 30 | Contrôle du stock théorique contre le stock enregistré, détection des écarts. |
| `cron/inbox` | 04 h 00 | Relève de la boîte mail. |
| `cron/velocity` | 04 h 15 | Recalcul de la vélocité de vente de tous les produits. |
| `cron/scheduled-emails` | 05 h 00 | Envoi des emails programmés arrivés à échéance. |
| `cron/marketing` | 09 h 00 | Relances de panier abandonné et séquences automatiques. |

---

## 8. Documents et sorties

**Sept modèles A4** : facture, avoir, bon de livraison, bon de commande
fournisseur, bon de retour, devis, plus le châssis partagé. Chaque document
existe en **deux rendus strictement identiques** — une page imprimable dans
le navigateur et un PDF généré côté serveur.

**Polices embarquées.** Jost et Cormorant Garamond sont incluses dans le
déploiement, pas chargées depuis un service externe : un PDF doit sortir
identique hors ligne.

**Trilingue.** Le bon de commande fournisseur privilégie le nom suédois et
porte la photo du produit — c'est le document avec lequel on va en magasin.
Les documents client suivent la langue du client, indépendamment de celle
du back-office.

**Exports** : tableur comptable, fichier FEC, CSV du stock, contacts.

---

## 9. Fonctions terrain

**Lecteur de code-barres.** Moteur ZXing dans le navigateur du téléphone :
sélection de l'objectif arrière principal (les objectifs ultra-grand-angle
et macro sont écartés par leur nom, ils ne font pas la mise au point de
près), zoom, torche, contrôle de la clé EAN-13, retour sonore et vibration.
Sert au picking, à l'inventaire et à la création d'article.

**Photo de ticket.** Prise de vue depuis le téléphone, lecture automatique
des lignes, rapprochement au catalogue avec apprentissage des alias.

**Interface mobile.** Barre d'onglets à cinq entrées sous 900 px, tables
converties en cartes, panneaux repliés. Le picking et l'inventaire sont
pensés pour le téléphone d'abord.

---

## 10. Expérience d'utilisation

C'est la partie la moins visible dans un inventaire de fonctions, et
pourtant celle qui décide si l'outil est utilisé ou contourné. Voici ce qui
est réellement en place, avec les chiffres relevés dans le code.

### Une seule source pour la navigation

Les huit groupes de menu, la barre mobile et le hub d'accueil sont
alimentés par **un seul fichier** (`admin-nav.ts`). Ajouter un écran se
fait à un endroit. L'état actif gère les variantes `?tab=` et `?type=`,
ce qui évite le défaut classique de deux entrées surlignées en même temps.

Mesures normatives du châssis : barre du haut **48 px**, barre latérale
**222 px**, barre d'onglets mobile **58 px**, bascule à **900 px**.

### Le chargement ne fait plus sauter la page

Dix écrans affichent une **silhouette de la forme et de la hauteur du
contenu à venir** pendant le chargement, au lieu d'un « Chargement… »
centré dans le vide. Le contenu se pose ensuite sans rien décaler.

Les largeurs des barres varient d'une ligne à l'autre — des barres toutes
identiques ressemblent à une grille cassée, pas à du texte. L'animation
s'arrête sous `prefers-reduced-motion`.

### Le clavier suffit

Dix écrans réagissent à **Entrée**. Sur la saisie des conditionnements,
Entrée et les flèches descendent d'une ligne : les 52 produits
s'enchaînent sans jamais lâcher le clavier pour attraper la souris. Le
champ se sélectionne au focus, donc on tape directement par-dessus.

### Rien ne s'écrit sans qu'on le sache

- **Enregistrement automatique** sur l'ajustement de stock, optimiste et
  temporisé : la valeur s'affiche tout de suite, l'écriture attend qu'on
  ait fini de taper.
- **Confirmation** avant chaque geste destructeur — dix chemins protégés.
- **Aperçu avant écriture** sur les scripts de reprise : ils affichent
  toujours le résultat qu'ils s'apprêtent à écrire, et n'écrivent que si
  on le redemande explicitement.
- Sur l'écran des conditionnements, **seul ce qui a changé** est envoyé.

### L'interface dit ce qui ne va pas, en le nommant

Ce n'est pas une alerte générique mais un bandeau qui désigne le problème
précis et propose le geste :

- « *N produits sans magasin connu* » — ils n'apparaissent dans aucune
  liste de réappro, avec le lien pour les rattacher ;
- « *Aucun conditionnement n'est renseigné : « 19 cartons » veut donc dire
  19 unités* », avec le lien pour les saisir ;
- « *N lignes ne peuvent pas être reprises* », en nommant les articles,
  avant qu'un enregistrement ne les supprime en silence ;
- sur le surcoût d'achat : « *+70 % vs GEKAS* » directement sur la ligne,
  au moment où on l'ajoute au panier.

### L'état se lit à la forme, pas seulement au texte

L'urgence d'un produit se voit à la **bordure gauche colorée** de sa ligne
et à sa jauge de couverture, pas seulement à une étiquette. Une ligne au
panier passe au vert. Vingt-quatre écrans ont un **état vide rédigé**, qui
explique quoi faire plutôt que d'afficher « aucun résultat ».

Vingt-huit écrans confirment leurs actions par un message bref en bas
d'écran.

### On reconnaît un produit sans le lire

Photo du produit et **nom suédois sous le nom français** partout où un
article est nommé : catalogue, stocks, picking, lignes de commande,
saisie de ticket, bons de commande. Celui qui prélève lit le paquet, pas
la fiche.

### Le calcul suit le geste, pas l'inverse

Sur la composition d'une commande d'achat, le curseur de couverture
recalcule couverture, urgence et quantité conseillée **dans le
navigateur**, à chaque cran. Un aller-retour serveur par mouvement de
curseur aurait rendu le réglage injouable.

La liste de contrôle avant envoi et la jauge de franco se mettent à jour
en même temps, ce qui rend visible l'effet d'un choix avant de le valider.

### Accessibilité

Quarante-trois `aria-label`, des états `aria-pressed`, `aria-busy` et
`aria-current` sur les contrôles qui en portent un, un focus clavier
visible, et le respect de `prefers-reduced-motion`.

### La langue suit l'opérateur

Le sélecteur en haut à droite mémorise le choix et le diffuse à tout
l'écran par un évènement — aucun rechargement. Les **formats suivent
aussi** : une interface anglaise n'affiche pas « 1 234,50 € » ni une date
au format français.

---

## 11. Variables d'environnement

Trente-sept au total.

**Base et stockage** — `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`

**Sécurité** — `ADMIN_JWT_SECRET`, `CUSTOMER_JWT_SECRET`, `CRON_SECRET`,
`INTERNAL_SECRET`, `REPLACEMENT_SECRET`, `IMPORT_SECRET`

**Paiement** — `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_TEST`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_TEST`,
`SNIPCART_SECRET_KEY`

**Email** — `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `RESEND_API_KEY`, `RESEND_FROM`,
`RESEND_WEBHOOK_SECRET`

**Transport** — `MONDIAL_RELAY_ENSEIGNE`, `MONDIAL_RELAY_KEY`,
`LOGSPHER_API_KEY`, `LOGSPHER_API_URL`, `LOGSPHER_MR_UUID`,
`LOGSPHER_RELAY_CARRIER_UUIDS`

**Services** — `MINDEE_API_KEY`, `GOOGLE_PLACES_API_KEY`,
`GOOGLE_PLACE_ID`

**Divers** — `NEXT_PUBLIC_FRONT_URL`, `NEXT_PUBLIC_BACKEND_URL`,
`ADMIN_TEST_EMAILS`, `NODE_ENV`

---

## 12. Outils de maintenance

Six scripts, tous conçus pour montrer avant d'écrire :

| Script | Rôle |
|---|---|
| `audit-i18n.js` | Compte les textes français encore en dur, écran par écran. |
| `verifier-i18n.js` | Détecte les dictionnaires incomplets — une entrée sans traduction se replie sur le français sans rien signaler. |
| `extraire-i18n.js` | Sort tous les libellés à traduire d'un écran. |
| `gabarits-traduits.js` | Génère les gabarits d'email anglais et suédois depuis le français ; **sort en erreur** si un texte reste français. |
| `reprise-prix-fournisseurs.js` | Reconstitue les prix d'achat par magasin depuis l'historique. |
| `reprise-langue-client.js` | Déduit le pays et la langue de chaque commande. |
