import { NextRequest, NextResponse } from 'next/server';
import { rafraichirVelocites } from '@/lib/velocity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* Recalcul nocturne de la velocite. Le handoff le demande explicitement :
   ne pas la calculer a la volee sur tout le catalogue a chaque ouverture
   de l'ecran d'achat. */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 });

  try {
    const r = await rafraichirVelocites();
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Calcul impossible' }, { status: 500 });
  }
}
