import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { rehostImage } from '@/lib/rehost-image';
import { resolveDiscount } from '@/lib/product-price';
import { pourVitrine, palierMarge } from '@/lib/produit-public';
import { champsFiche, controlerFiche, messageDoublon } from '@/lib/fiche-produit';

export const maxDuration = 60;

/* Une page au plus : PostgREST plafonne de toute façon à 1 000 lignes. */
const LIMITE_MAX = 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cat        = searchParams.get('cat');
  const bestseller = searchParams.get('bestseller');
  const isNew      = searchParams.get('new');
  const search     = searchParams.get('search');
  const sortOrder  = searchParams.get('sort_order');
  /* `limit` / `offset` étaient ignorés : ?limit=1 renvoyait tout le
     catalogue (365 Ko). Sans `limit`, on renvoie toujours tout — la
     vitrine et ses scripts de build lisent le catalogue en une fois. */
  const limit  = parseInt(searchParams.get('limit') || '', 10);
  const offset = parseInt(searchParams.get('offset') || '', 10);

  /* Vue back-office (fiches désactivées, rayon brut, prix d'achat) : sur
     jeton VALIDE seulement. La simple présence d'un en-tête Authorization
     suffisait, et n'importe qui peut en envoyer un. Un jeton refusé
     répond 401 : adminFetch renvoie alors vers la connexion, au lieu
     d'afficher en silence la vue publique. */
  const auth = !!req.headers.get('authorization');
  const isAdmin = auth && !!(await requireAuth(req));
  if (auth && !isAdmin) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  /* Filtre par rayon : sans « !inner », PostgREST ne filtre que la
     catégorie EMBARQUÉE (mise à null) et renvoie tous les produits. */
  const rayon = cat ? 'categories!inner' : 'categories';
  let query = supabaseAdmin
    .from('products')
    .select(`*, product_variants(*), ${rayon}(name_fr, name_sv, name_en, slug, discount_type, discount_value, discount_start, discount_end)`)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });   // ordre stable d'une page à l'autre
  if (!isAdmin) query = query.eq('is_active', true);

  if (sortOrder && Number.isFinite(parseInt(sortOrder, 10))) query = query.eq('sort_order', parseInt(sortOrder, 10));
  if (cat)        query = query.eq('categories.slug', cat);
  if (bestseller) query = query.eq('is_bestseller', true);
  if (isNew)      query = query.eq('is_new', true);
  if (search)     query = query.ilike('name_fr', `%${search}%`);
  if (Number.isFinite(limit) && limit > 0) {
    const debut = Number.isFinite(offset) && offset > 0 ? offset : 0;
    query = query.range(debut, debut + Math.min(limit, LIMITE_MAX) - 1);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* Le site public voit le DISPONIBLE, pas le rayon.
     `stock` compte ce qu'il y a sur l'étagère, y compris la marchandise
     déjà vendue et pas encore expédiée. La boutique qui l'affiche tel
     quel annonce « en stock » un article entièrement dû à quelqu'un
     d'autre — et le refus tombe au paiement, après le tunnel.
     Le checkout opposait déjà le disponible ; la vitrine ne le faisait
     pas. On aligne les deux à la source plutôt que dans chaque page.
     Le back-office, lui, garde le rayon brut : il affiche rayon et
     réservé côte à côte, il a besoin des deux. */
  const produits = data || [];

  /* Box (migration 054) : pas de rayon propre, le disponible se déduit
     des sachets. La vitrine le reçoit dans `stock` (avec track_stock à
     vrai) et affiche donc « en stock / stock limité / bientôt » comme
     pour n'importe quel produit ; le back-office le reçoit à part, dans
     `lot_disponible`, pour ne pas le confondre avec un rayon. */
  const { chargerLots, disponiblesLots } = await import('@/lib/lots');
  const lots = await chargerLots();
  const boxIds = (produits as any[]).filter(p => lots[p.id]).map(p => p.id);
  let reserveLots: Record<string, number> | null = null;
  let dispoBox: Record<string, number | null> = {};
  if (boxIds.length) {
    const { quantitesReservees } = await import('@/lib/reserve');
    reserveLots = await quantitesReservees();
    dispoBox = await disponiblesLots(lots, boxIds, reserveLots);
    if (isAdmin) for (const p of produits as any[]) if (p.id in dispoBox) p.lot_disponible = dispoBox[p.id];
  }

  if (!isAdmin) {
    const { quantitesReservees } = await import('@/lib/reserve');
    const reserve = reserveLots || await quantitesReservees();
    for (const p of produits as any[]) {
      /* Le flux Shopping a besoin du palier de marge, pas du coût. */
      p.margin_label = palierMarge(p);
      pourVitrine(p);
      /* Remise effective exposée à la vitrine : remise produit prioritaire,
         sinon remise de la catégorie (migration 052). Le front ne lit que
         p.discount_* → on y écrit le jeu « gagnant », il n'a rien à changer.
         (Uniquement côté public : l'admin garde la remise brute du produit
         pour éditer la fiche sans hériter par erreur de celle de la catégorie.) */
      const eff = resolveDiscount(p, p.categories);
      p.discount_type  = eff.discount_type  ?? null;
      p.discount_value = eff.discount_value ?? null;
      p.discount_start = eff.discount_start ?? null;
      p.discount_end   = eff.discount_end   ?? null;
      if (p.id in dispoBox) {
        const d = dispoBox[p.id];
        if (d !== null) { p.track_stock = true; p.stock = d; }
        continue;
      }
      if (p.track_stock !== true || typeof p.stock !== 'number') continue;
      p.stock = p.stock - (reserve[p.id] || 0);
    }
  }

  return NextResponse.json({ products: produits });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });

  // Les variantes vivent dans la table product_variants, pas dans products → on les sépare.
  const { variants } = body;

  /* Liste blanche : une clé inconnue (« brand » du scan, « categories »
     d'une ligne dupliquée…) faisait échouer l'insertion entière. */
  const fields = champsFiche(body);
  if (typeof fields.name_fr === 'string') fields.name_fr = fields.name_fr.trim();
  // Colonnes NOT NULL : une traduction absente reprend le nom français.
  for (const l of ['sv', 'en']) if (!String(fields[`name_${l}`] ?? '').trim()) fields[`name_${l}`] = fields.name_fr;
  const refus = controlerFiche(fields, { creation: true });
  if (refus) return NextResponse.json({ error: refus }, { status: 400 });

  // Rapatrie les images externes dans notre Storage (sinon liens morts type olw.se).
  // En cas d'échec on garde l'URL d'origine — mieux qu'aucune image.
  if (typeof fields.image_url === 'string' && fields.image_url) {
    fields.image_url = (await rehostImage(fields.image_url)) || fields.image_url;
  }
  if (Array.isArray(fields.extra_images) && fields.extra_images.length > 0) {
    fields.extra_images = await Promise.all(
      fields.extra_images.map(async (u: string) => (await rehostImage(u)) || u)
    );
  }

  /* Box (migration 054) : composition nettoyée, et jamais de rayon propre. */
  let estBox = false;
  if (body.bundle_items !== undefined) {
    const c = (await import('@/lib/lots')).composition(body.bundle_items);
    fields.bundle_items = c;
    if (c) { fields.track_stock = false; estBox = true; }
  }

  /* Stock initial : la fiche naît à 0 et la quantité saisie passe par le
     journal (inventaire), comme à l'import de catalogue. Écrit en direct,
     il n'avait aucune trace — premier écart inexplicable du produit. */
  const suivi = !estBox && fields.track_stock === true;
  const stockInitial = suivi && body.stock !== undefined && body.stock !== null && body.stock !== ''
    ? Math.max(0, Math.round(Number(body.stock) || 0)) : 0;
  fields.stock = suivi ? 0 : null;

  const { data, error } = await supabaseAdmin.from('products').insert(fields).select().single();
  if (error) {
    const doublon = messageDoublon(error);
    return NextResponse.json({ error: doublon || error.message }, { status: doublon ? 409 : 500 });
  }

  const avertissements: string[] = [];
  if (stockInitial > 0) {
    const { poserStock } = await import('@/lib/stock');
    const m = await poserStock(data.id, stockInitial, {
      reason: 'inventory', note: 'Stock initial — création de la fiche',
    }).catch(() => null);
    if (m) data.stock = m.after;
    else avertissements.push('Produit créé, mais le stock initial n’a pas pu être enregistré.');
  }

  // Variantes → table dédiée (le produit est déjà créé : un échec est signalé, pas bloquant)
  if (Array.isArray(variants) && variants.length > 0) {
    const rows = variants
      .filter((v: any) => v && v.label && Number(v.price) > 0)
      .map((v: any, i: number) => ({ product_id: data.id, label: v.label, price: parseFloat(v.price), is_default: i === 0, sort_order: i }));
    if (rows.length) {
      const { error: vErr } = await supabaseAdmin.from('product_variants').insert(rows);
      if (vErr) avertissements.push('Produit créé, mais ses variantes n’ont pas été enregistrées : ' + vErr.message);
    }
  }

  return NextResponse.json({ product: data, ...(avertissements.length ? { warning: avertissements.join(' ') } : {}) });
}
