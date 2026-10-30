import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { SLUG } from '@/lib/fiche-produit';
import { boutiqueDeRequete, codeBoutique } from '@/lib/boutique';

/* Boutique nommée par l'appel (?boutique=, en-tête x-boutique). */
const boutiqueExplicite = (req: NextRequest) =>
  req.nextUrl.searchParams.has('boutique') || req.headers.has('x-boutique');

export const dynamic = 'force-dynamic';
/* Colonnes d'une page que l'écran écrit (le corps était inséré tel quel). */
const CHAMPS_PAGE = [
  'slug', 'title_fr', 'title_sv', 'title_en', 'nav_label_fr', 'nav_label_sv', 'nav_label_en',
  'hero_image', 'hero_title_fr', 'hero_title_sv', 'hero_title_en',
  'hero_subtitle_fr', 'hero_subtitle_sv', 'hero_subtitle_en',
  'blocks', 'show_in_nav', 'is_active', 'sort_order',
];

export async function GET(req: NextRequest) {
  try {
    /* L'écran Pages voit aussi les pages désactivées : décocher « active »
       faisait disparaître la page de la liste, sans moyen de la retrouver. */
    const admin = !!req.headers.get('authorization') && !!(await requireAuth(req));
    let q = supabaseAdmin
      .from('cms_pages')
      .select('id, slug, title_fr, title_sv, title_en, nav_label_fr, nav_label_sv, nav_label_en, show_in_nav, is_active, sort_order')
      .order('sort_order');
    if (!admin) q = q.eq('is_active', true);
    // Vitrine : ses seules pages (migration 066) ; l'écran Pages, sans boutique demandée, voit tout.
    if (!admin || boutiqueExplicite(req)) q = q.eq('boutique_id', boutiqueDeRequete(req));
    const { data, error } = await q;
    if (error) { console.error('[pages] GET:', error.message); return NextResponse.json({ pages: [] }); }
    return NextResponse.json({ pages: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[pages] GET exception:', msg);
    return NextResponse.json({ pages: [] });
  }
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const body = await req.json();
    const row: Record<string, any> = Object.fromEntries(Object.entries(body || {}).filter(([k]) => CHAMPS_PAGE.includes(k)));
    // Boutique : seulement si l'écran la nomme ; sinon défaut de la base (Swedish Cravings).
    if (typeof body?.boutique_id === 'string' && body.boutique_id.trim()) row.boutique_id = codeBoutique(body.boutique_id);
    else if (boutiqueExplicite(req)) row.boutique_id = boutiqueDeRequete(req);
    // L'adresse finit dans une URL publique (/pages/<slug>) : forme stricte.
    if (!SLUG.test(String(row.slug || ''))) {
      return NextResponse.json({ error: 'Adresse (slug) invalide : minuscules sans accent, chiffres et tirets seulement.' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from('cms_pages').insert(row).select().maybeSingle();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Une page utilise déjà cette adresse.' }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ page: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
