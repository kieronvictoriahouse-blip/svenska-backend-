import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name_fr, stock, stock_alert, track_stock, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data || [] });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, stock, stock_alert, track_stock, reason } = body;
  
  // Get current stock for movement
  const { data: current } = await supabaseAdmin.from('products').select('stock').eq('id', id).single();
  const diff = stock - (current?.stock || 0);
  
  // Update product stock
  const { error } = await supabaseAdmin.from('products')
    .update({ stock, stock_alert, track_stock })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Log movement
  if (diff !== 0) {
    await supabaseAdmin.from('stock_movements').insert({
      product_id: id,
      quantity: diff,
      type: diff > 0 ? 'in' : 'out',
      reason: reason || 'Ajustement manuel',
    });
  }
  
  return NextResponse.json({ success: true });
}
