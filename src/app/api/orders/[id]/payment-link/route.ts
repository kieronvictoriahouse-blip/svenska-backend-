import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getWhiteLabelConfig, sendEmail, baseTemplate } from '@/lib/email-send';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  }

  let sendEmailFlag = false;
  try { const body = await req.json(); sendEmailFlag = !!body.send_email; } catch {}

  const { data: order } = await supabaseAdmin
    .from('orders').select('*').eq('id', params.id).maybeSingle();
  if (!order) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404, headers: CORS });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe non configuré' }, { status: 500, headers: CORS });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });

  const lines: any[] = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = lines
    .filter((l: any) => (l.price || 0) > 0)
    .map((l: any) => ({
      price_data: {
        currency: 'eur',
        product_data: { name: (l.desc || l.name || l.name_fr || 'Article').substring(0, 127) },
        unit_amount: Math.round((l.price || 0) * 100),
      },
      quantity: l.qty || 1,
    }));

  // Fallback : le total comme ligne unique
  if (lineItems.length === 0) {
    const amount = Math.round(((order.total || 0) - (order.shipping || 0)) * 100);
    if (amount > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: `Commande ${order.order_number}` },
          unit_amount: amount,
        },
        quantity: 1,
      });
    }
  }

  if (lineItems.length === 0) {
    return NextResponse.json(
      { error: 'Impossible de créer le lien (montant nul)' },
      { status: 400, headers: CORS }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    customer_email: order.customer_email || undefined,
    shipping_options: [{
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: Math.round((order.shipping || 0) * 100), currency: 'eur' },
        display_name: (order.shipping || 0) > 0 ? 'Livraison' : 'Livraison offerte',
      },
    }],
    metadata: { order_id: order.id },
    success_url: `${baseUrl}/success.html?order_id=${order.id}`,
    cancel_url:  `${baseUrl}/panier.html`,
    locale: 'fr',
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 jours
  });

  const url = session.url!;

  await supabaseAdmin.from('orders').update({
    payment_link_url:    url,
    payment_link_sent_at: new Date().toISOString(),
  }).eq('id', order.id);

  if (sendEmailFlag && order.customer_email) {
    try {
      const cfg = await getWhiteLabelConfig();
      const siteName  = (cfg as any).site_name || 'Swedish Cravings';
      const fromEmail = (cfg as any).smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || 'onboarding@resend.dev';

      const body = `
        <h1 class="title">Finalisez votre commande</h1>
        <p class="text">Bonjour ${order.customer_name || ''},</p>
        <p class="text">Votre commande <strong>${order.order_number}</strong> d'un montant de <strong>${(order.total || 0).toFixed(2)} €</strong> est prête à être réglée.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${url}" style="display:inline-block;background:#3E5238;color:#fff;padding:14px 32px;border-radius:4px;font-size:15px;text-decoration:none;letter-spacing:1px">Payer ma commande →</a>
        </div>
        <p style="font-size:12px;color:#9CA3AF;text-align:center;margin-top:8px">Ce lien est valable 7 jours.</p>
      `;

      await sendEmail({
        from:    fromEmail,
        to:      order.customer_email,
        subject: `💳 Finalisez votre commande ${order.order_number} — ${siteName}`,
        html:    baseTemplate(body, `Votre commande ${order.order_number}`, cfg),
      }, cfg as any);
    } catch (err: any) {
      console.warn('[payment-link] email error (non-fatal):', err.message);
    }
  }

  return NextResponse.json({ url }, { headers: CORS });
}
