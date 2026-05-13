import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createInvoiceFromOrder } from '@/lib/invoice-utils';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  const created: string[] = [];
  const skipped: string[] = [];
  const invoicesCreated: string[] = [];

  // ── Sync orders → recettes + factures manquantes ────────────────────────
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .in('status', ['paid', 'confirmed', 'shipped', 'delivered'])
    .or('is_test.is.null,is_test.eq.false');

  for (const order of orders || []) {
    // Créer la facture si manquante
    const { data: existingInv } = await supabaseAdmin
      .from('invoices').select('id').eq('order_id', order.id).maybeSingle();
    if (!existingInv && order.customer_email) {
      try {
        const inv = await createInvoiceFromOrder(order);
        if (inv) invoicesCreated.push(order.order_number);
      } catch { /* non bloquant */ }
    }

    // Entrée comptable
    const { data: existing } = await supabaseAdmin
      .from('accounting_entries')
      .select('id')
      .eq('reference_type', 'order')
      .eq('reference_id', order.id)
      .maybeSingle();

    if (existing) { skipped.push(order.order_number); continue; }

    const category = order.source === 'manual' ? 'vente_directe' : 'vente_en_ligne';
    await supabaseAdmin.from('accounting_entries').insert({
      date: order.created_at.split('T')[0],
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

  // ── Sync receptions → achats ────────────────────────────────────────────
  const { data: receptions } = await supabaseAdmin
    .from('receptions')
    .select('id, number, supplier_name, lines, received_at');

  for (const rec of receptions || []) {
    const { data: existing } = await supabaseAdmin
      .from('accounting_entries')
      .select('id')
      .eq('reference_type', 'reception')
      .eq('reference_id', rec.id)
      .maybeSingle();

    if (existing) { skipped.push(rec.number); continue; }

    const lines: any[] = typeof rec.lines === 'string' ? JSON.parse(rec.lines) : rec.lines || [];
    const total = lines.reduce(
      (s: number, l: any) => s + (parseInt(l.received_qty) || 0) * (parseFloat(l.unit_cost) || 0),
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
    const { data: existing } = await supabaseAdmin
      .from('accounting_entries')
      .select('id')
      .eq('reference_type', 'landed_cost')
      .eq('reference_id', lc.id)
      .maybeSingle();

    if (existing) { skipped.push(`LC-${lc.id.slice(0, 6)}`); continue; }

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

  return NextResponse.json({ created, skipped, count: created.length });
}
