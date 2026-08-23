import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { facturXDe } from '@/lib/facturx';

export const dynamic = 'force-dynamic';

/* Le XML CII seul (EN 16931), sans le PDF.
   Le PDF téléchargé embarque déjà ce XML — cette route sert quand une
   plateforme ou un client demande le format structuré nu, et elle rend
   le contenu contrôlable à l'œil ou par un validateur externe. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const fx = await facturXDe(params.id);
  if (!fx) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });

  return new NextResponse(fx.xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fx.filename}"`,
    },
  });
}
