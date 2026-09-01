# 04 — Control plane : l'usine à instances

La seule pièce de logiciel NOUVELLE de tout le plan. Petite par le code,
critique par le rôle : c'est elle qui encaisse, provisionne, suspend.

## Périmètre — strictement quatre fonctions

1. **Vendre** : site vitrine + tunnel d'inscription + Stripe Billing.
2. **Provisionner** : exécuter l'installateur (03) via les API.
3. **Facturer/suspendre** : réagir aux webhooks d'abonnement.
4. **Superviser** : un tableau des instances (état, version, dernier
   audit), pour toi seul.

Tout le reste — la boutique, l'admin, les données — vit dans les
instances. Le control plane ne lit JAMAIS les données d'une boutique.

## Pile recommandée

Le même moule que le moteur, pour ne pas s'éparpiller : Next.js +
Supabase (une base à lui : `clients`, `instances`, `abonnements`,
`evenements`) + Stripe Billing. Un seul dépôt de plus.

## Le tunnel d'inscription

```
1. Formulaire : nom boutique, email, SIREN (vérifié : 9 chiffres +
   clé Luhn), sous-domaine souhaité (*.shopflow.fr)
2. Stripe Checkout en mode subscription (essai 14 j sans CB, ou CB
   immédiate — à trancher commercialement)
3. Webhook checkout.session.completed → file de provisionnement
4. Provisionnement (5-10 min réelles) :
     API Supabase Management  POST /v1/projects        → base
     scripts/installer.js     (schema + seed + admin)  → contenu
     API Vercel               POST /v10/projects       → app, branchée
                              sur le dépôt moteur, env posées
     API Stripe (du client, plus tard à l'onboarding)  → webhooks
5. Email de bienvenue : URL admin, mot de passe initial, checklist
   d'onboarding (brancher Stripe, Resend, Mondial Relay — les env
   « client » de 03 §ENV, saisies via un écran dédié de l'admin)
```

File de provisionnement **séquentielle** (les API Supabase/Vercel
limitent la création en rafale) — une table + un cron, pas de
infrastructure de queue.

## Les webhooks d'abonnement (Stripe Billing)

| Événement | Action |
|---|---|
| `invoice.paid` | rien (état nominal) |
| `invoice.payment_failed` | J+0 email, J+7 relance |
| échec final (`subscription.past_due` → `canceled`) | env `SHOPFLOW_SUSPENDED=1` + redeploy : bannière, admin lecture seule, **vitrine coupée**, données intactes |
| régularisation | retirer la variable, redeploy |
| résiliation demandée | export complet remis (CSV, FEC, livre des recettes, factures PDF — tout existe déjà), pause Supabase 30 j, puis suppression définitive documentée |

La suspension est **réversible et non destructive** par construction :
c'est une promesse contractuelle (06), le code doit la tenir.

**Implémenté (2026-09-01)** — le webhook ne fait que noter le statut du
client ; le **tick** (cron Vercel chaque minute, `vercel.json`) compare
ce statut à l'état réel (`cp_instances.suspendue`) et agit sur l'écart
via `lib/suspension.js` (env Vercel + redeploy). Côté moteur :
`src/middleware.ts` coupe toute écriture API en 402 français (checkout
compris), laisse la lecture admin, la connexion et les webhooks Stripe
signés ; `/api/public-config` porte le drapeau `suspendu` (no-store) ;
bannière rouge trilingue dans l'admin (`SuspensionBanner.tsx`).
L'email de bienvenue (Resend, `lib/email.js`) part à l'étape « pret »,
seul moment où le mot de passe existe — repli `bienvenue_a_envoyer`.

## Le tableau de bord opérateur

Par instance : client, sous-domaine, version déployée (commit), état
de l'abonnement, migrations en attente, **résultat des deux audits**
(le control plane déclenche `audit-stock` / `audit-facturation` par un
endpoint interne protégé par `CRON_SECRET` et affiche vert/rouge).
C'est ton « est-ce que la flotte va bien ? » en un écran — la même
philosophie que les audits : une commande, une réponse.

## Facturation de Shopflow lui-même

Tes factures d'abonnement sortent de TA propre instance Shopflow
(l'instance Swedish Cravings sait déjà émettre des factures scellées
Factur-X) — le control plane pousse une commande par prélèvement réussi
via l'API. Le produit se facture avec le produit : argument commercial,
et un utilisateur quotidien de plus (toi).

## Risques spécifiques

- **Le control plane détient les jetons** des API Vercel et Supabase
  Management : ce sont les clés de TOUTES les instances. Stockage
  chiffré, jamais côté client, rotation documentée.
- **Provisionnement à moitié fait** (API qui échoue au milieu) : chaque
  étape est idempotente et rejouable — même philosophie que
  `scripts/installer.js` ; une instance en échec se reprend, ne se
  recrée pas.
- **Ne pas encaisser pour le client** : ses ventes vont sur SON Stripe.
  Shopflow n'encaisse que ses abonnements. Franchir cette ligne =
  réglementation des établissements de paiement.

Effort : 2-3 semaines une fois 02 et 03 terminés.
