import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* ═══════════════════════════════════════════════════════════════
   PAIEMENTS — brancher le compte Stripe du marchand (Vendd)

   La boutique encaisse sur SON compte Stripe. La clé vit dans les
   variables Vercel de l'instance ; le marchand n'y a pas accès, donc :

     1. il colle sa clé secrète ici ;
     2. on la VÉRIFIE auprès de Stripe (compte réel, encaissement actif) ;
     3. on crée le webhook sur SON compte, vers cette boutique (on
        remplace l'ancien s'il existe : pas de doublon à la relance) ;
     4. on transmet clé + secret du webhook à l'usine Vendd, qui les
        pose sur le projet Vercel de l'instance et redéploie.

   Aucune clé n'est stockée en base, ni ici ni dans l'usine.

   Une boutique qui n'est pas gérée par l'usine (Swedish Cravings, par
   exemple : ni VENDD_CP_URL ni VENDD_INSTANCE_ID) refuse tout
   changement — ses clés se règlent à la main dans Vercel. On ne crée
   donc jamais un webhook qu'on ne pourrait pas brancher.
   ═══════════════════════════════════════════════════════════════ */

const API_VERSION = '2026-04-22.dahlia' as any;
const EVENEMENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'checkout.session.expired',
];

const geree = () => !!(process.env.VENDD_CP_URL && process.env.VENDD_INSTANCE_ID && process.env.CRON_SECRET);
const urlBoutique = (req: NextRequest) =>
  (process.env.NEXT_PUBLIC_BACKEND_URL || new URL(req.url).origin).replace(/\/$/, '');
const modeDe = (cle: string) => (cle.includes('_live_') ? 'live' : cle.includes('_test_') ? 'test' : null);

async function decrireCompte(cle: string) {
  /* Appel REST direct (GET /v1/account = le compte de la clé) : la
     signature de accounts.retrieve() change selon les versions du SDK. */
  const r = await fetch('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${cle}` } });
  const a: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(a?.error?.message || `Stripe ${r.status}`);
  return {
    id: a.id,
    nom: a.settings?.dashboard?.display_name || a.business_profile?.name || a.email || a.id,
    pays: a.country || null,
    encaissement_actif: !!a.charges_enabled,
    versements_actifs: !!a.payouts_enabled,
  };
}

/* ── État actuel ─────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const cle = process.env.STRIPE_SECRET_KEY || '';
  let compte: any = null;
  let erreur: string | null = null;
  if (cle) {
    try { compte = await decrireCompte(cle); }
    catch (e: any) { erreur = e?.message || 'Clé refusée par Stripe'; }
  }
  return NextResponse.json({
    branche: !!cle,
    mode: modeDe(cle),
    webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
    compte,
    erreur,
    geree_par_vendd: geree(),
    url_webhook: `${urlBoutique(req)}/api/webhook/stripe`,
  });
}

/* ── Brancher / remplacer la clé ─────────────────────────────── */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  if (!geree()) {
    return NextResponse.json({
      error: 'Cette boutique n’est pas gérée par l’usine Vendd : ses clés Stripe se règlent dans les variables Vercel.',
    }, { status: 409 });
  }

  const { secret_key } = await req.json().catch(() => ({} as any));
  const cle = String(secret_key || '').trim();
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.test(cle)) {
    return NextResponse.json({ error: 'Ce n’est pas une clé secrète Stripe (elle commence par sk_live_ ou sk_test_).' }, { status: 400 });
  }

  /* 1. La clé ouvre-t-elle vraiment un compte ? */
  let compte;
  try { compte = await decrireCompte(cle); }
  catch (e: any) {
    return NextResponse.json({ error: 'Stripe refuse cette clé : ' + (e?.message || 'clé invalide') }, { status: 400 });
  }

  /* 2. Le webhook, sur SON compte, vers CETTE boutique. */
  const stripe = new Stripe(cle, { apiVersion: API_VERSION });
  const url = `${urlBoutique(req)}/api/webhook/stripe`;
  let whsec: string;
  try {
    const existants = await stripe.webhookEndpoints.list({ limit: 100 });
    for (const w of existants.data) if (w.url === url) await stripe.webhookEndpoints.del(w.id);
    const cree = await stripe.webhookEndpoints.create({
      url,
      enabled_events: EVENEMENTS,
      description: `Vendd — ${process.env.VENDD_INSTANCE_ID}`,
      metadata: { vendd_instance: String(process.env.VENDD_INSTANCE_ID) },
    });
    whsec = cree.secret || '';
    if (!whsec) throw new Error('Stripe n’a pas renvoyé le secret du webhook');
  } catch (e: any) {
    return NextResponse.json({
      error: 'Création du webhook impossible : ' + (e?.message || 'erreur Stripe')
        + ' (une clé restreinte doit avoir le droit « Webhook Endpoints : écriture »).',
    }, { status: 400 });
  }

  /* 3. L'usine pose les variables et redéploie. */
  const r = await fetch(`${process.env.VENDD_CP_URL!.replace(/\/$/, '')}/api/instances/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ instance: process.env.VENDD_INSTANCE_ID, secret_key: cle, webhook_secret: whsec }),
  }).catch(() => null);
  if (!r || !r.ok) {
    const detail = r ? (await r.json().catch(() => ({}))).error : 'usine injoignable';
    return NextResponse.json({ error: 'L’usine Vendd n’a pas pu enregistrer la clé : ' + (detail || r?.status) }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    mode: modeDe(cle),
    compte,
    message: 'Clé vérifiée et enregistrée. La boutique redémarre avec vos paiements : comptez 1 à 2 minutes.',
  });
}
