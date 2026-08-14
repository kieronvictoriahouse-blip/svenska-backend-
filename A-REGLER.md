# À régler — Swedish Cravings

Points relevés au fil des sessions. Dernière mise à jour : 14/08/2026.

Les points de code ont été traités. Ce qui reste demande **ta décision, ta
saisie ou un tiers** — je ne peux pas le faire à ta place.

---

## 🔴 À faire valider par un comptable

### 1. TVA intracommunautaire sur les achats en Suède
N° `FR19105003537` existant, franchise en base par ailleurs. L'autoliquidation
de la TVA sur les acquisitions intracommunautaires via **CA3** est probablement
due malgré la franchise.

C'est le seul sujet qui peut coûter cher rétroactivement. Les bons de commande
portent désormais la mention d'autoliquidation, ce qui est cohérent avec cette
hypothèse — mais une mention sur un document ne remplace pas une déclaration.

### 2. Six factures émises sur des commandes test
`FAC-2026-0001 / 0002 / 0003 / 0005 / 0008 / 0014` (15,60 € au total), passées
en statut `cancelled`. Fiscalement une facture émise ne s'annule pas, elle se
contre-passe par un avoir. Montants négligeables et c'est toi le client, mais à
signaler si un comptable reprend le dossier.

**Prévention** : marquer une commande comme test **avant** qu'elle passe en
`confirmed`, sinon la facturation se déclenche.

---

## 🟠 Ta décision

### 3. Le champ `siret` contient un SIREN
`white_label_config.siret` = `105003537`, soit 9 chiffres (SIREN), pas 14.
Acceptable sur une facture de micro-entreprise, mais il apparaît sur tous les
documents — à trancher une fois pour toutes.

### 4. Coordonnées bancaires absentes de la facture
Le bloc IBAN/BIC est prévu par le design mais désactivé (`bank: null`) : je n'ai
pas inventé tes coordonnées. À décider : les afficher ou non, et les stocker
dans `white_label_config`.

### 5. Pas de table `quotes` pour les devis
Le document Devis se génère à partir d'une commande existante. Impossible de
faire un devis à un prospect qui n'a jamais commandé — alors que le design vise
les revendeurs et restaurateurs. À construire si tu veux démarcher.

### 6. Onglets Marketing à restructurer
Ton retour : « c'est pouri ». L'écran empile campagnes, codes promo et abandon
panier dans un seul jeu d'onglets à plat, et la navigation propose quatre
entrées qui pointent toutes sur la même page avec un `?tab=`.

**À cadrer avec toi avant de coder** : le découpage change la structure des URL
et donc les entrées de navigation.

---

## 🟡 Ta saisie

### 7. Transport et emballage réels sous-saisis
Sur 34 commandes : **22,87 €** de transport réel et **1,92 € d'emballage**
enregistrés. Avec des envois Mondial Relay autour de 4-5 €, le transport réel
tourne plutôt autour de 100-120 €.

Conséquence : **le tableau de marge annonce plus que la réalité**, et les prix
sont pilotés là-dessus. Les champs existent dans la fiche commande — il faut les
remplir à l'expédition.

### 8. Poids manquant sur 19 produits
Le bon de livraison reconstitue le poids du colis depuis `products.weight`. Sur
les commandes contenant ces 19 produits, le total est précédé de `~`. Utile
aussi pour l'affranchissement.

### 9. Treize serviettes en papier jamais réceptionnées
Leur stock a été saisi à la main, sans réception : le contrôle ne peut pas le
recalculer. Deux sont même vendues avec un stock à 0. Un comptage physique est
le seul moyen — l'inventaire par scan est là pour ça.

### 10. Textes « dès 50 € » en dur sur le site
Le seuil de franco est dynamique dans le panier, mais pas ces textes :
- ticker d'accueil → éditable dans **CMS → `ticker_1`**
- badges des ~57 fiches produit pré-générées, `faq.html`, `cgv.html`,
  `livraison.html`, `contact.html`

À adapter à la main pendant une opération « livraison offerte ».

---

## 🟢 Environnement

### 11. `.vercel/project.json` du front pointe sur un ancien `orgId`
`team_BDipBo5jmqJ19qMuogt9k3kp`, alors que le projet vit sous
`kieronvictoriahouse-3949s-projects`. Sans effet sur le déploiement Git, mais
`vercel` en CLI depuis ce dossier échoue.

