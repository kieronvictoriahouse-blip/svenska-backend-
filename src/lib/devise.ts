import type Stripe from 'stripe';

/* ═══════════════════════════════════════════════════════════════
   DEVISES — l'argent dans la devise de la boutique (étape 3, migration 067)

   Une vitrine hors euro (« fc » en SEK) encaisse dans SA devise. La
   comptabilité, le CA URSSAF, le FEC et le seuil européen restent en
   euros : on relève l'EUR réellement crédité par Stripe
   (balance_transaction), à défaut le taux BCE.

   Convention de taux (même sens que balance_transaction.exchange_rate) :
   taux = valeur en EUR d'UNE unité de la devise, donc SEK × taux = EUR.

   Pour l'euro, chaque fonction rend exactement ce que le code faisait
   déjà en dur (Math.round(x * 100), 'eur') : Swedish Cravings ne change
   pas d'un centime. Aucun accès base ici.
   ═══════════════════════════════════════════════════════════════ */

export const EUR = 'EUR';

/** Code ISO 4217 en majuscules ; une valeur mal formée retombe sur l'euro. */
export function normDevise(brut: unknown): string {
  const d = String(brut ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(d) ? d : EUR;
}

export function estEuro(d: unknown): boolean {
  return normDevise(d) === EUR;
}

/** Devise au format attendu par Stripe (minuscules). */
export function deviseStripe(d: unknown): string {
  return normDevise(d).toLowerCase();
}

/* Devises « sans centimes » chez Stripe : le montant y est déjà l'unité. */
const SANS_DECIMALES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

export function decimales(d: unknown): 0 | 2 {
  return SANS_DECIMALES.has(normDevise(d)) ? 0 : 2;
}

/** Montant → unités mineures Stripe. Pour l'euro : Math.round(x * 100), comme avant. */
export function versMinor(montant: number, d: unknown): number {
  return decimales(d) === 2 ? Math.round(montant * 100) : Math.round(montant);
}

/** Unités mineures Stripe → montant. */
export function depuisMinor(minor: number, d: unknown): number {
  return decimales(d) === 2 ? minor / 100 : minor;
}

/* Minimum de paiement Stripe par devise. Stripe exige AUSSI environ
   0,50 € une fois converti dans la devise de règlement du compte. */
const MINIMUMS: Record<string, number> = {
  EUR: 0.50, SEK: 3.00, NOK: 3.00, DKK: 2.50, GBP: 0.30, USD: 0.50, CHF: 0.50,
};

export function montantMinimum(d: unknown): number {
  return MINIMUMS[normDevise(d)] ?? 0.50;
}

export function round2(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const LOCALES = { fr: 'fr-FR', en: 'en-GB', sv: 'sv-SE' } as const;

/** Montant lisible (« 149,00 kr », « 4,90 € ») ; espaces insécables normalisés pour les PDF. */
export function formatMontant(n: number, d: unknown, langue: 'fr' | 'en' | 'sv' = 'fr'): string {
  const dec = decimales(d);
  return new Intl.NumberFormat(LOCALES[langue] || LOCALES.fr, {
    style: 'currency',
    currency: normDevise(d),
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n).replace(/[  ]/g, ' ');
}

/** Jour calendaire AAAA-MM-JJ en heure de Paris (date des écritures). */
export function jourParis(d: Date | string | number = new Date()): string {
  return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

export type SourceTaux = 'stripe' | 'bce' | 'taux_vente';

/** Règlement relevé sur une balance_transaction Stripe. Montants POSITIFS. */
export type ReglementEur = {
  balance_tx: string;
  montant_eur: number;
  frais_eur: number;
  net_eur: number;
  taux: number | null;
  devise: string;
  montant_devise: number;
  date: string;
  source: 'stripe';
};

/* Options de requête stripe-node (3e argument) : un appel lent ne doit
   pas faire expirer le webhook. Une seule relance, gérée par l'appelant. */
export const OPTS_STRIPE = { timeout: 4000, maxNetworkRetries: 0 } as const;

function depuisBt(
  bt: Stripe.BalanceTransaction | null | undefined,
  devise: string,
  montantDeviseMinor: number,
): ReglementEur | null {
  if (!bt) return null;
  // Solde Stripe tenu dans une autre devise que l'euro : on ne devine pas,
  // l'appelant se rabat sur la BCE (et le journalise).
  if (bt.currency !== 'eur') return null;
  const montant_eur = Math.abs(bt.amount) / 100;
  const montant_devise = depuisMinor(Math.abs(montantDeviseMinor), devise);
  return {
    balance_tx: bt.id,
    montant_eur,
    frais_eur: bt.fee / 100,
    net_eur: Math.abs(bt.net) / 100,
    taux: bt.exchange_rate ?? (montant_devise > 0 ? montant_eur / montant_devise : null),
    devise: normDevise(devise),
    montant_devise,
    date: jourParis(bt.created * 1000),
    source: 'stripe',
  };
}

async function btDe(
  stripe: Stripe,
  bt: string | Stripe.BalanceTransaction | null | undefined,
): Promise<Stripe.BalanceTransaction | null> {
  if (!bt) return null;
  if (typeof bt === 'string') return stripe.balanceTransactions.retrieve(bt, {}, OPTS_STRIPE);
  return bt;
}

/** EUR crédité pour un PaymentIntent (charge → balance_transaction). Les erreurs réseau remontent. */
export async function reglementDePaymentIntent(stripe: Stripe, piId: string): Promise<ReglementEur | null> {
  const pi = await stripe.paymentIntents.retrieve(
    piId, { expand: ['latest_charge.balance_transaction'] }, OPTS_STRIPE,
  );
  let charge = pi.latest_charge;
  if (!charge) return null;
  // Expansion non appliquée : on relit la charge elle-même.
  if (typeof charge === 'string') {
    charge = await stripe.charges.retrieve(charge, { expand: ['balance_transaction'] }, OPTS_STRIPE);
  }
  const bt = await btDe(stripe, charge.balance_transaction);
  return depuisBt(bt, charge.currency, charge.amount);
}

/** Règlement d'une session Checkout (via son PaymentIntent). */
export async function reglementDeSession(
  stripe: Stripe,
  session: { payment_intent?: string | { id: string } | null },
): Promise<ReglementEur | null> {
  const pi = session.payment_intent;
  const id = typeof pi === 'string' ? pi : pi?.id;
  if (!id) return null;
  return reglementDePaymentIntent(stripe, id);
}

/* La balance_transaction peut naître quelques secondes après le webhook :
   un second essai, un seul, pour ne pas allonger le webhook. */
export async function reglementDeSessionAvecRelance(
  stripe: Stripe,
  session: { payment_intent?: string | { id: string } | null },
  attenteMs = 2000,
): Promise<ReglementEur | null> {
  const premier = await reglementDeSession(stripe, session).catch(() => null);
  if (premier) return premier;
  await new Promise(r => setTimeout(r, attenteMs));
  return reglementDeSession(stripe, session);
}

/** EUR réellement rendu pour un remboursement (balance_transaction du refund). */
export async function reglementDeRemboursement(
  stripe: Stripe,
  refund: string | Stripe.Refund,
): Promise<ReglementEur | null> {
  const r = typeof refund === 'string'
    ? await stripe.refunds.retrieve(refund, { expand: ['balance_transaction'] }, OPTS_STRIPE)
    : refund;
  const bt = await btDe(stripe, r.balance_transaction);
  return depuisBt(bt, r.currency, r.amount);
}

/**
 * Taux BCE (Frankfurter) : valeur en EUR d'une unité de `d` au jour donné
 * (ou au dernier jour publié). Ne lève jamais : null si indisponible.
 */
export async function tauxBce(d: unknown, date?: string): Promise<number | null> {
  const dev = normDevise(d);
  if (dev === EUR) return 1;
  const jour = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'latest';
  try {
    const res = await fetch(`https://api.frankfurter.app/${jour}?from=${dev}&to=EUR`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const t = Number(j?.rates?.EUR);
    return t > 0 ? t : null;
  } catch {
    return null;
  }
}

export function contreValeurEur(montant: number, taux: number): number {
  return round2(montant * taux);
}

/**
 * Champs `orders` posés depuis un règlement Stripe.
 * SEUL endroit qui décide : recette = EUR crédité (bt.amount), frais = bt.fee.
 * À confirmer par la comptable (marge de change Stripe, question 2) :
 * fx_rate_bce garde le taux BCE du jour pour mesurer l'écart.
 */
export function champsReglementCommande(r: ReglementEur, tauxBceJour?: number | null) {
  return {
    total_eur: round2(r.montant_eur),
    montant_regle_devise: round2(r.montant_devise),
    fx_rate: r.taux,
    ...(tauxBceJour ? { fx_rate_bce: tauxBceJour } : {}),
    stripe_fee_eur: round2(r.frais_eur),
    stripe_balance_tx: r.balance_tx,
    fx_source: 'stripe' as const,
    fx_date: r.date,
  };
}
