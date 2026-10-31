import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';

/* Hors EUR, la lecture de la balance transaction Stripe (bornée à 4 s,
   une relance) et le taux BCE allongent le traitement : marge explicite.
   300 s = défaut de la plateforme (Fluid Compute), déjà déclaré par
   d'autres routes : ne raccourcit jamais le chemin EUR. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const stripeKey        = process.env.STRIPE_SECRET_KEY;
  const stripeKeyTest    = process.env.STRIPE_SECRET_KEY_TEST;
  const webhookSecret    = process.env.STRIPE_WEBHOOK_SECRET;
  const webhookSecretTest = process.env.STRIPE_WEBHOOK_SECRET_TEST;
  if (!stripeKey) return NextResponse.json({ error: 'no key' }, { status: 500 });

  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') || '';

  /* Sans secret, on refuse : accepter un corps non signé permettait à
     n'importe qui de poster un faux « checkout.session.completed » et de
     faire passer une commande en payée. */
  if (!webhookSecret && !webhookSecretTest) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET absent — événement refusé');
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  let isTestEvent = false;
  try {
    // Try live secret first, then test secret
    let verified: Stripe.Event | null = null;
    if (webhookSecret) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });
        verified = stripe.webhooks.constructEvent(body, sig, webhookSecret);
      } catch { /* on tente le secret de test ci-dessous */ }
    }
    if (!verified && webhookSecretTest && stripeKeyTest) {
      const stripeTest = new Stripe(stripeKeyTest, { apiVersion: '2026-04-22.dahlia' });
      verified = stripeTest.webhooks.constructEvent(body, sig, webhookSecretTest);
      isTestEvent = true;
    }
    if (!verified) throw new Error('Invalid webhook signature');
    event = verified;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'invalid';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Use the correct Stripe instance for this event
  const activeKey = isTestEvent && stripeKeyTest ? stripeKeyTest : stripeKey;
  const stripe = new Stripe(activeKey, { apiVersion: '2026-04-22.dahlia' });
  if (!isTestEvent) isTestEvent = !(event as any).livemode;

  /* Paiement différé (virement SEPA, etc.) : Checkout se termine mais
     l'argent n'est pas encore là — payment_status vaut « unpaid ». La
     commande reste « pending » et n'est traitée qu'à
     checkout.session.async_payment_succeeded. PayPal et la carte arrivent
     directement en « paid ». */
  if (event.type === 'checkout.session.completed' && (event.data.object as any).payment_status === 'unpaid') {
    const s = event.data.object as any;
    const pendingOrderId = s.metadata?.order_id;
    if (pendingOrderId) {
      await supabaseAdmin.from('orders').update({
        stripe_session_id: s.id,
        ...(s.customer_details?.email ? { customer_email: s.customer_details.email } : {}),
        ...(s.customer_details?.name ? { customer_name: s.customer_details.name } : {}),
        // Bloque la relance « panier abandonné » : le client a bien commandé.
        recovery_skip_reason: 'paiement en cours de validation',
        updated_at: new Date().toISOString(),
      }).eq('id', pendingOrderId).eq('status', 'pending');
    }
    return NextResponse.json({ received: true });
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const s = event.data.object as any;
    const failedOrderId = s.metadata?.order_id;
    if (failedOrderId) {
      await supabaseAdmin.from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', failedOrderId).eq('status', 'pending');
      console.warn('[webhook] paiement différé refusé — commande annulée', failedOrderId);
    }
    return NextResponse.json({ received: true });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    /* Le traitement vit dans @/lib/session-payee : le rattrapage des
       paiements (/api/admin/reconcile-orders) emprunte le même chemin. */
    const { traiterSessionPayee } = await import('@/lib/session-payee');
    const r = await traiterSessionPayee(event.data.object as any, { stripe, isTestEvent, eventId: event.id });
    return NextResponse.json(r.body, { status: r.status });
  } else if (event.type === 'checkout.session.expired') {
    // Panier abandonné : la session Checkout a expiré sans paiement.
    // On marque la commande brouillon liée comme "abandonnée" (si toujours
    // en attente) pour ne pas polluer les vraies commandes dans l'admin.
    const expiredSession = event.data.object as any;
    const abandonedOrderId = expiredSession?.metadata?.order_id;
    if (abandonedOrderId) {
      await supabaseAdmin.from('orders')
        .update({ status: 'abandoned', updated_at: new Date().toISOString() })
        .eq('id', abandonedOrderId)
        .eq('status', 'pending');
      /* 1re relance du panier abandonné. La session expire 3 h après le
         clic sur « Payer » (expires_at au checkout) : c'est ce délai
         qui cadence la relance. Toutes les vérifications (désinscrit,
         a commandé depuis, panier plus récent…) sont dans la fonction.
         Entre 20 h et 8 h (Paris), rien ne part : le cron du matin
         envoie les relances 1 restées en attente. */
      try {
        const { envoyerRelance, heuresCalmes } = await import('@/lib/relance-panier');
        if (heuresCalmes()) {
          console.log('[webhook] relance panier reportée au passage du matin', abandonedOrderId);
        } else {
          const r = await envoyerRelance(abandonedOrderId, 1);
          console.log('[webhook] relance panier', abandonedOrderId, r.raison);
        }
      } catch (e) { console.error('[webhook] relance panier (non bloquant):', e); }
    }
  }

  return NextResponse.json({ received: true });
}
