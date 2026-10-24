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
  | 'already_used' // déjà utilisé par ce client (single_use_per_customer)
  // Codes personnels (fidélité, code ami) — cf. @/lib/fidelite
  | 'email_required'   // il faut l'email du panier pour vérifier à qui il est
  | 'not_owner'        // code fidélité d'un autre client
  | 'own_code'         // son propre code ami
  | 'not_new_customer' // code ami : réservé à une 1re commande
  | 'only_promo_items';// le panier n'a que des articles déjà en promotion

export type PromoVerdict =
  | { ok: true;  discount: number; freeShipping: boolean }
  | { ok: false; reason: PromoRefusal; minOrder: number };

/** Jour calendaire à Paris (AAAA-MM-JJ). */
export const jourParis = (d: Date = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/** Validité d'un code par ses dates (colonnes `date`, bornes incluses),
 *  jugée au jour de PARIS. Le serveur tourne en UTC : comparé à minuit UTC,
 *  un code « à partir du 24 » était refusé le 24 jusqu'à 2 h, et un code
 *  « jusqu'au 24 » accepté le 25 jusqu'à 2 h. */
export function dansLaPeriode(promo: any, now: Date = new Date()): 'ok' | 'not_yet' | 'expired' {
  const jour = jourParis(now);
  if (promo?.valid_from && jour < String(promo.valid_from).slice(0, 10)) return 'not_yet';
  if (promo?.valid_until && jour > String(promo.valid_until).slice(0, 10)) return 'expired';
  return 'ok';
}

export function evaluatePromo(
  promo: any,
  ctx: { subtotal: number; alreadyUsedByCustomer?: boolean; now?: Date },
): PromoVerdict {
  const minOrder = Number(promo?.min_order) || 0;
  const refuse = (reason: PromoRefusal): PromoVerdict => ({ ok: false, reason, minOrder });

  if (!promo || promo.is_active !== true) return refuse('invalid');

  // Bornes incluses, au jour de Paris : « jusqu'au 14 » vaut tout le 14.
  const periode = dansLaPeriode(promo, ctx.now || new Date());
  if (periode !== 'ok') return refuse(periode);
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
