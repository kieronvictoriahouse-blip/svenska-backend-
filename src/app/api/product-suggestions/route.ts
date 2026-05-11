import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('product_suggestions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suggestions: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { product_name, description, source_url, customer_email, lang } = body;
  if (!product_name?.trim()) {
    return NextResponse.json({ error: 'product_name requis' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('product_suggestions')
    .insert({
      product_name: product_name.trim(),
      description: description?.trim() || null,
      source_url: source_url?.trim() || null,
      customer_email: customer_email?.trim() || null,
      lang: lang || 'fr',
      status: 'new',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suggestion: data }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { id, status } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  const { error } = await supabaseAdmin
    .from('product_suggestions')
    .update({ status })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  const { error } = await supabaseAdmin.from('product_suggestions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
