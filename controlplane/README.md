# Control plane Shopflow

L'usine a instances : inscription -> Stripe Billing -> provisionnement
automatique (Supabase Management API + Vercel API) -> supervision.
Vit dans le depot du moteur (`controlplane/`) pour lire `install/` et
`supabase/migrations/` a la version du commit deploye.

## Demarrer en local

    npm install
    cp .env.example .env.local     # remplir CP_SUPABASE_* au minimum
    npm run dev                    # http://localhost:3400

Sans STRIPE_SECRET_KEY : l'inscription met l'instance en file
directement (mode developpement). Sans SUPABASE_MGMT_TOKEN : le tick
echoue proprement a l'etape « base_creee » et l'erreur s'affiche dans
/flotte — c'est le comportement attendu tant que les jetons ne sont pas
poses.

## Tester le pipeline sans toucher aux API

    node provisionner.js --dry --nom "Fromagerie Dupont" \
      --email jean@dupont.fr --sous-domaine fromagerie-dupont

Deroule les 7 etats et liste les 13 appels HTTP qui auraient ete emis.

## Deployer

Projet Vercel separe sur CE depot, Root Directory = `controlplane`.
Le cron (vercel.json) bat toutes les minutes sur /api/tick.

## Ce que Kieron doit creer (une fois)

1. Base du control plane : un projet Supabase + coller cp-schema.sql
   (en dev : les tables cp_ peuvent cohabiter sur le cobaye).
2. SUPABASE_MGMT_TOKEN : supabase.com -> Account -> Access Tokens.
3. SUPABASE_ORG_ID : Dashboard -> Organization -> settings.
4. VERCEL_TOKEN : vercel.com -> Settings -> Tokens.
5. Stripe : produit « Shopflow » + prix mensuel -> STRIPE_PRICE_ID,
   webhook vers /api/stripe/webhook -> STRIPE_WEBHOOK_SECRET.
6. Domaine shopflow.fr (et wildcard *.shopflow.fr sur Vercel).
