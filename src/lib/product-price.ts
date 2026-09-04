/* ═══════════════════════════════════════════════════════════════
   REMISE PAR ARTICLE — prix effectif

   Une remise se pose directement sur la fiche produit (colonnes
   discount_type / discount_value / discount_start / discount_end).
   Elle porte sur le prix de vente TTC (product.price, ou le prix de
   la variante choisie). Deux modes : pourcentage ou montant fixe.

   Ce module est la SOURCE DE VÉRITÉ côté serveur : le checkout
   l'utilise pour refacturer, le front n'a qu'un miroir d'affichage.
   Les dates sont comparées en YYYY-MM-DD (bornes inclusives), ce qui
   évite toute arithmétique de fuseau : une promo « du 10 au 12 » est
   active les 10, 11 et 12.
   ═══════════════════════════════════════════════════════════════ */

export type DiscountFields = {
  discount_type?: string | null;   // 'percent' | 'fixed' | null
  discount_value?: number | string | null;
  discount_start?: string | null;  // 'YYYY-MM-DD' ou null
  discount_end?: string | null;    // 'YYYY-MM-DD' ou null
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const dayOf = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

/** La remise est-elle active aujourd'hui (type valide, valeur > 0, dans les bornes) ? */
export function isDiscountActive(p: DiscountFields, today: string = todayISO()): boolean {
  const type = p?.discount_type;
  if (type !== 'percent' && type !== 'fixed') return false;
  const val = Number(p?.discount_value);
  if (!Number.isFinite(val) || val <= 0) return false;
  const start = dayOf(p?.discount_start);
  const end = dayOf(p?.discount_end);
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

/** Prix TTC après remise, plancher à 0, arrondi au centime. `base` = prix produit ou variante. */
export function effectiveUnitPrice(base: number, p: DiscountFields, today: string = todayISO()): number {
  const b = Number(base) || 0;
  if (!isDiscountActive(p, today)) return round2(b);
  const val = Number(p.discount_value);
  const out = p.discount_type === 'percent' ? b * (1 - val / 100) : b - val;
  return Math.max(0, round2(out));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
