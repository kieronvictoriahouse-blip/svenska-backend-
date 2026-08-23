# Conformité facturation & comptabilité — Swedish Cravings

État au 23 août 2026. Rédigé pour une **micro-entreprise en franchise en
base de TVA (art. 293 B du CGI)**, ventes B2C en ligne, encaissements
Stripe. À faire relire par l'expert-comptable — ce document décrit ce que
le logiciel fait et ce que le calendrier réglementaire exige, il ne
remplace pas un conseil.

---

## 1. Le calendrier réel de la facturation électronique

La réforme (ordonnance 2021-1190, LFR 2022, décret 2022-1299) n'impose
**pas la même chose à tout le monde le 1er septembre 2026** :

| Échéance | Obligation | Qui | Swedish Cravings |
|---|---|---|---|
| **1er sept. 2026** | **Recevoir** les factures électroniques de ses fournisseurs français | Toutes les entreprises assujetties à la TVA, franchise comprise | **OUI — dans 9 jours** |
| 1er sept. 2026 | Émettre en format structuré (B2B domestique) | Grandes entreprises et ETI seulement | Non |
| **1er sept. 2027** | **Émettre** (B2B domestique) + **e-reporting** des ventes B2C et internationales | PME et micro-entreprises | Oui, dans un an |

Points à retenir :

- La **franchise en base ne dispense de rien** ici : un micro-entrepreneur
  est assujetti à la TVA (même non redevable), donc concerné.
- Les ventes de la boutique sont du **B2C** : elles ne passeront jamais
  par l'e-invoicing B2B — c'est l'**e-reporting** qui les couvrira, à
  partir de **septembre 2027**.
- Les échanges passent par des **PDP** (Plateformes de Dématérialisation
  Partenaires immatriculées). Le portail public (PPF) a été recentré fin
  2024 sur l'annuaire et la concentration des données : il n'y a **pas de
  plateforme d'échange gratuite de l'État**, il faut choisir une PDP.

### Ce qu'il reste à faire AVANT le 1er septembre 2026 — action humaine

> **Choisir une plateforme de réception et s'y inscrire.** C'est une
> démarche administrative, pas du code. Beaucoup d'acteurs offrent la
> réception seule gratuitement (les suites comptables type Pennylane,
> Tiime, Indy, les banques pro, ou une PDP directement). L'inscription
> crée l'entrée de l'entreprise dans l'annuaire (clé : le SIREN
> 105003537). Sans cela, un fournisseur français qui bascule en électronique
> ne pourra tout simplement plus adresser sa facture.
>
> Volumétrie réelle : les achats de marchandise sont suédois (GEKAS,
> WILLYS — hors périmètre France), mais TNT France, et tout prestataire
> français, factureront par ce canal.

---

## 2. Ce que le logiciel fait désormais

### Factur-X — chaque facture est déjà au format 2027

Chaque PDF de facture est généré en **PDF/A-3** avec le XML **CII
EN 16931** embarqué sous le nom réservé `factur-x.xml` : c'est la
définition du format **Factur-X**, le format pivot français. Le même
fichier sert le client (mise en page) et la machine (données
structurées).

- Profil **EN 16931** complet (lignes incluses), pas le profil minimum :
  rien à refaire en 2027.
- TVA : catégorie **E** (exonéré), motif **VATEX-FR-FRANCHISE** — la
  traduction normalisée de « TVA non applicable, art. 293 B du CGI ».
- SIREN du vendeur dans les identifiants (schemeID 0002 = SIRENE), la
  clé de l'annuaire.
- XML nu disponible : `GET /api/invoices/{id}/facturx`.
- Vérifié sur pièce réelle (FAC-2026-0044) : XML équilibré, totaux
  concordants, `AFRelationship`, XMP PDF/A et profil ICC présents.

### Inaltérabilité — chaînage cryptographique (migration 045)

