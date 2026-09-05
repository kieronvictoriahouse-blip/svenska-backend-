import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listInstitutions } from '@/lib/finance/gocardless';
import { activeProvider } from '@/lib/finance/provider';

export const dynamic = 'force-dynamic';

// GET ?country=fr — picker de banques.
//   Bridge : pas de picker (sa page Connect gère le choix) → pickerExternal.
//   GoCardless : liste des banques.
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const provider = activeProvider();

  if (provider === 'bridge') return NextResponse.json({ configured: true, provider, pickerExternal: true, institutions: [] });
  if (provider === 'none') return NextResponse.json({ configured: false, provider, institutions: [] });

  const country = req.nextUrl.searchParams.get('country') || 'fr';
  try {
    const list = await listInstitutions(country);
    return NextResponse.json({ configured: true, provider, institutions: list.map(i => ({ id: i.id, name: i.name, logo: i.logo, days: i.transaction_total_days })) });
  } catch (e: any) {
    return NextResponse.json({ configured: true, provider, institutions: [], error: e.message }, { status: 502 });
  }
}
