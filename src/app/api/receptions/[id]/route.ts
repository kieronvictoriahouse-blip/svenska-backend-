import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applyStockAndPmp } from '@/lib/reception-utils';
import { requireAuth } from '@/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: reception, error } = await supabaseAdmin
    .from('receptions').select('*').eq('id', params.id).single();
  if (error || !reception) return NextResponse.json({ error: 'Réception introuvable' }, { status: 404 });
  if (reception.status === 'cancelled') return NextResponse.json({ error: 'Déjà annulée' }, { status: 400 });

  const lines = typeof reception.lines === 'string' ? JSON.parse(reception.lines) : reception.lines || [];

  // Inverser le stock et le PMP pour chaque ligne
  for (const line of lines) {
    if (!line.product_id || !line.received_qty) continue;
    const qty = parseInt(line.received_qty) || 0;
    const cost = parseFloat(line.unit_cost) || 0;

    const { data: product } = await supabaseAdmin.from('products')
      .select('stock, cost_price').eq('id', line.product_id).single();
    if (!product) continue;

    const newStock = Math.max(0, (product.stock || 0) - qty);
    let newPmp = product.cost_price || 0;
    if (newStock > 0 && qty > 0) {
      newPmp = ((product.stock || 0) * (product.cost_price || 0) - qty * cost) / newStock;
      if (newPmp < 0) newPmp = 0;
    } else if (newStock === 0) {
      newPmp = 0;
    }

    await supabaseAdmin.from('products').update({
      stock: newStock,
      cost_price: Math.round(newPmp * 10000) / 10000,
    }).eq('id', line.product_id);

    await supabaseAdmin.from('stock_movements').insert({
      product_id: line.product_id,
      quantity: -qty,
      type: 'out',
      reason: `Annulation réception ${reception.number}`,
    });
  }

  // Marquer la réception comme annulée
  await supabaseAdmin.from('receptions').update({ status: 'cancelled' }).eq('id', params.id);

  // Remettre la commande d'achat en "confirmed" UNIQUEMENT s'il ne reste plus
  // aucune autre réception valide pour cette PO (sinon on la remettrait en
  // attente à tort alors qu'une autre réception l'a déjà réceptionnée).
  if (reception.purchase_order_id) {
    const { data: otherReceptions } = await supabaseAdmin
      .from('receptions')
      .select('id')
      .eq('purchase_order_id', reception.purchase_order_id)
      .neq('status', 'cancelled')
      .neq('id', params.id);
    if (!otherReceptions || otherReceptions.length === 0) {
      await supabaseAdmin.from('purchase_orders')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', reception.purchase_order_id)
        .eq('status', 'received');
    }
  }

  return NextResponse.json({ success: true, reversed: lines.length });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: reception, error } = await supabaseAdmin
    .from('receptions').select('*').eq('id', params.id).single();
  if (error || !reception) return NextResponse.json({ error: 'Réception introuvable' }, { status: 404 });

  const lines = typeof reception.lines === 'string' ? JSON.parse(reception.lines) : reception.lines || [];
  const reason = `Rejeu réception ${reception.number} — ${reception.supplier_name || ''}`;

  for (const line of lines) {
    if (!line.product_id || !line.received_qty) continue;
    await applyStockAndPmp(line, reason);
  }

  return NextResponse.json({ success: true, replayed: lines.length });
}
