import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generatePurchaseOrderPdf, PdfLang } from '@/lib/purchase-order-pdf';
import { sendEmail, getWhiteLabelConfig } from '@/lib/email-send';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { email, lang = 'en' } = await req.json() as { email: string; lang?: PdfLang };
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });

  try {
    const { buffer, filename } = await generatePurchaseOrderPdf(params.id, lang);
    const cfg = await getWhiteLabelConfig();
    const from = (cfg.email_from as string) || (cfg as any).smtp_from || '';
    const orderNum = filename.replace('purchase-order-', '').replace(`-${lang}.pdf`, '');
    const subject = lang === 'sv'
      ? `Inköpsorder ${orderNum}`
      : `Purchase Order ${orderNum}`;
    const body = lang === 'sv'
      ? `<p>Vänligen se bifogad inköpsorder.</p><p>Med vänlig hälsning,<br>${(cfg as any).site_name || ''}</p>`
      : `<p>Please find the purchase order attached.</p><p>Best regards,<br>${(cfg as any).site_name || ''}</p>`;

    await sendEmail({ from, to: email, subject, html: body, attachments: [{ filename, content: buffer }] }, cfg);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
