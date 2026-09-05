// ─────────────────────────────────────────────────────────────────────
//  Plan comptable du module Finance — source unique front + back
//
//  Chaque « catégorie de tri » (ce que l'humaine choisit dans la pile)
//  porte : un libellé courant, une icône Material Symbols, un compte PCG
//  (affiché en « Vue comptable »), un journal (VE/AC/BQ/OD) et le sens.
//
//  Comptabilité d'encaissement : l'écriture est passée directement contre
//  le compte de banque (512). Le journal débit/crédit se dérive du sens.
//  Codes alignés sur la maquette (707 ventes de marchandises, 6026
//  emballages…). Les entrées créées portent le account_code complet à 6
//  chiffres ; « Vue comptable » affiche la forme courte (zéros de queue
//  retirés) pour coller au design.
// ─────────────────────────────────────────────────────────────────────

export type Sens = 'in' | 'out';

export interface CategoryDef {
  key: string;          // clé interne stockée dans accounting_entries.category
  label: string;        // libellé courant (fr)
  icon: string;         // Material Symbols Rounded
  account: string;      // compte PCG à 6 chiffres
  journal: 'VE' | 'AC' | 'BQ' | 'OD';
  sens: Sens;
  personal?: boolean;   // hors CA / hors charges (apport, prélèvement perso)
}

export const CATEGORIES: CategoryDef[] = [
  // ── Recettes (argent qui rentre) ──
  { key: 'vente',  label: 'Vente en ligne',            icon: 'shopping_bag',   account: '707000', journal: 'VE', sens: 'in' },
  { key: 'pro',    label: 'Vente à un professionnel',  icon: 'storefront',     account: '707100', journal: 'VE', sens: 'in' },
  { key: 'port',   label: 'Frais de port encaissés',   icon: 'local_shipping', account: '708500', journal: 'VE', sens: 'in' },
  { key: 'remb',   label: 'Remboursement reçu',        icon: 'undo',           account: '758000', journal: 'OD', sens: 'in' },
  { key: 'apport', label: 'Mon apport personnel',      icon: 'savings',        account: '108000', journal: 'OD', sens: 'in', personal: true },

  // ── Dépenses (argent qui sort) ──
  { key: 'march',     label: 'Achat de marchandises',       icon: 'inventory_2',    account: '607000', journal: 'AC', sens: 'out' },
  { key: 'emb',       label: 'Emballages & cartons',        icon: 'package_2',      account: '602600', journal: 'AC', sens: 'out' },
  { key: 'transport', label: 'Transport & livraison',       icon: 'local_shipping', account: '624100', journal: 'AC', sens: 'out' },
  { key: 'mat',       label: 'Matériel & équipement',       icon: 'handyman',       account: '606300', journal: 'AC', sens: 'out' },
  { key: 'logiciel',  label: 'Site & logiciels',            icon: 'language',       account: '651600', journal: 'AC', sens: 'out' },
  { key: 'depl',      label: 'Déplacement professionnel',   icon: 'directions_car', account: '625100', journal: 'AC', sens: 'out' },
  { key: 'banque',    label: 'Frais bancaires',             icon: 'account_balance',account: '627000', journal: 'BQ', sens: 'out' },
  { key: 'stripe',    label: 'Frais Stripe',                icon: 'credit_card',    account: '627100', journal: 'BQ', sens: 'out' },
  { key: 'cotis',     label: 'Cotisations sociales',        icon: 'gavel',          account: '645000', journal: 'OD', sens: 'out' },
  { key: 'amort',     label: "Usure du matériel (amortissement)", icon: 'trending_down', account: '681100', journal: 'OD', sens: 'out' },
  { key: 'perso',     label: "Ce n'est pas pour la boutique", icon: 'person',       account: '108000', journal: 'OD', sens: 'out', personal: true },
  { key: 'autre',     label: 'Autre dépense',               icon: 'more_horiz',     account: '628000', journal: 'AC', sens: 'out' },
];

const BY_KEY: Record<string, CategoryDef> = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

/** Compatibilité : anciennes clés de `accounting_entries.category` (sync
 *  des commandes/réceptions) → catégorie canonique du module. */
const LEGACY_ALIAS: Record<string, string> = {
  vente_en_ligne:    'vente',
  vente_directe:     'pro',
  facture:           'pro',
  achat_marchandise: 'march',
  frais_port:        'transport',
  frais_logistique:  'transport',
  frais_stripe:      'stripe',
  cotisations:       'cotis',
  emballages:        'emb',
  autre:             'autre',
};

export function categoryDef(key: string | null | undefined): CategoryDef {
  if (!key) return BY_KEY.autre;
  return BY_KEY[key] || BY_KEY[LEGACY_ALIAS[key] || 'autre'] || BY_KEY.autre;
}

/** Catégories proposées dans la pile de tri, selon le sens de l'opération. */
export function categoriesForSens(sens: Sens): CategoryDef[] {
  // On masque les catégories « système » (stripe/cotis/amort) : elles sont
  // posées automatiquement, pas choisies à la main dans la pile.
  const hiddenInPicker = new Set(['stripe', 'cotis', 'amort']);
  return CATEGORIES.filter(c => c.sens === sens && !hiddenInPicker.has(c.key));
}

/** Forme courte du compte PCG pour la « Vue comptable » (707000 → 707). */
export function pcgShort(account: string | null | undefined): string {
  if (!account) return '';
  const short = account.replace(/0+$/, '');
  return short.length >= 3 ? short : account.slice(0, 3);
}

/** Type income/expense (contrainte CHECK de accounting_entries) depuis le sens. */
export function typeFromSens(sens: Sens): 'income' | 'expense' {
  return sens === 'in' ? 'income' : 'expense';
}

/** Le journal débit/crédit d'une écriture de trésorerie (contre le 512). */
export function journalSides(cat: CategoryDef): { debit: string; credit: string } {
  return cat.sens === 'in'
    ? { debit: '512000', credit: cat.account }   // encaissement : 512 au débit, produit au crédit
    : { debit: cat.account, credit: '512000' };  // décaissement : charge au débit, 512 au crédit
}
