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

  // Rapatrie les images externes dans notre Storage (sinon liens morts type olw.se).
  // En cas d'échec on garde l'URL d'origine — mieux qu'aucune image.
  if (typeof body.image_url === 'string' && body.image_url) {
    body.image_url = (await rehostImage(body.image_url)) || body.image_url;
  }
  if (Array.isArray(body.extra_images) && body.extra_images.length > 0) {
    body.extra_images = await Promise.all(
      body.extra_images.map(async (u: string) => (await rehostImage(u)) || u)
    );
  }

  const { data, error } = await supabaseAdmin.from('products').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ product: data });
}
