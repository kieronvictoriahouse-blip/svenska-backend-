import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// ─── GET /api/products ────────────────────────────────────────────
// Lecture publique — consommée par le front HTML Netlify
// Params: ?cat=epices&lang=fr&bestseller=true&new=true&limit=20
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cat       = searchParams.get('cat');
  const bestseller = searchParams.get('bestseller');
  const isNew     = searchParams.get('new');
  const limit     = parseInt(searchParams.get('limit') || '100');
  const search    = searchParams.get('search');

  let query = supabase
    .from('products')
    .select(`
      *,
      categories ( id, slug, emoji, name_sv, name_fr, name_en ),
      product_variants ( id, label, price, is_default, sort_order )
    `)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (cat)       query = query.eq('categories.slug', cat);
  if (bestseller === 'true') query = query.eq('is_bestseller', true);
  if (isNew === 'true')      query = query.eq('is_new', true);
  if (search)    query = query.or(`name_fr.ilike.%${search}%,name_sv.ilike.%${search}%,name_en.ilike.%${search}%`);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data, total: data?.length ?? 0 });
}

// ─── POST /api/products ───────────────────────────────────────────
// Création d'un produit — admin seulement
export async function POST(req: NextRequest) {
  // Vérification auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
  }

  const body = await req.json();

  // Validation basique
  if (!body.name_fr || !body.price) {
    return NextResponse.json({ error: 'name_fr et price sont requis' }, { status: 400 });
  }

  // Insertion produit
  const { data: product, error: insertError } = await supabaseAdmin
    .from('products')
    .insert({
      category_id:   body.category_id || null,
      name_sv:       body.name_sv || body.name_fr,
      name_fr:       body.name_fr,
      name_en:       body.name_en || body.name_fr,
      subtitle_sv:   body.subtitle_sv,
      subtitle_fr:   body.subtitle_fr,
      subtitle_en:   body.subtitle_en,
      desc_sv:       body.desc_sv,
      desc_fr:       body.desc_fr,
      desc_en:       body.desc_en,
      price:         parseFloat(body.price),
      weight:        body.weight,
      origin_sv:     body.origin_sv,
      origin_fr:     body.origin_fr,
      origin_en:     body.origin_en,
      image_url:     body.image_url,
      badge:         body.badge || null,
      is_bestseller: body.is_bestseller ?? false,
      is_new:        body.is_new ?? false,
      is_active:     body.is_active ?? true,
      rating:        body.rating ?? 4.5,
      reviews_count: body.reviews_count ?? 0,
      tags:          body.tags || [],
      usage_sv:      body.usage_sv,
      usage_fr:      body.usage_fr,
      usage_en:      body.usage_en,
      ingredients_sv: body.ingredients_sv,
      ingredients_fr: body.ingredients_fr,
      ingredients_en: body.ingredients_en,
      storage_sv:    body.storage_sv,
      storage_fr:    body.storage_fr,
      storage_en:    body.storage_en,
      sort_order:    body.sort_order ?? 0,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Insertion variantes si fournies
  if (body.variants?.length > 0) {
    const variants = body.variants.map((v: any, i: number) => ({
      product_id: product.id,
      label:      v.label,
      price:      parseFloat(v.price),
      is_default: i === 0,
      sort_order: i,
    }));
    await supabaseAdmin.from('product_variants').insert(variants);
  }

  return NextResponse.json({ product }, { status: 201 });
}
