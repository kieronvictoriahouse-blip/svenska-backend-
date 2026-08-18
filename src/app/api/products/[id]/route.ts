import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { rehostImage } from '@/lib/rehost-image';

export const maxDuration = 60;

// Helper auth

// ─── GET /api/products/[id] ───────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  // Fiche produit : donnee de catalogue, lue par le site public.
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
  return NextResponse.json({ product: data });
}

// ─── PUT /api/products/[id] ───────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();

  // Rapatrie les nouvelles images externes dans notre Storage (évite les liens morts).
  if (typeof body.image_url === 'string' && body.image_url) {
    body.image_url = (await rehostImage(body.image_url)) || body.image_url;
  }
  if (Array.isArray(body.extra_images)) {
    body.extra_images = await Promise.all(
      body.extra_images.map(async (u: string) => (await rehostImage(u)) || u)
    );
  }

  // Mise à jour produit
  const updateData: Record<string, any> = {};
  const fields = [
    'category_id', 'name_sv', 'name_fr', 'name_en',
    'subtitle_sv', 'subtitle_fr', 'subtitle_en',
    'desc_sv', 'desc_fr', 'desc_en',
    'price', 'cost_price', 'weight', 'origin_sv', 'origin_fr', 'origin_en',
    'image_url', 'badge', 'is_bestseller', 'is_new', 'is_active', 'pickup_only',
    'rating', 'reviews_count', 'tags', 'sort_order', 'reorder_qty',
    'usage_sv', 'usage_fr', 'usage_en',
    'ingredients_sv', 'ingredients_fr', 'ingredients_en',
    'storage_sv', 'storage_fr', 'storage_en',
    'allergens_sv', 'allergens_fr', 'allergens_en',
    'nutrition', 'extra_images', 'ean', 'sku',
    /* Ces quatre-la manquaient : le formulaire produit les envoyait, la
       route les jetait, et repondait 200. Cocher « suivi de stock » ou
       changer un seuil n'avait aucun effet, sans le moindre message. */
    'track_stock', 'stock_alert', 'pack_size',
  ];
  fields.forEach(f => { if (body[f] !== undefined) updateData[f] = body[f]; });

  /* Ne rien mettre a jour n'est pas une erreur, mais PostgREST refuse un
     PATCH vide : « Cannot coerce the result to a single JSON object ».
     C'est exactement le cas de l'ecran Stocks, qui n'envoie que `stock`
     — un champ traite plus bas, hors liste blanche. On se contente alors
     de relire le produit. */
  let product: any = null;
  if (Object.keys(updateData).length > 0) {
    const { data, error } = await supabaseAdmin
      .from('products').update(updateData).eq('id', params.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  if (body.stock !== undefined && body.stock !== null) {
    const vise = Math.max(0, Math.round(Number(body.stock) || 0));
    const actuel = Number(product?.stock) || 0;
    if (vise !== actuel) {
      const { adjustStock } = await import('@/lib/stock');
      const m = await adjustStock(params.id, vise - actuel, {
        reason: body.stock_reason || 'manual',
        reference: body.stock_reference || null,
        note: body.stock_note || 'Saisie depuis le back-office',
      });
      if (!m) {
        /* Le silence est ce qui a coute le plus cher ici : un ajustement
           refuse doit se voir, pas se deviner au rechargement. */
        return NextResponse.json(
          { error: 'Stock non enregistre — le mouvement a echoue.' }, { status: 500 });
      }
      (product as any).stock = m.after;
    }
  }

  // Mise à jour variantes (remplace tout)
  if (body.variants !== undefined) {
    await supabaseAdmin.from('product_variants').delete().eq('product_id', params.id);
    if (body.variants.length > 0) {
      const variants = body.variants.map((v: any, i: number) => ({
        product_id: params.id,
        label:      v.label,
        price:      parseFloat(v.price),
        is_default: i === 0,
        sort_order: i,
      }));
      await supabaseAdmin.from('product_variants').insert(variants);
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
