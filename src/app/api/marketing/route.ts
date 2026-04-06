import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab');

  if (tab === 'abandoned') {
    const { data, error } = await supabaseAdmin.from('abandoned_carts')
      .select('*').order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ carts: data || [] });
  }

  if (tab === 'promo') {
    const { data, error } = await supabaseAdmin.from('promo_codes')
      .select('*').order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ codes: data || [] });
  }

  // Campagnes
  const { data, error } = await supabaseAdmin.from('marketing_campaigns')
    .select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data || [] });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab');
  const body = await req.json();

  if (tab === 'promo') {
    const { data, error } = await supabaseAdmin.from('promo_codes').insert(body).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ code: data });
  }

  if (tab === 'abandoned') {
    const { data, error } = await supabaseAdmin.from('abandoned_carts').insert({
      ...body, cart_data: JSON.stringify(body.cart_data || [])
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ cart: data });
  }

  // Campagne
  const { data, error } = await supabaseAdmin.from('marketing_campaigns').insert({
    ...body, updated_at: new Date().toISOString()
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const tab = searchParams.get('tab');
  const body = await req.json();

  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

  if (tab === 'promo') {
    const { data, error } = await supabaseAdmin.from('promo_codes').update(body).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ code: data });
  }

  const { data, error } = await supabaseAdmin.from('marketing_campaigns')
    .update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
