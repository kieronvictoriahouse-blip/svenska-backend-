# À régler — Swedish Cravings

Points relevés au fil des sessions, hors refonte des écrans. Rangés par urgence.
Coche au fur et à mesure. Dernière mise à jour : 12/08/2026.

---

## 🔴 Sécurité — à traiter en premier

### 1. Routes API sans authentification exposant des données personnelles

Audit du 12/08/2026 : la plupart des `GET` de l'API n'ont **aucun contrôle d'accès**.
Le plus grave d'abord :

| Route | Ce qui fuite | Gravité |
|---|---|---|
| `/api/contacts` | **tout le fichier client** : noms, emails, adresses, téléphones | 🔴 RGPD |
| `/api/contacts/[id]` | fiche client complète | 🔴 RGPD |
| `/api/orders/[id]` | commande complète : client, adresse, lignes, montants | 🔴 RGPD |
| `/api/invoices/[id]` | facture : identité client, adresse, montants | 🔴 RGPD |
| `/api/invoices/[id]/pdf` | le PDF de la facture | 🔴 RGPD |
| `/api/orders/session/[session_id]` | commande via l'id de session Stripe | 🟠 |
| `/api/purchases`, `/api/purchase-orders`, `/api/purchase-orders/[id]` | achats, prix fournisseurs, marges | 🟠 concurrence |
| `/api/landed-costs`, `/api/stock` | coûts de revient, niveaux de stock | 🟠 concurrence |
| `/api/receptions`, `/api/product-suggestions`, `/api/purchase-suggestions` | données internes | 🟠 |
| `/api/admin/replay-orders` | action d'administration | 🟠 |

Les identifiants sont des UUID (non devinables), donc l'exploitation demande de
connaître un id — mais un id fuite facilement (lien partagé, historique, log,
capture d'écran). **Ce n'est pas une protection.**

**À faire** : `requireAuth` sur chaque handler admin, et pour ce que le front
consomme vraiment (`/api/products`, `/api/categories`, `/api/white-label`,
`/api/public-config`, `/api/cms`, `/api/pages`, `/api/homepage`,
`/api/gift-offer`, `/api/mondial-relay/points`, `/api/exchange-rate`,
`/api/google-reviews`, `/api/orders/session/[session_id]`), créer des routes
publiques dédiées qui ne renvoient que le strict nécessaire — comme on l'a fait
pour `/api/promo/validate`.

⚠️ Piège : ajouter `requireAuth` casse l'écran admin qui appelle la route sans
jeton. Vérifier chaque appelant et passer par `adminFetch` (cf.
`src/lib/auth-client.ts`), qui gère jeton + rafraîchissement + redirection.

**Déjà corrigé le 12/08** : `/api/marketing` (GET/POST/PUT/DELETE),
`/api/marketing/automations`, `/api/marketing/promo-email`. Les codes promo
étaient listables **et créables** par n'importe qui.

---

## 🟠 Fiscal & légal

### 2. TVA intracommunautaire sur les achats en Suède
N° `FR19105003537` existant, franchise en base par ailleurs. L'autoliquidation
de la TVA sur les acquisitions intracommunautaires via **CA3** est probablement
due malgré la franchise. **À faire valider par un comptable** — c'est le seul
sujet qui peut coûter cher rétroactivement.

### 3. Le champ `siret` contient un SIREN
`white_label_config.siret` = `105003537`, soit 9 chiffres (SIREN), pas 14 (SIRET).
Acceptable sur une facture de micro-entreprise, mais à vérifier — il apparaît sur
tous les documents.

### 4. Six factures émises sur des commandes test
`FAC-2026-0001 / 0002 / 0003 / 0005 / 0008 / 0014` (15,60 € au total), passées en
statut `cancelled`. Fiscalement une facture émise ne s'annule pas, elle se
contre-passe par un avoir. Montants négligeables et c'est toi le client, mais à
signaler si un comptable reprend le dossier.
**Prévention** : marquer une commande comme test **avant** qu'elle passe en
`confirmed`, sinon la facturation se déclenche.

---

## 🟡 Données & cohérence

### 5. Transport et emballage réels sous-saisis
Sur 34 commandes : **22,87 €** de transport réel et **1,92 € d'emballage**
enregistrés. Avec des envois Mondial Relay autour de 4-5 €, le transport réel
tourne plutôt autour de 100-120 €. Conséquence : **le tableau de marge annonce
plus que la réalité**, et les prix sont pilotés là-dessus.
**À faire** : saisir systématiquement les deux à l'expédition (champs déjà
présents dans la fiche commande).

