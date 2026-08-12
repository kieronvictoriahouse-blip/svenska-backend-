// ─────────────────────────────────────────────────────────────
//  SOURCE DE VÉRITÉ UNIQUE DE LA NAVIGATION DU BACK-OFFICE
//  Structure et libellés repris du handoff « Redesign du back office » :
//  8 groupes, icônes Material Symbols Rounded, aucun emoji.
//  Consommée par : le shell (sidebar + barre d'onglets mobile) ET le hub.
//  Ne plus jamais redéfinir la nav ailleurs.
// ─────────────────────────────────────────────────────────────

export type NavBadge = 'stock' | 'orders' | 'receptions';

export type NavItem = {
  href: string;
  /** Ligature Material Symbols Rounded (pas d'emoji). */
  icon: string;
  label: string;
  /** Sous-titre affiché sur les cartes du hub. */
  desc?: string;
  /** Compteur dynamique à afficher en pastille. */
  badge?: NavBadge;
  /** Item hors maquette, conservé pour ne pas perdre l'accès à une page existante. */
  extra?: boolean;
};

export type NavGroup = {
  /** Vide pour le premier groupe (sans libellé, cf. handoff). */
  label: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/admin', icon: 'space_dashboard', label: 'Tableau de bord', desc: 'Vue d’ensemble de la boutique' },
    ],
  },
  {
    label: 'Boutique',
    items: [
      { href: '/admin/produits',   icon: 'inventory_2',  label: 'Produits',   desc: 'Gérer le catalogue' },
      { href: '/admin/categories', icon: 'category',     label: 'Catégories', desc: 'Organiser les rayons' },
      { href: '/admin/stock',      icon: 'inventory',    label: 'Stocks',     desc: 'Niveaux & alertes', badge: 'stock' },
      { href: '/admin/commandes',  icon: 'receipt_long', label: 'Commandes',  desc: 'Suivi des ventes',  badge: 'orders' },
      // Hors maquette — conservés pour ne pas perdre l'accès à ces écrans.
      { href: '/admin/produits/suggestions', icon: 'lightbulb', label: 'Suggestions', desc: 'Idées clients',        extra: true },
      { href: '/admin/import',              icon: 'upload',    label: 'Import URL',  desc: 'Ajouter depuis un lien', extra: true },
    ],
  },
  {
    label: 'Achats',
    items: [
      { href: '/admin/achats',     icon: 'shopping_basket', label: "Commandes d'achat", desc: 'Passer des commandes' },
      { href: '/admin/receptions', icon: 'local_shipping',  label: 'Réceptions',        desc: 'Recevoir & stocker', badge: 'receptions' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/admin/gestion',      icon: 'request_quote',   label: 'Facturation',  desc: 'Factures, marges, transport' },
      { href: '/admin/comptabilite', icon: 'account_balance', label: 'Comptabilité', desc: 'CA, recettes, cotisations' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/admin/marketing',             icon: 'campaign',            label: 'Campagnes',   desc: 'Emails & envois' },
      { href: '/admin/marketing?tab=promo',   icon: 'confirmation_number', label: 'Codes promo', desc: 'Réductions & offres' },
      { href: '/admin/marketing/automations', icon: 'smart_toy',           label: 'Automations', desc: 'Séquences automatiques' },
      { href: '/admin/marketing?tab=cart',    icon: 'shopping_cart',       label: 'Abandon panier', desc: 'Relances automatiques', extra: true },
    ],
  },
  {
    label: 'Contenu',
    items: [
      { href: '/admin/home-cms', icon: 'home',      label: "Page d'accueil", desc: 'Sections & textes de la home' },
      { href: '/admin/pages',    icon: 'article',   label: 'Pages',          desc: 'CGV, mentions, pages libres' },
      { href: '/admin/medias',   icon: 'perm_media', label: 'Médiathèque',   desc: 'Photos & fichiers' },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { href: '/admin/contacts?type=client',   icon: 'group',   label: 'Clients',      desc: "Carnet d'adresses clients" },
      { href: '/admin/contacts?type=supplier', icon: 'factory', label: 'Fournisseurs', desc: 'Gestion fournisseurs' },
    ],
  },
  {
    label: 'Réglages',
    items: [
      { href: '/admin/white-label', icon: 'palette', label: 'White label', desc: 'Couleurs, polices, logo' },
      { href: '/admin/apps',        icon: 'tune',    label: 'Paramètres',  desc: 'Boutique, livraison, TVA, emails' },
    ],
  },
];

/** Barre d'onglets mobile (58 px) — 5 entrées, cf. handoff. */
export const MOBILE_TABS: Array<{ href: string; icon: string; label: string; badge?: NavBadge; menu?: boolean }> = [
  { href: '/admin',           icon: 'space_dashboard', label: 'Accueil' },
  { href: '/admin/produits',  icon: 'inventory_2',     label: 'Produits' },
  { href: '/admin/commandes', icon: 'receipt_long',    label: 'Commandes', badge: 'orders' },
  { href: '/admin/stock',     icon: 'inventory',       label: 'Stocks',    badge: 'stock' },
  { href: '#menu',            icon: 'menu',            label: 'Menu', menu: true },
];

/** Tous les items, à plat — pratique pour le hub et la palette de commandes. */
export const ALL_ITEMS: NavItem[] = NAV.flatMap(g => g.items);

/** Pages plein écran : elles gèrent leur propre mise en page. */
export function isFullBleed(pathname: string): boolean {
  return pathname.startsWith('/admin/marketing/editor');
}

/**
 * État actif d'un item, en tenant compte des variantes ?tab= / ?type=.
 * Évite le bug « plusieurs liens actifs à la fois ».
 */
export function isNavItemActive(item: NavItem, pathname: string, search: string, siblings: NavItem[]): boolean {
  const [ipath, iquery] = item.href.split('?');

  // Le tableau de bord ne doit s'activer que sur /admin exactement.
  if (ipath === '/admin') return pathname === '/admin';

  if (!pathname.startsWith(ipath)) return false;

  const params = new URLSearchParams(search || '');
  if (iquery) {
    const [k, v] = iquery.split('=');
    if (params.get(k) !== v) return false;
  }

  // Un frère au chemin plus spécifique qui matche → c'est lui l'actif.
  const moreSpecificSibling = siblings.some(s => {
    if (s === item) return false;
    const sp = s.href.split('?')[0];
    return sp.length > ipath.length && pathname.startsWith(sp);
  });
  if (moreSpecificSibling) return false;

  // Item « de base » : il cède à un frère de même chemin dont le ?param= matche.
  if (!iquery) {
    const querySiblingMatches = siblings.some(s => {
      if (s === item) return false;
      const [sp, sq] = s.href.split('?');
      if (sp !== ipath || !sq) return false;
      const [k, v] = sq.split('=');
      return params.get(k) === v;
    });
    if (querySiblingMatches) return false;
  }
  return true;
}

/** Item actif, tous groupes confondus (pour le titre de page / la barre mobile). */
export function findActiveItem(pathname: string, search: string): NavItem | null {
  for (const g of NAV) {
    const hit = g.items.find(it => isNavItemActive(it, pathname, search, g.items));
    if (hit) return hit;
  }
  return null;
}
