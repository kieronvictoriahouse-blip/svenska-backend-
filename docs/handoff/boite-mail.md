# Handoff : boîte email du back-office Swedish Cravings

## Overview

Client de messagerie complet intégré au back-office **Swedish Cravings**, pour la boîte partagée **hej@swedishcravings.fr**. Aujourd'hui la boutique gère ses échanges clients / fournisseurs / comptable dans un webmail séparé, sans lien avec les commandes ; cet écran ramène la messagerie dans l'outil de gestion et la relie aux objets métier (commande, devis, bon de retour, commande d'achat).

Livrable : `Boite Mail Swedish Cravings.dc.html` — un écran, trois panneaux (dossiers / liste / lecture) plus une fenêtre de rédaction en surimpression.

Couvre l'intégralité de la demande : boîte de réception, envoyés, brouillons, dossiers personnalisés, états lu / non lu, envoyer-recevoir, rédaction et édition d'email, signature, pièces jointes — avec en plus : messages suivis (étoile), envois programmés, archives, corbeille, indésirables, étiquettes, actions groupées, recherche, réponse / réponse à tous / transfert, quota IMAP.

## About the Design Files

Le fichier est une **référence de design réalisée en HTML** — un prototype qui montre l'apparence et le comportement visés, **pas du code de production à copier tel quel**.

Techniquement, `.dc.html` utilise un petit runtime maison (`support.js`) : un template HTML avec des trous `{{ }}` et une classe de logique JavaScript. **Ne portez pas ce runtime.** Le travail consiste à recréer cet écran dans l'application existante — **Next.js App Router + Supabase** — avec ses conventions.

Ouvrez le fichier dans un navigateur : tout est réellement interactif (changement de dossier, filtres, sélection multiple, lu / non lu, étoiles, synchronisation animée, rédaction avec pièces jointes et signature, notifications). La classe `Component` en fin de fichier contient les données de démonstration (14 messages réalistes) et toute la logique.

## Fidelity

**High-fidelity.** Couleurs, tailles, densités et comportements sont définitifs — les valeurs ci-dessous sont à reprendre au pixel près. Seules les **données** sont fictives.

L'écran reprend exactement les tokens du back-office déjà livré (voir `design_handoff_swedish_cravings/README.md`) : même topbar, même grammaire de sidebar, mêmes boutons, mêmes badges. Il doit s'insérer comme un module de plus, pas comme une application à part.

---

## Design tokens

Identiques au back-office. Rappel de ce qui sert ici :

| Rôle | Hex |
|---|---|
| Topbar | `#15181E` |
| Ink / bouton primaire | `#1C2028` (hover `#2C3240`) |
| Fond du panneau de lecture | `#F1EEE9` |
| Surface (messages, en-têtes) | `#FFFFFF` |
| Fond sidebar + fond de liste | `#FCFAF7` |
| Surface alt (barre d'outils de rédaction) | `#FBF9F6` |
| Bordure forte | `#E7E1D8` · champs `#E1DBD2` · lignes `#F1EDE7` / `#F6F3EE` |
| Textes | `#1C2028` · `#3A3630` (corps de message) · `#5A5248` · `#6E6459` · `#8B7E72` · `#9C9184` · `#A79C8E` · `#C4BBAE` |
| **Accent (prune, paramétrable)** | `#7B4F7B` — teintes `+14` (fond actif ≈ 8 %), `+66` (liseré non lu), `+1A` (avatars) |
| Bandeau de sélection | fond `#F3EDF3`, bordure `#E3D6E3`, texte `#5E3B5E` |
| Vert « Envoyer » | `#3E5238` (hover `#334529`) |
| Rouge suppression | `#B03A2E` |
| Étoile active | `#C9A227` |
| Vert de signature (identité documents) | `#44573D`, bordure de vignette `#D8CFAF` |

**Couleurs d'étiquette** — servent aussi à colorer les avatars (`+1A` en fond, la couleur en texte) et les pastilles d'étiquette (`+18` en fond) :

`Clients #7B4F7B` · `Fournisseurs #1C4E80` · `Logistique #3E5238` · `Comptabilité #8A5B08` · `Marketing #A6501F` · défaut `#857C71`

### Typographie

**Jost** partout (300–700), **Cormorant Garamond** réservé à deux endroits seulement : l'objet du message ouvert (26 px / 600) et le bloc de signature (« Swedish Cravings » 16–17 px) — c'est le lien visuel avec les documents imprimables et les emails clients.

Échelle : objet du message 26 px · titre de dossier 15 px/600 · expéditeur dans la liste 13 px (**700 si non lu**, 500 sinon) · objet dans la liste 12,5 px (600 / 400) · extrait 11,5 px `#9C9184` · corps du message **14 px / line-height 1,72** avec `text-wrap: pretty` · libellé de dossier 12,5 px · en-tête de groupe 8,5 px / letter-spacing 2,2 px / uppercase · badge 10 px/700 · pastille d'étiquette 10 px/600.

Icônes : **Material Symbols Rounded**, `'wght' 300` au repos, `400` à l'état actif, `'FILL' 1` sur l'étoile pleine. Tailles 15–22 px.

Tous les compteurs, dates et tailles de fichier en `font-variant-numeric: tabular-nums`.

---

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Topbar 48 px — hej@swedishcravings.fr, recherche ⌘K, avatar      │
├───────────┬──────────────────────┬───────────────────────────────┤
│ Dossiers  │ Liste                │ Lecture                       │
│ 228 px    │ 392 px (340 < 1320)  │ flex:1                        │
│ #FCFAF7   │ #FCFAF7              │ #F1EEE9                       │
└───────────┴──────────────────────┴───────────────────────────────┘
                    + fenêtre de rédaction en surimpression (660 × 640)
```

Racine `display:flex; flex-direction:column; height:100vh; overflow:hidden`. Chaque panneau scrolle indépendamment ; seuls les corps de liste et de message ont `overflow-y:auto`, les en-têtes sont `flex-shrink:0`.

Deux seuils, calculés en JS (`state.w` + listener `resize`) et non en media query :
- **< 1320 px** : la colonne liste passe de 392 à 340 px.
- **< 1000 px** : bascule mobile complète (voir plus bas).

En React, `useMediaQuery('(max-width: 999px)')` et `'(max-width: 1319px)'` sont les équivalents idiomatiques.

---

## Panneau 1 — Dossiers (228 px)

De haut en bas :

**Bouton `Nouveau message`** pleine largeur, 38 px, ink `#1C2028`, icône `edit`.

**Bouton `Envoyer / recevoir`** 30 px, blanc bordé, icône `sync`. Trois états de libellé :
- au repos : `Envoyer / recevoir · il y a 3 min`
- pendant : `Synchronisation…` + icône en rotation (`@keyframes spin`, 0,9 s linéaire)
- après : `Envoyer / recevoir · à jour` + notification « Boîte synchronisée · 2 nouveaux messages »

**Liste de dossiers système** — item : `padding 7px 14px 7px 13px`, `margin 0 8px`, rayon 7, `gap 10px`, icône 19 px. Actif : fond `accent+14`, texte accent, poids 600, icône accent en `wght 400`. Compteur en pastille (min-width 19 px, hauteur 17 px, rayon 9) : grise `#EFEBE4`/`#857C71` au repos, **accent plein / blanc** quand le dossier est actif.

| Dossier | Icône | Compteur |
|---|---|---|
| Réception | `inbox` | nombre de non lus |
| Non lus | `mark_email_unread` | idem (vue virtuelle) |
| Suivis | `star` | nombre d'étoilés (vue virtuelle) |
| Brouillons | `drafts` | nombre de brouillons |
| Envoyés | `send` | — |
| Programmés | `schedule_send` | 1 |
| Archives | `archive` | — |
| Corbeille | `delete` | — |
| Indésirables | `report` | nombre |

**Groupe `DOSSIERS`** (dossiers utilisateur, icône `folder`) : Clients · Fournisseurs · Comptabilité · Mondial Relay · Réclamations `2` · `Nouveau dossier` (icône `create_new_folder`).

Dans la maquette, ces dossiers filtrent sur l'étiquette du message — en production, ce sont de vrais dossiers IMAP ou une table de classement.

**Groupe `ÉTIQUETTES`** : carré de couleur 8 × 8 px (rayon 2), libellé, nombre de messages à droite.

**Pied** : point vert 6 px + `IMAP connecté · 2,1 Go / 15 Go` + jauge de quota 4 px.

---

## Panneau 2 — Liste

**En-tête** (fond blanc, `flex-shrink:0`) :
- titre du dossier 15 px/600 + méta `« 8 messages · 3 non lus »` ou `« … · tout est lu »`
- boutons icône `select_all` (tout sélectionner) et `swap_vert` (trier)
- **onglets de filtre** : `Tous` · `Non lus` (avec compteur intégré) · `Avec pièce jointe`. Actif = fond `#1C2028`, blanc, 600.
- **barre d'actions groupées** conditionnelle (dès 1 message coché) : fond `#F3EDF3`, « N messages sélectionnés », puis `Marquer lu` (`mark_email_read`), `Non lu` (`mark_email_unread`), `Classer` (`drive_file_move`), et `Annuler` à droite.

**Ligne de message** — `display:flex; gap:11px; padding:11px 14px`, séparateur `1px #F1EDE7`, et une **bordure gauche de 3 px** qui porte l'état :

| État | Bordure gauche | Fond |
|---|---|---|
| Message ouvert | accent plein | `#fff` |
| Non lu | `accent+66` | `#fff` |
| Lu | transparente | transparent (`#FCFAF7` hérité) |

Structure : colonne case à cocher + étoile · avatar rond 34 px (initiales, couleur de l'étiquette) · puis trois lignes — expéditeur (**gras si non lu**) avec à droite l'icône `attach_file` si pièce jointe et l'heure ; objet ; extrait tronqué avec la pastille d'étiquette à droite.

Le clic sur la ligne ouvre le message **et le marque lu**. Le clic sur la case ou l'étoile ne doit pas ouvrir le message — dans la maquette, `e.stopPropagation()` ; en React, même chose sur le handler enfant.

Liste vide : icône `inbox` 32 px en `wght 200` + « Aucun message ici ».

---

## Panneau 3 — Lecture

**Barre d'actions** (blanche, collante) : `Répondre` (ink, primaire) · `À tous` · `Transférer` (blancs bordés) · spacer · boutons icône `drive_file_move`, `mark_email_unread`, `archive`, `delete` (rouge), `more_vert`. En mobile, un bouton retour `arrow_back` s'ajoute en tête.

**Corps** (`max-width: 820px`, padding `20px 22px 40px`) :
1. **Objet** en Cormorant 26 px, avec en dessous la pastille d'étiquette et, si le message est rattaché à un objet métier, une **puce cliquable prune** (`receipt_long` + `Commande #2417` / `PO-2026-041` / `Devis DV-2026-0031`). Étoile 22 px à droite, cliquable.
2. **Bloc expéditeur** : avatar 42 px, nom 13,5 px/600 + `<email>` en 11,5 px, ligne `à hej@swedishcravings.fr`, et à droite la date complète + le canal (`via Outlook`, `notification automatique`, `envoyé depuis le back-office`, `modèle « message libre »`).
3. **Corps du message** : un `<div>` par paragraphe, 14 px / 1,72.
4. **Citation** éventuelle : bordure gauche 2 px `#E1DBD2`, texte 13 px `#9C9184`.
5. **Signature** — affichée uniquement sur les messages envoyés depuis la boîte : vignette 34 × 50 px bordée `#D8CFAF` avec « SC », wordmark Cormorant vert `#44573D`, ligne de contact.
6. **Pièces jointes** : titre `N PIÈCES JOINTES` + filet + lien `Tout télécharger`, puis cartes 210 px minimum — icône typée, nom, poids, icône `download`. Icônes et couleurs par type : PDF `picture_as_pdf` `#B03A2E` · tableur `table_view` `#3E5238` · image `image` `#1C4E80` · archive `folder_zip` `#8A5B08` · défaut `description` `#857C71`.
7. **Réponse rapide** : barre cliquable « Répondre à Camille… » avec avatar et icône `send` — ouvre la fenêtre de rédaction pré-remplie.

Aucun message sélectionné : icône `drafts` 38 px + « Sélectionne un message pour le lire ».

---

## Fenêtre de rédaction

Surimpression `rgba(21,24,30,.32)` + `backdrop-filter: blur(3px)`, fenêtre ancrée **en bas à droite** (`660 × 640 px`, marge 22 px, rayon 12, ombre `0 26px 70px rgba(21,24,30,.34)`, animation `popIn` 0,18 s). Bouton `open_in_full` → mode large `960 × 88vh` centré. En mobile, plein écran sous la topbar.

**Barre de titre** 42 px `#15181E` : icône `edit`, titre = objet saisi ou « Nouveau message », boutons `remove` (réduire), `open_in_full`, `close`.

**Champs** (fond blanc, séparateurs `#F6F3EE`) :
- `De` — avatar + `hej@swedishcravings.fr` + `expand_more` (plusieurs identités possibles : hej@, achats@, retours@).
- `À` — destinataires en **puces prune** (fond `#F3EDF3`, bordure `#E3D6E3`, croix de retrait) + champ de saisie libre + lien `Cc / Cci` qui déplie une ligne `Cc`.
- `Objet` — 13,5 px/600.

**Barre de mise en forme** (fond `#FBF9F6`) : `format_bold`, `format_italic`, `format_underlined` | `format_list_bulleted`, `format_list_numbered`, `format_quote` | `link`, `image`, `sentiment_satisfied` | `format_clear`. Séparateurs = traits de 1 × 18 px `#E1DBD2`.

**Zone de saisie** : textarea 14 px / 1,7, sans bordure, hauteur minimale 150 px.

**Signature** — insérée sous un filet pointillé `#E1DBD2`, retirable par une croix, réinsérable par le bouton `draw` du pied (qui s'allume en accent quand la signature est active). Contenu : vignette SC, wordmark Cormorant, `Victoria · bringing Sweden to your table`, ligne de contact.

**Pièces jointes** : chips 200 px minimum (icône typée, nom, poids, croix rouge) + **zone de dépôt pointillée** « Glisse un fichier ici ou clique pour joindre » (`attach_file_add`), qui passe en accent au survol.

**Pied** (fond `#FBF9F6`) : bouton vert **`Envoyer`** 36 px · `schedule_send` (programmer) · `attach_file` · `draw` (signature, état actif) · `description` (modèle d'email — doit ouvrir les gabarits déjà livrés : rupture / remplacement, relance, etc.) · spacer · `Brouillon enregistré` · `delete` rouge.

L'envoi ferme la fenêtre et affiche la notification « Message envoyé depuis hej@swedishcravings.fr ».

**Notifications** : pilule `#1C2028` centrée en bas, icône `check_circle` verte `#9BC48C`, texte 12,5 px, animation `popIn`, disparition après 2,6 s.

---

## Comportements à implémenter

- **Lu / non lu** : ouvrir un message le marque lu ; `mark_email_unread` le repasse non lu **et referme le panneau en mobile** ; les actions groupées agissent sur la sélection puis la vident. Les compteurs de dossier, l'onglet « Non lus » et la méta d'en-tête se recalculent tous à partir du même état.
- **Étoile** : bascule depuis la liste ou depuis le panneau de lecture, alimente la vue virtuelle « Suivis ».
- **Filtres cumulatifs** : dossier ∧ onglet ∧ recherche. La recherche porte sur expéditeur + objet + extrait + référence métier.
- **Vues virtuelles** : « Non lus » exclut les indésirables ; « Suivis » traverse tous les dossiers.
- **Synchronisation** : appel IMAP réel, avec état de chargement et notification de résultat. Prévoir aussi un rafraîchissement périodique et, idéalement, IDLE.
- **Rattachement métier** : la puce `Commande #2417` doit ouvrir la commande dans le back-office. Détection par numéro dans l'objet ou le corps, ou par un `Message-ID` stocké au moment de l'envoi transactionnel — c'est ce lien qui justifie d'avoir la messagerie dans l'outil.
- **Accessibilité à traiter** : la maquette utilise des `div` cliquables pour les lignes de message et les dossiers. Utilisez des `button` / `a` réels, `aria-pressed` sur l'étoile, `aria-live` sur les notifications, navigation clavier dans la liste (↑ ↓ pour parcourir, Entrée pour ouvrir, `u` pour non lu, `e` pour archiver — conventions de webmail que les utilisateurs connaissent).

## Responsive (< 1000 px)

- Dossiers en **tiroir** (252 px, `translateX(-102%)` → `0`, transition 0,22 s `cubic-bezier(.4,0,.2,1)`, ombre `6px 0 28px`) avec overlay flouté qui ferme au clic ; ouvert par le hamburger de la topbar.
- Liste et lecture deviennent **deux vues alternées** en pleine largeur, avec un bouton retour dans la barre d'actions.
- Recherche et bloc identité masqués dans la topbar.
- Fenêtre de rédaction en plein écran sans rayon.

## State management

| Clé | Rôle | Recommandation |
|---|---|---|
| `folder`, `tab`, `q` | dossier, onglet, recherche | → route + query params (`/admin/mail/inbox?filtre=non-lus`) |
| `cur`, `mobDetail` | message ouvert, vue mobile | → route `/admin/mail/:folder/:id` |
| `sel` | sélection multiple | état client |
| `read`, `unread`, `stars` | surcharges d'état | → mutations optimistes vers IMAP |
| `composeOpen`, `wide`, `cc`, `sig`, `composeTo`, `composeSubject`, `composeBody`, `atts` | fenêtre de rédaction | état client + **brouillon persisté** (`Drafts` IMAP + sauvegarde locale anti-perte) |
| `syncing`, `syncMin`, `toast` | synchronisation et notifications | état client |
| `w`, `nav` | largeur, tiroir | hook media query + état client |

Côté back : IMAP pour la lecture / les dossiers / les états (`\Seen`, `\Flagged`), SMTP pour l'envoi, avec les identités `hej@`, `achats@`, `retours@`. Stockez les pièces jointes reçues qui servent de justificatif comptable (factures fournisseurs, tickets) directement dans la médiathèque / le dossier comptable — c'est un gain immédiat sur le circuit de l'expert-comptable.

## Files

| Fichier | Contenu |
|---|---|
| `Boite Mail Swedish Cravings.dc.html` | l'écran complet — 3 panneaux + fenêtre de rédaction |
| `assets/sc-monogramme.png` | monogramme de la marque (référence pour la vignette de signature) |

À lire en complément : `design_handoff_swedish_cravings/README.md` pour les tokens et le shell du back-office, et `design_handoff_emails/README.md` pour les gabarits d'emails que le bouton « Modèle d'email » doit proposer.
