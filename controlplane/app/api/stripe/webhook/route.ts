import { NextRequest, NextResponse } from 'next/server';
import { cp } from '../../../../lib/cp-db';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   WEBHOOK STRIPE BILLING — le cycle de vie des abonnements Shopflow

   checkout.session.completed   → client payé, instance mise en FILE
                                  (le tick provisionne, pas le webhook :
                                  un webhook doit répondre vite)
   invoice.payment_failed       → noté ; la suspension attend l'échec
                                  définitif, pas le premier raté de CB
   customer.subscription.deleted → suspension : SHOPFLOW_SUSPENDED=1
                                  posé sur l'instance + redéploiement.
                                  AUCUNE donnée touchée — réversible,
                                  c'est contractuel.
   ═══════════════════════════════════════════════════════════════ */

export async function POST(req: NextRequest) {
  const brut = await req.text();
  const signature = req.headers.get('stripe-signature') || '';

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_absent');

  let evenement: any;
  try {
    evenement = stripe.webhooks.constructEvent(brut, signature, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (e: any) {
    /* Signature invalide = requête qui n'est pas de Stripe. On refuse,
       on ne journalise même pas le contenu. */
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
  }

  const objet = evenement.data?.object || {};

  if (evenement.type === 'checkout.session.completed') {
    const clientId = objet.metadata?.client_id;
    if (clientId) {
      await cp.from('cp_clients').update({
        statut: 'paye',
        stripe_customer_id: objet.customer || null,
        stripe_subscription_id: objet.subscription || null,
      }).eq('id', clientId);
      /* Une seule instance par client : l'upsert évite le double
         webhook (Stripe rejoue) de créer deux boutiques. */
      const { data: existante } = await cp.from('cp_instances')
        .select('id').eq('client_id', clientId).limit(1);
      if (!existante || !existante.length) {
        await cp.from('cp_instances').insert({ client_id: clientId });
      }
      await cp.from('cp_evenements').insert({ client_id: clientId, type: 'paiement_valide', detail: { session: objet.id } });
    }
  }

  if (evenement.type === 'invoice.paid') {
    /* Régularisation : un client suspendu qui repaie retrouve sa
       boutique. Le tick voit statut=paye + instance suspendue → il
       réactive. Pour un client déjà en règle, c'est un non-événement. */
    const { data: client } = await cp.from('cp_clients')
      .select('id, statut').eq('stripe_customer_id', objet.customer).maybeSingle();
    if (client && client.statut === 'suspendu') {
      await cp.from('cp_clients').update({ statut: 'paye' }).eq('id', client.id);
      await cp.from('cp_evenements').insert({ client_id: client.id, type: 'regularisation', detail: { invoice: objet.id } });
    }
  }

  if (evenement.type === 'invoice.payment_failed') {
    const { data: client } = await cp.from('cp_clients')
      .select('id').eq('stripe_customer_id', objet.customer).maybeSingle();
    if (client) {
      await cp.from('cp_evenements').insert({ client_id: client.id, type: 'paiement_echoue', detail: { invoice: objet.id } });
    }
  }

  if (evenement.type === 'customer.subscription.deleted') {
    const { data: client } = await cp.from('cp_clients')
      .select('id').eq('stripe_customer_id', objet.customer).maybeSingle();
    if (client) {
      await cp.from('cp_clients').update({ statut: 'suspendu' }).eq('id', client.id);
      await cp.from('cp_evenements').insert({ client_id: client.id, type: 'abonnement_termine', detail: {} });
      /* La pose de SHOPFLOW_SUSPENDED + redéploiement passe par le
         tick (il a les jetons Vercel) : ici on ne fait que noter. */
    }
  }

  return NextResponse.json({ recu: true });
}
