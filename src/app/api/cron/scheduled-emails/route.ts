import { NextRequest, NextResponse } from 'next/server';
import { viderFileProgrammee } from '@/lib/mail-send';

export const dynamic = 'force-dynamic';
/* 300 s : chaque envoi (SMTP + copie dans les Envoyés, PDF joint) prend
   ~6 s ; à 120 s la fonction était coupée au 17e message d'une série de 20,
   laissant une ligne bloquée en « sending ». */
export const maxDuration = 300;

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
