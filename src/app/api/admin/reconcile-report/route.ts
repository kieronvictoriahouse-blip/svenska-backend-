import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { OPTS_STRIPE } from '@/lib/devise';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Rapport de réconciliation : compare le CA en compta, les commandes "payées"
// en base, et l'encaissé réel Stripe. Les 3 doivent coïncider. Lecture seule.
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const year = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()), 10);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const round = (n: number) => Math.round(n * 100) / 100;

  // ── 1) Compta (accounting_entries) ────────────────────────────────
  const { data: entries } = await supabaseAdmin
    .from('accounting_entries')
    .select('type, amount')
    .gte('date', from).lte('date', to);
  let comptaIncome = 0, comptaExpense = 0;
  for (const e of entries || []) {
    if (e.type === 'income') comptaIncome += Number(e.amount);
    else comptaExpense += Number(e.amount);
  }

  // ── 2) Commandes payées en base ───────────────────────────────────
  const PAID = ['paid', 'confirmed', 'shipped', 'delivered'];
  /* currency / total_eur : une commande hors euro compte pour l'EUR
     encaissé. Avant la migration 067 (colonne absente, 42703), ancien select. */
  const lireCommandes = async (cols: string) => {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select(cols)
      .in('status', PAID)
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);
    return { data: (data as any[] | null) ?? null, error };
  };
  let lu = await lireCommandes('total, status, is_test, exclude_from_stats, created_at, currency, total_eur');
  if (lu.error && (lu.error as any).code === '42703') lu = await lireCommandes('total, status, is_test, exclude_from_stats, created_at');
  const orders = lu.data;
  const realOrders = (orders || []).filter(o => !o.is_test && !o.exclude_from_stats);
  const ordersPaidTotal = realOrders.reduce((s, o) => s + (o.currency && o.currency !== 'EUR' ? Number(o.total_eur || 0) : Number(o.total || 0)), 0);

  // ── 3) Stripe réel (encaissé net = charges réussies − remboursements) ─
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  let stripeGross = 0, stripeRefunded = 0, stripeCount = 0, stripeError: string | null = null;
  let chargesHorsEur = 0, chargesHorsEurNonConverties = 0;
  if (!stripeKey) {
    stripeError = 'Clé Stripe absente';
  } else {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });
      const created = { gte: Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000), lte: Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000) };
      let startingAfter: string | undefined;
      for (let page = 0; page < 5; page++) {
        const charges = await stripe.charges.list({ limit: 100, created, ...(startingAfter ? { starting_after: startingAfter } : {}) });
        for (const c of charges.data) {
          if (c.status !== 'succeeded') continue;
          /* Charge hors euro : on compte l'EUR crédité (balance transaction).
             Le remboursé est approché au taux de la vente (signalé en note). */
          if (c.currency !== 'eur') {
            chargesHorsEur++;
            try {
              const bt = typeof c.balance_transaction === 'string'
                ? await stripe.balanceTransactions.retrieve(c.balance_transaction, {}, OPTS_STRIPE)
                : c.balance_transaction;
              if (bt && bt.currency === 'eur') {
                const ratio = c.amount ? bt.amount / c.amount : 0;
                stripeGross    += (c.amount_captured || 0) * ratio / 100;
                stripeRefunded += (c.amount_refunded || 0) * ratio / 100;
                stripeCount++;
                continue;
              }
            } catch { /* non convertie, comptée à part */ }
            chargesHorsEurNonConverties++;
            continue;
          }
          stripeGross    += (c.amount_captured || 0) / 100;
          stripeRefunded += (c.amount_refunded || 0) / 100;
          stripeCount++;
        }
        if (!charges.has_more) break;
        startingAfter = charges.data[charges.data.length - 1]?.id;
      }
    } catch (e: any) { stripeError = e?.message || 'Erreur Stripe'; }
  }
  const stripeNet = stripeGross - stripeRefunded;

  // ── Écarts ────────────────────────────────────────────────────────
  const tol = 0.5; // tolérance 50 centimes
  const deltaComptaStripe = round(comptaIncome - stripeNet);
  const deltaOrdersStripe = round(ordersPaidTotal - stripeGross);

  return NextResponse.json({
    year,
    compta:  { income: round(comptaIncome), expense: round(comptaExpense), net: round(comptaIncome - comptaExpense) },
    orders:  { paidCount: realOrders.length, paidTotal: round(ordersPaidTotal) },
    stripe:  { count: stripeCount, gross: round(stripeGross), refunded: round(stripeRefunded), net: round(stripeNet), error: stripeError },
    checks: {
      compta_income_vs_stripe_net:  { delta: deltaComptaStripe, ok: Math.abs(deltaComptaStripe) <= tol },
      orders_total_vs_stripe_gross: { delta: deltaOrdersStripe, ok: Math.abs(deltaOrdersStripe) <= tol },
      allMatch: !stripeError && Math.abs(deltaComptaStripe) <= tol && Math.abs(deltaOrdersStripe) <= tol,
    },
    note: 'compta.income doit ≈ stripe.net ; orders.paidTotal doit ≈ stripe.gross. Un écart révèle une écriture manquante/en trop ou une commande non synchronisée.'
      + (chargesHorsEur
        ? ` ${chargesHorsEur} charge(s) hors EUR : comptées à l'EUR crédité par Stripe, remboursements approchés au taux de la vente${chargesHorsEurNonConverties ? ` ; ${chargesHorsEurNonConverties} non convertie(s), exclue(s) des totaux Stripe` : ''}.`
        : ''),
  });
}
