import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { controlerRayon } from '@/lib/fiche-produit';
import { boutiqueDeRequete, codeBoutique } from '@/lib/boutique';

/* Boutique nommée par l'appel (?boutique= ou en-tête x-boutique). */
const boutiqueExplicite = (req: NextRequest) =>
  req.nextUrl.searchParams.has('boutique') || req.headers.has('x-boutique');

export async function GET(req: NextRequest) {
  /* Vitrine : les rayons de sa seule boutique (migration 066). Le
     back-office (jeton admin valide), sans boutique demandée, voit tout.
     Un jeton refusé n'est pas une erreur ici : la route était publique,
     elle répond la vue vitrine comme avant. */
  const admin = !!req.headers.get('authorization') && !!(await requireAuth(req));
  let q = supabase
    .from('categories')
    .select('*');
  if (!admin || boutiqueExplicite(req)) q = q.eq('boutique_id', boutiqueDeRequete(req));
  const { data, error } = await q.order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  /* Liste blanche (le corps était inséré tel quel) ; noms SV/EN repris du
     français s'ils manquent (colonnes NOT NULL). */
  const ALLOWED = ['slug', 'emoji', 'name_fr', 'name_sv', 'name_en', 'sort_order', 'is_active',
    'discount_type', 'discount_value', 'discount_start', 'discount_end'];
  const row: Record<string, any> = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED.includes(k)));
  row.name_fr = String(row.name_fr ?? '').trim();
  row.slug = String(row.slug ?? '').trim();
  for (const l of ['sv', 'en']) if (!String(row[`name_${l}`] ?? '').trim()) row[`name_${l}`] = row.name_fr;
  const refus = controlerRayon(row, { creation: true });
  if (refus) return NextResponse.json({ error: refus }, { status: 400 });
  /* Boutique : seulement si l'écran la nomme ; sinon défaut de la base (Swedish Cravings). */
  if (typeof body.boutique_id === 'string' && body.boutique_id.trim()) row.boutique_id = codeBoutique(body.boutique_id);
  else if (boutiqueExplicite(req)) row.boutique_id = boutiqueDeRequete(req);

  const { data, error } = await supabaseAdmin.from('categories').insert(row).select().single();
  if (error) {
    // Adresse déjà prise : message clair plutôt que l'erreur PostgreSQL brute.
    if (error.code === '23505') return NextResponse.json({ error: 'Cette adresse (slug) est déjà utilisée par une autre catégorie.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ category: data }, { status: 201 });
}
