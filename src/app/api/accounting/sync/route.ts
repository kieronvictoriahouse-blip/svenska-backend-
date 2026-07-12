import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createInvoiceFromOrder } from '@/lib/invoice-utils';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const created: string[] = [];
  const skipped: string[] = [];
  const invoicesCreated: string[] = [];
  const removed: string[] = [];

  // ── Nettoyage : retirer les écritures des commandes devenues test ou
  //    hors-stats (auto-réparation — évite un CA gonflé par des commandes
  //    de démo qui avaient déjà été synchronisées). Même périmètre que le
  //    dashboard commandes : is_test OU exclude_from_stats.
  const { data: excludedOrders } = await supabaseAdmin
    .from('orders')
    .select('id, order_number')
    .or('is_test.eq.true,exclude_from_stats.eq.true');
  for (const o of excludedOrders || []) {
    const { data: del } = await supabaseAdmin
      .from('accounting_entries')
      .delete()
      .eq('reference_type', 'order')
      .eq('reference_id', o.id)
      .select('id');
    if (del && del.length) removed.push(o.order_number);
  }

  // ── Sync orders → recettes + factures manquantes ────────────────────────
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .in('status', ['paid', 'confirmed', 'shipped', 'delivered'])
    .or('is_test.is.null,is_test.eq.false')
    .or('exclude_from_stats.is.null,exclude_from_stats.eq.false');

  for (const order of orders || []) {
    // Créer la facture si manquante
    const { data: invRows } = await supabaseAdmin
      .from('invoices').select('id').eq('order_id', order.id).limit(1);
    const existingInv = invRows && invRows.length > 0;
    if (!existingInv && order.customer_email) {
      try {
        const inv = await createInvoiceFromOrder(order);
        if (inv) invoicesCreated.push(order.order_number);
      } catch { /* non bloquant */ }
    }

    // Entrée comptable (income uniquement — les frais_stripe sont séparés)
    // .limit(1) et non .maybeSingle() : si des doublons existent déjà,
    // maybeSingle renvoie une erreur → data null → on réinsérerait (la cause
    // historique du CA gonflé). Un simple test de présence évite ça.
    const { data: existingRows } = await supabaseAdmin
      .from('accounting_entries')
      .select('id')
      .eq('reference_type', 'order')
      .eq('reference_id', order.id)
      .eq('type', 'income')
      .limit(1);
    const existing = existingRows && existingRows.length > 0;

    const orderDate = (order.created_at || new Date().toISOString()).split('T')[0];

    if (existing) {
      skipped.push(order.order_number);
    } else {
      const category = order.source === 'manual' ? 'vente_directe' : 'vente_en_ligne';
      await supabaseAdmin.from('accounting_entries').insert({
        date: orderDate,
        type: 'income',
        category,
        description: `Commande ${order.order_number}${order.customer_name ? ' — ' + order.customer_name : ''}`,
        amount: order.total || 0,
        reference_type: 'order',
        reference_id: order.id,
        reference_number: order.order_number,
      });
      created.push(order.order_number);
    }

    // Frais Stripe automatiques — uniquement pour les commandes passées par Stripe
    if (order.stripe_session_id && (order.total || 0) > 0) {
      const { data: stripeRows } = await supabaseAdmin
        .from('accounting_entries').select('id')
        .eq('reference_type', 'order').eq('reference_id', order.id).eq('category', 'frais_stripe')
        .limit(1);
      if (!(stripeRows && stripeRows.length > 0)) {
        const stripeFee = Math.round(((order.total || 0) * 0.015 + 0.25) * 100) / 100;
        await supabaseAdmin.from('accounting_entries').insert({
          date: orderDate,
          type: 'expense',
          category: 'frais_stripe',
          description: `Frais Stripe — ${order.order_number}`,
          amount: stripeFee,
          reference_type: 'order',
          reference_id: order.id,
          reference_number: order.order_number,
        });
        created.push(`STRIPE-${order.order_number}`);
      }
    }
  }

  // ── Sync receptions → achats ────────────────────────────────────────────
  const { data: receptions } = await supabaseAdmin
    .from('receptions')
    .select('id, number, supplier_name, lines, received_at, status')
    .neq('status', 'cancelled');

  for (const rec of receptions || []) {
    const { data: existingRec } = await supabaseAdmin
      .from('accounting_entries')
      .select('id')
      .eq('reference_type', 'reception')
      .eq('reference_id', rec.id)
      .limit(1);

    if (existingRec && existingRec.length > 0) { skipped.push(rec.number); continue; }

    const lines: any[] = typeof rec.lines === 'string' ? JSON.parse(rec.lines) : rec.lines || [];
    const total = lines.reduce(
      (s: number, l: any) => s + (parseFloat(l.received_qty) || 0) * (parseFloat(l.unit_cost) || 0),
      0,
    );
    if (total <= 0) { skipped.push(rec.number); continue; }

    const date = rec.received_at
      ? rec.received_at.split('T')[0]
      : new Date().toISOString().split('T')[0];

    await supabaseAdmin.from('accounting_entries').insert({
      date,
      type: 'expense',
      category: 'achat_marchandise',
      description: `Réception ${rec.number}${rec.supplier_name ? ' — ' + rec.supplier_name : ''}`,
      amount: Math.round(total * 100) / 100,
      reference_type: 'reception',
      reference_id: rec.id,
      reference_number: rec.number,
    });
    created.push(rec.number);
  }

  // ── Sync landed costs → frais logistiques ──────────────────────────────
  const { data: landedCosts } = await supabaseAdmin
    .from('landed_costs')
    .select('id, reception_id, description, amount, created_at, receptions(number)')
    .eq('status', 'validated');

  for (const lc of landedCosts || []) {
    const { data: existingLc } = await supabaseAdmin
      .from('accounting_entries')
      .select('id')
      .eq('reference_type', 'landed_cost')
      .eq('reference_id', lc.id)
      .limit(1);

    if (existingLc && existingLc.length > 0) { skipped.push(`LC-${lc.id.slice(0, 6)}`); continue; }

    const date = lc.created_at
      ? lc.created_at.split('T')[0]
      : new Date().toISOString().split('T')[0];

    const recNum = (lc as any).receptions?.number || null;

    await supabaseAdmin.from('accounting_entries').insert({
      date,
      type: 'expense',
      category: 'frais_logistique',
      description: `${lc.description}${recNum ? ' — ' + recNum : ''}`,
      amount: lc.amount,
      reference_type: 'landed_cost',
      reference_id: lc.id,
      reference_number: recNum,
    });
    created.push(`LC-${lc.id.slice(0, 6)}`);
  }

  return NextResponse.json({ created, skipped, removed, count: created.length, removedCount: removed.length });
}
