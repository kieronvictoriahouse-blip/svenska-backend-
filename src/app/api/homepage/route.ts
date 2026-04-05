import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// ─── GET /api/homepage ────────────────────────────────────────────
// Lecture publique — consommée par le front Netlify
export async function GET() {
  // Sections configurables
  const { data: sections, error: sError } = await supabase
    .from('homepage_sections')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (sError) return NextResponse.json({ error: sError.message }, { status: 500 });

  // Produits mis en avant (bestsellers)
  const { data: bestsellers } = await supabase
    .from('products')
    .select('*, categories(*), product_variants(*)')
    .eq('is_active', true)
    .eq('is_bestseller', true)
    .order('sort_order', { ascending: true })
    .limit(6);

  // Nouveautés
  const { data: newArrivals } = await supabase
    .from('products')
    .select('*, categories(*), product_variants(*)')
    .eq('is_active', true)
    .eq('is_new', true)
    .order('sort_order', { ascending: true })
    .limit(4);

  // Snacks & Confiseries pour le fredagsmys band
  const { data: snacks } = await supabase
    .from('products')
    .select('*, categories(*)')
    .eq('is_active', true)
    .in('categories.slug', ['snacks-chips', 'confiseries'])
    .order('sort_order', { ascending: true })
    .limit(4);

  return NextResponse.json({
    sections,
    bestsellers,
    new_arrivals: newArrivals,
    snacks,
  });
}

// ─── PUT /api/homepage ────────────────────────────────────────────
// Mise à jour d'une section (admin)
export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const token = authHeader.slice(7);
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

  const body = await req.json();
  const { key, ...updates } = body;
  if (!key) return NextResponse.json({ error: 'key requis' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('homepage_sections')
    .update(updates)
    .eq('key', key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ section: data });
}
