#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   setup-vendd.js — la config plateforme Vendd, en UNE commande.

   Tu remplis controlplane/.env.local avec tes jetons (voir la liste plus
   bas), puis :

       node setup-vendd.js --dry     # simulation : montre ce qui serait fait
       node setup-vendd.js           # pour de vrai

   Ce que le script fait à ta place (idempotent, rejouable) :
     1. Stripe  : produit « Vendd » + prix 39 €/mois + webhook (4 events)
     2. Vercel  : projet control-plane (Root=controlplane) lié au dépôt moteur
     3. Vercel  : pose TOUTES les variables d'environnement du control-plane
     4. Vercel  : déclenche le premier déploiement
     5. Domaine : rattache app.vendd.fr au projet et affiche les DNS à poser

   Il ne te reste QUE les 3 gestes vraiment manuels (générer les jetons,
   activer Stripe, pointer le DNS). Les secrets ne transitent jamais par
   ailleurs que ton .env.local et l'API Vercel/Stripe.

   ── À mettre dans controlplane/.env.local ──
     STRIPE_SECRET_KEY=sk_live_...        (ou sk_test_ pour répéter)
     VERCEL_TOKEN=...
     VERCEL_TEAM_ID=                      (vide si compte perso)
     CP_SUPABASE_URL=https://dafddrjgvhymdoybxvjr.supabase.co
     CP_SUPABASE_KEY=...                  (service_role de la base CP)
     SUPABASE_MGMT_TOKEN=sbp_...
     SUPABASE_ORG_ID=...
     RESEND_API_KEY=re_...                (optionnel — email de bienvenue)
     RESEND_FROM=Vendd <bonjour@vendd.fr> (optionnel)
   Optionnel (des défauts sont posés) :
     CP_URL=https://app.vendd.fr · TENANT_DOMAIN=vendd.fr
     MOTEUR_GITHUB_REPO=kieronvictoriahouse-blip/svenska-backend-
     CP_ADMIN_KEY / CP_CRON_SECRET / CRON_SECRET (générés si absents)
     CP_PROJECT_NAME=vendd-controlplane · PRICE_AMOUNT=3900 · PRICE_CURRENCY=eur
   ═══════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { appeler, activerDry } = require('./lib/transport');
const vercelApi = require('./lib/api-vercel');

const DRY = process.argv.includes('--dry');
if (DRY) activerDry();

