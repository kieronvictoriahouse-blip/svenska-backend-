import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// Cron quotidien : tire les nouvelles opérations bancaires (GoCardless) et
// met à jour les soldes, pour que « les lignes arrivent toutes seules chaque matin ».
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  try {
    const res = await fetch(`${base}/api/accounting/bank/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), bank: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 502 });
  }
}
