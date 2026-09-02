# Variables d'environnement d'une instance

Les 38 variables lues par le code, classées par provenance. C'est le
contrat entre le provisionneur et le moteur : `scripts/installer.js`
imprime cette liste préremplie à la fin de l'installation.

## Générées au provisionnement — uniques par instance, jamais partagées

| Variable | Rôle |
|---|---|
| `ADMIN_JWT_SECRET` | signature des sessions admin |
| `CUSTOMER_JWT_SECRET` | signature des sessions espace client |
| `REPLACEMENT_SECRET` | jetons HMAC des liens de remplacement (emails ruptures) |
| `CRON_SECRET` | protège les crons (`Authorization: Bearer …`) |
| `INTERNAL_SECRET` | appels machine-à-machine entre routes |
| `IMPORT_SECRET` | protège les endpoints d'import ponctuels |

## Instance — produites par la création des projets Supabase/Vercel

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | projet Supabase de l'instance |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (clé service) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem (clé anon) |
| `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` | créé par l'installateur (`media` par défaut) |
| `NEXT_PUBLIC_BACKEND_URL` | URL publique de l'admin (domaine Vercel) |
| `NEXT_PUBLIC_FRONT_URL` | URL publique de la vitrine |

## Client — ses comptes à lui, saisis à l'onboarding

| Variable | Service | Obligatoire |
|---|---|---|
| `STRIPE_SECRET_KEY` | encaissement de SES ventes | oui |
| `STRIPE_WEBHOOK_SECRET` | webhook créé PAR instance (URL propre) | oui |
| `STRIPE_SECRET_KEY_TEST` / `STRIPE_WEBHOOK_SECRET_TEST` | mode test | non |
| `RESEND_API_KEY` / `RESEND_FROM` / `RESEND_WEBHOOK_SECRET` | emails transactionnels | oui (ou SMTP) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | alternative SMTP | — |
| `IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASSWORD` | boîte mail intégrée | si module actif |
| `MONDIAL_RELAY_ENSEIGNE` / `MONDIAL_RELAY_KEY` | étiquettes point relais | si module actif |
| `LOGSPHER_API_URL` / `LOGSPHER_API_KEY` / `LOGSPHER_MR_UUID` / `LOGSPHER_RELAY_CARRIER_UUIDS` | expédition | si module actif |
| `OCR_SPACE_API_KEY` | lecture automatique des tickets (OCR gratuit, https://ocr.space/ocrapi) | non — défaut « helloworld » |
| `MINDEE_API_KEY` | lecture automatique des tickets, moteur payant plus fiable (prioritaire si défini) | non |
| `GOOGLE_PLACES_API_KEY` / `GOOGLE_PLACE_ID` | avis Google sur la vitrine | non |
| `ANTHROPIC_API_KEY` | studio d'emails IA | non |

## Reliquats — à supprimer, pas à documenter

`SNIPCART_SECRET_KEY`, `ADMIN_TEST_EMAILS`, `VERCEL_OIDC_TOKEN` :
héritage de l'ancienne pile. Aucun rôle dans une instance neuve.

## Règles

- **Jamais de valeur par défaut de marque dans le code** — une variable
  absente doit produire un vide visible, pas la marque d'un autre
  (garde-fou : `node scripts/audit-marque.js`).
- Les webhooks Stripe/Resend se créent PAR instance : l'URL contient le
  domaine de l'instance, le secret retourné va dans ses env.
- Rotation : changer un secret généré = le reposer sur Vercel et
  redéployer. Aucun n'est stocké ailleurs que dans les env Vercel.
