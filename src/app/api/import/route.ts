import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/import
 * Import en masse des produits depuis le tableau PRODUCTS statique du front.
 * À utiliser UNE SEULE FOIS pour migrer les données initiales.
 *
 * Body: { products: [...], secret: "VOTRE_SECRET" }
 * Protégé par un secret dans .env pour éviter les abus.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Vérification secret
  const secret = process.env.IMPORT_SECRET;
  if (!secret || body.secret !== secret) {
    return NextResponse.json({ error: 'Secret invalide' }, { status: 403 });
  }

  const { products = [] } = body;
  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: 'Aucun produit fourni' }, { status: 400 });
  }

  // Récupérer les catégories existantes pour matcher
  const { data: cats } = await supabaseAdmin.from('categories').select('*');
  const catMap: Record<string, string> = {};
  (cats || []).forEach(c => {
    catMap[c.name_fr.toLowerCase()] = c.id;
    catMap[c.slug] = c.id;
  });

  const inserted: any[] = [];
  const errors:   any[] = [];

  for (const p of products) {
    try {
      // Résoudre la catégorie
      const catId = catMap[p.cat?.toLowerCase()] || catMap[p.catSlug] || null;

      const { data: prod, error: prodErr } = await supabaseAdmin.from('products').insert({
        category_id:   catId,
        name_sv:       p.name?.sv || p.name_fr || '',
        name_fr:       p.name?.fr || p.name_fr || '',
        name_en:       p.name?.en || p.name_fr || '',
        subtitle_sv:   p.subtitle?.sv,
        subtitle_fr:   p.subtitle?.fr,
        subtitle_en:   p.subtitle?.en,
        desc_sv:       p.desc?.sv,
        desc_fr:       p.desc?.fr,
        desc_en:       p.desc?.en,
        price:         parseFloat(p.price) || 0,
        weight:        p.weight,
        origin_sv:     p.origin?.sv || 'Suède',
        origin_fr:     p.origin?.fr || 'Suède',
        origin_en:     p.origin?.en || 'Sweden',
        image_url:     p.photo || null,
        badge:         p.badge || null,
        is_bestseller: p.bestseller ?? false,
        is_new:        p.isNew ?? false,
        is_active:     true,
        rating:        parseFloat(p.rating) || 4.5,
        reviews_count: parseInt(p.reviews) || 0,
        tags:          Array.isArray(p.tags) ? p.tags : [],
        usage_sv:      p.usage?.sv,
        usage_fr:      p.usage?.fr,
        usage_en:      p.usage?.en,
        ingredients_sv: p.ingredients?.sv,
        ingredients_fr: p.ingredients?.fr,
        ingredients_en: p.ingredients?.en,
        storage_sv:    p.storage?.sv,
        storage_fr:    p.storage?.fr,
        storage_en:    p.storage?.en,
        sort_order:    p.id || 0,
      }).select().single();

      if (prodErr) throw prodErr;

      // Insérer les variantes
      if (p.variants?.length > 0 && prod) {
        const variants = p.variants.map((v: any, i: number) => ({
          product_id: prod.id,
          label:      v.label,
          price:      parseFloat(v.price),
          is_default: i === 0,
          sort_order: i,
        }));
        await supabaseAdmin.from('product_variants').insert(variants);
      }

      inserted.push({ id: prod?.id, name: p.name?.fr || p.name_fr });
    } catch (err: any) {
      errors.push({ product: p.name?.fr || p.name_fr, error: err.message });
    }
  }

  return NextResponse.json({
    message: `Import terminé : ${inserted.length} produits importés, ${errors.length} erreurs`,
    inserted,
    errors,
  });
}
