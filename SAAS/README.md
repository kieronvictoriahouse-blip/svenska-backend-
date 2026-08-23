# Shopflow — plan de passage en SaaS

Transformer le back-office Swedish Cravings en produit vendu par
abonnement, où un commerçant s'inscrit, paie, et reçoit sa boutique en
ligne dix minutes plus tard — sans intervention humaine.

Rédigé le 23 août 2026, sur l'état réel du code (chiffres mesurés, pas
estimés). Les six documents de ce dossier se lisent dans l'ordre.

---

## La décision d'architecture, en une phrase

**Le SaaS est une expérience client, pas une topologie de base de
données.** Chaque abonné reçoit sa propre instance — son projet Vercel,
sa base Supabase — créée par un robot. Le moteur (ce dépôt) reste
unique : un push le met à jour partout.

Pourquoi pas une base partagée multi-tenant : les 99 routes d'API
utilisent la clé `service_role` sans cloisonnement — les réécrire
toutes, c'est 3-4 mois de travail où **un seul oubli montre les
commandes d'un client à un autre**. Et tout ce qui vient d'être durci
(numérotation de factures, chaînage d'intégrité, journal de stock) est
conçu par-boutique. L'isolation par instance transforme cette
contrainte en argument de vente : *« vos données ont leur propre base,
elles ne côtoient personne »*. La question du multi-tenant se reposera
à ~300 abonnés, financée par les revenus.

## Ce qu'on vend

> **Shopflow** — la boutique en ligne complète des petits commerçants :
> vitrine trilingue FR/EN/SV, back-office (32 écrans : stock tracé et
> audité, préparation au scan, ruptures avec choix du client par email,
> moteur d'achats, comptabilité micro, factures inaltérables Factur-X),
> conforme facturation électronique 2026/2027. Chaque boutique a sa
> propre base de données. Résiliable avec export complet.

Cible de départ : **micro-entrepreneurs français** (franchise TVA) —
le moteur de facturation suppose l'art. 293 B, c'est notre cas d'usage
prouvé en production. Le régime TVA normale est un chantier ultérieur
(cf. 05-OFFRE.md §limites).

## Les phases

| # | Chantier | Doc | Effort | Critère de sortie (mesurable) |
|---|---|---|---|---|
| 1 | Débranding | 02 | 2-3 j | `node scripts/audit-marque.js` → zéro occurrence en dur |
| 2 | Installateur | 03 | 3-5 j | boutique vierge sur Supabase neuf en < 1 h, audits verts |
| 3 | Control plane | 04 | 2-3 sem | inscription → paiement Stripe → boutique en ligne, sans humain |
| 4 | Pilote | 05 | 1 mois | 1 commerçant réel passé par le tunnel complet, qui paie |
| 5 | Exploitation | 06 | continu | mise à jour de flotte + migrations en 1 commande |

Les phases 1 et 2 ne dépendent pas du choix SaaS : elles servent
n'importe quel modèle de vente. **Rien n'y sera du travail perdu.**

## Ce qui existe déjà et se revend tel quel

- 32 906 lignes TS/TSX · 32 écrans · 99 routes · 45 migrations ·
  665 clés de traduction FR/EN/SV (interface, documents, emails).
- `white_label_config` : nom, slogan, couleurs, 3 polices, logo,
  favicon, bandeau, coordonnées, devise, TVA, seuil de franco, SMTP,
  import — le socle multi-marque est posé depuis la migration 003.
- Intégrité prouvée par tests : stock atomique (15 écritures
  concurrentes 15/15), factures chaînées SHA-256 (falsification
  détectée nommément), deux audits en une commande.
- Factur-X natif (PDF/A-3 + XML EN 16931) : l'argument « conforme
  2026/2027 » que les concurrents font payer.
- Le nom **Shopflow** est déjà dans le pied de page de l'admin —
  vérifier la disponibilité INPI + domaine avant toute communication.
