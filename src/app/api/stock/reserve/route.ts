import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { quantitesReservees } from '@/lib/reserve';

export const dynamic = 'force-dynamic';

/* Quantités dues aux commandes payées non expédiées, par produit.
   Route séparée de /api/products : ce calcul ne sert qu'aux écrans de
   stock, et /api/products est chargé par presque tout le back-office. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  return NextResponse.json({ reserve: await quantitesReservees() });
}
