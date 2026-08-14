import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applySaleStock } from '@/lib/stock';
import { createInvoiceFromOrder } from '@/lib/invoice-utils';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
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
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { count: orderCount } = await supabaseAdmin.from('orders').select('id', { count: 'exact', head: true });
  const num = String((orderCount || 0) + 1).padStart(4, '0');
  const { data, error } = await supabaseAdmin.from('orders').insert({
    ...body,
    order_number: `SD-${num}`,
    lines: JSON.stringify(body.lines || []),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Décrémenter le stock, en journalisant chaque ligne (cf. lib/stock).
  if (body.lines?.length > 0) {
    const r = await applySaleStock(body.lines, data.id, data.order_number);
    if (r.failed.length) console.error('[orders] stock non déduit:', data.order_number, r.failed);
  }

  // Créer la facture automatiquement
  const invoice = await createInvoiceFromOrder({ ...data, lines: body.lines });

  return NextResponse.json({ order: data, invoice_number: invoice?.number || null });
}
