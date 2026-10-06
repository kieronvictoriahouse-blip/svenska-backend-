/* ═══════════════════════════════════════════════════════════════
   054 — LOTS (box)

   Un lot est un produit vendu comme les autres (prix, photo, fiche),
   mais composé d'autres produits du catalogue :

     bundle_items = [{"product_id": "<uuid>", "qty": 2}, …]
     NULL         = produit simple (cas de tous les produits existants)

   Le lot n'a PAS de stock propre (track_stock reste false) : son
   disponible se déduit de ses composants, et c'est sa vente qui
   réserve puis, à l'expédition, sort les sachets du rayon.
   Toute la logique vit dans src/lib/lots.ts.
   ═══════════════════════════════════════════════════════════════ */

alter table public.products add column if not exists bundle_items jsonb;

comment on column public.products.bundle_items is
  'Composition d''un lot : [{product_id, qty}]. NULL = produit simple.';
