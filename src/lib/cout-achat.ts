import { repartir } from '@/lib/landed';

/* ═══════════════════════════════════════════════════════════════
   COÛT D'ACHAT D'UN ARTICLE ACHETÉ EN MAGASIN (ticket de caisse)

   La boutique est une micro-entreprise en franchise de TVA (art. 293 B
   du CGI) : elle ne récupère ni la moms suédoise ni la TVA française.
   La taxe payée en caisse fait donc partie du coût, comme la
   marchandise. L'ancien calcul la retirait (÷ 1,12 sur la composition
   de commande, ÷ (1 + moms) sur le ticket) : chaque coût était sous-
   évalué, chaque marge gonflée — et la moms alimentaire suédoise est
   de 6 % en 2026, pas de 12 %.

   Règle choisie par le propriétaire le 11/11/2026 :
     coût = prix payé en caisse (remises déduites, moms comprise) × taux
          + part du port du voyage, au prorata du prix.

   Le montant de moms reste calculé à part, pour mémoire comptable
   (`taxeIncluse`), mais n'est jamais retiré du coût.

   `taux` = euros pour UNE unité de la devise du ticket
   (10,80 kr = 1 € → 0,092593).
   ═══════════════════════════════════════════════════════════════ */

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const round4 = (n: number) => Math.round((Number(n) || 0) * 10000) / 10000;

/** Prix payé (taxe comprise) → euros. Rien n'est déduit. */
export const versEuros = (montant: number, taux: number) =>
  (Number(montant) || 0) * (Number(taux) || 0);

/** Taxe contenue dans un montant taxe comprise — pour mémoire seulement. */
export function taxeIncluse(ttc: number, tauxTaxe: number): number {
  const t = Number(tauxTaxe) || 0;
  const m = Number(ttc) || 0;
  return t > 0 ? m - m / (1 + t / 100) : 0;
}

/**
 * Part du port d'un voyage qui revient à un ticket.
 *
 * Le port se répartit sur TOUS les articles du voyage au prorata de leur
 * prix : la part d'un ticket est donc proportionnelle à son montant
 * (94 € de port pour 6 817,55 kr d'achats → un ticket de 1 000 kr en
 * porte 13,79 €). Sans montant du voyage, le port ne concerne que ce
 * ticket et il le porte en entier.
 *
 * Les deux montants sont dans la devise du ticket (kr pour la Suède).
 */
export function partPortDuTicket(
  portEur: number,
  montantTicket: number,
  montantVoyage?: number | null,
): number {
  const port = Math.max(0, Number(portEur) || 0);
  const ticket = Number(montantTicket) || 0;
  const voyage = Number(montantVoyage) || 0;
  if (!port || ticket <= 0) return 0;
  if (voyage <= 0) return round2(port);
  return round2(port * Math.min(1, ticket / voyage));
}

export type LigneTicket = {
  key: string;
  /** Quantité entrée en stock (entière). */
  qty: number;
  /** Prix unitaire payé, dans la devise du ticket, taxe comprise. */
  prix: number;
};

export type CoutLigne = {
  key: string;
  /** Marchandise : prix payé converti, taxe comprise. */
  unit_eur: number;
  /** Taxe contenue dans `unit_eur` (mémoire, non déduite). */
  taxe_unit_eur: number;
  /** Part du port portée par la ligne entière, et ramenée à l'unité. */
  port_total: number;
  port_unit: number;
  /** Coût de revient unitaire : marchandise + port. C'est lui qui va
   *  dans `products.cost_price`. */
  revient_unit: number;
};

export type CoutsTicket = {
  lignes: Record<string, CoutLigne>;
  /** Marchandises taxe comprise, en euros. */
  marchandises_eur: number;
  /** Taxe contenue dans les marchandises (mémoire). */
  taxe_eur: number;
  /** Port réparti sur ce ticket. */
  port_eur: number;
};

/**
 * Coûts des lignes d'un ticket : conversion taxe comprise, puis port
 * réparti au prorata du prix avec `repartir` — le même calcul que les
 * commandes d'achat et les réceptions, pour que deux écrans ne donnent
 * jamais deux coûts au même article.
 */
export function coutsDuTicket(
  lignes: LigneTicket[],
  o: { taux: number; tauxTaxe: number; port: number },
): CoutsTicket {
  const unitaires = lignes.map(l => ({ ...l, unit: versEuros(l.prix, o.taux) }));
  const parts = repartir(
    unitaires.map(l => ({ key: l.key, qty: l.qty, unit_cost: l.unit, retenue: true })),
    Math.max(0, Number(o.port) || 0),
    'prorata',
  );

  const out: Record<string, CoutLigne> = {};
  let marchandises = 0;
  let port = 0;
  for (const l of unitaires) {
    const p = parts[l.key];
    marchandises += l.unit * l.qty;
    port += p?.total || 0;
    out[l.key] = {
      key: l.key,
      unit_eur: round4(l.unit),
      taxe_unit_eur: round4(taxeIncluse(l.unit, o.tauxTaxe)),
      port_total: p?.total || 0,
      port_unit: p?.parUnite || 0,
      revient_unit: p?.revient ?? round4(l.unit),
    };
  }

  return {
    lignes: out,
    marchandises_eur: round2(marchandises),
    taxe_eur: round2(taxeIncluse(marchandises, o.tauxTaxe)),
    port_eur: round2(port),
  };
}
