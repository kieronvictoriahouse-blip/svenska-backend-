# 01 — Architecture : un moteur, N instances, un control plane

## Vue d'ensemble

```
                    shopflow.fr  (CONTROL PLANE — à construire, cf. 04)
                    ├── site vitrine + inscription
                    ├── Stripe Billing (abonnements Shopflow)
                    ├── provisionneur (robot)
                    └── tableau de bord des instances

  UN dépôt GitHub (ce code, débrandé)
   │
   ├── instance client A ── projet Vercel A ── base Supabase A ── domaine A
   ├── instance client B ── projet Vercel B ── base Supabase B ── domaine B
   └── ...                  (mêmes commits,     (schéma identique,
                             env différentes)    données isolées)
```

Trois plans distincts, à ne jamais mélanger :

| Plan | Contenu | Qui le voit |
|---|---|---|
| **Moteur** | ce dépôt : écrans, routes, migrations | personne — c'est le produit |
| **Instance** | 1 Vercel + 1 Supabase + env par client | le client (sa boutique, son admin) |
| **Control plane** | inscriptions, abonnements, registre des instances | toi seul |

## Le cycle de vie d'une instance

```
inscription → paiement validé (webhook Stripe Billing)
  → créer la base           API Supabase Management (POST /v1/projects)
  → jouer init.sql          runner de migrations (cf. 03)
  → seed minimal            catégories vides, config white-label du formulaire
  → créer le projet Vercel  API Vercel (repo = le moteur, branch = main)
  → poser les env           38 variables (cf. 03 §env), secrets générés
  → créer l'admin           compte du commerçant, email de bienvenue
  → enregistrer l'instance  table du control plane (client, urls, état)

impayé (webhook Stripe)     → env SHOPFLOW_SUSPENDED=1 + redeploy
                              (bannière « abonnement suspendu », admin en
                               lecture seule, AUCUNE donnée touchée)
résiliation                 → export complet (CSV + FEC + factures PDF)
                              remis au client, puis pause du projet
                              Supabase 30 j, puis suppression
```

## Mises à jour de flotte

- **Code** : un push sur `main` → Vercel redéploie chaque projet branché
  sur le dépôt. C'est natif, rien à construire.
- **Schéma** : le runner de migrations (03) tient une table
  `schema_migrations` par instance et applique ce qui manque. Le control
  plane l'exécute sur toute la flotte après chaque release qui contient
  une migration. Règle absolue héritée de ce projet : **migrations
  additives uniquement** (ADD COLUMN IF NOT EXISTS, jamais de DROP de
  colonne utilisée) — une instance en retard d'un déploiement doit
  continuer de tourner.
- **Version affichée** : le pied de page « Shopflow v2.4 » lit déjà une
  constante ; la brancher sur le commit déployé.

## Ce qui reste par client (fourni par lui, posé en env)

- **Stripe** : chaque commerçant a SON compte Stripe (clés + webhook).
  Ne jamais encaisser pour son compte — ni Stripe Connect ni agrégation :
  c'est son argent qui va sur son compte, on n'est pas un établissement
  de paiement.
- **Emails** : Resend (une clé par instance, domaine du client vérifié)
  ou son SMTP. IMAP de la boîte mail : celui du client.
- **Livraison** : Mondial Relay / Logspher — comptes du client.
- **Domaine** : sous-domaine `*.shopflow.fr` par défaut, domaine propre
  branché sur le projet Vercel en option.

## Sécurité et cloisonnement

- Une clé `service_role` **par instance**, générée par Supabase à la
  création du projet — jamais partagée, jamais dans le moteur.
- Secrets d'instance (`ADMIN_JWT_SECRET`, `REPLACEMENT_SECRET`,
  `CRON_SECRET`, `INTERNAL_SECRET`) : générés aléatoirement au
  provisionnement, uniques par client.
- Le control plane ne stocke AUCUN secret d'instance en clair après le
  provisionnement : ils vivent dans les env Vercel de l'instance.
- RLS reste activée comme aujourd'hui ; le modèle de menace inter-client
  est réglé par construction (bases distinctes).

## Limites assumées (et quand les revoir)

- **Coût plancher par instance** : 0 € (tiers gratuits) à ~45 €/mois
  (Supabase Pro 25 $ + Vercel Pro 20 $ au prorata). Recalculer le prix
  plancher de l'abonnement si ces tarifs bougent.
- **Quotas d'API** : la création de projets Supabase/Vercel est limitée
  en rafale — le provisionneur met en file, il ne parallélise pas.
- **Multi-tenant partagé** : à ré-étudier vers ~300 instances, quand le
  coût plancher et la gestion de flotte pèseront plus que le coût de la
  réécriture. Pas avant.
