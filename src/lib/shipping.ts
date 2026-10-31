/**
 * Source unique de vérité des règles de frais de port.
 *
 * Le seuil de franco et le coût de port étaient dupliqués dans le checkout,
 * la création de commande manuelle et le front. Tout passe désormais par
 * `resolveShipping`, y compris l'opération « livraison offerte » limitée
 * dans le temps (ex : 25 € au lieu de 50 € du 15 au 30 septembre).
 *
 * ⚠️ La logique est répliquée côté front dans `js/app.js` (window.SD_SHIP).
 * Toute évolution ici doit y être reportée — le serveur reste l'autorité :
 * c'est `/api/checkout` qui fixe le montant réellement facturé.
 */

/* Zone internationale : tarif 9,90 EUR, franco 50 EUR.

   La Suede manquait alors que le panier la proposait — elle etait donc
   facturee au tarif France (4,90 EUR) pour un cout reel de 13,46 EUR TTC.
   La Suisse en sort : hors UE (declaration douaniere a chaque colis) et
   33,38 EUR HT de port reel, soit ~40 EUR TTC contre 9,90 EUR factures.
   Elle est retiree du selecteur du panier dans le meme mouvement. */
export const INTERNATIONAL_COUNTRIES = ['ES', 'PT', 'IT', 'DE', 'NL', 'BE', 'LU', 'SE'];

/** Barème par défaut si rien n'est configuré en base */
export const SHIPPING_DEFAULTS = {
  FR:   { threshold: 29, cost: 4.90 },
  INTL: { threshold: 50, cost: 9.90 },
};

export type ShippingRules = {
  /** Seuil de franco applicable maintenant (opération comprise) */
  threshold: number;
  /** Coût de port si le seuil n'est pas atteint */
  cost: number;
  /** true si l'opération temporaire est en cours et s'applique à cette zone */
  promoActive: boolean;
  /** Seuil hors opération — utile pour afficher « au lieu de 50 € » */
  baseThreshold: number;
  /** Message d'opération, par langue */
  label: { fr: string; sv: string; en: string };
};

