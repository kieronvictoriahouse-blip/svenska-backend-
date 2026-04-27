import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  let query = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (search) query = query.or(`customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,order_number.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { count: orderCount } = await supabaseAdmin.from('orders').select('id', { count: 'exact', head: true });
  const num = String((orderCount || 0) + 1).padStart(4, '0');
  const { data, error } = await supabaseAdmin.from('orders').insert({
    ...body,
    order_number: `SD-${num}`,
    lines: JSON.stringify(body.lines || []),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Décrémenter le stock si track_stock
  if (body.lines?.length > 0) {
    for (const line of body.lines) {
      if (line.product_id) {
        await supabaseAdmin.rpc('decrement_stock', { p_id: line.product_id, qty: line.qty });
      }
    }
  }
  return NextResponse.json({ order: data });
}
