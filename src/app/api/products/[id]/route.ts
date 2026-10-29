import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { rehostImage } from '@/lib/rehost-image';
import { pourVitrine } from '@/lib/produit-public';
import { champsFiche, controlerFiche, messageDoublon } from '@/lib/fiche-produit';

export const maxDuration = 60;

// Helper auth

// ─── GET /api/products/[id] ───────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Fiche produit : donnee de catalogue, lue par le site public.
  /* Vue back-office sur jeton VALIDE seulement (cf. GET /api/products). */
  const auth = !!req.headers.get('authorization');
  const isAdmin = auth && !!(await requireAuth(req));
  if (auth && !isAdmin) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('products')
    .select(`
      *,
      categories ( * ),
      product_variants ( * )
    `)
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
  /* Fiche dépubliée (brouillon) : introuvable pour le public, comme dans
     la liste. Elle se lisait en entier avec son identifiant. */
  if (!isAdmin && (data as any).is_active === false) {
    return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
  }

  /* Pré-commande (migration 065) : unités payées encore à servir — la
     quantité à acheter. Back-office seulement. */
  if (isAdmin && ((data as any).preorder || (data as any).preorder_ship_date)) {
    const { precommandesDues } = await import('@/lib/precommande');
    (data as any).preorder_dues = (await precommandesDues([params.id]))[params.id] || 0;
  }

  /* Même règle que sur la liste : la fiche publique annonce le
     disponible. Sans ça, la vitrine et le tunnel se contredisent —
     « I LAGER » sur la page, refus au paiement. */
  /* Box (migration 054) : contenu détaillé (pour la fiche) et disponible
     déduit des sachets. Côté vitrine il remplace `stock`, côté
     back-office il arrive à part dans `lot_disponible`. */
  const { composition, disponiblesLots } = await import('@/lib/lots');
  const compo = composition((data as any).bundle_items);
  if (compo) {
    const { data: sachets } = await supabaseAdmin
      .from('products').select('id, name_fr, name_sv, name_en, image_url, price, weight')
      .in('id', compo.map(c => c.product_id));
    (data as any).lot_contenu = compo.map(c => ({
      ...c, ...((sachets || []).find((s: any) => s.id === c.product_id) || {}),
    }));
    const { quantitesReservees } = await import('@/lib/reserve');
    const d = (await disponiblesLots({ [params.id]: compo }, [params.id], await quantitesReservees()))[params.id];
    if (isAdmin) (data as any).lot_disponible = d;
    else {
      if (d !== null) { (data as any).track_stock = true; (data as any).stock = d; }
      pourVitrine(data);
    }
    return NextResponse.json({ product: data });
  }

  if (!isAdmin) pourVitrine(data);
  if (!isAdmin
      && (data as any).track_stock === true
      && typeof (data as any).stock === 'number') {
    const { reservePour } = await import('@/lib/reserve');
    const r = await reservePour([params.id]);
    (data as any).stock = (data as any).stock - (r[params.id] || 0);
  }

  return NextResponse.json({ product: data });
}

