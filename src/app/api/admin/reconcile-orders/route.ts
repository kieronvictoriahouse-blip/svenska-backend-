import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Réconcilie les commandes avec Stripe : pour chaque session de paiement RÉUSSIE,
// si la commande liée est restée "pending" (webhook raté), on la passe "paid" et
// on remplit nom/email/téléphone. Idempotent, sans email ni facture (déjà gérés
// ailleurs). Sert de filet quand un webhook a échoué.
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Stripe non configuré' }, { status: 500 });
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });

  const fixed: any[] = [];
  const skipped: string[] = [];

  // Parcourt les sessions Checkout récentes (paginé, jusqu'à ~300)
  let startingAfter: string | undefined;
  for (let page = 0; page < 3; page++) {
    const sessions = await stripe.checkout.sessions.list({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    for (const s of sessions.data) {
      if (s.payment_status !== 'paid') continue;
      const orderId = s.metadata?.order_id;
      if (!orderId) continue;

      const { data: order } = await supabaseAdmin
        .from('orders').select('id, order_number, status').eq('id', orderId).maybeSingle();
      if (!order) { skipped.push(`${s.id} (commande introuvable)`); continue; }
      if (order.status === 'paid' || order.status === 'refunded') { skipped.push(order.order_number); continue; }

      const full = s as any;
      const name  = full.shipping_details?.name || full.customer_details?.name || '';
      const email = full.customer_details?.email || '';
      const phone = full.customer_details?.phone || '';
      const total = (s.amount_total || 0) / 100;
      const shippingCost = full.shipping_cost?.amount_total ? full.shipping_cost.amount_total / 100 : 0;
      const subtotal = total - shippingCost > 0 ? total - shippingCost : total;

      // essentiel — colonnes garanties
      const { error: coreErr } = await supabaseAdmin.from('orders').update({
        customer_name:     name,
        customer_email:    email,
        subtotal, shipping: shippingCost, total,
        status:            'paid',
        stripe_session_id: s.id,
        updated_at:        new Date().toISOString(),
      }).eq('id', orderId);
      if (coreErr) { skipped.push(`${order.order_number} (erreur: ${coreErr.message})`); continue; }

      // optionnel — téléphone (colonne éventuellement absente)
      if (phone) {
        try { await supabaseAdmin.from('orders').update({ customer_phone: phone }).eq('id', orderId); } catch { /* non bloquant */ }
      }

      fixed.push({ order: order.order_number, email, total });
    }
    if (!sessions.has_more) break;
    startingAfter = sessions.data[sessions.data.length - 1]?.id;
  }

  // Balayage : les commandes restées "pending" sans paiement Stripe depuis
  // plus de 3 h sont des paniers abandonnés → statut "abandoned".
  const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data: swept } = await supabaseAdmin
    .from('orders')
    .update({ status: 'abandoned', updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .is('stripe_session_id', null)
    .lt('created_at', cutoff)
    .select('order_number');
  const abandoned = (swept || []).map(o => o.order_number);

  return NextResponse.json({
    message: `${fixed.length} commande(s) réconciliée(s), ${abandoned.length} abandonnée(s).`,
    fixed,
    abandoned,
    skipped,
  });
}
