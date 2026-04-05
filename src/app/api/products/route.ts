import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cat        = searchParams.get('cat');
  const bestseller = searchParams.get('bestseller');
  const isNew      = searchParams.get('new');
  const search     = searchParams.get('search');
  const sortOrder  = searchParams.get('sort_order');

  let query = supabaseAdmin
    .from('products')
    .select('*, product_variants(*), categories(name_fr, name_sv, name_en, slug)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (sortOrder) query = query.eq('sort_order', parseInt(sortOrder));
  if (cat)        query = query.eq('categories.slug', cat);
  if (bestseller) query = query.eq('is_bestseller', true);
  if (isNew)      query = query.eq('is_new', true);
  if (search)     query = query.ilike('name_fr', `%${search}%`);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data || [] });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('products').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ product: data });
}