Chaque facture est **scellée à la création** : empreinte SHA-256 de son
contenu (numéro, date, identités, lignes, montants, mention légale) +
l'empreinte de la pièce précédente. Modifier ou supprimer une pièce
casse toutes les empreintes suivantes — l'altération devient visible en
une commande :

```bash
node scripts/audit-facturation.js
```

C'est le principe d'**inaltérabilité** de l'art. 286-I-3° bis du CGI
(logiciels de caisse). La franchise en base **dispense** aujourd'hui de
l'obligation de certification (BOI-TVA-DECLA-30-10-30) — mais la
dispense tombe avec la franchise, et un historique inaltérable ne se
reconstruit pas rétroactivement. Depuis la LF 2025, l'auto-attestation
de l'éditeur ne suffit plus pour les assujettis soumis : si la boutique
sort un jour de franchise, la certification (NF525/LNE) sera à
prévoir — le chaînage posé ici en est le prérequis technique.

Garanties associées :

- **Numéro unique en base** (index) : deux créations simultanées ne
  peuvent plus produire deux FAC-2026-0050 — la course devient une
  re-numérotation.
- **Le contenu d'une pièce émise ne se modifie plus** : l'API n'accepte
  que le cycle de vie (statut, encaissement, note). La date d'émission
  est verrouillée. Toute correction passe par un **avoir** (AV-2026-…),
  lui-même scellé.
- **Aucune suppression** : il n'existe pas de route DELETE sur les
  factures, et le chaînage rendrait le trou visible.

### Livre des recettes — le registre légal de la micro

Le document central d'un contrôle de micro-entreprise (art. 50-0 CGI,
L123-28 c. com.) : chronologie des **encaissements** — date, pièce
justificative (numéro de facture), client, nature, montant, mode de
règlement. Export : **Comptabilité → Livre des recettes** (CSV), les
remboursements en négatif à leur date.

### Contrôles permanents

`scripts/audit-facturation.js`, lecture seule, 7 contrôles :
numérotation continue sans trou ni doublon · chaîne d'intégrité ·
chaque commande payée a sa facture · montants facture = commande
(avoirs compris) · chaque remboursement a son avoir · mentions
obligatoires sur chaque pièce · recettes comptables = encaissements
nets, au centime.

État au 23/08/2026 : **tout est vert** (1 147,39 € = 1 147,39 €), reste
le scellement initial des 51 pièces existantes (§3).

### Conservation

Les pièces vivent en base (Supabase, sauvegardé) et les PDF se
régénèrent à l'identique depuis les données scellées. Obligations :
**10 ans** (pièce comptable, L123-22 c. com.), 6 ans côté fiscal. Le
chaînage garantit que ce qui est régénéré est ce qui a été émis.

---

## 3. Mise en service — deux gestes

1. **Migration 045** (Supabase → SQL Editor) :
   `supabase/migrations/045_facturation_integrite.sql`
   (index unique sur le numéro + colonnes de chaînage).

2. **Scellement des 51 factures existantes** :
   ```bash
   node scripts/reprise-chaine-factures.js            # simulation
   node scripts/reprise-chaine-factures.js --ecrire   # écriture
   node scripts/audit-facturation.js                  # doit être vert
   ```

Puis redéployer. Toute facture créée ensuite se scelle seule.

---

## 4. Hors périmètre logiciel — à ne pas oublier

- **Inscription à une plateforme de réception avant le 1/09/2026** (§1).
- **E-reporting sept. 2027** : la transmission des ventes B2C passera
  par la PDP choisie ; les données nécessaires (montants, dates, TVA
  catégorie E) sont déjà structurées dans le Factur-X.
- Si le CA approche les seuils de franchise TVA, prévenir le comptable
  AVANT : sortie de franchise = TVA sur factures, certification
  logiciel de caisse, et bascule des mentions — le code est prêt à
  l'accueillir (les montants sont déjà séparés HT/TVA/TTC), mais c'est
  une décision comptable.
