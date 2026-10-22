/* ═══════════════════════════════════════════════════════════════
   FICHE PRODUIT PUBLIQUE

   La vitrine lit /api/products, /api/products/[id] et /api/homepage
   sans authentification : tout ce qui en sort est lisible par
   n'importe qui. Ces routes font select('*') : les champs réservés au
   back-office (prix d'achat en tête) sont retirés ici, en un seul
   endroit. La base les réserve aussi au back-office (migration 055).
   ═══════════════════════════════════════════════════════════════ */

export const CHAMPS_INTERNES = ['cost_price', 'reorder_qty', 'stock_alert'] as const;

/** Retire les champs internes d'une fiche (en place) et la renvoie. */
export function pourVitrine<T extends Record<string, any>>(p: T): T {
  if (p) for (const k of CHAMPS_INTERNES) delete (p as any)[k];
  return p;
}

/**
 * Palier de marge pour le flux Google Shopping (custom_label_0). Le
 * script du site le calculait lui-même à partir du prix d'achat ; seul
 * le palier sort désormais, jamais le coût. Même formule qu'avant :
 * prix HT approché avec la TVA alimentaire à 5,5 %.
 */
export function palierMarge(p: { price?: any; cost_price?: any }): string {
  const prix = parseFloat(p.price) || 0, cout = parseFloat(p.cost_price) || 0;
  if (!prix || !cout) return 'marge-inconnue';
  const m = 1 - cout / (prix / 1.055);
  return m >= 0.6 ? 'marge-haute' : m >= 0.45 ? 'marge-moyenne' : 'marge-basse';
}
