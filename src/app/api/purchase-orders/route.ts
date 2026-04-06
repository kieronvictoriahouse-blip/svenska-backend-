import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  let query = supabaseAdmin.from('purchase_orders').select('*, contacts(company, first_name, last_name, email)').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { count } = await supabaseAdmin.from('purchase_orders').select('id', { count: 'exact', head: true });
  const num = String((count || 0) + 1).padStart(4, '0');
  const { data, error } = await supabaseAdmin.from('purchase_orders').insert({
    ...body,
    number: `ACH-${num}`,
    lines: JSON.stringify(body.lines || []),
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}
