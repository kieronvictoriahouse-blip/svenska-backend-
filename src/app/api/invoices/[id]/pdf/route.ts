import { NextRequest, NextResponse } from 'next/server';
import { generateInvoicePdf } from '@/lib/invoice-pdf';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
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
