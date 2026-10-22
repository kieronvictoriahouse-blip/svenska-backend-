import { NextRequest, NextResponse } from 'next/server';
import { validerParrainages } from '@/lib/fidelite';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* ═══════════════════════════════════════════════════════════════
   PARRAINAGES — PASSAGE QUOTIDIEN (9 h, heure de Paris)

   Un parrainage attend 14 jours avant d'être validé : le temps qu'une
   commande annulée ou remboursée le fasse tomber. Validé, il porte le
   code fidélité du parrain à −10 % pour 12 mois et lui envoie un
   email. Toutes les règles sont dans @/lib/fidelite.
   ═══════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const journal = await validerParrainages();
  return NextResponse.json({ ok: true, journal });
}
