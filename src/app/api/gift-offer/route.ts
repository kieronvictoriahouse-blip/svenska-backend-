import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ─── GET /api/gift-offer ──────────────────────────────────────────────
// Public : renvoie les offres "cadeau offert" actives (type=gift), chacune
// avec son déclenchement (seuil ou quantité) et ses produits éligibles
// (pour les sélecteurs de cadeau du panier).
//
// Plusieurs offres cohabitent (ex. « un Center offert dans toute
// commande » ET « 2 dipmix achetés, le 3e offert ») : `offers` les liste
// toutes, la plus récente d'abord. `offer` (la première) reste pour les
// pages pas encore à jour.
// Défensif : si la colonne gift_product_ids n'existe pas encore, renvoie vide.
export async function GET() {
  try {
    const { dansLaPeriode } = await import('@/lib/promo');
    const { listeIds, parQuantite } = await import('@/lib/cadeau');
    const { data: promos, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .eq('type', 'gift')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error || !promos || promos.length === 0) return NextResponse.json({ offer: null, offers: [] });

    // Offres valides en date + non épuisées. Dates au jour de Paris, comme le checkout (@/lib/promo).
    const valides = promos.filter((p: any) =>
      dansLaPeriode(p) === 'ok' && (!p.max_uses || (p.used_count || 0) < p.max_uses));
    if (!valides.length) return NextResponse.json({ offer: null, offers: [] });

    // Tous les produits utiles en une requête : cadeaux + déclencheurs.
    const tousIds = Array.from(new Set(valides.flatMap((p: any) => [
      ...listeIds(p.gift_product_ids), ...listeIds(p.gift_trigger_product_ids),
    ])));
    if (!tousIds.length) return NextResponse.json({ offer: null, offers: [] });

    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name_fr, name_sv, name_en, image_url, price, is_active, track_stock, stock')
      .in('id', tousIds);
    const parId: Record<string, any> = Object.fromEntries((products || []).map((p: any) => [p.id, p]));

    /* Le disponible, pas le rayon : un cadeau entièrement dû à d'autres
       commandes n'est pas offrable. Le checkout applique déjà cette
       règle — proposer ici ce qu'il refusera ensuite ne fait que
       déplacer la déception à l'étape du paiement. */
    const { quantitesReservees } = await import('@/lib/reserve');
    const reserve = await quantitesReservees();
    const fiche = (p: any) => ({
      id: p.id, name_fr: p.name_fr, name_sv: p.name_sv, name_en: p.name_en, image_url: p.image_url,
    });

    const offers = valides.map((promo: any) => {
      const eligible = listeIds(promo.gift_product_ids)
        .map(id => parId[id])
        .filter((p: any) => p && p.is_active
          && !(p.track_stock === true && ((p.stock || 0) - (reserve[p.id] || 0)) <= 0))
        .map(fiche);
      if (!eligible.length) return null;

      /* Le panier a besoin de savoir COMMENT l'offre se declenche pour
         ecrire « encore 1 Piffi » plutot que « encore 12 € ». */
      const parQte = parQuantite(promo);
      return {
        id: promo.id,
        threshold: parseFloat(promo.min_order) || 0,
        products: eligible,
        mode: parQte ? 'quantite' : 'montant',
        trigger_qty: parQte ? Number(promo.gift_trigger_qty) : null,
        trigger_products: parQte
          ? listeIds(promo.gift_trigger_product_ids).map(id => parId[id]).filter(Boolean).map(fiche)
          : [],
        max: promo.gift_max ? Number(promo.gift_max) : null,
      };
    }).filter(Boolean);

    return NextResponse.json({ offer: offers[0] || null, offers });
  } catch (e: any) {
    // Colonne absente / autre souci → pas d'offre (ne casse jamais le panier)
    return NextResponse.json({ offer: null, offers: [] });
  }
}
