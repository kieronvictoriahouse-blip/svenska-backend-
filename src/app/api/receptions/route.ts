import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applyStockAndPmp } from '@/lib/reception-utils';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poId = searchParams.get('purchase_order_id');
  let query = supabaseAdmin.from('receptions').select('*, contacts(company, first_name, last_name), purchase_orders(number)').order('created_at', { ascending: false });
  if (poId) query = query.eq('purchase_order_id', poId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ receptions: data || [] });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { count } = await supabaseAdmin.from('receptions').select('id', { count: 'exact', head: true });
  const num = String((count || 0) + 1).padStart(4, '0');

  const lines = body.lines || [];

  // Créer la réception
  const { data: reception, error } = await supabaseAdmin.from('receptions').insert({
    number: `REC-${num}`,
    purchase_order_id: body.purchase_order_id || null,
    supplier_id: body.supplier_id || null,
    supplier_name: body.supplier_name,
    status: 'done',
    received_at: new Date().toISOString(),
    notes: body.notes,
    lines: JSON.stringify(lines),
    invoice_id: body.invoice_id || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message, details: (error as any).details, hint: (error as any).hint, code: (error as any).code }, { status: 500 });

  // Mettre à jour le stock + PMP pour chaque ligne reçue
  for (const line of lines) {
    if (!line.product_id || !line.received_qty) continue;
    await applyStockAndPmp(line, `Réception ${num} — ${body.supplier_name || ''}`);
  }

  // Mettre à jour statut commande d'achat si toutes les lignes reçues
  if (body.purchase_order_id) {
    await supabaseAdmin.from('purchase_orders')
      .update({ status: 'received', updated_at: new Date().toISOString() })
      .eq('id', body.purchase_order_id);
  }

  return NextResponse.json({ reception });
}