// ─── PUT /api/products/[id] ───────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });

  /* Mise à jour produit : liste blanche commune avec la création
     (lib/fiche-produit). track_stock / stock_alert / pack_size y sont :
     ils manquaient ici, la route les jetait en répondant 200. Remise par
     article (migration 049) : seuls ses paramètres sont stockés. */
  const updateData: Record<string, any> = champsFiche(body);
  if (typeof updateData.name_fr === 'string') updateData.name_fr = updateData.name_fr.trim();

  /* Contrôles : nom FR non vide, prix > 0, remise cohérente, EAN valide.
     L'autosave de la fiche envoie tout le formulaire : un prix effacé le
     temps de le retaper partait en ligne à 0 €. Un EAN déjà en base n'est
     pas recontrôlé. */
  let eanActuel: string | null = null;
  if (updateData.ean) {
    const { data: avant } = await supabaseAdmin.from('products').select('ean').eq('id', params.id).maybeSingle();
    eanActuel = (avant as any)?.ean ?? null;
  }
  const refus = controlerFiche(updateData, { eanActuel });
  if (refus) return NextResponse.json({ error: refus }, { status: 400 });

  // Rapatrie les nouvelles images externes dans notre Storage (évite les liens morts).
  if (typeof updateData.image_url === 'string' && updateData.image_url) {
    updateData.image_url = (await rehostImage(updateData.image_url)) || updateData.image_url;
  }
  if (Array.isArray(updateData.extra_images)) {
    updateData.extra_images = await Promise.all(
      updateData.extra_images.map(async (u: string) => (await rehostImage(u)) || u)
    );
  }

  /* Composition d'une box (migration 054). Nettoyée ici : une box ne se
     contient pas elle-même, et elle n'a jamais de rayon propre — son
     stock, c'est celui de ses sachets. `null` repasse en produit simple. */
  if (body.bundle_items !== undefined) {
    const { composition } = await import('@/lib/lots');
    const c = (composition(body.bundle_items) || []).filter(i => i.product_id !== params.id);
    updateData.bundle_items = c.length ? c : null;
    if (c.length) updateData.track_stock = false;
  }

  /* Ne rien mettre a jour n'est pas une erreur, mais PostgREST refuse un
     PATCH vide : « Cannot coerce the result to a single JSON object ».
     C'est exactement le cas de l'ecran Stocks, qui n'envoie que `stock`
     — un champ traite plus bas, hors liste blanche. On se contente alors
     de relire le produit. */
  let product: any = null;
  if (Object.keys(updateData).length > 0) {
    const { data, error } = await supabaseAdmin
      .from('products').update(updateData).eq('id', params.id).select().single();
    if (error) {
      const doublon = messageDoublon(error);
      return NextResponse.json({ error: doublon || error.message }, { status: doublon ? 409 : 500 });
    }
    product = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('products').select('*').eq('id', params.id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    product = data;
  }

  /* Le stock ne s'ecrit pas comme un champ ordinaire : toute variation
     doit laisser une trace datee, sinon un ecart devient inexplicable.
     Il etait absent de la liste blanche ci-dessus, donc silencieusement
     ignore — le « + » de l'ecran Stocks n'ecrivait rien et n'affichait
     aucune erreur. On le route ici vers le journal. */
  /* Valeur ABSOLUE (« j'en compte 12 ») : posée par poserStock, qui
     relit et écrit sous garde. L'ancien calcul « visé − lu juste avant »
     appliquait un delta à un état déjà périmé si une expédition passait
     entre la lecture et l'écriture. */
  if (body.stock !== undefined && body.stock !== null && body.stock !== '') {
    const vise = Math.max(0, Math.round(Number(body.stock) || 0));
    const { poserStock } = await import('@/lib/stock');
    const m = await poserStock(params.id, vise, {
      reason: body.stock_reason || 'manual',
      reference: body.stock_reference || undefined,
      note: body.stock_note || 'Saisie depuis le back-office',
    }).catch(() => null);
    if (!m) {
      /* Le silence est ce qui a coute le plus cher ici : un ajustement
         refuse doit se voir, pas se deviner au rechargement. */
      return NextResponse.json(
        { error: 'Stock non enregistre — le mouvement a echoue.' }, { status: 500 });
    }
    (product as any).stock = m.after;
  }

  /* Variantes (remplace tout) : les nouvelles d'abord, l'ancien jeu n'est
     retiré qu'une fois celles-ci écrites. Dans l'ordre inverse, un échec
     d'insertion laissait le produit sans aucune variante, réponse 200. */
  if (Array.isArray(body.variants)) {
    const { data: anciennes } = await supabaseAdmin
      .from('product_variants').select('id').eq('product_id', params.id);
    const rows = body.variants
      .filter((v: any) => v && v.label && Number(v.price) > 0)
      .map((v: any, i: number) => ({
        product_id: params.id,
        label:      v.label,
        price:      parseFloat(v.price),
        is_default: i === 0,
        sort_order: i,
      }));
    if (rows.length) {
      const { error: vErr } = await supabaseAdmin.from('product_variants').insert(rows);
      if (vErr) return NextResponse.json({ error: 'Variantes non enregistrées : ' + vErr.message }, { status: 500 });
    }
    const ids = (anciennes || []).map((v: any) => v.id);
    if (ids.length) {
      const { error: dErr } = await supabaseAdmin.from('product_variants').delete().in('id', ids);
      if (dErr) return NextResponse.json({ error: 'Anciennes variantes non retirées : ' + dErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ product });
}

// ─── DELETE /api/products/[id] ────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  // Supprimer les tables liées avant le produit (FK constraints)
  await supabaseAdmin.from('product_variants').delete().eq('product_id', params.id);
  await supabaseAdmin.from('stock_movements').delete().eq('product_id', params.id);

  const { error } = await supabaseAdmin.from('products').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: 'Produit supprimé' });
}
