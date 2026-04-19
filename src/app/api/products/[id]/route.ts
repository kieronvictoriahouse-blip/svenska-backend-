import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// Helper auth
async function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user;
}

// ─── GET /api/products/[id] ───────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
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

  // Mise à jour produit
  const updateData: Record<string, any> = {};
  const fields = [
    'category_id', 'name_sv', 'name_fr', 'name_en',
    'subtitle_sv', 'subtitle_fr', 'subtitle_en',
    'desc_sv', 'desc_fr', 'desc_en',
    'price', 'weight', 'origin_sv', 'origin_fr', 'origin_en',
    'image_url', 'badge', 'is_bestseller', 'is_new', 'is_active',
    'rating', 'reviews_count', 'tags', 'sort_order',
    'usage_sv', 'usage_fr', 'usage_en',
    'ingredients_sv', 'ingredients_fr', 'ingredients_en',
    'storage_sv', 'storage_fr', 'storage_en',
    'allergens_sv', 'allergens_fr', 'allergens_en',
    'nutrition', 'extra_images',
  ];
  fields.forEach(f => { if (body[f] !== undefined) updateData[f] = body[f]; });

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  // Soft delete (désactivation) plutôt que suppression définitive
  const { error } = await supabaseAdmin
    .from('products')
    .update({ is_active: false })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: 'Produit désactivé' });
}
