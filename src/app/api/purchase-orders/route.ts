import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  let query = supabaseAdmin.from('purchase_orders')
    .select('*, contacts(company, first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data || [] });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { count } = await supabaseAdmin.from('purchase_orders').select('id', { count: 'exact', head: true });
  const num = String((count || 0) + 1).padStart(4, '0');

  const payload: Record<string, unknown> = {
    number:        `ACH-${num}`,
    status:        body.status        || 'draft',
    supplier_id:   body.supplier_id   || null,
    supplier_name: body.supplier_name || '',
    expected_date: body.expected_date || null,
    notes:         body.notes         || null,
    lines:         JSON.stringify(body.lines || []),
    subtotal:      body.subtotal      || 0,
    tax:           body.tax           || 0,
    shipping:      body.shipping      || 0,
    total:         body.total         || 0,
    currency:      body.currency      || 'EUR',
    updated_at:    new Date().toISOString(),
  };

  // Colonnes optionnelles — présentes si la migration a été jouée
  if (body.exchange_rate != null) payload.exchange_rate = body.exchange_rate;
  if (body.payment_date)          payload.payment_date  = body.payment_date;

  const { data, error } = await supabaseAdmin.from('purchase_orders').insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message, details: error.details, hint: error.hint, code: error.code }, { status: 500 });
  return NextResponse.json({ order: data });
}