### 6. Pas de champ référence (SKU) sur les produits
La table `products` n'a pas de colonne référence. Les écrans affichent
`SC-0042` dérivé du `sort_order` — instable si l'ordre change.
**À faire** : ajouter une colonne `sku` (texte, unique) et remplacer `refOf()`
dans `src/app/admin/produits/page.tsx` et `src/app/admin/stock/page.tsx`.

### 7. Deux définitions du « stock bas »
Le handoff fixe le seuil à **12** ; la base a un `stock_alert` **par produit**.
Aujourd'hui : le seuil du produit sert à la couleur et à la jauge, le 12 du
handoff sert au filtre « Stock bas » et aux compteurs de la sidebar.
**À trancher** : un seul des deux, partout.

### 8. Pas de table `quotes` pour les devis
Le document Devis se génère à partir d'une commande existante. Impossible de
faire un devis à un prospect qui n'a jamais commandé — alors que le design vise
justement les revendeurs et restaurateurs (« tarif professionnel »).
**À faire** : table `quotes` + écran de saisie, ou formulaire à la volée.

---

## 🟡 Documents & impression

### 9. La facture envoyée par email n'a pas le nouveau design
Les 6 documents A4 sont en HTML pixel-perfect (`/admin/documents/...`), mais
l'envoi automatique par email utilise toujours `src/lib/invoice-pdf.ts`
(**pdfkit**, ancien design).
**Option retenue si tu veux l'unifier** : Chromium headless sur Vercel
(`@sparticuz/chromium`) pour rendre le HTML en PDF côté serveur — ~50 Mo de
dépendance et des démarrages à froid plus lents, à n'activer que pour cet usage.

### 10. Coordonnées bancaires absentes de la facture
Le bloc IBAN/BIC est prévu par le design mais désactivé (`bank: null`) : je n'ai
pas inventé tes coordonnées. **À décider** : les afficher ou non, et où les
stocker (`white_label_config`).

### 11. Liens « Imprimer » pas encore posés dans les écrans
Les URLs fonctionnent, mais aucun bouton n'y mène depuis Facturation, Commandes
et Achats. À poser lors de la refonte de ces écrans (le handoff prévoit des
icônes `print` / `picture_as_pdf`).

---

## 🟢 Confort & finitions

### 12. Textes « dès 50 € » en dur sur le front
Le seuil de franco est dynamique dans le panier, mais ces textes ne le sont pas :
- ticker d'accueil → éditable dans **CMS → `ticker_1`**
- badges des ~57 fiches produit pré-générées, `faq.html`, `cgv.html`,
  `livraison.html`, `contact.html`
À adapter à la main pendant une opération « livraison offerte ».

### 13. Le formulaire de code promo exige une « valeur » inutile
Pour le type **Livraison offerte**, le champ Valeur est obligatoire alors qu'il
ne sert à rien (le type `gift` en est déjà exempté).
`src/app/admin/marketing/page.tsx`, fonction `saveCode` — une ligne.

### 14. Le bloc « Opération livraison offerte » paraît vide quand il est inactif
Les champs n'apparaissent qu'une fois l'interrupteur allumé, ce qui donne
l'impression d'un bloc mort. Possible : les afficher grisés en permanence.

### 15. `.vercel/project.json` du front pointe sur un ancien `orgId`
`team_BDipBo5jmqJ19qMuogt9k3kp`, alors que le projet vit sous
`kieronvictoriahouse-3949s-projects`. Sans effet sur le déploiement Git, mais
`vercel` en CLI depuis ce dossier échoue.

### 16. Compte GitHub actif à rebasculer
Le compte actif retombe sur `dvsfrance26-site`, qui n'a pas les droits sur les
dépôts. Avant un push :
```bash
gh auth switch --user kieronvictoriahouse-blip
```

---

## ✅ Réglé

- Migration `028` (remboursement partiel) et `029` (opération livraison) appliquées.
- `AV-2026-0001` remis en statut `avoir`.
- Les 5 paiements test en `cs_live_` remboursés sur Stripe (11,15 €) — les
  12 autres étaient en `cs_test_`, aucun flux réel. **Réflexe** : le préfixe de
  `stripe_session_id` dit si de l'argent a bougé.
- `/api/marketing` et ses sous-routes fermées.
- Déclarations URSSAF mai, juin, juillet 2026 faites.
