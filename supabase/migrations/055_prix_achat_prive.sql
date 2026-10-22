/* ═══════════════════════════════════════════════════════════════
   055 — COLONNES INTERNES DES PRODUITS RÉSERVÉES AU BACK-OFFICE

   Le prix d'achat, le seuil d'alerte et la quantité de réassort ne
   concernent que le back-office. Les rôles anon et authenticated ne les
   lisent plus ; le back-office lit tout avec la clé de service, qui
   n'est pas concernée. Les routes de l'API les retirent aussi
   (src/lib/produit-public.ts).

   Conséquence à connaître : avec des droits par colonne, un
   select('*') sur products par anon ou authenticated est REFUSÉ. Plus
   aucun code ne le fait (/api/homepage passe par la clé de service).
   Une colonne ajoutée plus tard reste invisible à ces rôles tant qu'on
   ne l'ajoute pas ici — c'est voulu.
   ═══════════════════════════════════════════════════════════════ */

revoke select on table public.products from anon, authenticated;

grant select (
  id, category_id, sku, ean,
  name_sv, name_fr, name_en,
  subtitle_sv, subtitle_fr, subtitle_en,
  desc_sv, desc_fr, desc_en,
  usage_sv, usage_fr, usage_en,
  ingredients_sv, ingredients_fr, ingredients_en,
  storage_sv, storage_fr, storage_en,
  allergens_sv, allergens_fr, allergens_en,
  origin_sv, origin_fr, origin_en,
  price, discount_type, discount_value, discount_start, discount_end,
  weight, pack_size, nutrition, image_url, extra_images,
  badge, tags, rating, reviews_count,
  is_active, is_bestseller, is_new, pickup_only, sort_order,
  stock, track_stock, bundle_items,
  created_at, updated_at
) on table public.products to anon, authenticated;
