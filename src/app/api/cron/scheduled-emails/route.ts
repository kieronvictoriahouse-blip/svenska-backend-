import { NextRequest, NextResponse } from 'next/server';
import { viderFileProgrammee } from '@/lib/mail-send';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* ═══════════════════════════════════════════════════════════════
   ENVOIS PROGRAMMÉS

   Garde anti-double-envoi : chaque ligne passe par « sending » avant
   d'être expédiée, et la prise n'aboutit que si elle était encore
   « pending ». Deux exécutions qui se chevauchent ne peuvent donc pas
   envoyer le même message deux fois — même précaution que sur les
   déductions de stock, et pour la même raison : ce qui est parti chez
   un client ne se rattrape pas.
   ═══════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 });

  const r = await viderFileProgrammee();

  return NextResponse.json({ ok: !r.echecs.length, ...r });
}
