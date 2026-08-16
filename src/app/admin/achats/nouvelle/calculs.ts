/* ═══════════════════════════════════════════════════════════════
   CALCULS DE L'ÉCRAN DE COMMANDE D'ACHAT

   Sortis du composant pour être lisibles et testables : ce sont eux
   qui décident ce qu'on achète, ils ne doivent pas être noyés dans du
   JSX.

   Formules du handoff, à la lettre :
     daily   = vel / 7
     cover   = stock / daily                 → jours de couverture
     need    = max(0, semaines × 7 × daily − stock)
     suggest = ceil(need / pack)             → nombre de CARTONS
   ═══════════════════════════════════════════════════════════════ */

export type Source = {
  sup: string; cost: number; sek: number | null;
  pack: number; fois: number; habituel: boolean;
};

export type Produit = {
  id: string; ref: string; name: string; name_sv: string | null;
  image_url: string | null;
  /* Le meme article s'achete chez plusieurs magasins a des prix
     differents. GEKAS, grossiste pour particuliers, est presque
     toujours le moins cher. */
  sources: Source[];
  moinsCher: { sup: string; cost: number } | null;
  stock: number; onOrder: number; pack: number; cost: number;
  vel: number; velCalendar: number; joursRupture: number; isNew: boolean;
};

export type Fournisseur = {
  id: string; name: string; city: string;
  delay: number; franco: number; min: number;
  last: string | null; refs: number;
};

export type Enrichi = Produit & {
  daily: number; cover: number; suggest: number; urgency: number;
  /** Prix et conditionnement du magasin selectionne. */
  prix: number; sek: number | null; packEffectif: number;
  /** Ecart avec le magasin le moins cher, en % — 0 si c'est le moins cher. */
  surcout: number;
};

export const URGENCE_COULEUR = ['#B03A2E', '#C97A2B', '#8A5B08', '#3E5238'];
export const URGENCE_LABEL = ['Rupture', 'Urgent', 'Bientôt', 'Confortable'];

/** Couverture, suggestion et urgence pour une semaine visée donnée. */
export function enrichir(p: Produit, semaines: number, fournisseur?: string | null): Enrichi {
  const source = p.sources.find(s => s.sup === fournisseur)
    || p.sources.find(s => s.habituel) || p.sources[0] || null;

  const packEffectif = Math.max(1, source?.pack || p.pack || 1);
  const prix = source?.cost || p.cost || 0;

  const daily = p.vel / 7;
  const cover = daily > 0 ? Math.round(p.stock / daily) : 999;
  const need = Math.max(0, Math.round(semaines * 7 * daily) - p.stock);
  /* Sans historique de vente, aucune formule n'a de sens : on propose
     deux cartons, comme le prototype, plutôt qu'un chiffre invente. */
  const suggest = p.isNew && p.vel === 0 ? 2 : Math.ceil(need / packEffectif);
  const urgency = p.stock === 0 ? 0 : cover <= 10 ? 1 : cover <= 25 ? 2 : 3;

  /* Payer 41 % de plus parce qu'on a pris l'habitude d'un magasin est
     une perte silencieuse : on la rend visible. */
  const surcout = p.moinsCher && p.moinsCher.cost > 0 && prix > 0
    ? Math.round(((prix - p.moinsCher.cost) / p.moinsCher.cost) * 100) : 0;

  return { ...p, daily, cover, suggest, urgency, prix, sek: source?.sek ?? null, packEffectif, surcout };
}

/** Libellé de couverture — « 999 j » ne veut rien dire à l'écran. */
export function libelleCouverture(p: Enrichi): string {
  if (p.vel === 0) return 'Nouveau produit';
  if (p.cover > 180) return 'couverture > 6 mois';
  return `${p.cover} j de couverture`;
}

/** Tri du handoff : l'urgence d'abord, la couverture ensuite. Ce qui
 *  manque le plus remonte, sans que personne ait à trier. */
export function trier(a: Enrichi, b: Enrichi): number {
  if (a.urgency !== b.urgency) return a.urgency - b.urgency;
  return a.cover - b.cover;
}

/**
 * Conversion couronnes → euros HT.
 *
 * Même calcul que la saisie de ticket : la moms suédoise de 12 % est
 * déduite AVANT la conversion. Sans cette déduction, le coût d'achat
 * est surévalué de 12 % et toutes les marges avec.
 */
export const sekVersEur = (sek: number, taux: number) => (sek / 1.12) * taux;

export const eur = (n: number) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export const kr = (n: number) =>
  (Number(n) || 0).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';

export type Totaux = {
  lignes: number; unites: number; sek: number; eur: number;
  couvertureMoyenne: number;
  francoReste: number; francoAtteint: boolean;
  minAtteint: boolean;
  urgencesOubliees: number;
  pretAEnvoyer: boolean;
};

/** Compteurs du panier, jauge de franco et liste de contrôle. */
export function totaux(
  panier: Record<string, number>,
  catalogue: Enrichi[],
  fournisseur: Fournisseur | null,
  semaines: number,
  taux: number,
): Totaux {
  let unites = 0, sek = 0, euros = 0;
  const couvertures: number[] = [];
  let lignes = 0;

  for (const p of catalogue) {
    const cartons = panier[p.id] || 0;
    if (!cartons) continue;
    lignes++;
    const u = cartons * p.packEffectif;
    unites += u;
    if (p.sek != null) { sek += p.sek * u; euros += sekVersEur(p.sek * u, taux); }
    else euros += p.prix * u;
    // Couverture une fois la commande reçue.
    couvertures.push(p.daily > 0 ? (p.stock + u) / p.daily : 999);
  }

  const franco = fournisseur?.franco || 0;
  const min = fournisseur?.min || 0;

  /* Le point qui evite l'erreur couteuse : partir sans le produit en
     rupture, et devoir repayer un transport deux jours plus tard. */
  const urgencesOubliees = catalogue
    .filter(p => p.urgency <= 1 && !(panier[p.id] > 0)).length;

  return {
    lignes, unites, sek, eur: euros,
    couvertureMoyenne: couvertures.length
      ? Math.round(couvertures.reduce((s, c) => s + c, 0) / couvertures.length) : 0,
    francoReste: Math.max(0, franco - sek),
    francoAtteint: franco > 0 ? sek >= franco : true,
    minAtteint: min > 0 ? sek >= min : true,
    urgencesOubliees,
    // Le franco n'est pas bloquant : c'est une economie, pas une regle.
    pretAEnvoyer: lignes > 0 && (min > 0 ? sek >= min : true) && urgencesOubliees === 0,
  };
}
