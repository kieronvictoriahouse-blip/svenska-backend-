/* ═══════════════════════════════════════════════════════════════
   OFFRE CADEAU

   Deux façons de mériter un cadeau, et une seule règle par offre :

     · par MONTANT   — « à partir de 50 €, un produit offert »
     · par QUANTITÉ  — « 2 Piffi achetés, 1 dip offert »

   La quantité prime quand elle est renseignée. Le même calcul sert au
   panier (qui annonce l'offre), à la validation de commande (qui la
   refuse ou l'accorde) et au back-office (qui la prévisualise) : trois
   endroits qui doivent dire la même chose, sinon le client voit un
   cadeau qu'on lui retire au paiement.
   ═══════════════════════════════════════════════════════════════ */

export type OffreCadeau = {
  min_order?: number | null;
  gift_product_ids?: any;
  gift_trigger_product_ids?: any;
  gift_trigger_qty?: number | null;
  gift_max?: number | null;
};

export type LignePanier = { product_id?: string; id?: string; quantity?: number; qty?: number };

/** `jsonb` revient tantôt en tableau, tantôt en chaîne selon le pilote. */
export function listeIds(brut: any): string[] {
  if (Array.isArray(brut)) return brut.filter(Boolean);
  if (typeof brut === 'string') {
    try { const v = JSON.parse(brut); return Array.isArray(v) ? v.filter(Boolean) : []; }
    catch { return []; }
  }
  return [];
}

/** Vrai quand l'offre se déclenche sur des quantités, pas sur un montant. */
export const parQuantite = (o: OffreCadeau) =>
  !!(Number(o?.gift_trigger_qty) > 0 && listeIds(o?.gift_trigger_product_ids).length);

/**
 * Combien de cadeaux le panier mérite.
 *
 * Retourne 0 quand rien n'est acquis — jamais un nombre négatif, et
 * jamais plus que le plafond quand il est posé.
 */
export function cadeauxDus(
  offre: OffreCadeau | null | undefined,
  lignes: LignePanier[],
  sousTotal: number,
): number {
  if (!offre) return 0;

  let dus = 0;

  if (parQuantite(offre)) {
    const declencheurs = new Set(listeIds(offre.gift_trigger_product_ids));
    const pas = Math.max(1, Number(offre.gift_trigger_qty) || 1);
    let comptees = 0;
    for (const l of lignes || []) {
      const id = String(l.product_id || l.id || '');
      if (!declencheurs.has(id)) continue;
      comptees += Math.max(0, Number(l.quantity ?? l.qty) || 0);
    }
    dus = Math.floor(comptees / pas);
  } else {
    const seuil = Number(offre.min_order) || 0;
    dus = sousTotal >= seuil ? 1 : 0;
  }

  const plafond = Number(offre.gift_max);
  if (plafond > 0) dus = Math.min(dus, plafond);
  return Math.max(0, dus);
}

/** Ce qu'il manque pour le prochain cadeau — sert au message du panier. */
export function resteAAtteindre(
  offre: OffreCadeau | null | undefined,
  lignes: LignePanier[],
  sousTotal: number,
): { type: 'quantite' | 'montant'; manque: number } | null {
  if (!offre) return null;

  if (parQuantite(offre)) {
    const declencheurs = new Set(listeIds(offre.gift_trigger_product_ids));
    const pas = Math.max(1, Number(offre.gift_trigger_qty) || 1);
    let comptees = 0;
    for (const l of lignes || []) {
      const id = String(l.product_id || l.id || '');
      if (declencheurs.has(id)) comptees += Math.max(0, Number(l.quantity ?? l.qty) || 0);
    }
    const plafond = Number(offre.gift_max);
    if (plafond > 0 && Math.floor(comptees / pas) >= plafond) return null;
    const manque = pas - (comptees % pas);
    return { type: 'quantite', manque: manque === pas && comptees > 0 ? pas : manque };
  }

  const seuil = Number(offre.min_order) || 0;
  if (sousTotal >= seuil) return null;
  return { type: 'montant', manque: Math.round((seuil - sousTotal) * 100) / 100 };
}