const dayString = (d: Date) => {
  // Date « calendaire » en heure de Paris : une opération qui finit le 30
  // doit rester active toute la journée du 30 pour un client français.
  const paris = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${paris.getFullYear()}-${pad(paris.getMonth() + 1)}-${pad(paris.getDate())}`;
};

/** L'opération est-elle dans sa fenêtre de validité ? (indépendant de la zone) */
export function isShipPromoActive(cfg: any, at: Date = new Date()): boolean {
  if (!cfg || cfg.ship_promo_active !== true) return false;
  const today = dayString(at);
  const from = cfg.ship_promo_from ? String(cfg.ship_promo_from).slice(0, 10) : null;
  const until = cfg.ship_promo_until ? String(cfg.ship_promo_until).slice(0, 10) : null;
  if (from && today < from) return false;
  if (until && today > until) return false;
  return true;
}

/**
 * Règles applicables à un panier donné.
 * @param cfg  ligne `white_label_config` (ou {} → barème par défaut)
 */
export function resolveShipping(
  cfg: any,
  opts: { isInternational?: boolean; at?: Date } = {},
): ShippingRules {
  const isIntl = !!opts.isInternational;
  const base = isIntl ? SHIPPING_DEFAULTS.INTL : SHIPPING_DEFAULTS.FR;

  // Le seuil France reste pilotable hors opération via le white-label
  const configured = Number(cfg?.free_shipping_threshold);
  const baseThreshold = !isIntl && configured > 0 ? configured : base.threshold;

  const label = {
    fr: cfg?.ship_promo_label_fr || '',
    sv: cfg?.ship_promo_label_sv || '',
    en: cfg?.ship_promo_label_en || '',
  };

  if (isShipPromoActive(cfg, opts.at)) {
    const raw = isIntl ? cfg?.ship_promo_threshold_intl : cfg?.ship_promo_threshold;
    const promoThreshold = Number(raw);
    // Seuil non renseigné pour cette zone → barème normal (une opé FR ne
    // s'applique pas d'office à l'international, le port y coûte le double)
    if (raw != null && raw !== '' && promoThreshold >= 0) {
      return { threshold: promoThreshold, cost: base.cost, promoActive: true, baseThreshold, label };
    }
  }

  return { threshold: baseThreshold, cost: base.cost, promoActive: false, baseThreshold, label };
}

/* ═══════════════════════════════════════════════════════════════
   LIVRAISON PAR BOUTIQUE (étape 3, migration 067)

   Swedish Cravings (fiche === null) : exactement le calcul que faisait
   le checkout, délégué à resolveShipping avec les mêmes arguments.
   Autre boutique : ses propres règles, dans SA devise. Jamais les
   barèmes de SC (4,90 / 29 €) appliqués à des couronnes : une boutique
   non configurée est signalée (configIncomplete) et le checkout refuse.
   ═══════════════════════════════════════════════════════════════ */

export type FicheLivraison = {
  livraison_pays?: string[] | null;
  livraison_cout?: number | string | null;
  livraison_franco?: number | string | null;
};

export type Livraison = {
  /** Pays de livraison retenu (ISO-2) */
  pays: string;
  /** false : le pays demandé n'est pas desservi par cette boutique */
  servi: boolean;
  /** Zone internationale de SC (toujours false pour une autre boutique) */
  international: boolean;
  rules: ShippingRules;
  /** Pays proposés pour la livraison à domicile */
  paysDomicile: string[];
  /** Boutique non-sc sans pays ou sans coût de port : à refuser */
  configIncomplete: boolean;
};

export function livraisonBoutique(
  fiche: FicheLivraison | null,
  cfg: any,
  opts: { pays?: string | null; relais: boolean; at?: Date },
): Livraison {
  // Swedish Cravings : copie conforme de l'ancien calcul du checkout.
  if (fiche === null) {
    const pays = String(opts.pays || 'FR').toUpperCase();
    const international = opts.relais && INTERNATIONAL_COUNTRIES.includes(pays);
    const servi = !opts.relais || pays === 'FR' || international;
    const rules = resolveShipping(cfg, { isInternational: international, at: opts.at });
    return { pays, servi, international, rules, paysDomicile: ['FR', 'MC'], configIncomplete: false };
  }

  const liste = (Array.isArray(fiche.livraison_pays) ? fiche.livraison_pays : [])
    .map(p => String(p || '').trim().toUpperCase())
    .filter(Boolean);
  const coutBrut = fiche.livraison_cout;
  if (!liste.length || coutBrut == null || coutBrut === '') {
    return {
      pays: String(opts.pays || '').toUpperCase(),
      servi: false,
      international: false,
      // Port nul et franco jamais atteint : rien de facturable ne doit en sortir.
      rules: { ...resolveShipping(cfg, { isInternational: false, at: opts.at }), cost: 0, threshold: Number.POSITIVE_INFINITY },
      paysDomicile: [],
      configIncomplete: true,
    };
  }

  const pays = String(opts.pays || liste[0]).toUpperCase();
  const servi = !opts.relais || liste.includes(pays);
  const cost = Number(coutBrut);
  const franco = Number(fiche.livraison_franco);
  // Pas de seuil renseigné : la livraison n'est jamais offerte.
  const baseThreshold = franco > 0 ? franco : Number.POSITIVE_INFINITY;
  const label = {
    fr: cfg?.ship_promo_label_fr || '',
    sv: cfg?.ship_promo_label_sv || '',
    en: cfg?.ship_promo_label_en || '',
  };

  let threshold = baseThreshold;
  let promoActive = false;
  if (isShipPromoActive(cfg, opts.at)) {
    const raw = cfg?.ship_promo_threshold;
    const promoThreshold = Number(raw);
    if (raw != null && raw !== '' && promoThreshold >= 0) {
      threshold = promoThreshold;
      promoActive = true;
    }
  }

  return {
    pays,
    servi,
    international: false,
    rules: { threshold, cost, promoActive, baseThreshold, label },
    paysDomicile: liste,
    configIncomplete: false,
  };
}

