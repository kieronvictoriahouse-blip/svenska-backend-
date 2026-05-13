import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getWhiteLabelConfig, sendEmail, baseTemplate } from '@/lib/email-send';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders').select('*').eq('id', params.id).single();

  if (orderErr || !order) return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 });
  if (order.status === 'refunded') return NextResponse.json({ error: 'Déjà remboursée' }, { status: 400 });

  // ── Remboursement Stripe ──────────────────────────────────────────
  let refundId: string | null = null;
  if (stripeKey && order.stripe_session_id) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      const paymentIntentId = session.payment_intent as string;
      if (paymentIntentId) {
        const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
        refundId = refund.id;
      }
    } catch (e: any) {
      return NextResponse.json({ error: `Erreur Stripe : ${e.message}` }, { status: 500 });
    }
  }

  // ── Mise à jour commande ──────────────────────────────────────────
  await supabaseAdmin.from('orders')
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', params.id);

  // ── Ré-incrément stock ────────────────────────────────────────────
  const lines = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);
  for (const line of lines) {
    if (line.product_id) {
      try {
        const { data: prod } = await supabaseAdmin
          .from('products').select('stock').eq('id', line.product_id).single();
        if (prod) {
          await supabaseAdmin.from('products')
            .update({ stock: (prod.stock || 0) + (line.qty || 1) })
            .eq('id', line.product_id);
        }
      } catch { /* non bloquant */ }
    }
  }

  // ── Email client ──────────────────────────────────────────────────
  try {
    const cfg = await getWhiteLabelConfig();
    const siteName  = cfg.site_name || '';
    const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || `${siteName} <noreply@swedishcravings.fr>`;
    const content = `
      <h1 class="title">Remboursement confirmé</h1>
      <p class="text">Bonjour ${order.customer_name},</p>
      <p class="text">Votre commande <strong>${order.order_number}</strong> a été annulée et le remboursement intégral a été initié.</p>
      <div class="box">
        <div class="box-title">💶 Montant remboursé</div>
        <div class="line total"><span>Total TTC</span><span>${(order.total || 0).toFixed(2)} €</span></div>
      </div>
      <p class="text">Le remboursement apparaîtra sur votre compte bancaire sous <strong>5 à 10 jours ouvrés</strong>, selon votre banque.</p>
      ${cfg.email ? `<p class="text" style="font-size:13px">Des questions ? <a href="mailto:${cfg.email}" style="color:#3E4550">${cfg.email}</a></p>` : ''}
      <p class="text">Merci de votre confiance.</p>`;

    await sendEmail({
      from:    fromEmail,
      to:      order.customer_email,
      subject: `💶 Remboursement ${order.order_number}${siteName ? ` — ${siteName}` : ''}`,
      html:    baseTemplate(content, `Remboursement ${order.order_number}`, cfg),
    }, cfg);
  } catch (e) {
    console.error('[refund] email error:', e);
  }

  return NextResponse.json({ success: true, refund_id: refundId });
}