/* ── Chargement de .env.local (sans dépendance) ──────────────────── */
(function chargerEnv() {
  const f = path.join(__dirname, '.env.local');
  if (!fs.existsSync(f)) return;
  for (const ligne of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    // Coupe un commentaire en fin de ligne (« ... # ... »), sauf si la valeur est entre guillemets.
    if (!/^["']/.test(val)) val = val.replace(/\s+#.*$/, '');
    val = val.trim().replace(/^["']|["']$/g, '');
    if (val !== '' && process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
})();

const gen = (n) => crypto.randomBytes(n).toString('base64url');
const need = (k) => {
  const v = process.env[k];
  if (!v) {
    if (DRY) return `<${k}>`;   // en dry, on tolère l'absence pour valider le flux
    console.error(`\n✗ Variable manquante : ${k} — ajoute-la dans controlplane/.env.local\n`); process.exit(1);
  }
  return v;
};

/* Défauts + secrets générés si absents. */
process.env.CP_URL = process.env.CP_URL || 'https://app.vendd.fr';
process.env.TENANT_DOMAIN = process.env.TENANT_DOMAIN || 'vendd.fr';
process.env.MOTEUR_GITHUB_REPO = process.env.MOTEUR_GITHUB_REPO || 'kieronvictoriahouse-blip/svenska-backend-';
process.env.CP_ADMIN_KEY = process.env.CP_ADMIN_KEY || gen(32);
process.env.CP_CRON_SECRET = process.env.CP_CRON_SECRET || gen(24);
process.env.CRON_SECRET = process.env.CRON_SECRET || gen(24);

const PROJECT = process.env.CP_PROJECT_NAME || 'vendd-controlplane';
const AMOUNT = Number(process.env.PRICE_AMOUNT || 3900);
const CURRENCY = (process.env.PRICE_CURRENCY || 'eur').toLowerCase();
const APP_DOMAIN = new URL(process.env.CP_URL).host;   // app.vendd.fr
const WEBHOOK_EVENTS = ['checkout.session.completed', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted'];
const team = () => (process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '');
const vh = () => ({ Authorization: 'Bearer ' + process.env.VERCEL_TOKEN });

/* ── 1-2-3. Stripe : produit + prix + webhook ────────────────────── */
async function stripeSetup() {
  if (DRY) { console.log('  [dry] Stripe : produit « Vendd » + prix 39 €/mois + webhook'); return { priceId: 'price_dry', webhookSecret: 'whsec_dry', existant: false }; }
  const Stripe = require('stripe');
  const stripe = new Stripe(need('STRIPE_SECRET_KEY'));

  /* Si STRIPE_PRICE_ID est déjà fourni (prix créé à la main), on le réutilise
     — pas de création, donc pas de doublon. Sinon on crée produit + prix. */
  let priceId = process.env.STRIPE_PRICE_ID || null;
  if (priceId) {
    console.log(`  Stripe · prix fourni ${priceId} (réutilisé)`);
  } else {
    let product = null;
    try { const s = await stripe.products.search({ query: "metadata['app']:'vendd'" }); product = s.data[0] || null; } catch { /* search indispo → on créera */ }
    if (!product) product = await stripe.products.create({ name: 'Vendd', description: 'Abonnement Vendd — la back-boutique des indépendants', metadata: { app: 'vendd' } });
    console.log(`  Stripe · produit ${product.id}`);
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    let price = prices.data.find(p => p.unit_amount === AMOUNT && p.currency === CURRENCY && p.recurring && p.recurring.interval === 'month');
    if (!price) price = await stripe.prices.create({ product: product.id, unit_amount: AMOUNT, currency: CURRENCY, recurring: { interval: 'month' } });
    priceId = price.id;
    console.log(`  Stripe · prix ${priceId} (${(AMOUNT / 100).toFixed(2)} ${CURRENCY.toUpperCase()}/mois)`);
  }

  const url = `${process.env.CP_URL}/api/stripe/webhook`;
  const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
  let hook = hooks.data.find(h => h.url === url);
  let webhookSecret = null, existant = false;
  if (!hook) { hook = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS }); webhookSecret = hook.secret; console.log(`  Stripe · webhook ${hook.id} créé`); }
  else { existant = true; console.log(`  Stripe · webhook ${hook.id} déjà présent (secret non relisible via API)`); }

  return { priceId, webhookSecret, existant };
}

/* ── 4-5. Vercel : projet + env + déploiement + domaine ──────────── */
async function vercelSetup(env) {
  if (DRY) { console.log('  [dry] Vercel : projet + env + déploiement + domaine'); return { projectId: 'prj_dry' }; }

  let project = null;
  const create = await appeler('POST', `https://api.vercel.com/v11/projects${team()}`, {
    headers: vh(),
    corps: { name: PROJECT, framework: 'nextjs', gitRepository: { type: 'github', repo: process.env.MOTEUR_GITHUB_REPO }, rootDirectory: 'controlplane' },
  });
  if (create.ok) { project = await create.json(); console.log(`  Vercel · projet ${project.name} créé`); }
  else {
    const txt = await create.text();
    if (create.status === 409 || /already exists|conflict/i.test(txt)) {
      const g = await appeler('GET', `https://api.vercel.com/v9/projects/${PROJECT}${team()}`, { headers: vh() });
      if (!g.ok) throw new Error('projet existant mais illisible : ' + await g.text());
      project = await g.json(); console.log(`  Vercel · projet ${project.name} déjà présent`);
    } else throw new Error('création projet Vercel : ' + txt);
  }

  await vercelApi.poserEnv(project.id, env);
  console.log(`  Vercel · ${Object.keys(env).length} variables posées`);

  let deploiement = null;
  try { deploiement = await vercelApi.deployer(project.id, PROJECT); console.log(`  Vercel · déploiement lancé`); }
  catch (e) { console.log(`  ⚠ Déploiement non lancé : ${e.message}\n     → connecte le dépôt GitHub au projet dans le dashboard Vercel, puis relance.`); }

  let dns = null;
  try {
    const d = await appeler('POST', `https://api.vercel.com/v10/projects/${project.id}/domains${team()}`, { headers: vh(), corps: { name: APP_DOMAIN } });
    if (d.ok) { dns = await d.json(); console.log(`  Vercel · domaine ${APP_DOMAIN} rattaché`); }
    else { const t = await d.text(); if (!/already/i.test(t)) console.log(`  ⚠ Domaine ${APP_DOMAIN} : ${t}`); else console.log(`  Vercel · domaine ${APP_DOMAIN} déjà rattaché`); }
  } catch (e) { console.log(`  ⚠ Domaine : ${e.message}`); }

  return { projectId: project.id, deploiement, dns };
}

/* ── Orchestration ───────────────────────────────────────────────── */
(async () => {
  console.log(DRY ? '\n═══ setup-vendd — MODE DRY (aucun appel réel) ═══\n' : '\n═══ setup-vendd — configuration de la plateforme ═══\n');

  const stripe = await stripeSetup();
  if (stripe.webhookSecret) process.env.STRIPE_WEBHOOK_SECRET = stripe.webhookSecret;

  const env = {
    CP_SUPABASE_URL: need('CP_SUPABASE_URL'),
    CP_SUPABASE_KEY: need('CP_SUPABASE_KEY'),
    SUPABASE_MGMT_TOKEN: need('SUPABASE_MGMT_TOKEN'),
    SUPABASE_ORG_ID: need('SUPABASE_ORG_ID'),
    VERCEL_TOKEN: need('VERCEL_TOKEN'),
    VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID || '',
    MOTEUR_GITHUB_REPO: process.env.MOTEUR_GITHUB_REPO,
    STRIPE_SECRET_KEY: need('STRIPE_SECRET_KEY'),
    STRIPE_PRICE_ID: stripe.priceId,
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    RESEND_FROM: process.env.RESEND_FROM || '',
    CP_URL: process.env.CP_URL,
    TENANT_DOMAIN: process.env.TENANT_DOMAIN,
    CP_ADMIN_KEY: process.env.CP_ADMIN_KEY,
    CP_CRON_SECRET: process.env.CP_CRON_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  };
  /* Le secret du webhook : posé seulement si on l'a (webhook fraîchement créé). */
  if (process.env.STRIPE_WEBHOOK_SECRET) env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  const vercel = await vercelSetup(env);

  /* ── Résumé + gestes manuels restants ──────────────────────────── */
  console.log('\n─────────────── RÉSUMÉ ───────────────');
  console.log(`Prix Stripe   : ${stripe.priceId}`);
  console.log(`Control-plane : ${process.env.CP_URL}  (projet Vercel « ${PROJECT} », Root=controlplane)`);
  console.log(`Secrets générés (garde-les) :`);
  console.log(`  CP_ADMIN_KEY=${process.env.CP_ADMIN_KEY}`);
  console.log(`  CP_CRON_SECRET=${process.env.CP_CRON_SECRET}`);
  console.log(`  CRON_SECRET=${process.env.CRON_SECRET}`);
  console.log('\n─────────── IL TE RESTE (manuel) ───────────');
  if (stripe.existant) console.log(`• Webhook Stripe déjà existant : récupère son « Signing secret » (whsec_…) dans Stripe → Developers → Webhooks, et pose STRIPE_WEBHOOK_SECRET dans les env Vercel du projet ${PROJECT}. (Ou supprime-le et relance ce script pour en générer un neuf.)`);
  console.log(`• DNS : chez ton registrar / Vercel, pointe`);
  console.log(`    ${APP_DOMAIN}   → CNAME cname.vercel-dns.com   (le control-plane)`);
  console.log(`    *.${process.env.TENANT_DOMAIN} → CNAME cname.vercel-dns.com   (les boutiques clientes)`);
  console.log(`• Stripe : si le compte Valkode n'est pas encore ACTIVÉ (business/identité/banque), fais-le — sinon les paiements réels sont bloqués.`);
  if (!process.env.RESEND_API_KEY) console.log(`• Resend : sans RESEND_API_KEY, l'email de bienvenue est journalisé (bienvenue_a_envoyer) au lieu d'être envoyé — à brancher quand tu veux.`);
  console.log('\n✓ Terminé. Va sur ' + process.env.CP_URL + ' pour tester une inscription.\n');
})().catch(e => { console.error('\n✗ Échec :', e.message, '\n'); process.exit(1); });
