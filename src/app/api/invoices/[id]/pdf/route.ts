import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generateInvoicePdf } from '@/lib/invoice-pdf';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Une facture porte le nom, l'adresse et les montants du client :
  // elle ne doit jamais etre lisible par simple identifiant.
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const { buffer, filename } = await generateInvoicePdf(params.id);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('[invoice-pdf]', e);
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}
