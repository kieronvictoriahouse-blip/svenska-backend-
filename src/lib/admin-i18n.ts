export type AdminLang = 'fr' | 'en' | 'sv';

export function getAdminLang(): AdminLang {
  if (typeof localStorage === 'undefined') return 'fr';
  return (localStorage.getItem('sd_admin_lang') as AdminLang) || 'fr';
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

export const T_COMMON = {
  save:     { fr: 'Enregistrer', en: 'Save', sv: 'Spara' },
  cancel:   { fr: 'Annuler',     en: 'Cancel', sv: 'Avbryt' },
  delete:   { fr: 'Supprimer',   en: 'Delete', sv: 'Ta bort' },
  create:   { fr: 'Créer',       en: 'Create', sv: 'Skapa' },
  loading:  { fr: 'Chargement…', en: 'Loading…', sv: 'Laddar…' },
  noData:   { fr: 'Aucun résultat', en: 'No results', sv: 'Inga resultat' },
  client:   { fr: 'Client',      en: 'Customer', sv: 'Kund' },
  supplier: { fr: 'Fournisseur', en: 'Supplier', sv: 'Leverantör' },
  product:  { fr: 'Produit',     en: 'Product', sv: 'Produkt' },
  qty:      { fr: 'Qté',         en: 'Qty', sv: 'Antal' },
  price:    { fr: 'Prix',        en: 'Price', sv: 'Pris' },
  total:    { fr: 'Total',       en: 'Total', sv: 'Totalt' },
  date:     { fr: 'Date',        en: 'Date', sv: 'Datum' },
  status:   { fr: 'Statut',      en: 'Status', sv: 'Status' },
  notes:    { fr: 'Notes',       en: 'Notes', sv: 'Anteckningar' },
  address:  { fr: 'Adresse',     en: 'Address', sv: 'Adress' },
  email:    { fr: 'Email',       en: 'Email', sv: 'E-post' },
  name:     { fr: 'Nom',         en: 'Name', sv: 'Namn' },
  actions:  { fr: 'Actions',     en: 'Actions', sv: 'Åtgärder' },
  subtotal: { fr: 'Sous-total',  en: 'Subtotal', sv: 'Delsumma' },
  shipping: { fr: 'Livraison',   en: 'Shipping', sv: 'Frakt' },
  free:     { fr: 'Offerte',     en: 'Free', sv: 'Gratis' },
};

export const T_ORDER_STATUS = {
  pending:   { fr: 'En attente',  en: 'Pending',    sv: 'Väntar' },
  paid:      { fr: 'Payée',       en: 'Paid',        sv: 'Betald' },
  confirmed: { fr: 'Confirmée',   en: 'Confirmed',   sv: 'Bekräftad' },
  shipped:   { fr: 'Expédiée',    en: 'Shipped',     sv: 'Skickad' },
  delivered: { fr: 'Livrée',      en: 'Delivered',   sv: 'Levererad' },
  cancelled: { fr: 'Annulée',     en: 'Cancelled',   sv: 'Avbruten' },
  refunded:  { fr: 'Remboursée',  en: 'Refunded',    sv: 'Återbetald' },
};
