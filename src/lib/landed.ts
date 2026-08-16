/* ═══════════════════════════════════════════════════════════════
   RÉPARTITION DU PORT SUR LES ARTICLES

   Le transport (TNT, colis, palette) n'est pas un frais général : c'est
   un coût d'achat. Tant qu'il n'est pas reversé sur les articles, la
   marge affichée est fausse — d'autant plus fausse que le panier est
   petit.

   Un seul calcul, partagé par l'écran de commande d'achat, l'écran de
   réception et l'API des coûts logistiques : deux répartitions qui ne
   tombent pas d'accord donneraient deux PMP différents pour le même
   carton.

   Toutes les lignes ne portent pas le port : un article volumineux
   absorbe le transport d'un article plat, d'où la sélection.
   ═══════════════════════════════════════════════════════════════ */

export type Methode = 'equal' | 'prorata';

export type LigneAImputer = {
  /** Identifiant stable de la ligne — product_id en pratique. */
  key: string;
  qty: number;
  /** Prix marchandise unitaire, hors port. */
  unit_cost: number;
  /** Fausse quand l'article est décoché : il ne supporte pas le port. */
  retenue: boolean;
};

export type Part = {
  key: string;
  /** Part du port portée par la ligne entière. */
  total: number;
  /** Part ramenée à l'unité — c'est elle qui entre dans le PMP. */
  parUnite: number;
  /** Prix de revient réel de l'unité : marchandise + port. */
  revient: number;
};

/**
 * Répartit `montant` sur les lignes retenues.
 *
 * `equal`   — au prorata des quantités : un carton coûte à transporter
 *             ce que coûte un carton, quel que soit son prix.
 * `prorata` — au prorata de la valeur : le port suit ce qui a de la
 *             valeur, utile quand le transport est assuré.
 *
 * Le reste de l'arrondi est versé sur la dernière ligne retenue : sans
 * ça, la somme des parts ne fait pas le montant de la facture TNT, et
 * l'écart se retrouve en comptabilité.
 */
export function repartir(
  lignes: LigneAImputer[],
  montant: number,
  methode: Methode = 'equal',
): Record<string, Part> {
  const parts: Record<string, Part> = {};
  const eligibles = lignes.filter(l => l.retenue && l.qty > 0);

  const base = methode === 'prorata'
    ? eligibles.reduce((s, l) => s + l.qty * (Number(l.unit_cost) || 0), 0)
    : eligibles.reduce((s, l) => s + l.qty, 0);

  /* Sans base — rien de coché, ou des lignes toutes à prix nul en
     prorata — on ne répartit rien plutôt que de diviser par zéro. */
  const repartissable = montant > 0 && base > 0;

  let verse = 0;
  eligibles.forEach((l, i) => {
    const poids = methode === 'prorata' ? l.qty * (Number(l.unit_cost) || 0) : l.qty;
    let total = repartissable ? Math.round((montant * poids / base) * 100) / 100 : 0;
    if (repartissable && i === eligibles.length - 1) total = Math.round((montant - verse) * 100) / 100;
    verse += total;

    const parUnite = l.qty > 0 ? total / l.qty : 0;
    parts[l.key] = {
      key: l.key,
      total,
      parUnite: Math.round(parUnite * 10000) / 10000,
      revient: Math.round(((Number(l.unit_cost) || 0) + parUnite) * 10000) / 10000,
    };
  });

  // Les lignes décochées existent quand même, avec une part nulle.
  for (const l of lignes) {
    if (parts[l.key]) continue;
    parts[l.key] = {
      key: l.key, total: 0, parUnite: 0,
      revient: Math.round((Number(l.unit_cost) || 0) * 10000) / 10000,
    };
  }

  return parts;
}
