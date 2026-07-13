import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { sendEmail } from '@/lib/email-send';
import { getWlConfig } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'svenska-internal-2024';

export async function POST(req: NextRequest) {
  const { order_id, secret } = await req.json();
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  if (!order_id) {
    return NextResponse.json({ error: 'order_id requis' }, { status: 400 });
  }

  try {
    const { data: inv } = await supabaseAdmin
      .from('invoices').select('*').eq('order_id', order_id).neq('status', 'avoir')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();

    if (!inv) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
    if (typeof inv.lines === 'string') inv.lines = JSON.parse(inv.lines);

    // Même générateur que le téléchargement admin → une seule facture, format légal complet
    const { buffer: pdfBuffer } = await generateInvoicePdf(inv.id);

    const cfg = await getWlConfig();
    const siteName  = cfg.site_name || 'Swedish Cravings';
    const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || 'onboarding@resend.dev';
    const toEmail   = inv.client_email;

    if (!toEmail) return NextResponse.json({ error: 'Email client manquant' }, { status: 400 });

    await sendEmail({
      from:    fromEmail,
      to:      toEmail,
      subject: `🧾 Votre facture ${inv.number} — ${siteName}`,
      html:    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Georgia,serif;background:#EDEAE4;margin:0;padding:40px 20px">
        <div style="max-width:500px;margin:0 auto;background:#FDFAF5;border-radius:8px;overflow:hidden">
          <div style="background:#1C2028;padding:24px 36px;text-align:center">
            <p style="color:#fff;font-size:18px;font-weight:300;letter-spacing:2px;text-transform:uppercase;margin:0">${siteName}</p>
          </div>
          <div style="padding:36px">
            <h1 style="font-size:22px;color:#1C2028;font-weight:300;margin-bottom:12px">Votre facture</h1>
            <p style="font-size:15px;color:#3E4550;line-height:1.8">Bonjour ${inv.client_name},</p>
            <p style="font-size:15px;color:#3E4550;line-height:1.8">Veuillez trouver ci-joint votre facture <strong>${inv.number}</strong> d'un montant de <strong>${(inv.total_ttc || 0).toFixed(2)} €</strong>.</p>
            <p style="font-size:13px;color:#6A7280;margin-top:24px">Merci pour votre commande !</p>
          </div>
          <div style="background:#1C2028;padding:20px 36px;text-align:center">
            <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0">${siteName}</p>
          </div>
        </div>
      </body></html>`,
      attachments: [{ filename: `${inv.number}.pdf`, content: pdfBuffer }],
    }, cfg);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[send-invoice-email]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
