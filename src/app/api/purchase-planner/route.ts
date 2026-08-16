import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { donneesReappro } from '@/lib/reappro';

export const dynamic = 'force-dynamic';

/* L'assemblage est dans @/lib/reappro : Next.js interdit les exports
   autres que les handlers dans un fichier de route, et sortir la
   fonction la rend vérifiable sans ouvrir de session. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  return NextResponse.json(await donneesReappro());
}
