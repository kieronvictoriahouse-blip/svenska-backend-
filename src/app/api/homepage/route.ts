import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { pourVitrine } from '@/lib/produit-public';
import { boutiqueDeRequete, codeBoutique } from '@/lib/boutique';

/* Boutique nommée par l'appel (?boutique=, en-tête x-boutique). */
const boutiqueExplicite = (req: NextRequest) =>
  req.nextUrl.searchParams.has('boutique') || req.headers.has('x-boutique');

// ─── GET /api/homepage ────────────────────────────────────────────
// Lecture publique — consommée par le front Netlify
export async function GET(req: NextRequest) {
  /* Vitrine : sections et produits de sa seule boutique (migration 066).
     L'écran Accueil (jeton admin valide), sans boutique demandée, lit
     tout comme avant ; un jeton refusé reçoit la vue publique. */
  const admin = !!req.headers.get('authorization') && !!(await requireAuth(req));
  const b = boutiqueDeRequete(req);
  const filtrer = !admin || boutiqueExplicite(req);

  // Sections configurables
  let qSections = supabase
    .from('homepage_sections')
    .select('*')
    .eq('is_active', true);
  if (filtrer) qSections = qSections.eq('boutique_id', b);
  const { data: sections, error: sError } = await qSections
    .order('sort_order', { ascending: true });

  if (sError) return NextResponse.json({ error: sError.message }, { status: 500 });

  /* Produits : lus avec la clé de service puis nettoyés, comme sur
     /api/products. La clé anonyme ne lit plus le prix d'achat
     (migration 055), et un select('*') anonyme serait refusé. */
  // Produits mis en avant (bestsellers)
  let qBest = supabaseAdmin
    .from('products')
    .select('*, categories(*), product_variants(*)')
    .eq('is_active', true)
    .eq('is_bestseller', true);
  if (filtrer) qBest = qBest.eq('boutique_id', b);
  const { data: bestsellers } = await qBest
    .order('sort_order', { ascending: true })
    .limit(6);

  // Nouveautés
  let qNew = supabaseAdmin
    .from('products')
    .select('*, categories(*), product_variants(*)')
    .eq('is_active', true)
    .eq('is_new', true);
  if (filtrer) qNew = qNew.eq('boutique_id', b);
  const { data: newArrivals } = await qNew
    .order('sort_order', { ascending: true })
    .limit(4);

  // Snacks & Confiseries pour le fredagsmys band
  // « !inner » : sans lui, le filtre sur categories.slug ne filtrait pas les produits.
  let qSnacks = supabaseAdmin
    .from('products')
    .select('*, categories!inner(*)')
    .eq('is_active', true)
    .in('categories.slug', ['snacks-chips', 'confiseries']);
  if (filtrer) qSnacks = qSnacks.eq('boutique_id', b);
  const { data: snacks } = await qSnacks
    .order('sort_order', { ascending: true })
    .limit(4);

  return NextResponse.json({
    sections,
    bestsellers: (bestsellers || []).map(pourVitrine),
    new_arrivals: (newArrivals || []).map(pourVitrine),
    snacks: (snacks || []).map(pourVitrine),
  });
}

// ─── PUT /api/homepage ────────────────────────────────────────────
// Mise à jour d'une section (admin)
export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const token = authHeader.slice(7);
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

  const body = await req.json();
  const { key, ...updates } = body;
  if (!key) return NextResponse.json({ error: 'key requis' }, { status: 400 });

  /* Boutique nommée (corps ou ?boutique) : on ne touche que sa section,
     sans la déplacer. Sinon, comme avant. */
  let bn: string | null = null;
  if (typeof updates.boutique_id === 'string' && updates.boutique_id.trim()) bn = codeBoutique(updates.boutique_id);
  else if (boutiqueExplicite(req)) bn = boutiqueDeRequete(req);
  if (bn) delete updates.boutique_id;

  let maj = supabaseAdmin
    .from('homepage_sections')
    .update(updates)
    .eq('key', key);
  if (bn) maj = maj.eq('boutique_id', bn);
  const { data, error } = await maj
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ section: data });
}
