import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { BOUTIQUE_DEFAUT, boutiqueDeRequete } from '@/lib/boutique';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  // Admin : toutes les boutiques, sauf si une boutique est demandée explicitement.
  const explicite = new URL(req.url).searchParams.has('boutique') || req.headers.has('x-boutique');
  let q = supabaseAdmin.from('product_suggestions').select('*');
  if (explicite) q = q.eq('boutique_id', boutiqueDeRequete(req));
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suggestions: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  /* Formulaire PUBLIC : textes bornés (un envoi de plusieurs Mo partait
     tel quel en base), langue limitée aux trois du site. */
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const customer_name = txt(body.customer_name, 120);
  const customer_email = txt(body.customer_email, 200);
  const product_name = txt(body.product_name, 200);
  if (!customer_name) return NextResponse.json({ error: 'customer_name requis' }, { status: 400 });
  if (!customer_email) return NextResponse.json({ error: 'customer_email requis' }, { status: 400 });
  if (!product_name) return NextResponse.json({ error: 'product_name requis' }, { status: 400 });
  const b = boutiqueDeRequete(req);
  const { data, error } = await supabaseAdmin
    .from('product_suggestions')
    .insert({
      customer_name,
      product_name,
      description: txt(body.description, 2000) || null,
      source_url: txt(body.source_url, 500) || null,
      customer_email,
      lang: ['fr', 'sv', 'en'].includes(body.lang) ? body.lang : 'fr',
      status: 'new',
      // Swedish Cravings : le défaut de la base suffit, comme avant.
      ...(b !== BOUTIQUE_DEFAUT ? { boutique_id: b } : {}),
    })
    .select('id, status, created_at')
    .single();
  if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 });
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
