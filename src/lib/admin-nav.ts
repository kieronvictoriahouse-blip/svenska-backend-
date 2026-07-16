// ─────────────────────────────────────────────────────────────
//  SOURCE DE VÉRITÉ UNIQUE DE LA NAVIGATION DU BACK-OFFICE
//  Consommée par : le layout (sidebar) ET l'accueil (launcher/hub).
//  Ne plus jamais redéfinir la nav ailleurs.
// ─────────────────────────────────────────────────────────────

export type NavItem = {
  href: string;
  icon: string;
  label: string;
  desc?: string; // sous-titre affiché sur les cartes de l'accueil
};

export type NavModule = {
  key: string;
  label: string;
  icon: string;
  color: string;
  /** Préfixes de chemin qui font qu'on est "dans" ce module (détection sidebar). */
  paths: string[];
  nav: NavItem[];
};

export const MODULES: NavModule[] = [
  {
    key: 'boutique',
    label: 'Boutique',
    icon: '🛍️',
    color: '#7B4F7B',
    paths: ['/admin/produits', '/admin/categories', '/admin/stock', '/admin/commandes', '/admin/import'],
    nav: [
      { href: '/admin/produits',             icon: '📦', label: 'Produits',    desc: 'Gérer le catalogue' },
      { href: '/admin/categories',           icon: '🗂️', label: 'Catégories',  desc: 'Organiser les rayons' },
      { href: '/admin/stock',                icon: '🔢', label: 'Stocks',      desc: 'Niveaux & alertes' },
      { href: '/admin/commandes',            icon: '🛒', label: 'Commandes',   desc: 'Suivi des ventes' },
      { href: '/admin/produits/suggestions', icon: '💡', label: 'Suggestions', desc: 'Idées clients' },
      { href: '/admin/import',               icon: '📥', label: 'Import URL',  desc: 'Ajouter depuis un lien' },
    ],
  },
  {
    key: 'achats',
    label: 'Achats',
    icon: '📬',
    color: '#1A6B55',
    paths: ['/admin/achats', '/admin/receptions'],
    nav: [
      { href: '/admin/achats',     icon: '🛍️', label: 'Commandes achat', desc: 'Passer des commandes' },
      { href: '/admin/receptions', icon: '📬', label: 'Réceptions',       desc: 'Recevoir & stocker' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: '💰',
    color: '#1C4E80',
    paths: ['/admin/gestion', '/admin/comptabilite', '/admin/factures'],
    nav: [
      { href: '/admin/gestion',      icon: '🧾', label: 'Facturation',  desc: 'Factures, marges, transport' },
      { href: '/admin/comptabilite', icon: '📊', label: 'Comptabilité', desc: 'CA, recettes, cotisations' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: '📣',
    color: '#7B2D8B',
    paths: ['/admin/marketing'],
    nav: [
      { href: '/admin/marketing',             icon: '📧', label: 'Campagnes',      desc: 'Emails & envois' },
      { href: '/admin/marketing/automations', icon: '🤖', label: 'Automations',    desc: 'Séquences automatiques' },
      { href: '/admin/marketing?tab=promo',   icon: '🎟️', label: 'Codes promo',    desc: 'Réductions & offres' },
      { href: '/admin/marketing?tab=cart',    icon: '🛒', label: 'Abandon panier', desc: 'Relances automatiques' },
    ],
  },
  {
    key: 'contenu',
    label: 'Contenu',
    icon: '🖼️',
    color: '#8B5E3C',
    paths: ['/admin/home-cms', '/admin/homepage', '/admin/medias', '/admin/pages'],
    nav: [
      { href: '/admin/home-cms', icon: '🏠', label: "Page d'accueil", desc: 'Textes & sections de la home' },
      { href: '/admin/pages',    icon: '📄', label: 'Pages',          desc: 'CGV, mentions, pages libres' },
      { href: '/admin/medias',   icon: '🖼️', label: 'Médiathèque',    desc: 'Photos & fichiers' },
    ],
  },
  {
    key: 'contacts',
    label: 'Contacts',
    icon: '👥',
    color: '#5B3427',
    paths: ['/admin/contacts'],
    nav: [
      { href: '/admin/contacts?type=client',   icon: '👤', label: 'Clients',      desc: "Carnet d'adresses clients" },
      { href: '/admin/contacts?type=supplier', icon: '🏭', label: 'Fournisseurs', desc: 'Gestion fournisseurs' },
    ],
  },
  {
    key: 'config',
    label: 'Configuration',
    icon: '⚙️',
    color: '#424242',
    paths: ['/admin/white-label'],
    nav: [
      { href: '/admin/white-label',            icon: '🎨', label: 'White Label',    desc: 'Couleurs, polices, logo' },
      { href: '/admin/white-label?tab=import', icon: '📥', label: 'Import données', desc: 'CSV articles / clients' },
    ],
  },
];

/** Trouve le module correspondant à un chemin (préfixe). */
export function findModule(pathname: string): NavModule | null {
  return MODULES.find(m => m.paths.some(p => pathname.startsWith(p))) || null;
}

/** Pages plein écran : elles gèrent leur propre mise en page, pas de sidebar/padding du shell. */
export function isFullBleed(pathname: string): boolean {
  return pathname.startsWith('/admin/marketing/editor') || pathname.startsWith('/admin/gestion');
}

/**
 * État actif d'un item de nav, en tenant compte des variantes en ?tab= / ?type=
 * (corrige le bug "plusieurs liens actifs à la fois").
 */
export function isNavItemActive(item: NavItem, pathname: string, search: string, siblings: NavItem[]): boolean {
  const [ipath, iquery] = item.href.split('?');
  if (!pathname.startsWith(ipath)) return false;
  const params = new URLSearchParams(search || '');
  if (iquery) {
    const [k, v] = iquery.split('=');
    if (params.get(k) !== v) return false;
  }
  // Un frère avec un chemin plus spécifique qui matche → c'est lui l'actif, pas celui-ci.
  const moreSpecificSibling = siblings.some(s => {
    if (s === item) return false;
    const sp = s.href.split('?')[0];
    return sp.length > ipath.length && pathname.startsWith(sp);
  });
  if (moreSpecificSibling) return false;
  // Item "de base" (sans query) : il cède à un frère de même chemin dont le ?param= matche l'URL.
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
