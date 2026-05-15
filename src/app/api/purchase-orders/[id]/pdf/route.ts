import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generatePurchaseOrderPdf, PdfLang } from '@/lib/purchase-order-pdf';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const lang = (req.nextUrl.searchParams.get('lang') || 'en') as PdfLang;
  try {
    const { buffer, filename } = await generatePurchaseOrderPdf(params.id, lang);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
