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

  // ── Avoir + contre-passation comptable ───────────────────────────
  try {
    const year = new Date().getFullYear();
    const today = new Date().toISOString().split('T')[0];

    // Récupérer la facture originale
    const { data: originalInv } = await supabaseAdmin
      .from('invoices').select('*').eq('order_id', params.id).neq('status', 'avoir').maybeSingle();

    // Numéro d'avoir séquentiel
    const counterKey = `avoir_next_${year}`;
    const { data: setting } = await supabaseAdmin
      .from('company_settings').select('value').eq('key', counterKey).maybeSingle();
    const nextNum = parseInt(setting?.value || '1', 10);
    const avoirNumber = `AV-${year}-${String(nextNum).padStart(4, '0')}`;

    // Créer l'avoir (montants négatifs)
    await supabaseAdmin.from('invoices').insert({
      number:         avoirNumber,
      date:           today,
      status:         'avoir',
      client_name:    originalInv?.client_name    || order.customer_name  || '',
      client_address: originalInv?.client_address || '',
      client_email:   originalInv?.client_email   || order.customer_email || '',
      lines:          originalInv?.lines          || '[]',
      total_ht:       -(originalInv?.total_ht     || order.total || 0),
      total_tva:      -(originalInv?.total_tva    || 0),
      total_ttc:      -(order.total               || 0),
      note:           `Avoir sur ${originalInv?.number || order.order_number}`,
      order_id:       order.id,
      legal_mention:  originalInv?.legal_mention  || '',
      seller_name:    originalInv?.seller_name    || '',
      seller_siret:   originalInv?.seller_siret   || '',
      seller_address: originalInv?.seller_address || '',
      seller_email:   originalInv?.seller_email   || '',
      seller_phone:   originalInv?.seller_phone   || '',
    });

    await supabaseAdmin.from('company_settings')
      .upsert({ key: counterKey, value: (nextNum + 1).toString() }, { onConflict: 'key' });

    // Marquer la facture originale comme remboursée
    if (originalInv) {
      await supabaseAdmin.from('invoices').update({ status: 'refunded' }).eq('id', originalInv.id);
    }

    // Contre-passation de la recette
    const { data: incomeEntry } = await supabaseAdmin
      .from('accounting_entries').select('*')
      .eq('reference_type', 'order').eq('reference_id', params.id).eq('type', 'income')
      .maybeSingle();
    if (incomeEntry) {
      await supabaseAdmin.from('accounting_entries').insert({
        date:             today,
        type:             'income',
        category:         incomeEntry.category,
        description:      `Remboursement — ${order.order_number}`,
        amount:           -(order.total || 0),
        reference_type:   'refund',
        reference_id:     params.id,
        reference_number: order.order_number,
      });
    }

    // Contre-passation des frais Stripe (Stripe rembourse les frais sur remboursement intégral)
    const { data: stripeEntry } = await supabaseAdmin
      .from('accounting_entries').select('*')
      .eq('reference_type', 'order').eq('reference_id', params.id).eq('category', 'frais_stripe')
      .maybeSingle();
    if (stripeEntry) {
      await supabaseAdmin.from('accounting_entries').insert({
        date:             today,
        type:             'expense',
        category:         'frais_stripe',
        description:      `Remboursement frais Stripe — ${order.order_number}`,
        amount:           -stripeEntry.amount,
        reference_type:   'refund',
        reference_id:     params.id,
        reference_number: order.order_number,
      });
    }
  } catch (e) {
    console.error('[refund] avoir/accounting error:', e);
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
