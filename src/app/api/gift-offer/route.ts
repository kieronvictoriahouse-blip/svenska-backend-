import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ─── GET /api/gift-offer ──────────────────────────────────────────────
// Public : renvoie l'offre "cadeau offert" active (type=gift), avec le seuil
// (min_order) et les produits éligibles (pour le sélecteur de cadeau du panier).
// Défensif : si la colonne gift_product_ids n'existe pas encore, renvoie null.
export async function GET() {
  try {
    const now = new Date();
    const { data: promos, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .eq('type', 'gift')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error || !promos || promos.length === 0) return NextResponse.json({ offer: null });

    // Première offre cadeau valide en date + non épuisée
    const promo = promos.find((p: any) => {
      const dateOk =
        (!p.valid_from || now >= new Date(p.valid_from)) &&
        (!p.valid_until || now <= new Date(String(p.valid_until).slice(0, 10) + 'T23:59:59'));
      const usesOk = !p.max_uses || (p.used_count || 0) < p.max_uses;
      return dateOk && usesOk;
    });
    if (!promo) return NextResponse.json({ offer: null });

    // gift_product_ids : jsonb array d'UUID (peut être une string JSON selon le driver)
    let ids: string[] = [];
    const raw = (promo as any).gift_product_ids;
    if (Array.isArray(raw)) ids = raw;
    else if (typeof raw === 'string') { try { ids = JSON.parse(raw); } catch { ids = []; } }
    ids = (ids || []).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ offer: null });

    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name_fr, name_sv, name_en, image_url, price, is_active, track_stock, stock')
      .in('id', ids)
      .eq('is_active', true);

    const eligible = (products || [])
      // exclut les cadeaux en rupture si suivi de stock actif
      .filter((p: any) => !(p.track_stock === true && (p.stock || 0) <= 0))
      .map((p: any) => ({
        id: p.id,
        name_fr: p.name_fr, name_sv: p.name_sv, name_en: p.name_en,
        image_url: p.image_url,
      }));

    if (eligible.length === 0) return NextResponse.json({ offer: null });

    return NextResponse.json({
      offer: {
        id: promo.id,
        threshold: parseFloat(promo.min_order) || 0,
        products: eligible,
      },
    });
  } catch (e: any) {
    // Colonne absente / autre souci → pas d'offre (ne casse jamais le panier)
    return NextResponse.json({ offer: null });
  }
}
