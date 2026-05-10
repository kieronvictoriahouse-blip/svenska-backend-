import { NextRequest, NextResponse } from 'next/server';
import { getWhiteLabelConfig, promoTemplate } from '@/lib/email-send';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { products, subject, intro } = await req.json();
  if (!products || products.length === 0) {
    return NextResponse.json({ error: 'Aucun produit fourni' }, { status: 400 });
  }
  const cfg = await getWhiteLabelConfig();
  const { html } = promoTemplate(products, cfg, { subject, intro });
  return NextResponse.json({ html });
}
