// ─── ACHATS : src/app/api/purchases/route.ts ────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

async function auth(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(h.slice(7));
  return user;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data, error } = await supabaseAdmin.from('purchases').select('*').order('date', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchases: data });
}

export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('purchases').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchase: data }, { status: 201 });
}

// ─── PRODUITS MARGES : src/app/api/margin-products/route.ts ─────
// (créer un fichier séparé avec ce contenu)
/*
export async function GET(req) {
  if (!await auth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data, error } = await supabaseAdmin.from('margin_products').select('*').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}

export async function POST(req) {
  if (!await auth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('margin_products').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data }, { status: 201 });
}
*/

// ─── SETTINGS : src/app/api/settings/route.ts ───────────────────
// (créer un fichier séparé avec ce contenu)
/*
export async function GET(req) {
  if (!await auth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data, error } = await supabaseAdmin.from('company_settings').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PUT(req) {
  if (!await auth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const updates = Object.entries(body).map(([key, value]) =>
    supabaseAdmin.from('company_settings').upsert({ key, value: String(value) }, { onConflict: 'key' })
  );
  await Promise.all(updates);
  return NextResponse.json({ success: true });
}
*/
