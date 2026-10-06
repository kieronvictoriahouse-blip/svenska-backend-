import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { cp, depot } from '../../../../lib/cp-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* ═══════════════════════════════════════════════════════════════
   BRANCHER LE STRIPE D'UN MARCHAND

   Chaque boutique encaisse sur SON compte Stripe (Vendd n'encaisse que
   ses abonnements — jamais d'agrégation de paiements). La clé vit dans
   les variables Vercel de l'instance, mais le marchand n'a pas accès à
   Vercel : c'est sa boutique qui nous l'apporte.

   Appelant : la boutique elle-même (Réglages → Paiements), après avoir
   vérifié la clé auprès de Stripe et créé son webhook.
   Authentification : Bearer = CRON_SECRET de l'instance, que l'usine a
   généré au provisionnement et garde (cp_instances.cron_secret).

   On pose STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET sur le projet Vercel
   de cette instance, puis on redéploie (les variables ne sont lues qu'au
   démarrage). AUCUNE clé n'est stockée ici, ni journalisée : seul le
   mode (test / live) l'est.
   ═══════════════════════════════════════════════════════════════ */

const egal = (a: string, b: string) => {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => ({} as any));
  const sousDomaine = String(corps.instance || '').toLowerCase();
  const cle = String(corps.secret_key || '');
  const whsec = String(corps.webhook_secret || '');

  if (!/^[a-z0-9-]{2,63}$/.test(sousDomaine)) {
    return NextResponse.json({ error: 'Instance invalide' }, { status: 400 });
  }
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.test(cle) || !/^whsec_[A-Za-z0-9]{10,}$/.test(whsec)) {
    return NextResponse.json({ error: 'Clé Stripe ou secret de webhook mal formé' }, { status: 400 });
  }

  const { data: client } = await cp.from('cp_clients').select('id').eq('sous_domaine', sousDomaine).maybeSingle();
  const { data: instance } = client
    ? await cp.from('cp_instances').select('id, cron_secret, vercel_project_id, etape').eq('client_id', client.id).maybeSingle()
    : { data: null };

  /* Même réponse pour « instance inconnue » et « mauvais secret » : on
     ne confirme pas l'existence d'une boutique à qui ne prouve rien. */
  const jeton = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!instance || !instance.cron_secret || !egal(jeton, instance.cron_secret)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  if (instance.etape !== 'pret' || !instance.vercel_project_id) {
    return NextResponse.json({ error: 'Instance pas encore prête' }, { status: 409 });
  }

  const vercel = require('../../../../lib/api-vercel') as {
    poserEnv: (id: string, v: Record<string, string>) => Promise<unknown>;
    deployer: (id: string, nom: string) => Promise<unknown>;
  };
  try {
    await vercel.poserEnv(instance.vercel_project_id, { STRIPE_SECRET_KEY: cle, STRIPE_WEBHOOK_SECRET: whsec });
    await vercel.deployer(instance.vercel_project_id, `vendd-${sousDomaine}`);
  } catch (e: any) {
    /* Le message d'erreur Vercel ne contient pas la clé (elle n'est
       jamais dans l'URL), on peut le renvoyer tel quel. */
    return NextResponse.json({ error: 'Vercel : ' + (e?.message || 'échec') }, { status: 502 });
  }

  await depot().evenement(instance.id, 'stripe_branche', { mode: cle.includes('_live_') ? 'live' : 'test' });
  return NextResponse.json({ ok: true, redeploiement: true });
}
