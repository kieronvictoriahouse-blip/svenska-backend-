import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { boutiqueDeRequete, codeBoutique } from '@/lib/boutique';

/* Boutique nommée par l'appel (?boutique=, en-tête x-boutique). */
const boutiqueExplicite = (req: NextRequest) =>
  req.nextUrl.searchParams.has('boutique') || req.headers.has('x-boutique');

/* Colonnes modifiables (le corps était écrit tel quel, `id` et `slug` compris). */
const CHAMPS_PAGE = [
  'title_fr', 'title_sv', 'title_en', 'nav_label_fr', 'nav_label_sv', 'nav_label_en',
  'hero_image', 'hero_title_fr', 'hero_title_sv', 'hero_title_en',
  'hero_subtitle_fr', 'hero_subtitle_sv', 'hero_subtitle_en',
  'blocks', 'show_in_nav', 'is_active', 'sort_order',
];

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    // Page désactivée : visible de l'écran Pages, pas du public.
    const admin = !!req.headers.get('authorization') && !!(await requireAuth(req));
    let q = supabaseAdmin.from('cms_pages').select('*').eq('slug', params.slug);
    if (!admin) q = q.eq('is_active', true);
    // Vitrine : une page d'une autre boutique est introuvable (migration 066).
    if (!admin || boutiqueExplicite(req)) q = q.eq('boutique_id', boutiqueDeRequete(req));
    const { data, error } = await q.maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ page: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[pages/slug] GET exception:', msg);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const body = await req.json();
    const maj = Object.fromEntries(Object.entries(body || {}).filter(([k]) => CHAMPS_PAGE.includes(k)));
    /* Boutique nommée (corps ou ?boutique) : on ne touche que sa page de
       cette adresse. Sinon, comme avant. */
    let q = supabaseAdmin
      .from('cms_pages')
      .update({ ...maj, updated_at: new Date().toISOString() })
      .eq('slug', params.slug);
    if (typeof body?.boutique_id === 'string' && body.boutique_id.trim()) q = q.eq('boutique_id', codeBoutique(body.boutique_id));
    else if (boutiqueExplicite(req)) q = q.eq('boutique_id', boutiqueDeRequete(req));
    const { data, error } = await q.select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Aucune ligne : la page a été supprimée ou renommée ailleurs — ne pas annoncer « sauvée ».
    if (!data) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 });
    return NextResponse.json({ page: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string } }) {
  if (!await requireAuth(_req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    let q = supabaseAdmin.from('cms_pages').delete().eq('slug', params.slug);
    // Boutique nommée : seule sa page de cette adresse part.
    if (boutiqueExplicite(_req)) q = q.eq('boutique_id', boutiqueDeRequete(_req));
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
