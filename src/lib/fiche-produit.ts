/* ═══════════════════════════════════════════════════════════════
   FICHE PRODUIT — champs modifiables et contrôles d'écriture

   Partagé par POST /api/products (création, duplication, import par
   URL) et PUT /api/products/[id] (fiche, liste, écran Stock).

   Avant, la création insérait le corps de la requête tel quel : une
   clé inconnue (« brand » venu du scan, « categories » et
   « product_variants » d'une ligne de liste dupliquée) faisait échouer
   l'insertion, et rien ne refusait un prix à 0 € ou un nom vide —
   un produit gratuit pouvait partir en ligne.

   Fichier sans dépendance serveur : le formulaire peut l'importer.
   ═══════════════════════════════════════════════════════════════ */

/** Colonnes qu'un écran peut écrire directement sur `products`.
 *  `stock` n'y est pas (il passe par le journal, lib/stock) ;
 *  `bundle_items` non plus (nettoyée par lib/lots). */
export const CHAMPS_FICHE = [
  'category_id', 'name_sv', 'name_fr', 'name_en',
  'subtitle_sv', 'subtitle_fr', 'subtitle_en',
  'desc_sv', 'desc_fr', 'desc_en',
  'price', 'cost_price', 'weight', 'origin_sv', 'origin_fr', 'origin_en',
  'image_url', 'badge', 'is_bestseller', 'is_new', 'is_active', 'pickup_only',
  'rating', 'reviews_count', 'tags', 'sort_order', 'reorder_qty',
  'usage_sv', 'usage_fr', 'usage_en',
  'ingredients_sv', 'ingredients_fr', 'ingredients_en',
  'storage_sv', 'storage_fr', 'storage_en',
  'allergens_sv', 'allergens_fr', 'allergens_en',
  'nutrition', 'extra_images', 'ean', 'sku',
  // Fabricant, mention obligatoire de la fiche (migration 060)
  'manufacturer',
  'track_stock', 'stock_alert', 'pack_size',
  // Remise par article (migration 049)
  'discount_type', 'discount_value', 'discount_start', 'discount_end',
  // Pré-commande (migration 065)
  'preorder', 'preorder_ship_date', 'preorder_end',
] as const;

/** Ne garde que les colonnes modifiables (les clés absentes restent absentes).
 *  EAN et référence vides deviennent NULL : leurs index uniques ignorent
 *  NULL mais pas '' — la deuxième fiche sans référence était refusée. */
export function champsFiche(body: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of CHAMPS_FICHE) if (body && body[f] !== undefined) out[f] = body[f];
  for (const k of ['ean', 'sku'] as const) {
    if (!(k in out)) continue;
    const s = String(out[k] ?? '').trim();
    out[k] = s ? (k === 'sku' ? s.toUpperCase() : s) : null;
  }
  if ('category_id' in out && !out.category_id) out.category_id = null;
  return out;
}

