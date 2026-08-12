// ─────────────────────────────────────────────────────────────
//  DESIGN TOKENS DU BACK-OFFICE
//  Source : « Redesign du back office » (handoff hifi, août 2026).
//  Les valeurs sont normatives — ne pas improviser de variante.
//  Toute couleur utilisée dans un écran doit venir d'ici ou de
//  la variable CSS --accent.
// ─────────────────────────────────────────────────────────────

export const T = {
  // Surfaces
  topbar:      '#15181E',
  ink:         '#1C2028',
  inkHover:    '#2C3240',
  appBg:       '#F1EEE9',
  surface:     '#FFFFFF',
  sidebarBg:   '#FCFAF7',
  surfaceAlt:  '#FBF9F6',
  rowHover:    '#FBFAF7',

  // Bordures
  border:      '#E7E1D8',
  borderField: '#E1DBD2',
  borderFaint: '#F6F3EE',
  borderFaint2:'#F1EDE7',

  // Textes
  text2:       '#5A5248',
  text2b:      '#6E6459',
  text3:       '#8B7E72',
  muted:       '#9C9184',
  muted2:      '#A79C8E',
  muted3:      '#C4BBAE',

  // Couleurs fonctionnelles
  accentDefault: '#7B4F7B',
  green:       '#3E5238',
  greenHover:  '#334529',
  blue:        '#1C4E80',
  orange:      '#A6501F',
  red:         '#B03A2E',
  amberText:   '#8A5B08',
} as const;

/** Accents proposés par le handoff (prop `accentColor`). */
export const ACCENTS = ['#7B4F7B', '#1C4E80', '#3E5238', '#8B5E3C'] as const;

// ── Badges de statut ────────────────────────────────────────
// fond / texte, exactement comme la maquette.
export type BadgeTone = 'green' | 'amber' | 'blue' | 'gray' | 'red' | 'plum' | 'orange';

export const BADGE: Record<BadgeTone, { bg: string; fg: string }> = {
  green:  { bg: '#E9F0E6', fg: '#3E5238' },
  amber:  { bg: '#FBF0DA', fg: '#8A5B08' },
  blue:   { bg: '#E6EDF6', fg: '#1C4E80' },
  gray:   { bg: '#F1EDE7', fg: '#857C71' },
  red:    { bg: '#FBE7E4', fg: '#B03A2E' },
  plum:   { bg: '#F1E9F1', fg: '#6E4470' },
  orange: { bg: '#FCF1E4', fg: '#A6501F' },
};

/** Statuts de commande de la boutique → libellé + ton. Couvre tous les
 *  statuts réellement présents en base, pas seulement ceux de la maquette. */
export const ORDER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending:   { label: 'En attente', tone: 'amber'  },
  paid:      { label: 'Payée',      tone: 'blue'   },
  confirmed: { label: 'Confirmée',  tone: 'blue'   },
  shipped:   { label: 'Expédiée',   tone: 'plum'   },
  delivered: { label: 'Livrée',     tone: 'green'  },
  cancelled: { label: 'Annulée',    tone: 'gray'   },
  refunded:  { label: 'Remboursée', tone: 'gray'   },
  abandoned: { label: 'Abandonné',  tone: 'gray'   },
};

/** Statuts de facture. */
export const INVOICE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft:    { label: 'Brouillon',    tone: 'gray'  },
  sent:     { label: 'À encaisser',  tone: 'amber' },
  paid:     { label: 'Payée',        tone: 'green' },
  late:     { label: 'En retard',    tone: 'red'   },
  avoir:    { label: 'Avoir',        tone: 'gray'  },
  refunded: { label: 'Remboursée',   tone: 'gray'  },
};

// ── Helpers ─────────────────────────────────────────────────

/** Couleur du niveau de stock : rupture / bas / sain (seuils du handoff). */
export function stockColor(qty: number, threshold = 12): string {
  if (qty <= 0) return T.red;
  if (qty <= threshold) return '#C97A2B';
  return T.green;
}

/** Vignette produit de repli : pastille colorée dérivée du nom.
 *  Utilisée quand le produit n'a pas de photo. */
export function thumbStyle(name: string, size = 28): React.CSSProperties {
  const hues = ['#EDE7EE', '#E7EDE6', '#EEE9E1', '#E6EAF0', '#F0E8E6'];
  const key = (name || '?');
  const h = hues[(key.charCodeAt(0) + key.length) % hues.length];
  return {
    width: size, height: size, borderRadius: size > 40 ? 9 : 7,
    background: h, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size > 40 ? 15 : 11, fontWeight: 700, color: T.text2b, flexShrink: 0,
    objectFit: 'cover',
  };
}

/** Initiales pour les avatars / vignettes de repli. */
export function initials(s: string, n = 2): string {
  const clean = (s || '').trim();
  if (!clean) return '—';
  const parts = clean.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, n).toUpperCase();
}

/** Formatage monétaire du back-office : « 1 234,56 € ». */
export const eur = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Entier formaté (séparateur de milliers insécable). */
export const num = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('fr-FR');
