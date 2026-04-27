import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const search = searchParams.get('search');

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 50;
  const from = (page - 1) * limit;

  let query = supabaseAdmin.from('contacts').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + limit - 1);
  if (type && type !== 'all') query = query.eq('type', type);
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data || [], total: count ?? 0, page });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('contacts').insert({
    ...body, updated_at: new Date().toISOString()
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}