### 12. Compte GitHub actif à rebasculer
Le compte actif retombe régulièrement sur un autre. Avant un push :
```bash
gh auth switch --user kieronvictoriahouse-blip
```

### 13. `.next` verrouillé par OneDrive
Le dépôt vit dans OneDrive, qui synchronise `.next` et verrouille des fichiers
pendant un build — d'où des `EINVAL: readlink` intermittents. Contournement :
supprimer `.next` en PowerShell avant le build. Mieux : exclure `.next` de la
synchronisation OneDrive.

---

## ✅ Réglé

**Sécurité**
- Audit d'authentification refait handler par handler, en retirant les
  commentaires : le comptage naïf prenait des handlers commentés pour des
  fuites. 31 handlers étaient ouverts, tous fermés. Les routes restées
  publiques le sont pour une raison écrite : authentification, checkout,
  webhooks à signature, crons à secret, jeton de remplacement, lectures de
  catalogue.
- Les 74 appels concernés des écrans admin passent par `adminFetch` — fermer
  une route sans ça casse l'écran qui l'appelle.
- `/api/orders/[id]` renvoyait la commande entière (nom, adresse, email,
  téléphone) à qui connaissait l'identifiant, et la page de remerciement du
  site s'en servait. Nouvelle route `/api/orders/[id]/public` limitée à ce que
  cette page affiche.
- `/api/invoices/[id]` et son PDF fermés ; les liens de téléchargement passent
  par `downloadAuth()`, un `<a href download>` n'envoyant pas le jeton.
- Espace client (`/api/customer/*`) déjà neutralisé en 410.

**Stock**
- Journal unique : toute variation écrit un mouvement, idempotent par commande.
  La dérive de +77 unités sur 22 produits venait de trois causes cumulées, dont
  un `decrement_stock` muet quand `track_stock = false`.
- Cron de surveillance qui répare ce qui est réparable et alerte sur le reste.
- 9 produits réalignés, référence `CTRL-2026-08-13`.
- Référence produit stable (`sku`, migration 036) au lieu d'être dérivée du
  `sort_order`, qui changeait quand on réordonnait le catalogue.
- Un seul seuil de stock bas : celui du produit, 12 en repli.

**Documents**
- Facture et avoir PDF au nouveau modèle, polices Jost et Cormorant embarquées.
- Bon de commande fournisseur idem, multilingue conservé.
- `lib/pdf-doc` : tokens et blocs communs, la palette n'est plus dupliquée.
- Statut « payée » corrigé à la source + 25 factures reprises ; filigrane PAYÉE.
- Bon de livraison : poids du colis reconstitué, marqué `~` quand un article
  n'a pas de poids.
- Boutons « imprimer » et « PDF » posés dans Facturation.

**Emails & boîte mail**
- Six gabarits du handoff branchés, éditables depuis le back-office avec un
  garde-fou qui refuse un gabarit laissant une balise non résolue.
- Boîte mail IMAP complète : relève, dossiers réels du serveur, lecture,
  réponse, transfert, pièces jointes dans les deux sens, étiquettes,
  brouillons, envois programmés, carnet d'adresses.
- Parcours de remplacement sur rupture, avec jeton HMAC signé et recalcul du
  montant côté serveur.

**Fiabilité**
- Le cron marketing avalait six erreurs d'envoi : elles remontent désormais.
- Les échecs de dépôt IMAP remontent à l'écran au lieu des seuls logs.
- Écran boîte mail repris d'un bloc et découpé en composants.

**Écrans**
- Repassés au nouveau design : Suggestions, Import URL, Création d'article,
  Facturation, Achats, Pages, Ruptures, Boîte mail, Emails.
- `/admin/homepage` n'était pas un doublon de `home-cms` : il édite les
  sections et les produits mis en avant, que `home-cms` ne couvre pas. Remis
  dans la navigation au lieu d'être supprimé.
- Champ EAN, « Créer par scan », inventaire scanné, préparation de commande.
- Le type « livraison offerte » n'exige plus de valeur.
- Les champs de l'opération livraison restent visibles, grisés, quand elle est
  éteinte.

**Fiscal**
- Déclarations URSSAF mai, juin, juillet 2026 faites.
- Les 5 paiements test en `cs_live_` remboursés (11,15 €). **Réflexe** : le
  préfixe de `stripe_session_id` dit si de l'argent a bougé.
