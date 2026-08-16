'use client';
import { useEffect, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════
   LANGUE DU BACK-OFFICE

   Le sélecteur vit en haut à droite du shell ; le choix est persisté et
   diffusé à tout l'écran par un évènement. Cette partie fonctionnait
   déjà — ce qui manquait, c'étaient les traductions.

   Deux niveaux, volontairement :
   · `T_COMMON`, `T_ORDER_STATUS`… ici, pour ce qui traverse les écrans.
     Un statut de commande doit se dire pareil partout, sinon la même
     commande est « Expédiée » ici et « Envoyée » là.
   · un dictionnaire local à chaque écran, à côté de son code. Tout
     regrouper dans un seul fichier de trois mille lignes rendrait
     chaque ajout pénible et les libellés introuvables.

   Les deux passent par le même `useT()`, donc la même mécanique.
   ═══════════════════════════════════════════════════════════════ */

export type AdminLang = 'fr' | 'en' | 'sv';

export const LANGUES: AdminLang[] = ['fr', 'en', 'sv'];

/** Une entrée de dictionnaire. `en`/`sv` absents ⇒ repli sur le français. */
export type Trad = { fr: string; en?: string; sv?: string };
export type Dico = Record<string, Trad>;

export function getAdminLang(): AdminLang {
  if (typeof localStorage === 'undefined') return 'fr';
  const l = localStorage.getItem('sd_admin_lang') as AdminLang;
  return LANGUES.includes(l) ? l : 'fr';
}

export function setAdminLang(lang: AdminLang) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('sd_admin_lang', lang);
    window.dispatchEvent(new Event('sd_admin_lang_change'));
  }
}

export function subscribeAdminLang(setLang: (l: AdminLang) => void) {
  if (typeof window === 'undefined') return;
  const handler = () => setLang(getAdminLang());
  window.addEventListener('sd_admin_lang_change', handler);
  return () => window.removeEventListener('sd_admin_lang_change', handler);
}

/** Le français est le repli : une traduction manquante affiche un mot
 *  compréhensible plutôt qu'une clé technique. */
export function traduire(entree: Trad | undefined, lang: AdminLang): string {
  if (!entree) return '';
  return entree[lang] || entree.fr || '';
}

/**
 * Langue courante, resynchronisée à chaque changement.
 *
 * Le premier rendu vaut toujours 'fr' : `localStorage` n'existe pas au
 * rendu serveur, et lire la vraie valeur pendant le rendu ferait diverger
 * client et serveur. On la pose donc après montage.
 */
export function useAdminLang(): AdminLang {
  const [lang, setLang] = useState<AdminLang>('fr');
  useEffect(() => {
    setLang(getAdminLang());
    return subscribeAdminLang(setLang);
  }, []);
  return lang;
}

/**
 * Traducteur d'un écran.
 *
 *   const { t, lang } = useT(T_ECRAN);
 *   <h1>{t('titre')}</h1>
 *
 * Une clé inconnue se renvoie elle-même : un libellé oublié se voit à
 * l'écran au lieu de disparaître.
 */
export function useT<D extends Dico>(dico: D) {
  const lang = useAdminLang();
  const t = (cle: keyof D & string, dico2?: Dico): string => {
    const entree = (dico2 || dico)[cle] as Trad | undefined;
    return entree ? traduire(entree, lang) : cle;
  };
  return { t, lang, tc: (cle: keyof typeof T_COMMON) => traduire(T_COMMON[cle], lang) };
}

/* ── Termes transversaux ─────────────────────────────────────── */
export const T_COMMON = {
  save:      { fr: 'Enregistrer', en: 'Save', sv: 'Spara' },
  cancel:    { fr: 'Annuler', en: 'Cancel', sv: 'Avbryt' },
  delete:    { fr: 'Supprimer', en: 'Delete', sv: 'Ta bort' },
  create:    { fr: 'Créer', en: 'Create', sv: 'Skapa' },
  edit:      { fr: 'Modifier', en: 'Edit', sv: 'Ändra' },
  close:     { fr: 'Fermer', en: 'Close', sv: 'Stäng' },
  back:      { fr: 'Retour', en: 'Back', sv: 'Tillbaka' },
  search:    { fr: 'Rechercher', en: 'Search', sv: 'Sök' },
  filter:    { fr: 'Filtrer', en: 'Filter', sv: 'Filtrera' },
  all:       { fr: 'Tout', en: 'All', sv: 'Alla' },
  loading:   { fr: 'Chargement…', en: 'Loading…', sv: 'Laddar…' },
  noData:    { fr: 'Aucun résultat', en: 'No results', sv: 'Inga resultat' },
  confirm:   { fr: 'Confirmer', en: 'Confirm', sv: 'Bekräfta' },
  print:     { fr: 'Imprimer', en: 'Print', sv: 'Skriv ut' },
  send:      { fr: 'Envoyer', en: 'Send', sv: 'Skicka' },
  download:  { fr: 'Télécharger', en: 'Download', sv: 'Ladda ner' },
  add:       { fr: 'Ajouter', en: 'Add', sv: 'Lägg till' },

  client:    { fr: 'Client', en: 'Customer', sv: 'Kund' },
  supplier:  { fr: 'Fournisseur', en: 'Supplier', sv: 'Leverantör' },
  product:   { fr: 'Produit', en: 'Product', sv: 'Produkt' },
  products:  { fr: 'Produits', en: 'Products', sv: 'Produkter' },
  order:     { fr: 'Commande', en: 'Order', sv: 'Beställning' },
  orders:    { fr: 'Commandes', en: 'Orders', sv: 'Beställningar' },
  qty:       { fr: 'Qté', en: 'Qty', sv: 'Antal' },
  units:     { fr: 'unités', en: 'units', sv: 'enheter' },
  price:     { fr: 'Prix', en: 'Price', sv: 'Pris' },
  total:     { fr: 'Total', en: 'Total', sv: 'Totalt' },
  subtotal:  { fr: 'Sous-total', en: 'Subtotal', sv: 'Delsumma' },
  shipping:  { fr: 'Livraison', en: 'Shipping', sv: 'Frakt' },
  free:      { fr: 'Offerte', en: 'Free', sv: 'Gratis' },
  date:      { fr: 'Date', en: 'Date', sv: 'Datum' },
  status:    { fr: 'Statut', en: 'Status', sv: 'Status' },
  notes:     { fr: 'Notes', en: 'Notes', sv: 'Anteckningar' },
  address:   { fr: 'Adresse', en: 'Address', sv: 'Adress' },
  email:     { fr: 'Email', en: 'Email', sv: 'E-post' },
  phone:     { fr: 'Téléphone', en: 'Phone', sv: 'Telefon' },
  name:      { fr: 'Nom', en: 'Name', sv: 'Namn' },
  actions:   { fr: 'Actions', en: 'Actions', sv: 'Åtgärder' },
  stock:     { fr: 'Stock', en: 'Stock', sv: 'Lager' },
  reference: { fr: 'Réf.', en: 'Ref.', sv: 'Ref.' },
  weight:    { fr: 'Poids', en: 'Weight', sv: 'Vikt' },
  country:   { fr: 'Pays', en: 'Country', sv: 'Land' },
  language:  { fr: 'Langue', en: 'Language', sv: 'Språk' },
};

