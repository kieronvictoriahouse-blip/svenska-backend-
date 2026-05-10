import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin.from('contacts').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Récupérer commandes et achats liés
  const [orders, purchases] = await Promise.all([
    supabaseAdmin.from('orders').select('*').eq('customer_email', data.email).order('created_at', { ascending: false }),
    supabaseAdmin.from('purchase_orders').select('*').eq('supplier_id', params.id).order('created_at', { ascending: false }),
  ]);
  return NextResponse.json({ contact: data, orders: orders.data || [], purchases: purchases.data || [] });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('contacts')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  await supabaseAdmin.from('contacts').update({ is_active: false }).eq('id', params.id);
  return NextResponse.json({ success: true });
}
