// ─────────────────────────────────────────────────────────────────────
//  Décomposition d'un versement Stripe (payout)
//  Un seul virement « VIR STRIPE PAYOUT » regroupe plusieurs commandes.
//  On interroge l'API Stripe pour retrouver les charges couvertes et les
//  frais, afin de rapprocher chaque facture et d'inscrire les frais Stripe.
// ─────────────────────────────────────────────────────────────────────

import Stripe from 'stripe';

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST;
  if (!key) throw new Error('STRIPE_SECRET_KEY absent');
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
}

export function stripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST);
}

export interface PayoutCharge {
  chargeId: string;
  amount: number;   // brut encaissé (€)
  fee: number;      // frais Stripe (€)
  net: number;      // net versé (€)
  date: string;     // YYYY-MM-DD
  description: string;
  orderNumber?: string;
  customer?: string;
}

export interface PayoutBreakdown {
  payoutId: string;
  arrivalDate: string;
  gross: number;
  fee: number;
  net: number;
  charges: PayoutCharge[];
}

const d = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

/** Retrouve le payout Stripe correspondant à une ligne bancaire (net + date). */
export async function findPayout(netAmount: number, aroundIso: string): Promise<Stripe.Payout | null> {
  const stripe = getStripe();
  const around = new Date(aroundIso + 'T12:00:00Z').getTime() / 1000;
  const payouts = await stripe.payouts.list({
    limit: 20,
    arrival_date: { gte: Math.floor(around - 7 * 86400), lte: Math.floor(around + 7 * 86400) },
  });
  const target = Math.round(Math.abs(netAmount) * 100);
  return payouts.data.find(p => Math.abs(p.amount - target) <= 2) || null;
}

/** Décompose un payout en charges + frais. */
export async function explodePayout(payoutId: string): Promise<PayoutBreakdown> {
  const stripe = getStripe();
  const payout = await stripe.payouts.retrieve(payoutId);
  const charges: PayoutCharge[] = [];
  let feeTotal = 0, grossTotal = 0;

  for await (const bt of stripe.balanceTransactions.list({ payout: payoutId, expand: ['data.source'] })) {
    if (bt.type === 'charge' || bt.type === 'payment') {
      const src = bt.source as Stripe.Charge | null;
      const meta = (src && (src.metadata || {})) as Record<string, string>;
      charges.push({
        chargeId: typeof bt.source === 'string' ? bt.source : (src?.id || bt.id),
        amount: bt.amount / 100,
        fee: bt.fee / 100,
        net: bt.net / 100,
        date: d(bt.created),
        description: src?.description || meta.order_number || 'Commande en ligne',
        orderNumber: meta.order_number || meta.orderNumber || undefined,
        customer: (src?.billing_details?.name) || meta.customer_name || undefined,
      });
      feeTotal += bt.fee / 100;
      grossTotal += bt.amount / 100;
    } else if (bt.type === 'stripe_fee' || bt.type === 'application_fee') {
      feeTotal += Math.abs(bt.amount) / 100;
    }
  }

  return {
    payoutId,
    arrivalDate: d(payout.arrival_date),
    gross: Math.round(grossTotal * 100) / 100,
    fee: Math.round(feeTotal * 100) / 100,
    net: payout.amount / 100,
    charges,
  };
}
