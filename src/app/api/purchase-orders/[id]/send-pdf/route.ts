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
    /* Le fichier s'appelle « bon-de-commande-<numéro>-<langue>.pdf » : le
       préfixe retiré ici était l'ancien, et l'objet du mail partait en
       « Purchase Order bon-de-commande-ACH-0007 ». */
    const orderNum = filename.replace(/^(bon-de-commande|purchase-order)-/, '').replace(`-${lang}.pdf`, '');
    const subject = lang === 'sv'
      ? `Inköpsorder ${orderNum}`
      : `Purchase Order ${orderNum}`;
    const body = lang === 'sv'
      ? `<p>Vänligen se bifogad inköpsorder.</p><p>Med vänlig hälsning,<br>${(cfg as any).site_name || ''}</p>`
      : `<p>Please find the purchase order attached.</p><p>Best regards,<br>${(cfg as any).site_name || ''}</p>`;

    await sendEmail({ from, to: email, subject, html: body, attachments: [{ filename, content: buffer }] }, cfg);
    /* Un brouillon envoyé au magasin n'est plus un brouillon : sans ça il
       restait « Brouillon » et n'apparaissait pas comme en cours. Les
       autres statuts ne bougent pas (un renvoi ne rouvre rien). */
    const { supabaseAdmin } = await import('@/lib/supabase');
    await supabaseAdmin.from('purchase_orders')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', params.id).eq('status', 'draft');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
