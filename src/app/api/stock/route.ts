import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get('history') === '1') {
    const { data, error } = await supabaseAdmin
      .from('stock_movements')
      .select('id, product_id, quantity, type, reason, created_at, products(name_fr)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ movements: data || [] });
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name_fr, stock, stock_alert, track_stock, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data || [] }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { id, stock, stock_alert, track_stock, reason } = body;
  
  // Get current stock for movement
  const { data: current } = await supabaseAdmin.from('products').select('stock').eq('id', id).single();
  const diff = stock - (current?.stock || 0);
  
  // Update product stock
  const { data: updated, error } = await supabaseAdmin.from('products')
    .update({ stock, stock_alert, track_stock })
    .eq('id', id)
    .select('id, stock, stock_alert, track_stock')
    .single();
  if (error) return NextResponse.json({ error: error.message, details: (error as any).details }, { status: 500 });

  // Vérification post-update — détecte les triggers qui resetteraient la valeur
  const { data: verify } = await supabaseAdmin.from('products')
    .select('id, stock, track_stock')
    .eq('id', id)
    .single();

  // Log movement
  if (diff !== 0) {
    await supabaseAdmin.from('stock_movements').insert({
      product_id: id,
      quantity: diff,
      type: diff > 0 ? 'in' : 'out',
      reason: reason || 'Ajustement manuel',
    });
  }

  return NextResponse.json({ success: true, updated, verify });
}
