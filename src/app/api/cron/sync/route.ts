import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// Cron quotidien : filet de sécurité si un webhook Stripe a été manqué.
// 1) réconcilie les commandes payées + marque les paniers abandonnés,
// 2) synchronise la comptabilité (recettes/achats manquants).
// Idempotent (les doublons sont bloqués en base).
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  // Vercel Cron envoie automatiquement "Authorization: Bearer $CRON_SECRET"
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré — définir la variable dans Vercel' }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://admin.swedishcravings.fr';
  const headers = { 'Content-Type': 'application/json', authorization: `Bearer ${cronSecret}` };

  const call = async (path: string) => {
    try {
      const res = await fetch(`${base}${path}`, { method: 'POST', headers });
      return await res.json();
    } catch (e: any) {
      return { error: e?.message || String(e) };
    }
  };

  const reconcile = await call('/api/admin/reconcile-orders');
  const accounting = await call('/api/accounting/sync');

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), reconcile, accounting });
}
