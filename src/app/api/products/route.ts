import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { rehostImage } from '@/lib/rehost-image';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cat        = searchParams.get('cat');
  const bestseller = searchParams.get('bestseller');
  const isNew      = searchParams.get('new');
  const search     = searchParams.get('search');
  const sortOrder  = searchParams.get('sort_order');

  const isAdmin = !!req.headers.get('authorization');
  let query = supabaseAdmin
    .from('products')
    .select('*, product_variants(*), categories(name_fr, name_sv, name_en, slug)')
    .order('sort_order', { ascending: true });
  if (!isAdmin) query = query.eq('is_active', true);

  if (sortOrder) query = query.eq('sort_order', parseInt(sortOrder));
  if (cat)        query = query.eq('categories.slug', cat);
  if (bestseller) query = query.eq('is_bestseller', true);
  if (isNew)      query = query.eq('is_new', true);
  if (search)     query = query.ilike('name_fr', `%${search}%`);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data || [] });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();

  // Les variantes vivent dans la table product_variants, pas dans products → on les sépare.
  const { variants, ...fields } = body;

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

  const { data, error } = await supabaseAdmin.from('products').insert(fields).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Variantes → table dédiée (non bloquant : le produit est déjà créé)
  if (Array.isArray(variants) && variants.length > 0) {
    const rows = variants
      .filter((v: any) => v && v.label)
      .map((v: any, i: number) => ({ product_id: data.id, label: v.label, price: parseFloat(v.price), is_default: i === 0, sort_order: i }));
    if (rows.length) await supabaseAdmin.from('product_variants').insert(rows);
  }

  return NextResponse.json({ product: data });
}
