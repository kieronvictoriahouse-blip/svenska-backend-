// ─────────────────────────────────────────────────────────────
//  SOURCE DE VÉRITÉ UNIQUE DE LA NAVIGATION DU BACK-OFFICE
//  Structure et libellés repris du handoff « Redesign du back office » :
//  8 groupes, icônes Material Symbols Rounded, aucun emoji.
//  Consommée par : le shell (sidebar + barre d'onglets mobile) ET le hub.
//  Ne plus jamais redéfinir la nav ailleurs.
// ─────────────────────────────────────────────────────────────

import type { Trad } from '@/lib/admin-i18n';

export type NavBadge = 'stock' | 'orders' | 'receptions';

export type NavItem = {
  href: string;
  /** Ligature Material Symbols Rounded (pas d'emoji). */
  icon: string;
  /* Les libellés sont traduits : la navigation est le seul texte visible
     sur tous les écrans, un back-office à moitié traduit se voit ici en
     premier. */
  label: Trad;
  /** Sous-titre affiché sur les cartes du hub. */
  desc?: Trad;
  /** Compteur dynamique à afficher en pastille. */
  badge?: NavBadge;
  /** Item hors maquette, conservé pour ne pas perdre l'accès à une page existante. */
  extra?: boolean;
};

export type NavGroup = {
  /** Vide pour le premier groupe (sans libellé, cf. handoff). */
  label: Trad | null;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/admin', icon: 'space_dashboard',
        label: { fr: 'Tableau de bord', en: 'Dashboard', sv: 'Översikt' },
        desc: { fr: 'Vue d’ensemble de la boutique', en: 'Shop overview', sv: 'Överblick över butiken' } },
    ],
  },
  {
    label: { fr: 'Boutique', en: 'Shop', sv: 'Butik' },
    items: [
      { href: '/admin/produits', icon: 'inventory_2',
        label: { fr: 'Produits', en: 'Products', sv: 'Produkter' },
        desc: { fr: 'Gérer le catalogue', en: 'Manage the catalogue', sv: 'Hantera sortimentet' } },
      { href: '/admin/categories', icon: 'category',
        label: { fr: 'Catégories', en: 'Categories', sv: 'Kategorier' },
        desc: { fr: 'Organiser les rayons', en: 'Organise the aisles', sv: 'Ordna hyllorna' } },
      { href: '/admin/stock', icon: 'inventory', badge: 'stock',
        label: { fr: 'Stocks', en: 'Stock', sv: 'Lager' },
        desc: { fr: 'Niveaux & alertes', en: 'Levels & alerts', sv: 'Nivåer och varningar' } },
      { href: '/admin/stock/historique', icon: 'history', extra: true,
        label: { fr: 'Historique stock', en: 'Stock history', sv: 'Lagerhistorik' },
        desc: { fr: 'Chaque mouvement, daté et justifié', en: 'Every movement, dated and justified', sv: 'Varje rörelse, daterad och motiverad' } },
      { href: '/admin/commandes', icon: 'receipt_long', badge: 'orders',
        label: { fr: 'Commandes', en: 'Orders', sv: 'Beställningar' },
        desc: { fr: 'Suivi des ventes', en: 'Sales tracking', sv: 'Uppföljning av försäljning' } },
      { href: '/admin/commandes/preparation', icon: 'barcode_scanner',
        label: { fr: 'Préparation', en: 'Picking', sv: 'Plockning' },
        desc: { fr: 'Picking scanné au téléphone', en: 'Scan-based picking on your phone', sv: 'Plockning med mobilskanner' } },
      { href: '/admin/ruptures', icon: 'production_quantity_limits',
        label: { fr: 'Ruptures', en: 'Out of stock', sv: 'Slutsålt' },
        desc: { fr: 'Proposer un remplacement au client', en: 'Offer the customer a replacement', sv: 'Erbjud kunden en ersättning' } },
      // Hors maquette — conservés pour ne pas perdre l'accès à ces écrans.
      { href: '/admin/produits/suggestions', icon: 'lightbulb', extra: true,
        label: { fr: 'Suggestions', en: 'Suggestions', sv: 'Förslag' },
        desc: { fr: 'Idées clients', en: 'Customer ideas', sv: 'Kundernas idéer' } },
      { href: '/admin/import', icon: 'upload', extra: true,
        label: { fr: 'Import URL', en: 'URL import', sv: 'URL-import' },
        desc: { fr: 'Ajouter depuis un lien', en: 'Add from a link', sv: 'Lägg till från en länk' } },
    ],
  },
  {
    label: { fr: 'Achats', en: 'Purchasing', sv: 'Inköp' },
    items: [
      { href: '/admin/achats', icon: 'shopping_basket',
        label: { fr: 'Commandes d’achat', en: 'Purchase orders', sv: 'Inköpsorder' },
        desc: { fr: 'Passer des commandes', en: 'Place orders', sv: 'Lägg beställningar' } },
      { href: '/admin/achats/conditionnements', icon: 'inventory_2', extra: true,
        label: { fr: 'Conditionnements', en: 'Pack sizes', sv: 'Förpackningsstorlekar' },
        desc: { fr: 'Unités par carton', en: 'Units per case', sv: 'Enheter per kartong' } },
      { href: '/admin/achats/ticket', icon: 'receipt',
        label: { fr: 'Saisie ticket', en: 'Receipt entry', sv: 'Kvittoregistrering' },
        desc: { fr: 'Lire un ticket de caisse', en: 'Read a till receipt', sv: 'Läs ett kvitto' } },
      { href: '/admin/receptions', icon: 'local_shipping', badge: 'receptions',
        label: { fr: 'Réceptions', en: 'Goods receipts', sv: 'Inleveranser' },
        desc: { fr: 'Recevoir & stocker', en: 'Receive & store', sv: 'Ta emot och lagra' } },
    ],
  },
  {
    label: { fr: 'Finance', en: 'Finance', sv: 'Ekonomi' },
    items: [
      { href: '/admin/gestion', icon: 'request_quote',
        label: { fr: 'Facturation', en: 'Invoicing', sv: 'Fakturering' },
        desc: { fr: 'Factures, marges, transport', en: 'Invoices, margins, freight', sv: 'Fakturor, marginaler, frakt' } },
      { href: '/admin/comptabilite', icon: 'account_balance',
        label: { fr: 'Comptabilité', en: 'Accounting', sv: 'Bokföring' },
        desc: { fr: 'CA, recettes, cotisations', en: 'Turnover, income, contributions', sv: 'Omsättning, intäkter, avgifter' } },
    ],
  },
  {
    label: { fr: 'Marketing', en: 'Marketing', sv: 'Marknadsföring' },
    items: [
      { href: '/admin/marketing', icon: 'campaign',
        label: { fr: 'Campagnes', en: 'Campaigns', sv: 'Kampanjer' },
        desc: { fr: 'Emails & envois', en: 'Emails & sends', sv: 'Utskick och e-post' } },
      { href: '/admin/marketing?tab=promo', icon: 'confirmation_number',
        label: { fr: 'Codes promo', en: 'Promo codes', sv: 'Rabattkoder' },
        desc: { fr: 'Réductions & offres', en: 'Discounts & offers', sv: 'Rabatter och erbjudanden' } },
      { href: '/admin/marketing/automations', icon: 'smart_toy',
        label: { fr: 'Automations', en: 'Automations', sv: 'Automatiseringar' },
        desc: { fr: 'Séquences automatiques', en: 'Automated sequences', sv: 'Automatiska sekvenser' } },
      { href: '/admin/emails', icon: 'mail',
        label: { fr: 'Emails', en: 'Emails', sv: 'E-postmallar' },
        desc: { fr: 'Modèles envoyés aux clients', en: 'Templates sent to customers', sv: 'Mallar som skickas till kunder' } },
      { href: '/admin/boite-mail', icon: 'inbox',
        label: { fr: 'Boîte mail', en: 'Mailbox', sv: 'Inkorg' },
        desc: { fr: 'hej@swedishcravings.fr', en: 'hej@swedishcravings.fr', sv: 'hej@swedishcravings.fr' } },
      { href: '/admin/marketing?tab=cart', icon: 'shopping_cart', extra: true,
        label: { fr: 'Abandon panier', en: 'Abandoned carts', sv: 'Övergivna kundvagnar' },
        desc: { fr: 'Relances automatiques', en: 'Automatic reminders', sv: 'Automatiska påminnelser' } },
    ],
  },
  {
    label: { fr: 'Contenu', en: 'Content', sv: 'Innehåll' },
    items: [
      { href: '/admin/home-cms', icon: 'home',
        label: { fr: 'Textes d’accueil', en: 'Home texts', sv: 'Startsidans texter' },
        desc: { fr: 'Titres, images et textes de la home', en: 'Home page titles, images and copy', sv: 'Rubriker, bilder och text på startsidan' } },
      /* Complementaire, pas doublon : home-cms edite les cles CMS, cet ecran
         edite les sections (hero, bande Epices, bande Fredagsmys) et les
         selections de produits mises en avant. Il etait sorti de la nav par
         erreur et devenait inatteignable. */
      { href: '/admin/homepage', icon: 'view_carousel',
        label: { fr: 'Sections d’accueil', en: 'Home sections', sv: 'Startsidans sektioner' },
        desc: { fr: 'Bandes et produits mis en avant', en: 'Bands and featured products', sv: 'Block och utvalda produkter' } },
      { href: '/admin/pages', icon: 'article',
        label: { fr: 'Pages', en: 'Pages', sv: 'Sidor' },
        desc: { fr: 'CGV, mentions, pages libres', en: 'Terms, legal notice, free pages', sv: 'Villkor, juridik, fria sidor' } },
      { href: '/admin/medias', icon: 'perm_media',
        label: { fr: 'Médiathèque', en: 'Media library', sv: 'Mediabibliotek' },
        desc: { fr: 'Photos & fichiers', en: 'Photos & files', sv: 'Bilder och filer' } },
    ],
  },
  {
    label: { fr: 'Contacts', en: 'Contacts', sv: 'Kontakter' },
    items: [
      { href: '/admin/contacts?type=client', icon: 'group',
        label: { fr: 'Clients', en: 'Customers', sv: 'Kunder' },
        desc: { fr: 'Carnet d’adresses clients', en: 'Customer address book', sv: 'Kundregister' } },
      { href: '/admin/contacts?type=supplier', icon: 'factory',
        label: { fr: 'Fournisseurs', en: 'Suppliers', sv: 'Leverantörer' },
        desc: { fr: 'Gestion fournisseurs', en: 'Supplier management', sv: 'Leverantörshantering' } },
    ],
  },
  {
    label: { fr: 'Réglages', en: 'Settings', sv: 'Inställningar' },
    items: [
      { href: '/admin/white-label', icon: 'palette',
        label: { fr: 'White label', en: 'White label', sv: 'White label' },
        desc: { fr: 'Couleurs, polices, logo', en: 'Colours, fonts, logo', sv: 'Färger, typsnitt, logotyp' } },
      { href: '/admin/apps', icon: 'tune',
        label: { fr: 'Paramètres', en: 'Settings', sv: 'Inställningar' },
        desc: { fr: 'Boutique, livraison, TVA, emails', en: 'Shop, shipping, VAT, emails', sv: 'Butik, frakt, moms, e-post' } },
    ],
  },
];

