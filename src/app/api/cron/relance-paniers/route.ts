import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { envoyerRelance } from '@/lib/relance-panier';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* ═══════════════════════════════════════════════════════════════
   RELANCE DES PANIERS — PASSAGE QUOTIDIEN (10 h, heure de Paris)

   · Relance 2 : paniers dont la relance 1 est partie il y a plus de
     18 h — le lendemain matin, donc.
   · Filet de la relance 1 : le webhook d'expiration Stripe l'envoie
     normalement à +3 h ; s'il a été manqué, elle part ici.

   Toutes les règles (désinscrit, a commandé depuis, panier plus
   récent, double envoi) vivent dans envoyerRelance — ce passage ne
   fait que choisir les candidats.
   ═══════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const iso = (h: number) => new Date(now - h * 3600_000).toISOString();
  const journal: string[] = [];

  // Filet relance 1 : brouillons de 3 h à 48 h, jamais relancés.
  const { data: r1 } = await supabaseAdmin
    .from('orders').select('id')
    .in('status', ['pending', 'abandoned'])
    .not('recovery_token', 'is', null).not('customer_email', 'is', null)
    .is('recovery_1_sent_at', null).is('recovery_skip_reason', null)
    .lt('created_at', iso(3)).gt('created_at', iso(48))
    .limit(100);
  for (const o of r1 || []) journal.push(`R1 ${o.id} : ${(await envoyerRelance(o.id, 1)).raison}`);

  // Relance 2 : relance 1 partie depuis plus de 18 h, panier de moins de 7 jours.
  const { data: r2 } = await supabaseAdmin
    .from('orders').select('id')
    .in('status', ['pending', 'abandoned'])
    .not('recovery_1_sent_at', 'is', null).lt('recovery_1_sent_at', iso(18))
    .is('recovery_2_sent_at', null).is('recovered_at', null).is('recovery_skip_reason', null)
    .gt('created_at', iso(168))
    .limit(100);
  for (const o of r2 || []) journal.push(`R2 ${o.id} : ${(await envoyerRelance(o.id, 2)).raison}`);

  return NextResponse.json({ ok: true, journal });
}
