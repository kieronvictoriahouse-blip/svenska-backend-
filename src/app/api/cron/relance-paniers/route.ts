import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { envoyerRelance, heuresCalmes } from '@/lib/relance-panier';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* ═══════════════════════════════════════════════════════════════
   RELANCE DES PANIERS — PASSAGE QUOTIDIEN (vercel.json : 8 h UTC,
   soit 9 h l'hiver et 10 h l'été à Paris)

   · Relances 1 en attente : celles que le webhook d'expiration Stripe
     a reportées (expiration entre 20 h et 8 h) ou manquées.
   · Relance 2 : paniers dont la relance 1 est partie il y a plus de
     12 h. Avec un seul passage par jour, l'ancien seuil de 18 h
     repoussait au surlendemain toute relance 1 partie après ~16 h ;
     12 h laisse partir la 2e le lendemain matin, quelle que soit
     l'heure de la 1re (au plus tard 20 h), sans jamais l'envoyer le
     même matin qu'elle.

   Toutes les règles (désinscrit, a commandé depuis, panier plus
   récent, double envoi) vivent dans envoyerRelance — ce passage ne
   fait que choisir les candidats.
   ═══════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  /* Vercel appelle ce chemin en GET, avec « Authorization: Bearer
     <CRON_SECRET> » — seulement si CRON_SECRET existe dans les variables
     d'environnement de PRODUCTION du projet. Chaque refus est écrit dans
     les logs : c'est la seule trace visible côté Vercel. */
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    console.error('[cron/relance-paniers] CRON_SECRET absent de l’environnement : passage refusé');
    return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 });
  }
  const recu = (req.headers.get('authorization') || '').trim();
  if (recu !== `Bearer ${cronSecret}`) {
    console.error('[cron/relance-paniers] refusé : en-tête Authorization',
      recu ? 'différent de CRON_SECRET' : 'absent', '— user-agent', req.headers.get('user-agent') || '?');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Un lancement à la main en soirée n'envoie rien : mêmes heures que le webhook.
  if (heuresCalmes()) {
    console.log('[cron/relance-paniers] heures calmes (20 h – 8 h, Paris) : rien envoyé');
    return NextResponse.json({ ok: true, journal: ['heures calmes : rien envoyé'] });
  }

  const now = Date.now();
  const iso = (h: number) => new Date(now - h * 3600_000).toISOString();
  const journal: string[] = [];
  let erreurs = 0;

  // Relances 1 en attente : brouillons de 3 h à 48 h, jamais relancés.
  const { data: r1, error: e1 } = await supabaseAdmin
    .from('orders').select('id')
    .in('status', ['pending', 'abandoned'])
    .not('recovery_token', 'is', null).not('customer_email', 'is', null)
    .is('recovery_1_sent_at', null).is('recovery_skip_reason', null)
    .lt('created_at', iso(3)).gt('created_at', iso(48))
    .limit(100);
  if (e1) { erreurs++; journal.push(`R1 : lecture impossible (${e1.message})`); }
  for (const o of r1 || []) journal.push(`R1 ${o.id} : ${(await envoyerRelance(o.id, 1)).raison}`);

  // Relance 2 : relance 1 partie depuis plus de 12 h, panier de moins de 7 jours.
  const { data: r2, error: e2 } = await supabaseAdmin
    .from('orders').select('id')
    .in('status', ['pending', 'abandoned'])
    .not('recovery_1_sent_at', 'is', null).lt('recovery_1_sent_at', iso(12))
    .is('recovery_2_sent_at', null).is('recovered_at', null).is('recovery_skip_reason', null)
    .gt('created_at', iso(168))
    .limit(100);
  if (e2) { erreurs++; journal.push(`R2 : lecture impossible (${e2.message})`); }
  for (const o of r2 || []) journal.push(`R2 ${o.id} : ${(await envoyerRelance(o.id, 2)).raison}`);

  // Le journal part dans les logs Vercel : la réponse d'un cron, personne ne la lit.
  if (erreurs) console.error('[cron/relance-paniers]', journal);
  else console.log('[cron/relance-paniers]', journal.length ? journal : ['aucun panier à relancer']);
  return NextResponse.json({ ok: !erreurs, journal }, { status: erreurs ? 500 : 200 });
}