/** Barre d'onglets mobile (58 px) — 5 entrées, cf. handoff. */
export const MOBILE_TABS: Array<{ href: string; icon: string; label: Trad; badge?: NavBadge; menu?: boolean }> = [
  { href: '/admin',           icon: 'space_dashboard', label: { fr: 'Accueil', en: 'Home', sv: 'Hem' } },
  { href: '/admin/produits',  icon: 'inventory_2',     label: { fr: 'Produits', en: 'Products', sv: 'Produkter' } },
  { href: '/admin/commandes', icon: 'receipt_long',    label: { fr: 'Commandes', en: 'Orders', sv: 'Order' }, badge: 'orders' },
  { href: '/admin/stock',     icon: 'inventory',       label: { fr: 'Stocks', en: 'Stock', sv: 'Lager' }, badge: 'stock' },
  { href: '#menu',            icon: 'menu',            label: { fr: 'Menu', en: 'Menu', sv: 'Meny' }, menu: true },
];

/** Tous les items, à plat — pratique pour le hub et la palette de commandes. */
export const ALL_ITEMS: NavItem[] = NAV.flatMap(g => g.items);

/** Pages plein écran : elles gèrent leur propre mise en page. */
export function isFullBleed(pathname: string): boolean {
  return pathname.startsWith('/admin/marketing/editor');
}

/** Pages « nues » : rendues sans shell du tout (documents A4 à imprimer).
 *  Elles restent protégées par le middleware et le contrôle d'auth du layout. */
export function isBare(pathname: string): boolean {
  return pathname.startsWith('/admin/documents/');
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
