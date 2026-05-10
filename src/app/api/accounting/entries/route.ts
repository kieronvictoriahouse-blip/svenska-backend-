import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  let query = supabaseAdmin
    .from('accounting_entries')
    .select('*')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: false });

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, type, category, description, amount } = body;

  if (!date || !type || !description || amount == null) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('accounting_entries').insert({
    date,
    type,
    category: category || 'autre',
    description,
    amount: parseFloat(amount),
    reference_type: body.reference_type || 'manual',
    reference_id: body.reference_id || null,
    reference_number: body.reference_number || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

  const { error } = await supabaseAdmin.from('accounting_entries').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
