/**
 * Règles de validité d'un code promo — source unique.
 *
 * Utilisé par `/api/promo/validate` (affichage panier) ET `/api/checkout`
 * (montant réellement facturé). Les deux doivent répondre la même chose,
 * sinon le client voit une remise qui saute au paiement.
 */

export type PromoRefusal =
  | 'invalid'      // code inconnu ou désactivé
  | 'not_yet'      // avant valid_from
  | 'expired'      // après valid_until
  | 'exhausted'    // max_uses atteint
  | 'min_order'    // sous-total sous le minimum
  | 'already_used';// déjà utilisé par ce client (single_use_per_customer)

export type PromoVerdict =
  | { ok: true;  discount: number; freeShipping: boolean }
  | { ok: false; reason: PromoRefusal; minOrder: number };

export function evaluatePromo(
  promo: any,
  ctx: { subtotal: number; alreadyUsedByCustomer?: boolean; now?: Date },
): PromoVerdict {
  const minOrder = Number(promo?.min_order) || 0;
  const refuse = (reason: PromoRefusal): PromoVerdict => ({ ok: false, reason, minOrder });

  if (!promo || promo.is_active !== true) return refuse('invalid');

  const now = ctx.now || new Date();
  if (promo.valid_from && now < new Date(promo.valid_from)) return refuse('not_yet');
  // valid_until inclusif jusqu'à la fin de journée, sinon un code « jusqu'au 14 »
  // expirerait dès le 14 à 00:00.
  if (promo.valid_until && now > new Date(String(promo.valid_until).slice(0, 10) + 'T23:59:59')) {
    return refuse('expired');
  }
  if (promo.max_uses && (promo.used_count || 0) >= promo.max_uses) return refuse('exhausted');

  const subtotal = Number(ctx.subtotal) || 0;
  if (subtotal < minOrder) return refuse('min_order');

  if (promo.single_use_per_customer && ctx.alreadyUsedByCustomer) return refuse('already_used');

  const value = Number(promo.value) || 0;
  let discount = 0;
  if (promo.type === 'percent')    discount = Math.min(subtotal, (subtotal * value) / 100);
  else if (promo.type === 'fixed') discount = Math.min(subtotal, value);

  return {
    ok: true,
    discount: Math.round(discount * 100) / 100,
    freeShipping: promo.type === 'free_shipping',
  };
}
