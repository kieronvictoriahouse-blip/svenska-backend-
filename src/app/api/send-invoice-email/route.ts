import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { factureEmail } from '@/lib/customer-emails';
import { sendEmail } from '@/lib/email-send';
import { getWlConfig } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'svenska-internal-2024';

export async function POST(req: NextRequest) {
  const { order_id, secret } = await req.json();

  /* Deux appelants légitimes, deux preuves différentes :
     — le webhook Stripe, qui s'appelle lui-même avec le secret interne
       et n'a pas de session admin ;
     — le back-office, qui envoie une facture à la main avec son jeton.
     Exiger le jeton pour les deux aurait coupé l'envoi automatique. */
  const interne = secret === INTERNAL_SECRET;
  if (!interne && !await requireAuth(req)) {
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

    // Gabarit du handoff : meme document que la facture PDF jointe.
    const { data: ord } = await supabaseAdmin
      .from('orders').select('*').eq('id', inv.order_id).maybeSingle();
    const mail = await factureEmail(ord || {}, inv);

    await sendEmail({
      from:    fromEmail,
      to:      toEmail,
      subject: mail.sujet,
      html:    mail.html,
      attachments: [{ filename: `facture-${inv.number}.pdf`, content: pdfBuffer }],
    }, cfg);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[send-invoice-email]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
