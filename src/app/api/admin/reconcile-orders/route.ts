import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { traiterSessionPayee } from '@/lib/session-payee';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Réconcilie les commandes avec Stripe : pour chaque session de paiement RÉUSSIE,
// si la commande liée est restée "pending" (webhook raté), on la traite EXACTEMENT
// comme le webhook l'aurait fait (@/lib/session-payee) : statut payé, usage du
// code promo, facture, compta, fidélité, emails, étiquette relais. Avant, seul le
// statut changeait — « sans email ni facture (déjà gérés ailleurs) », sauf que
// l'ailleurs, c'était justement le webhook raté. Idempotent : la prise du statut
// ne réussit qu'une fois. Sert de filet quand un webhook a échoué.
export async function POST(req: NextRequest) {
  // Auth : admin connecté OU appel interne du cron (Bearer CRON_SECRET, jamais en dur)
  const cronSecret = process.env.CRON_SECRET;
  const cronOk = !!cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`;
  if (!cronOk && !await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

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
      /* Seul un brouillon jamais soldé passe en « payée ». Le test ne
         visait que « paid » et « refunded » : une commande expédiée,
         livrée ou annulée retombait en « payée » à chaque passage. */
      if (!['pending', 'abandoned'].includes(order.status)) { skipped.push(order.order_number); continue; }

      const r = await traiterSessionPayee(s as any, { stripe, isTestEvent: !s.livemode });
      if (r.status !== 200) { skipped.push(`${order.order_number} (erreur: ${String(r.body?.error || r.status)})`); continue; }
      if (r.body?.duplicate) { skipped.push(`${order.order_number} (déjà traitée entre-temps)`); continue; }

      fixed.push({ order: order.order_number, email: (s as any).customer_details?.email || '', total: (s.amount_total || 0) / 100 });
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