export const T_ORDER_STATUS = {
  pending:   { fr: 'En attente', en: 'Pending', sv: 'Väntar' },
  paid:      { fr: 'Payée', en: 'Paid', sv: 'Betald' },
  confirmed: { fr: 'Confirmée', en: 'Confirmed', sv: 'Bekräftad' },
  preparing: { fr: 'En préparation', en: 'Preparing', sv: 'Förbereds' },
  shipped:   { fr: 'Expédiée', en: 'Shipped', sv: 'Skickad' },
  delivered: { fr: 'Livrée', en: 'Delivered', sv: 'Levererad' },
  cancelled: { fr: 'Annulée', en: 'Cancelled', sv: 'Avbruten' },
  refunded:  { fr: 'Remboursée', en: 'Refunded', sv: 'Återbetald' },
  abandoned: { fr: 'Abandonnée', en: 'Abandoned', sv: 'Övergiven' },
};

/* ── Coquille : topbar, pied de la barre latérale ────────────── */
export const T_SHELL = {
  backoffice:  { fr: 'Back-office', en: 'Back office', sv: 'Backoffice' },
  searchPlaceholder: {
    fr: 'Rechercher un produit, une commande, un client…',
    en: 'Search a product, an order, a customer…',
    sv: 'Sök produkt, beställning eller kund…',
  },
  viewSite:    { fr: 'Voir le site', en: 'View site', sv: 'Visa sajten' },
  logout:      { fr: 'Se déconnecter', en: 'Sign out', sv: 'Logga ut' },
  openNav:     { fr: 'Ouvrir la navigation', en: 'Open navigation', sv: 'Öppna navigeringen' },
  closeNav:    { fr: 'Fermer la navigation', en: 'Close navigation', sv: 'Stäng navigeringen' },
  help:        { fr: 'Aide', en: 'Help', sv: 'Hjälp' },
};

/**
 * Nom d'un produit dans la langue choisie.
 *
 * Vaut pour une fiche produit comme pour une ligne de commande : les
 * deux portent les mêmes champs, et une ligne ancienne n'a parfois que
 * `name`. On accepte donc les deux, la fiche l'emportant sur la ligne —
 * un produit renommé doit s'afficher sous son nom actuel.
 *
 * Le français est le dernier repli parce qu'il est toujours renseigné :
 * mieux vaut un nom lisible qu'une case vide.
 */
export function nomProduit(source: any, lang: AdminLang, ligne?: any): string {
  const champs = lang === 'sv' ? ['name_sv'] : lang === 'en' ? ['name_en'] : [];
  for (const c of champs) {
    const v = source?.[c] || ligne?.[c];
    if (v) return String(v);
  }
  return source?.name_fr || ligne?.name_fr || ligne?.name || source?.name || 'Article';
}

/** Formats de date et de monnaie de la langue choisie. Une interface
 *  anglaise qui affiche « 16 août 2026 » n'est pas traduite. */
export const LOCALES: Record<AdminLang, string> = {
  fr: 'fr-FR', en: 'en-GB', sv: 'sv-SE',
};

export function formatDate(d: any, lang: AdminLang, avecHeure = false): string {
  if (!d) return '—';
  const x = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d);
  if (Number.isNaN(+x)) return '—';
  return x.toLocaleDateString(LOCALES[lang], {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(avecHeure ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function formatDateLongue(d: any, lang: AdminLang): string {
  if (!d) return '—';
  const x = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d);
  if (Number.isNaN(+x)) return '—';
  return x.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatEur(n: any, lang: AdminLang): string {
  return (Number(n) || 0).toLocaleString(LOCALES[lang], {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + ' €';
}
