import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

/* Recherche d'un produit par code-barres.
   GET /api/scan?ean=7310865004703
   Un UPC-A à 12 chiffres et sa forme GTIN-13 (avec le zéro de tête)
   désignent le même article : les deux sont cherchées.
   Réponse : { found, product } — et si l'EAN est inconnu, on interroge
   Open Food Facts pour pré-remplir une création (très bonne couverture
   des produits alimentaires suédois). */

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const ean = (new URL(req.url).searchParams.get('ean') || '').trim();
  if (!ean) return NextResponse.json({ error: 'EAN manquant' }, { status: 400 });

  /* Un même produit s'écrit de deux façons. Les codes américains
     (UPC-A, 12 chiffres) sont la forme courte d'un GTIN-13 : il suffit
     d'ajouter un zéro devant. zxing-cpp rend systématiquement la forme
     longue, mais la fiche produit peut avoir été saisie à la main
     depuis l'étiquette, où figurent les 12 chiffres.
     Chercher une seule forme, c'est déclarer inconnu un article qu'on
     a bel et bien en base — et proposer de le créer une deuxième fois. */
  const formes = [ean];
  if (/^\d{12}$/.test(ean)) formes.push('0' + ean);
  else if (/^0\d{12}$/.test(ean)) formes.push(ean.slice(1));

  const { data: trouves } = await supabaseAdmin
    .from('products')
    .select('id, name_fr, name_sv, name_en, price, cost_price, stock, stock_alert, track_stock, image_url, category_id, weight, ean, sort_order')
    .in('ean', formes);

  const product = (trouves || [])[0] || null;

  if (product) return NextResponse.json({ found: true, product });

  // EAN inconnu : proposition de pré-remplissage, jamais de création automatique.
  let suggestion: any = null;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json`, {
      headers: { 'User-Agent': 'SwedishCravings-Admin/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const d = await r.json();
      const p = d?.product;
      if (p && d.status === 1) {
        suggestion = {
          name: p.product_name_fr || p.product_name || p.product_name_sv || '',
          brand: (p.brands || '').split(',')[0]?.trim() || '',
          weight: p.quantity || '',
          image_url: p.image_front_url || p.image_url || '',
          ingredients: p.ingredients_text_fr || p.ingredients_text || '',
          allergens: (p.allergens_tags || []).map((a: string) => a.split(':').pop()).join(', '),
        };
      }
    }
  } catch { /* source externe indisponible : on renvoie simplement rien */ }

  return NextResponse.json({ found: false, ean, suggestion });
}
