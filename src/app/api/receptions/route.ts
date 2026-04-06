import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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
  const body = await req.json();
  const { count } = await supabaseAdmin.from('receptions').select('id', { count: 'exact', head: true });
  const num = String((count || 0) + 1).padStart(4, '0');

  const lines = body.lines || [];

  // Créer la réception
  const { data: reception, error } = await supabaseAdmin.from('receptions').insert({
    number: `REC-${num}`,
    purchase_order_id: body.purchase_order_id,
    supplier_id: body.supplier_id,
    supplier_name: body.supplier_name,
    status: 'done',
    received_at: new Date().toISOString(),
    notes: body.notes,
    lines: JSON.stringify(lines),
    invoice_id: body.invoice_id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mettre à jour le stock pour chaque ligne reçue
  for (const line of lines) {
    if (!line.product_id || !line.received_qty) continue;
    
    // Récupérer stock actuel
    const { data: product } = await supabaseAdmin.from('products')
      .select('stock, track_stock').eq('id', line.product_id).single();
    
    if (product?.track_stock) {
      const newStock = (product.stock || 0) + parseInt(line.received_qty);
      await supabaseAdmin.from('products').update({ stock: newStock }).eq('id', line.product_id);
      
      // Log mouvement
      await supabaseAdmin.from('stock_movements').insert({
        product_id: line.product_id,
        quantity: parseInt(line.received_qty),
        type: 'in',
        reason: `Réception ${num} — ${body.supplier_name || ''}`,
      });
    }
  }

  // Mettre à jour statut commande d'achat si toutes les lignes reçues
  if (body.purchase_order_id) {
    await supabaseAdmin.from('purchase_orders')
      .update({ status: 'received', updated_at: new Date().toISOString() })
      .eq('id', body.purchase_order_id);
  }

  return NextResponse.json({ reception });
}
