import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { etatSeuilUe, ventesDistanceUe } from '@/lib/seuil-ue';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   SEUIL EUROPÉEN DE VENTE À DISTANCE (10 000 €) — lecture seule

   Ventes B2C livrées hors de France dans l'UE, toutes vitrines
   confondues (Swedish Cravings hors France + vitrine en couronnes),
   comptées en EUR. Au-delà du seuil, la TVA du pays d'arrivée
   s'applique : c'est un garde-fou de pilotage, pas la source légale.

   GET /api/accounting/seuil-ue?annee=2026
     → { etat, detail }
   ═══════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const brut = req.nextUrl.searchParams.get('annee');
  const annee = brut && /^\d{4}$/.test(brut) ? Number(brut) : new Date().getFullYear();
  try {
    return NextResponse.json({ etat: await etatSeuilUe(), detail: await ventesDistanceUe(annee) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Calcul du seuil impossible' }, { status: 500 });
  }
}