/** EAN-8, UPC-A (12), EAN-13 ou GTIN-14, clé de contrôle comprise. */
export function eanValide(v: string): boolean {
  const s = String(v || '').trim();
  if (!/^\d+$/.test(s) || ![8, 12, 13, 14].includes(s.length)) return false;
  const chiffres = s.split('').map(Number);
  const cle = chiffres.pop()!;
  let somme = 0;
  // De droite à gauche (sans la clé) : poids 3, 1, 3, 1…
  for (let i = chiffres.length - 1, k = 0; i >= 0; i--, k++) somme += chiffres[i] * (k % 2 === 0 ? 3 : 1);
  return (10 - (somme % 10)) % 10 === cle;
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Contrôle les champs PRÉSENTS dans `f` (une mise à jour partielle ne
 * redemande pas le nom ni le prix). À la création, nom FR et prix sont
 * exigés. `eanActuel` : l'EAN déjà en base — un code inchangé n'est pas
 * revérifié, pour ne jamais bloquer l'enregistrement d'une fiche ancienne.
 * Renvoie le message à afficher, ou null si tout va bien.
 */
export function controlerFiche(
  f: Record<string, any>,
  opts: { creation?: boolean; eanActuel?: string | null } = {},
): string | null {
  if (opts.creation || 'name_fr' in f) {
    if (!String(f.name_fr ?? '').trim()) return 'Le nom du produit (FR) est obligatoire.';
  }
  if (opts.creation || 'price' in f) {
    const prix = Number(f.price);
    if (!Number.isFinite(prix) || prix <= 0) return 'Le prix de vente doit être supérieur à 0 €.';
  }
  if ('cost_price' in f && f.cost_price !== null && f.cost_price !== '') {
    const pa = Number(f.cost_price);
    if (!Number.isFinite(pa) || pa < 0) return 'Prix d’achat invalide.';
  }
  if ('ean' in f && f.ean) {
    const ean = String(f.ean).trim();
    if (ean !== String(opts.eanActuel ?? '').trim() && !eanValide(ean)) {
      return `Code-barres « ${ean} » invalide : 8, 12, 13 ou 14 chiffres avec une clé de contrôle correcte.`;
    }
  }
  const remise = controlerRemise(f);
  if (remise) return remise;
  const pre = controlerPrecommande(f);
  if (pre) return pre;
  if (f.discount_type === 'fixed' && 'price' in f && Number(f.discount_value) >= Number(f.price)) {
    return 'La remise en euros doit rester inférieure au prix de vente.';
  }
  return null;
}

/** Pré-commande (migration 065) : dates AAAA-MM-JJ ; la fin des
 *  pré-commandes ne peut pas tomber après la date d'expédition. */
function controlerPrecommande(f: Record<string, any>): string | null {
  const s = f.preorder_ship_date ? String(f.preorder_ship_date).slice(0, 10) : '';
  const e = f.preorder_end ? String(f.preorder_end).slice(0, 10) : '';
  if ((s && !JOUR.test(s)) || (e && !JOUR.test(e))) return 'Dates de pré-commande invalides.';
  if (s && e && e > s) return 'La fin des pré-commandes doit précéder la date d’expédition.';
  return null;
}

/** Adresse d'une catégorie ou d'une page : minuscules, chiffres, tirets. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Paramètres d'une remise (produit ou catégorie) : type connu, valeur
 *  > 0, pourcentage ≤ 100, dates AAAA-MM-JJ dans l'ordre. */
function controlerRemise(f: Record<string, any>): string | null {
  if (!('discount_type' in f) || !f.discount_type) return null;
  const type = f.discount_type, val = Number(f.discount_value);
  if (type !== 'percent' && type !== 'fixed') return 'Type de remise inconnu.';
  if (!Number.isFinite(val) || val <= 0) return 'La remise doit être supérieure à 0.';
  if (type === 'percent' && val > 100) return 'Une remise en pourcentage ne peut pas dépasser 100 %.';
  const s = f.discount_start ? String(f.discount_start).slice(0, 10) : '';
  const e = f.discount_end ? String(f.discount_end).slice(0, 10) : '';
  if ((s && !JOUR.test(s)) || (e && !JOUR.test(e))) return 'Dates de remise invalides.';
  if (s && e && s > e) return 'La fin de la remise précède son début.';
  return null;
}

/** Catégorie (rayon) : champs présents seulement, comme controlerFiche. */
export function controlerRayon(f: Record<string, any>, opts: { creation?: boolean } = {}): string | null {
  if ((opts.creation || 'name_fr' in f) && !String(f.name_fr ?? '').trim()) return 'Le nom de la catégorie (FR) est obligatoire.';
  if ((opts.creation || 'slug' in f) && !SLUG.test(String(f.slug ?? ''))) {
    return 'Adresse (slug) invalide : minuscules sans accent, chiffres et tirets seulement.';
  }
  return controlerRemise(f);
}

/** Message lisible pour une violation d'unicité PostgreSQL (code 23505). */
export function messageDoublon(err: { code?: string; message?: string } | null | undefined): string | null {
  if (!err || err.code !== '23505') return null;
  const m = String(err.message || '');
  if (m.includes('ean')) return 'Ce code-barres (EAN) est déjà utilisé par un autre produit.';
  if (m.includes('sku')) return 'Cette référence (SKU) est déjà utilisée par un autre produit.';
  if (m.includes('slug')) return 'Cette adresse (slug) est déjà utilisée.';
  return 'Doublon : une valeur unique est déjà utilisée.';
}
