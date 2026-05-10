import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin.from('purchase_orders')
    .select('*, contacts(*)').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Récupérer réceptions liées
  const { data: receptions } = await supabaseAdmin.from('receptions').select('*').eq('purchase_order_id', params.id);
  return NextResponse.json({ order: data, receptions: receptions || [] });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  // Only update fields that are present in the body (partial update)
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('status'        in body) payload.status        = body.status;
  if ('supplier_id'   in body) payload.supplier_id   = body.supplier_id   || null;
  if ('supplier_name' in body) payload.supplier_name = body.supplier_name || '';
  if ('expected_date' in body) payload.expected_date = body.expected_date || null;
  if ('notes'         in body) payload.notes         = body.notes         || null;
  if ('lines'         in body) payload.lines         = JSON.stringify(body.lines || []);
  if ('subtotal'      in body) payload.subtotal      = body.subtotal      || 0;
  if ('tax'           in body) payload.tax           = body.tax           || 0;
  if ('shipping'      in body) payload.shipping      = body.shipping      || 0;
  if ('total'         in body) payload.total         = body.total         || 0;
  if ('currency'      in body) payload.currency      = body.currency      || 'EUR';
  if (body.exchange_rate != null) payload.exchange_rate = body.exchange_rate;
  if (body.payment_date)          payload.payment_date  = body.payment_date;

  const { data, error } = await supabaseAdmin.from('purchase_orders')
    .update(payload).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await supabaseAdmin.from('purchase_orders').update({ status: 'cancelled' }).eq('id', params.id);
  return NextResponse.json({ success: true });
}
