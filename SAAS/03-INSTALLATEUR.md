# 03 — Installateur : une boutique vierge, reproductible

Le provisionnement automatique (04) n'est que cet installateur piloté
par API. Il se construit et se prouve **à la main d'abord**.

## Le problème réel

Les 45 fichiers de `supabase/migrations/` supposent une base qui a
vécu : la 031 documente elle-même que `stock_movements` existait « créée
à la main, jamais versionnée », la 012 pose le SIREN de Swedish
Cravings, certaines migrations corrigent des données qui n'existeront
pas sur une base neuve. **Personne n'a jamais installé ce logiciel sur
une base vide.** Tant que ce n'est pas fait une fois, il n'y a pas de
produit — il y a un déploiement unique qui marche.

## Livrables

### 1. `install/schema.sql` — le schéma consolidé

Un seul fichier idempotent qui crée TOUT : les ~30 tables, index,
contraintes (dont `invoices_number_unique`, `orders_status_check`
corrigée par la 040, les colonnes de chaînage de la 045), RLS et
politiques, buckets Storage. Généré depuis la base de production
(`pg_dump --schema-only` nettoyé), PAS en rejouant les 45 migrations —
elles restent l'historique de l'instance d'origine.

Piège connu à vérifier au dump : les colonnes `lines` sont des `jsonb`
qui contiennent une **chaîne** JSON — le schéma doit rester `jsonb`
(le code fait le parse), ne pas « corriger » en migrant.

### 2. `install/seed.sql` — le minimum vital

- config white-label par défaut (neutre, sans marque) ;
- catégories vides, aucun produit ;
- les gabarits d'email par défaut sont déjà dans le code (fichiers) —
  rien à seeder ;
- PAS de données de démo ici (la démo est une instance comme une autre,
  avec son propre seed enrichi).

### 3. `scripts/migrer.js` — le runner d'instance

```
node scripts/migrer.js            → applique ce qui manque
node scripts/migrer.js --statut   → liste appliquées / en attente
```

- table `schema_migrations (fichier, applique_le, checksum)` ;
- installation neuve : enregistre `schema.sql` comme point zéro et
  marque toutes les migrations existantes comme appliquées ;
- instance vivante : applique les nouvelles, dans l'ordre, une par une,
  s'arrête à la première erreur ;
- checksum : une migration modifiée après application = alerte, pas de
  rejeu silencieux (même philosophie que le chaînage des factures).

### 4. `scripts/installer.js` — l'orchestrateur

Entrées : URL + service key d'un projet Supabase vierge, la config
white-label (nom, SIREN, email…), l'email de l'admin.
Étapes : schema → seed → création de l'admin → écriture de la config →
`node scripts/audit-stock.js` et `audit-facturation.js` (verts sur base
vide) → impression des env à poser sur Vercel.

### 5. `install/ENV.md` — le contrat des 38 variables

Mesurées dans le code. À classer en trois colonnes :

| Classe | Variables | Qui les fournit |
|---|---|---|
| **Générées** au provisionnement | ADMIN_JWT_SECRET, CUSTOMER_JWT_SECRET, REPLACEMENT_SECRET, CRON_SECRET, INTERNAL_SECRET, IMPORT_SECRET | le robot |
| **Instance** Supabase/Vercel | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET, NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_FRONT_URL | le robot |
| **Client** (ses comptes) | STRIPE_SECRET_KEY(+TEST), STRIPE_WEBHOOK_SECRET(+TEST), RESEND_API_KEY, RESEND_FROM, RESEND_WEBHOOK_SECRET, SMTP_*, IMAP_*, MONDIAL_RELAY_*, LOGSPHER_*, GOOGLE_PLACES*, MINDEE_API_KEY | le client, guidé par l'onboarding |
| **À trancher** | SNIPCART_SECRET_KEY, ADMIN_TEST_EMAILS | reliquats — supprimer plutôt que documenter |

Les webhooks Stripe/Resend se créent PAR instance (URL propre) — le
robot les enregistre via l'API Stripe et pose le secret retourné.

## Le test à l'acide (critère de sortie)

Sur un projet Supabase créé pour l'occasion, chronomètre en main :

```
installer.js → deploy Vercel → parcours complet :
créer un produit → le voir sur la vitrine → passer une commande test
(Stripe test) → la préparer au scan → l'expédier → facture Factur-X
scellée → audits verts
```

**En moins d'une heure, sans toucher au code.** Puis détruire
l'instance et recommencer — la deuxième fois doit être ennuyeuse.

Effort : 3-5 jours, dont la moitié sur le schéma consolidé.
Dépendance : le débranding (02) — sinon on installe des boutiques
Swedish Cravings.
