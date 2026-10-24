'use client';
import { downloadAuth, adminFetch } from '@/lib/auth-client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { getAdminLang, setAdminLang, subscribeAdminLang, T_COMMON, T_ORDER_STATUS, AdminLang, LOCALES, nomProduit } from '@/lib/admin-i18n';
import { resolveShipping } from '@/lib/shipping';
import { evaluatePromo, dansLaPeriode } from '@/lib/promo';
import { ADMIN_SEARCH_EVENT } from '@/lib/admin-nav';
// Thème importé sous alias :  est déjà pris par le dictionnaire de traductions.
import { T as TH, BADGE, ORDER_STATUS, thumbStyle, initials } from '@/lib/admin-theme';
import { SqueletteTable } from '@/components/Squelette';
import { MenuActions, MenuItem, MenuSep } from '@/components/MenuActions';
import {
  LANGUES_CLIENT, NOM_LANGUE, langueDeCommande, paysDeLivraison, type LangueClient,
} from '@/lib/langue-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Order = {
  id: string; order_number: string; status: string;
  customer_name: string; customer_email: string; customer_phone?: string;
  shipping_address?: string; customer_address?: string;
  lang?: LangueClient; shipping_country?: string;
  lines: any[]; subtotal: number; shipping: number; total: number;
  notes?: string; source?: string; created_at: string;
  tracking_number?: string; delivery_mode?: string;
  transport_cost_real?: number; packaging_cost?: number;
  is_test?: boolean; promo_code?: string; discount?: number;
  stripe_session_id?: string; exclude_from_stats?: boolean;
  relay_point_id?: string; relay_point_name?: string; relay_point_address?: string; relay_point_pays?: string;
  mondial_relay_tracking?: string; mondial_relay_label_url?: string;
  logspher_tracking?: string; logspher_label_url?: string; logspher_carrier_name?: string; logspher_error?: string;
  payment_link_url?: string; payment_link_sent_at?: string;
  refunded_amount?: number; refunded_at?: string;
  refunds?: { date: string; amount: number; shipping_kept?: number; reason?: string | null; stripe_refund_id?: string | null; order_modified?: boolean; items?: any[] }[];
};

type ProductCost = { id: string; cost_price: number };
type Product = {
  id: string; name_fr: string; name_en?: string; name_sv?: string;
  price: number; weight?: string; image_url?: string;
  product_variants?: { label: string; price: number }[];
};

const T = {
  title:         { fr: 'Commandes', en: 'Orders', sv: 'Beställningar' },
  newOrder:      { fr: 'Nouvelle commande', en: 'New order', sv: 'Ny beställning' },
  search:        { fr: 'Rechercher client, email, n° commande…', en: 'Search customer, email, order #…', sv: 'Sök kund, e-post, ordernr…' },
  allStatuses:   { fr: 'Tous les statuts', en: 'All statuses', sv: 'Alla status' },
  colOrder:      { fr: 'N° Commande', en: 'Order #', sv: 'Ordernr' },
  colClient:     { fr: 'Client', en: 'Customer', sv: 'Kund' },
  colDate:       { fr: 'Date', en: 'Date', sv: 'Datum' },
  colTotal:      { fr: 'Total', en: 'Total', sv: 'Totalt' },
  totalOrders:   { fr: 'Total commandes', en: 'Total orders', sv: 'Totalt' },
  pending:       { fr: 'En attente', en: 'Pending', sv: 'Väntar' },
  revenue:       { fr: "Chiffre d'affaires", en: 'Revenue', sv: 'Intäkt' },
  avgCart:       { fr: 'Panier moyen', en: 'Avg. order', sv: 'Snittorder' },
  tracking:      { fr: 'Numéro de suivi', en: 'Tracking number', sv: 'Spårningsnummer' },
  trackingSave:  { fr: 'Enregistrer le suivi', en: 'Save tracking', sv: 'Spara spårning' },
  trackingPlaceholder: { fr: 'Ex: 1Z999AA10123456784', en: 'E.g. 1Z999AA10123456784', sv: 'T.ex. 1Z999AA10123456784' },
  deliveryNote:  { fr: 'Bon de livraison', en: 'Delivery note', sv: 'Följesedel' },
  clickCollect:  { fr: 'Click & Collect', en: 'Click & Collect', sv: 'Click & Collect' },
  pickupReady:   { fr: 'À retirer en magasin', en: 'Ready for pickup', sv: 'Redo att hämtas' },
  changeStatus:  { fr: 'Changer le statut', en: 'Change status', sv: 'Ändra status' },
  orderLines:    { fr: 'Lignes', en: 'Lines', sv: 'Rader' },
  resteALivrer:  { fr: 'reste à livrer', en: 'still to ship', sv: 'kvar att skicka' },
  ligneLivree:   { fr: 'livré', en: 'shipped', sv: 'skickat' },
  newOrderTitle: { fr: 'Nouvelle commande manuelle', en: 'New manual order', sv: 'Ny manuell beställning' },
  custName:      { fr: 'Nom client *', en: 'Customer name *', sv: 'Kundnamn *' },
  shippingFee:   { fr: 'Frais de livraison', en: 'Shipping fee', sv: 'Fraktkostnad' },
  addLine:       { fr: '+ Ligne', en: '+ Line', sv: '+ Rad' },
  details:       { fr: 'Détails', en: 'Details', sv: 'Detaljer' },
  source:        { fr: 'Source', en: 'Source', sv: 'Källa' },
  refund:        { fr: 'Rembourser', en: 'Refund', sv: 'Återbetala' },
  refundConfirm: { fr: '⚠️ Confirmer le remboursement ?', en: '⚠️ Confirm refund?', sv: '⚠️ Bekräfta återbetalning?' },
  partialRefund: { fr: 'Remboursement partiel', en: 'Partial refund', sv: 'Delvis återbetalning' },
  refunded:      { fr: 'Déjà remboursé', en: 'Already refunded', sv: 'Redan återbetalt' },
  netCollected:  { fr: 'Net encaissé', en: 'Net collected', sv: 'Netto' },
  markTest:      { fr: 'Marquer comme test', en: 'Mark as test', sv: 'Markera som test' },
  markTestConfirm: { fr: '⚠️ Confirmer ? Supprime la comptabilité associée', en: '⚠️ Confirm? Removes accounting entry', sv: '⚠️ Bekräfta? Tar bort bokföringen' },
  showTest:      { fr: 'Afficher les commandes test', en: 'Show test orders', sv: 'Visa testbeställningar' },
  selectOrder:   { fr: 'Sélectionne une commande dans la liste.', en: 'Select an order from the list.', sv: 'Välj en order i listan.' },
  noOrder:       { fr: 'Aucune commande', en: 'No order', sv: 'Ingen order' },
  notApplicable: { fr: 'Non applicable', en: 'Not applicable', sv: 'Ej tillämpligt' },
  realCosts:     { fr: 'Coûts réels & marge', en: 'Actual costs & margin', sv: 'Verkliga kostnader och marginal' },
  saving:        { fr: 'Enregistrement…', en: 'Saving…', sv: 'Sparar…' },
  realFreight:   { fr: 'Transport réel', en: 'Actual freight', sv: 'Verklig frakt' },
  packaging:     { fr: 'Emballage', en: 'Packaging', sv: 'Emballage' },
  realMargin:    { fr: 'Marge réelle', en: 'Actual margin', sv: 'Verklig marginal' },
  stripeFee:     { fr: 'Stripe (~1,5 % + 0,25 €)', en: 'Stripe (~1.5% + €0.25)', sv: 'Stripe (~1,5 % + 0,25 €)' },
  freightCharged:{ fr: 'Port perçu client', en: 'Shipping charged to customer', sv: 'Frakt debiterad kunden' },
  itemsToCredit: { fr: 'Articles à retirer / créditer', en: 'Items to remove / credit', sv: 'Artiklar att ta bort / kreditera' },
  freightToBill: { fr: 'Frais de port à facturer au client', en: 'Shipping to bill the customer', sv: 'Frakt att fakturera kunden' },
  creditItems:   { fr: 'Crédit articles retirés', en: 'Credit for removed items', sv: 'Kredit för borttagna artiklar' },
  freightBilled: { fr: 'Frais de port facturés', en: 'Shipping billed', sv: 'Fakturerad frakt' },
  refundReason:  { fr: 'Motif (visible sur l’avoir et l’email client)', en: 'Reason (shown on the credit note and customer email)', sv: 'Orsak (syns på kreditnotan och kundens e-post)' },
  stripeLink:    { fr: 'Lien de paiement Stripe', en: 'Stripe payment link', sv: 'Stripe-betallänk' },
  shipment:      { fr: 'Expédition', en: 'Shipment', sv: 'Försändelse' },
  downloadPdf:   { fr: 'Télécharger le PDF', en: 'Download PDF', sv: 'Ladda ner PDF' },
  relayDelivery: { fr: 'Relais livraison', en: 'Pickup point', sv: 'Utlämningsställe' },
  relayCode:     { fr: 'Code relais', en: 'Pickup code', sv: 'Utlämningskod' },
  relayDrop:     { fr: 'Relais de dépôt', en: 'Drop-off point', sv: 'Inlämningsställe' },
  relayYours:    { fr: 'Votre relais', en: 'Your pickup point', sv: 'Ditt ombud' },
  weightG:       { fr: 'Poids (g)', en: 'Weight (g)', sv: 'Vikt (g)' },
  trackingShort: { fr: 'Suivi', en: 'Tracking', sv: 'Spårning' },
  docsActions:   { fr: 'Documents & actions', en: 'Documents & actions', sv: 'Dokument och åtgärder' },
  excludeStats:  { fr: 'Exclut des stats de marge uniquement — la compta reste intacte', en: 'Excludes from margin stats only — accounting untouched', sv: 'Utesluts endast ur marginalstatistiken — bokföringen rörs inte' },
  excludeAll:    { fr: 'Exclut la commande des stats ET de la comptabilité', en: 'Excludes the order from stats AND accounting', sv: 'Utesluter ordern ur både statistik och bokföring' },
  shippingMode:  { fr: 'Mode de livraison', en: 'Shipping method', sv: 'Fraktsätt' },
  promoCode:     { fr: 'Code promo (optionnel)', en: 'Promo code (optional)', sv: 'Rabattkod (valfritt)' },
  promoExample:  { fr: 'Ex: SWEDISH10', en: 'E.g. SWEDISH10', sv: 'T.ex. SWEDISH10' },
  freeShipping:  { fr: 'Livraison offerte', en: 'Free shipping', sv: 'Fri frakt' },
  searchProduct: { fr: 'Rechercher un produit...', en: 'Search a product...', sv: 'Sök en produkt...' },
  cancelledOrder:{ fr: 'Cette commande a été annulée ou remboursée.', en: 'This order was cancelled or refunded.', sv: 'Ordern har avbrutits eller återbetalats.' },
  restock:       { fr: 'Voulez-vous remettre les articles en stock ?', en: 'Do you want to put the items back in stock?', sv: 'Vill du lägga tillbaka artiklarna i lagret?' },
  msgLinkCopied: { fr: 'Lien copié', en: 'Link copied', sv: 'Länk kopierad' },
  msgAddLine:    { fr: '⚠️ Ajoutez au moins un article', en: '⚠️ Add at least one item', sv: '⚠️ Lägg till minst en artikel' },
  msgOrderCreated:{ fr: '✅ Commande créée', en: '✅ Order created', sv: '✅ Order skapad' },
  msgMarkedTest: { fr: '✅ Commande marquée comme test — compta et facture nettoyées', en: '✅ Order marked as test — accounting and invoice cleaned up', sv: '✅ Ordern markerad som test — bokföring och faktura rensade' },
  msgCostsSaved: { fr: '✅ Coûts enregistrés', en: '✅ Costs saved', sv: '✅ Kostnader sparade' },
  msgRefunded:   { fr: '✅ Remboursement effectué — client notifié par email', en: '✅ Refund issued — customer notified by email', sv: '✅ Återbetalning gjord — kunden har meddelats via e-post' },
  msgLabelMR:    { fr: '✅ Étiquette Mondial Relay créée !', en: '✅ Mondial Relay label created!', sv: '✅ Mondial Relay-etikett skapad!' },
  msgRefundPos:  { fr: '❌ Le montant à rembourser doit être positif', en: '❌ The refund amount must be positive', sv: '❌ Återbetalningsbeloppet måste vara positivt' },
  msgMaxRefund:  { fr: 'Maximum remboursable', en: 'Maximum refundable', sv: 'Högsta återbetalning' },
  msgRefundedOk: { fr: 'remboursés', en: 'refunded', sv: 'återbetalda' },
  msgNotified:   { fr: 'client notifié', en: 'customer notified', sv: 'kunden meddelad' },
  langueClient:  { fr: 'Langue du client', en: 'Customer language', sv: 'Kundens språk' },
  langueChoisie: { fr: 'Choisie à la main — cliquer à nouveau pour revenir à la déduction', en: 'Set manually — click again to return to automatic', sv: 'Vald manuellt — klicka igen för att återgå till automatiskt' },
  langueDeduite: { fr: 'Déduite du pays de livraison :', en: 'Derived from the delivery country:', sv: 'Härledd från leveranslandet:' },
  msgLangueKo:   { fr: 'Langue non enregistrée', en: 'Language not saved', sv: 'Språket sparades inte' },
  allOrders:     { fr: 'Toutes les commandes', en: 'All orders', sv: 'Alla order' },
  invoice:       { fr: 'Facture', en: 'Invoice', sv: 'Faktura' },
  invoiceEditor: { fr: 'Facture (éditeur)', en: 'Invoice (editor)', sv: 'Faktura (redigerare)' },
  creditNote:    { fr: 'Avoir', en: 'Credit note', sv: 'Kreditnota' },
  markShipped:   { fr: 'Marquer expédiée', en: 'Mark as shipped', sv: 'Markera som skickad' },
  copy:          { fr: 'Copier', en: 'Copy', sv: 'Kopiera' },
  sendByEmail:   { fr: 'Envoyer par email', en: 'Send by email', sv: 'Skicka via e-post' },
  labelPdf:      { fr: 'Étiquette PDF', en: 'PDF label', sv: 'PDF-etikett' },
  // ── Téléphone ──
  newShort:      { fr: 'Nouvelle', en: 'New', sv: 'Ny' },
  prepare:       { fr: 'Préparer', en: 'Pick', sv: 'Plocka' },
  label:         { fr: 'Étiquette', en: 'Label', sv: 'Etikett' },
  more:          { fr: 'Plus d’actions', en: 'More actions', sv: 'Fler åtgärder' },
  close:         { fr: 'Fermer', en: 'Close', sv: 'Stäng' },
  markDelivered: { fr: 'Marquer livrée', en: 'Mark as delivered', sv: 'Markera som levererad' },
  confirmShip:   { fr: 'Confirmer ?', en: 'Confirm?', sv: 'Bekräfta?' },
  confirmDeliv:  { fr: 'Confirmer ?', en: 'Confirm?', sv: 'Bekräfta?' },
  modeRelay:     { fr: 'Point relais', en: 'Pickup point', sv: 'Ombud' },
  modeHome:      { fr: 'Livraison', en: 'Delivery', sv: 'Leverans' },
  callClient:    { fr: 'Appeler', en: 'Call', sv: 'Ring' },
  mailClient:    { fr: 'Écrire', en: 'Email', sv: 'Mejla' },
  documentsA4:   { fr: 'Documents A4', en: 'A4 documents', sv: 'A4-dokument' },
  notesTitle:    { fr: 'Note du client', en: 'Customer note', sv: 'Kundens kommentar' },
  tests:         { fr: 'Tests', en: 'Tests', sv: 'Tester' },
  abandoned:     { fr: 'Abandonnés', en: 'Abandoned', sv: 'Övergivna' },
};

/* Les formats suivent la langue choisie : une interface anglaise qui
   affiche « 1 234,50 € » le 16/08/2026 n'est pas traduite. */
const fmtL = (n: number, lang: AdminLang) =>
  (n || 0).toLocaleString(LOCALES[lang], { minimumFractionDigits: 2 }) + ' €';
const fmtDateL = (d: string, lang: AdminLang) =>
  new Date(d).toLocaleDateString(LOCALES[lang], { day: '2-digit', month: '2-digit', year: 'numeric' });
// shipping_address peut être string ou objet JSONB selon la source
const toAddrStr = (v: any): string => !v ? '' : typeof v === 'string' ? v : [v.line1, v.line2, v.postal_code && v.city ? `${v.postal_code} ${v.city}` : (v.postal_code || v.city), v.country].filter(Boolean).join(', ');

/* « À traiter » = tout ce qui reste à expédier : la file de préparation,
   le badge du menu et la réservation de stock (STATUTS_DUS) comptent ces
   quatre statuts. La puce ne comptait que « paid » : 12 à traiter ici,
   15 au menu, 16 dans la file. */
const A_TRAITER = ['paid', 'confirmed', 'preparing', 'partial'];
/** Une commande correspond-elle à la puce de filtre `k` ? */
const correspond = (o: { status: string }, k: string) =>
  !k || (k === 'todo' ? A_TRAITER.includes(o.status) : o.status === k);

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', paid: '#10B981', confirmed: '#3B82F6',
  preparing: '#0EA5E9', partial: '#D97706',
  shipped: '#8B5CF6', delivered: '#10B981', cancelled: '#EF4444', refunded: '#6B7280',
  abandoned: '#B0AEA8',
};

export default function CommandesPage() {
  const [lang, setLang] = useState<AdminLang>('fr');
  // Les formateurs suivent la langue courante sans changer les appels.
  const fmt = (n: number) => fmtL(n, lang);
  const fmtDate = (d: string) => fmtDateL(d, lang);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [toast, setToast] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundConfirm, setRefundConfirm] = useState(false);
  const [showPartialPanel, setShowPartialPanel] = useState(false);
  const [partialItems, setPartialItems] = useState<Record<number, number>>({});   // index ligne → qté créditée
  const [partialShipping, setPartialShipping] = useState('');
  const [partialOverride, setPartialOverride] = useState('');                     // montant forcé (sinon calculé)
  const [partialReason, setPartialReason] = useState('');
  const [partialModifyOrder, setPartialModifyOrder] = useState(true);
  const [partialRestock, setPartialRestock] = useState(true);
  const [partialNotify, setPartialNotify] = useState(true);
  const [partialSwitchDelivery, setPartialSwitchDelivery] = useState(false);
  const [partialConfirm, setPartialConfirm] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockOrderId, setRestockOrderId] = useState<string | null>(null);
  const [markingTest, setMarkingTest] = useState(false);
  const [testConfirm, setTestConfirm] = useState(false);
  const [togglingStats, setTogglingStats] = useState(false);
  const [showTestOrders, setShowTestOrders] = useState(false);
  const [showAbandoned, setShowAbandoned] = useState(false);
  const [avoirId, setAvoirId] = useState<string | null>(null);
  const [sendingPaymentLink, setSendingPaymentLink] = useState(false);
  const [restocking, setRestocking] = useState(false);
  const [mrLivRel, setMrLivRel] = useState('');
  const [mrColRel, setMrColRel] = useState('');
  const [mrWeight, setMrWeight] = useState('500');
  const [mrLoading, setMrLoading] = useState(false);
  const [mrResult, setMrResult] = useState<{ tracking: string; labelUrl: string } | null>(null);
  const [lsRetrying, setLsRetrying] = useState(false);
  const [lsWeight, setLsWeight] = useState('');
  // Saisie manuelle d'une étiquette déjà payée chez UGO (récupérée sur upelgo.com).
  const [lblUrlInput, setLblUrlInput] = useState('');
  const [lsSavingManual, setLsSavingManual] = useState(false);
  const [transportInput, setTransportInput] = useState('');
  const [packagingInput, setPackagingInput] = useState('');
  const [savingCosts, setSavingCosts] = useState(false);
  const [costMap, setCostMap] = useState<Record<string, number>>({});
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [productList, setProductList] = useState<Product[]>([]);
  const [newOrder, setNewOrder] = useState({ customer_name: '', customer_email: '', customer_address: '', notes: '' });
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelections, setPickerSelections] = useState<Record<string, { qty: number; variantLabel?: string; price: number }>>({});
  const [newOrderDelivery, setNewOrderDelivery] = useState<'pickup' | 'mondial_relay' | 'delivery'>('pickup');
  const [newOrderPromoCode, setNewOrderPromoCode] = useState('');
  const [newOrderPromoData, setNewOrderPromoData] = useState<any>(null);
  const [newOrderPromoMsg, setNewOrderPromoMsg] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);
  // Config boutique : seuil de franco + opération « livraison offerte » en cours
  const [wlConfig, setWlConfig] = useState<any>(null);
  // Master-detail : sous 900 px la liste et le detail s'empilent (handoff §4)
  const [mobile, setMobile] = useState(false);
  const [mobDetail, setMobDetail] = useState(false);
  /* Téléphone : menu « ⋯ » des actions secondaires, et confirmation en
     deux temps des gestes de la barre du bas (le pouce y passe sans
     viser : un statut client ne doit pas partir sur un frôlement). */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [armed, setArmed] = useState<'' | 'shipped' | 'delivered'>('');
  const listScroll = useRef(0);
  const moreRef = useRef<HTMLButtonElement>(null);

  const L = lang;
  const t = (key: keyof typeof T) => T[key][L] || T[key].fr;
  const tc = (key: keyof typeof T_COMMON) => T_COMMON[key][L] || T_COMMON[key].fr;
  const ts = (status: string) => T_ORDER_STATUS[status as keyof typeof T_ORDER_STATUS]?.[L] || status;

  useEffect(() => {
    setLang(getAdminLang());
    return subscribeAdminLang(setLang);
  }, []);

  useEffect(() => {
    const r = () => setMobile(window.innerWidth < 900);
    r(); window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  /* Téléphone : le détail est une « page » à part entière. Le geste
     retour d'Android / iOS doit ramener à la liste, pas quitter l'écran
     des commandes : on pose une entrée d'historique à l'ouverture (Next
     recopie son propre état dedans, l'URL ne change pas). */
  useEffect(() => {
    const onPop = () => { if (!(window.history.state as any)?.ocmd) { setMobDetail(false); setSheetOpen(false); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const mainEl = () => document.querySelector('.sc-main') as HTMLElement | null;
  useEffect(() => {
    if (!mobile) return;
    // Retour à la liste : on retrouve la commande d'où l'on venait.
    const el = mainEl();
    if (el) el.scrollTop = mobDetail ? 0 : listScroll.current;
    setArmed('');
  }, [mobDetail, mobile]);
  useEffect(() => { setArmed(''); setSheetOpen(false); }, [selected?.id]);
  useEffect(() => {
    if (!armed) return;
    const tm = setTimeout(() => setArmed(''), 4000);
    return () => clearTimeout(tm);
  }, [armed]);
  function closeMobDetail() {
    if ((window.history.state as any)?.ocmd) window.history.back();
    else setMobDetail(false);
  }
  function openOrder(o: Order) {
    setSelected(o);
    setTrackingInput(o.tracking_number || '');
    setTransportInput(o.transport_cost_real ? String(o.transport_cost_real) : '');
    setPackagingInput(o.packaging_cost ? String(o.packaging_cost) : '');
    setTestConfirm(false); setRefundConfirm(false);
    if (mobile) {
      listScroll.current = mainEl()?.scrollTop || 0;
      const st = (window.history.state as any) || {};
      if (!st.ocmd) window.history.pushState({ ocmd: o.id }, '');
      else if (st.ocmd !== o.id) window.history.replaceState({ ...st, ocmd: o.id }, '');
      setMobDetail(true);
    }
  }
  /* Retour (geste ou bouton) depuis un document, la préparation… : on
     rouvre la commande qu'on avait sous les yeux plutôt que la liste. */
  const reopened = useRef(false);
  useEffect(() => {
    if (reopened.current || !mobile || !orders.length) return;
    reopened.current = true;
    const id = (window.history.state as any)?.ocmd;
    const o = id && orders.find(x => x.id === id);
    if (o) openOrder(o);
  }, [orders, mobile]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Le filtre de statut se fait ici, pas en base : les compteurs des
     puces se calculent sur la liste entière. Filtrée côté serveur, la
     liste ne contenait que le statut choisi et toutes les autres puces
     tombaient à 0. La recherche, elle, reste côté serveur. */
  useEffect(() => { load(); }, [search]);
  useEffect(() => { loadCosts(); }, []);
  /* Recherche de la barre du haut (« SD-0240 », « #240 », un email) :
     au chargement par ?q=, puis par l'évènement quand l'écran est déjà
     ouvert — Next ne remonte pas la page quand seule la query change. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setSearch(q);
    const onSearch = (e: Event) => {
      setSearch(String((e as CustomEvent).detail || ''));
      setFilter('');
      // Téléphone : sortir du détail, sinon les résultats restent cachés.
      setMobDetail(false); setSheetOpen(false);
    };
    window.addEventListener(ADMIN_SEARCH_EVENT, onSearch);
    return () => window.removeEventListener(ADMIN_SEARCH_EVENT, onSearch);
  }, []);
  useEffect(() => {
    adminFetch('/api/white-label')
      .then(r => r.json())
      .then(d => setWlConfig(d.config || null))
      .catch(() => setWlConfig(null));
  }, []);
  // Réinitialise le panneau de remboursement partiel à chaque commande ouverte
  useEffect(() => {
    setShowPartialPanel(false);
    setPartialItems({});
    setPartialOverride('');
    setPartialReason('');
    setPartialModifyOrder(true);
    setPartialRestock(true);
    setPartialNotify(true);
    setPartialConfirm(false);
    // Click & Collect basculé en expédition → on pré-remplit le port standard
    const isPickupWithoutShipping = selected?.delivery_mode === 'pickup' && !(selected?.shipping > 0);
    setPartialShipping(isPickupWithoutShipping ? '4.90' : '');
    setPartialSwitchDelivery(isPickupWithoutShipping);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || (selected.status !== 'refunded' && !(selected.refunded_amount! > 0))) { setAvoirId(null); return; }
    const token = localStorage.getItem('sd_admin_token') || '';
    adminFetch(`/api/invoices?order_id=${selected.id}&status=avoir`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setAvoirId(d.invoices?.[0]?.id || null))
      .catch(() => setAvoirId(null));
  }, [selected?.id, selected?.status, selected?.refunded_amount]);

  useEffect(() => {
    if (!selected) { setMrResult(null); return; }
    setMrLivRel(selected.relay_point_id || '');
    setMrResult(selected.mondial_relay_tracking
      ? { tracking: selected.mondial_relay_tracking, labelUrl: selected.mondial_relay_label_url || '' }
      : null);
    const token = localStorage.getItem('sd_admin_token') || '';
    adminFetch('/api/mondial-relay/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.mr_col_rel) setMrColRel(d.mr_col_rel); })
      .catch(() => {});
  }, [selected?.id]);

  /* Un seul minuteur : celui d'un message précédent effaçait le suivant
     avant qu'on l'ait lu (statut puis remise en stock, par exemple). */
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  };

  async function loadCosts() {
    const token = localStorage.getItem('sd_admin_token') || '';
    const res = await adminFetch('/api/products?limit=1000', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const costs: Record<string, number> = {};
    const images: Record<string, string> = {};
    for (const p of (data.products || [])) {
      if (p.cost_price > 0) costs[p.id] = p.cost_price;
      if (p.image_url) images[p.id] = p.image_url;
    }
    setCostMap(costs);
    setImageMap(images);
    setProductList(data.products || []);
  }

  /* Une frappe = une requête : sans numéro d'ordre, la réponse à « a »
     pouvait arriver après celle à « anna » et remplacer la liste. */
  const loadSeq = useRef(0);
  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    try {
      const res = await adminFetch('/api/orders?' + params.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== loadSeq.current) return;
      // Une erreur affichait « Aucune commande » : on garde la liste et on le dit.
      if (!res.ok) { showToast('❌ ' + (data.error || 'Liste des commandes indisponible')); return; }
      setOrders(data.orders || []);
    } catch (e: any) {
      if (seq === loadSeq.current) showToast('❌ ' + (e?.message || 'Liste des commandes indisponible'));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  /* Poser NULL rend la commande a la deduction automatique : c'est ce
     qui permet de revenir en arriere apres une correction. */
  async function reglerLangue(id: string, lang: LangueClient | null) {
    setOrders(os => os.map(o => o.id === id ? { ...o, lang: lang || undefined } : o));
    const res = await adminFetch(`/api/orders/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang }),
    });
    if (!res.ok) { showToast(t('msgLangueKo')); load(); }
  }

  async function updateStatus(id: string, status: string) {
    const token = localStorage.getItem('sd_admin_token') || '';
    const res = await adminFetch(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
    /* La reponse n'etait pas regardee : un statut refuse par la base
       affichait quand meme « ✅ » et la liste se rechargeait inchangee.
       Les statuts « Confirmee » et « En preparation » etaient dans ce cas
       jusqu'a la migration 040. */
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('❌ ' + (d.error || tc('status')));
      return;
    }
    /* Passage en expédiée/livrée : le serveur sort ce qui restait dû du
       stock. S'il n'a pas pu tout sortir, il faut le savoir. */
    showToast(d.echecs_stock?.length
      ? '⚠️ ' + tc('status') + ' — stock non décrémenté pour ' + d.echecs_stock.length + ' article(s), à corriger dans Stock'
      : '✅ ' + tc('status'));
    load();
    if (selected?.id === id) setSelected(o => o ? { ...o, status } : null);
    if (status === 'cancelled' || status === 'refunded') {
      setRestockOrderId(id);
      setShowRestockModal(true);
    }
  }

  async function doRestock(orderId: string) {
    if (restocking) return;   // double toucher : un seul appel
    setRestocking(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch(`/api/orders/${orderId}/restock`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      // Une erreur s'affichait « Aucun produit suivi » : on dit l'erreur.
      if (!res.ok) { showToast('❌ ' + (data.error || 'Remise en stock impossible')); return; }
      showToast(data.restocked > 0 ? `✅ Stock réincrémenté (${data.restocked} produit${data.restocked > 1 ? 's' : ''})` : '⚠️ Rien à réincrémenter (jamais sorti du stock, ou déjà rentré)');
      setShowRestockModal(false);
      setRestockOrderId(null);
    } catch (e: any) {
      showToast('❌ ' + (e?.message || 'Remise en stock impossible'));
    } finally {
      setRestocking(false);
    }
  }

  /* Coûts et suivi : la réponse n'était pas lue, « ✅ enregistré »
     s'affichait même quand le serveur refusait. */
  async function saveCosts() {
    if (!selected) return;
    const token = localStorage.getItem('sd_admin_token') || '';
    setSavingCosts(true);
    const transport_cost_real = parseFloat(transportInput) || 0;
    const packaging_cost = parseFloat(packagingInput) || 0;
    try {
      const res = await adminFetch(`/api/orders/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transport_cost_real, packaging_cost }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast('❌ ' + (d.error || t('realCosts'))); return; }
      setSelected(o => o ? { ...o, transport_cost_real, packaging_cost } : null);
      load();
      showToast(t('msgCostsSaved'));
    } catch (e: any) {
      showToast('❌ ' + (e?.message || t('realCosts')));
    } finally {
      setSavingCosts(false);
    }
  }

  async function saveTracking() {
    if (!selected) return;
    const token = localStorage.getItem('sd_admin_token') || '';
    setSavingTracking(true);
    try {
      const res = await adminFetch(`/api/orders/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tracking_number: trackingInput || null }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast('❌ ' + (d.error || t('tracking'))); return; }
      setSelected(o => o ? { ...o, tracking_number: trackingInput || undefined } : null);
      load();
      showToast('✅ ' + t('tracking'));
    } catch (e: any) {
      showToast('❌ ' + (e?.message || t('tracking')));
    } finally {
      setSavingTracking(false);
    }
  }

  function resetNewOrderModal() {
    setNewOrder({ customer_name: '', customer_email: '', customer_address: '', notes: '' });
    setNewOrderDelivery('pickup');
    setNewOrderPromoCode('');
    setNewOrderPromoData(null);
    setNewOrderPromoMsg('');
    setPickerSelections({});
    setPickerSearch('');
    setShowNewModal(false);
  }

  async function applyPromoInNewOrder() {
    const code = newOrderPromoCode.trim().toUpperCase();
    if (!code) return;
    setApplyingPromo(true);
    try {
      const token = localStorage.getItem('sd_admin_token') || '';
      const res = await adminFetch('/api/marketing?tab=promo', { headers: { Authorization: `Bearer ${token}` } });
      const { codes } = await res.json();
      const found = (codes || []).find((c: any) => c.code === code);
      if (!found || !found.is_active) { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code invalide ou inactif'); return; }
      /* Offre cadeau : pas une remise (elle s'affichait « Livraison
         offerte » sans rien offrir). Code fidélité / ami : son taux et ses
         règles (articles hors promo, email du propriétaire) ne se calculent
         qu'au checkout du site. */
      if (found.type === 'gift' || found.kind) {
        setNewOrderPromoData(null);
        setNewOrderPromoMsg(found.kind ? '❌ Code personnel (fidélité / ami) : utilisable sur le site seulement' : '❌ Offre cadeau, pas un code de remise');
        return;
      }
      // Dates au jour de Paris, la même règle qu'au checkout (@/lib/promo).
      const periode = dansLaPeriode(found);
      if (periode === 'not_yet') { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code pas encore valide'); return; }
      if (periode === 'expired') { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code expiré'); return; }
      if (found.max_uses && (found.used_count || 0) >= found.max_uses) { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code plus disponible'); return; }
      setNewOrderPromoData(found);
      setNewOrderPromoMsg(found.type === 'percent' ? `✅ −${found.value}%` : found.type === 'fixed' ? `✅ −${found.value} €` : '✅ Livraison offerte');
    } finally {
      setApplyingPromo(false);
    }
  }

  /* Remise d'une commande manuelle : même règle que le checkout
     (@/lib/promo — minimum de commande, dates, plafond, arrondi au
     centime). Le calcul local ignorait le minimum : un code « dès 30 € »
     s'appliquait à une commande de 12 €. */
  function remiseManuelle(subtotal: number) {
    if (!newOrderPromoData) return { ok: true, discount: 0, freeShipping: false, minOrder: 0 };
    const v = evaluatePromo(newOrderPromoData, { subtotal });
    return v.ok
      ? { ok: true, discount: v.discount, freeShipping: v.freeShipping, minOrder: 0 }
      : { ok: false, discount: 0, freeShipping: false, minOrder: v.minOrder };
  }

  async function createOrder() {
    if (!newOrder.customer_name || !newOrder.customer_email) { showToast('⚠️ ' + t('custName')); return; }
    const lines = Object.entries(pickerSelections).filter(([, s]) => s.qty > 0).map(([pid, s]) => {
      const p = productList.find(x => x.id === pid);
      const variantObj = s.variantLabel ? p?.product_variants?.find(v => v.label === s.variantLabel) : null;
      const price = variantObj ? variantObj.price : (p?.price || s.price);
      return { desc: (p?.name_fr || pid) + (s.variantLabel ? ` — ${s.variantLabel}` : ''), qty: s.qty, price, product_id: pid, image_url: p?.image_url || null };
    });
    if (lines.length === 0) { showToast(t('msgAddLine')); return; }
    const subtotal = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
    const shipRules = resolveShipping(wlConfig, { isInternational: false });
    const baseShipping = subtotal >= shipRules.threshold ? 0 : shipRules.cost;
    const remise = remiseManuelle(subtotal);
    if (!remise.ok) {
      showToast(`❌ ${newOrderPromoData?.code} : ${remise.minOrder > 0 && subtotal < remise.minOrder ? `minimum ${fmt(remise.minOrder)} non atteint` : 'code plus valable'}`);
      return;
    }
    const isFreeShip = remise.freeShipping;
    const effectiveShipping = (newOrderDelivery === 'pickup' || isFreeShip) ? 0 : baseShipping;
    const discount = remise.discount;
    const total = Math.round((Math.max(0, subtotal - discount) + effectiveShipping) * 100) / 100;
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customer_name: newOrder.customer_name, customer_email: newOrder.customer_email,
          shipping_address: newOrder.customer_address,
          notes: newOrder.notes || null, lines, subtotal, shipping: effectiveShipping, total,
          delivery_mode: newOrderDelivery,
          ...(newOrderPromoData ? { promo_code: newOrderPromoData.code, discount } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`❌ Erreur : ${err.error || err.message || res.status}`);
        return;
      }
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
      return;
    }
    resetNewOrderModal();
    showToast(t('msgOrderCreated'));
    load();
  }

  async function handleMarkTest() {
    if (!selected) return;
    if (!testConfirm) { setTestConfirm(true); return; }
    setMarkingTest(true);
    setTestConfirm(false);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch(`/api/orders/${selected.id}/mark-test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showToast(t('msgMarkedTest'));
        setShowModal(false);
        setSheetOpen(false);
        load();
      } else {
        const d = await res.json();
        showToast(`❌ ${d.error || 'Erreur'}`);
      }
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
    } finally {
      setMarkingTest(false);
    }
  }

  async function toggleExcludeStats() {
    if (!selected) return;
    setTogglingStats(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch(`/api/orders/${selected.id}/exclude-stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ exclude: !selected.exclude_from_stats }),
      });
      if (res.ok) {
        const newVal = !selected.exclude_from_stats;
        setSelected(o => o ? { ...o, exclude_from_stats: newVal } : null);
        showToast(newVal ? '📊 Commande exclue des statistiques' : '📊 Commande réintégrée dans les statistiques');
        load();
      } else {
        const d = await res.json();
        showToast(`❌ ${d.error || 'Erreur'}`);
      }
    } finally {
      setTogglingStats(false);
    }
  }

  async function handleRefund() {
    if (!selected) return;
    if (!refundConfirm) { setRefundConfirm(true); return; }
    setRefunding(true);
    setRefundConfirm(false);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch(`/api/orders/${selected.id}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(t('msgRefunded'));
        setSelected(o => o ? { ...o, status: 'refunded' } : null);
        load();
        setShowModal(false);
        setSheetOpen(false);
      } else {
        showToast(`❌ ${data.error || 'Erreur remboursement'}`);
      }
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
    } finally {
      setRefunding(false);
    }
  }

  // ── Remboursement partiel ─────────────────────────────────────────
  const orderLinesOf = (o: Order): any[] => {
    try { return typeof o.lines === 'string' ? JSON.parse(o.lines as any) : (o.lines || []); }
    catch { return []; }
  };

  function partialTotals(o: Order | null) {
    if (!o) return { credit: 0, shipping: 0, net: 0, amount: 0, remaining: 0 };
    const lines = orderLinesOf(o);
    const credit = Object.entries(partialItems).reduce((s, [idx, qty]) => {
      const l = lines[Number(idx)];
      return s + (l ? (l.price || 0) * (qty || 0) : 0);
    }, 0);
    const shipping = Math.max(0, parseFloat(partialShipping) || 0);
    const net = Math.round((credit - shipping) * 100) / 100;
    const amount = partialOverride !== '' ? Math.round((parseFloat(partialOverride) || 0) * 100) / 100 : net;
    // Reste remboursable : ne pas re-déduire ce qui est déjà répercuté dans `total`
    const remaining = Math.round(((o.total || 0) - pendingRefundAdj(o).amount) * 100) / 100;
    return { credit: Math.round(credit * 100) / 100, shipping, net, amount, remaining };
  }

  async function handlePartialRefund() {
    if (!selected) return;
    const { shipping, amount, remaining } = partialTotals(selected);
    if (!(amount > 0)) { showToast(t('msgRefundPos')); return; }
    if (amount > remaining + 0.005) { showToast(`❌ ${t('msgMaxRefund')} : ${fmt(remaining)}`); return; }
    if (!partialConfirm) { setPartialConfirm(true); return; }

    setRefunding(true);
    setPartialConfirm(false);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch(`/api/orders/${selected.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount,
          items: Object.entries(partialItems).map(([index, qty]) => ({ index: Number(index), qty })),
          shipping_charge: shipping,
          reason: partialReason || undefined,
          restock: partialRestock,
          notify: partialNotify,
          modify_order: partialModifyOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`❌ ${data.error || 'Erreur remboursement'}`); return; }

      // Bascule Click & Collect → expédition si demandé
      if (partialSwitchDelivery && selected.delivery_mode === 'pickup') {
        await adminFetch(`/api/orders/${selected.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ delivery_mode: 'delivery' }),
        }).catch(() => {});
      }

      showToast(
        data.warning
          ? `✅ ${fmt(data.amount)} ${t('msgRefundedOk')} — ⚠️ ${data.warning}`
          : `✅ ${fmt(data.amount)} ${t('msgRefundedOk')}${partialNotify ? ' — ' + t('msgNotified') : ''}`
      );
      // La commande a pu être réécrite (lignes, port, total) → on relit la version à jour
      try {
        const fresh = await adminFetch(`/api/orders/${selected.id}`).then(r => r.json());
        if (fresh?.order) setSelected(fresh.order);
      } catch {
        setSelected(o => o ? { ...o, status: data.status || o.status, refunded_amount: data.refunded_amount } : null);
      }
      setShowPartialPanel(false);
      setPartialItems({});
      setPartialOverride('');
      load();
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
    } finally {
      setRefunding(false);
    }
  }

  async function sendPaymentLink(byEmail: boolean) {
    if (!selected) return;
    setSendingPaymentLink(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch(`/api/orders/${selected.id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ send_email: byEmail }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`❌ ${data.error || 'Erreur'}`); return; }
      setSelected(o => o ? { ...o, payment_link_url: data.url, payment_link_sent_at: new Date().toISOString() } : null);
      try { await navigator.clipboard.writeText(data.url); } catch {}
      showToast(byEmail ? '✅ Lien envoyé par email + copié !' : '✅ Lien copié dans le presse-papier !');
      load();
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
    } finally {
      setSendingPaymentLink(false);
    }
  }

  /* « Créer compte client » a été retiré : les comptes clients n'existent
     plus sur le site (le client est reconnu par son email de paiement) et
     /api/customer/create-account répond 410 — le bouton ne pouvait
     qu'afficher une erreur. */

  async function createMrLabel() {
    if (!selected) return;
    setMrLoading(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch('/api/mondial-relay/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          order_id: selected.id,
          weight_grams: parseInt(mrWeight) || 500,
          col_rel: mrColRel,
          liv_rel: mrLivRel,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast('❌ ' + (data.error || 'Erreur MR')); return; }
      setMrResult({ tracking: data.tracking, labelUrl: data.labelUrl });
      setSelected(s => s ? { ...s, mondial_relay_tracking: data.tracking, mondial_relay_label_url: data.labelUrl, tracking_number: data.tracking, status: 'shipped' } : s);
      showToast(t('msgLabelMR'));
      load();
    } finally {
      setMrLoading(false);
    }
  }

  // Relance l'étiquette UGO quand le webhook a échoué (logspher_error).
  async function retryLogspherLabel() {
    if (!selected) return;
    setLsRetrying(true);
    try {
      const res = await adminFetch(`/api/orders/${selected.id}/logspher-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight_grams: parseInt(lsWeight) || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.logspher_error) setSelected(s => s ? { ...s, logspher_error: data.logspher_error } : s);
        showToast('❌ ' + (data.error || 'Erreur LogSpher'));
        return;
      }
      setSelected(s => s ? { ...s, ...data, logspher_error: undefined } : s);
      if (data.tracking_number) setTrackingInput(data.tracking_number);
      showToast(data.recovered
        ? `✅ Étiquette récupérée chez UGO${data.emailed ? ' · suivi envoyé au client' : ''}`
        : '✅ Étiquette créée');
      load();
    } finally {
      setLsRetrying(false);
    }
  }

  /* Enregistre une étiquette UGO déjà payée mais non capturée (cas 402 payé
     via le lien puis 412 « already shipped ») : on colle l'URL du PDF et le
     suivi récupérés sur upelgo.com. Le suivi enregistré permet aussi au cron
     livraisons de prévenir le client à l'arrivée au point relais. */
  async function saveLogspherManual() {
    if (!selected) return;
    const url = lblUrlInput.trim();
    const trk = trackingInput.trim();
    if (!url && !trk) { showToast('Colle au moins l’URL du PDF ou le numéro de suivi'); return; }
    setLsSavingManual(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    const patch: any = { logspher_error: null };
    if (url) patch.logspher_label_url = url;
    if (trk) { patch.tracking_number = trk; patch.logspher_tracking = trk; }
    if (!selected.logspher_carrier_name) patch.logspher_carrier_name = 'UGO';
    try {
      const res = await adminFetch(`/api/orders/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast('❌ ' + (d.error || 'Erreur')); return; }
      setSelected(s => s ? {
        ...s,
        logspher_label_url: url || s.logspher_label_url,
        logspher_tracking: trk || s.logspher_tracking,
        tracking_number: trk || s.tracking_number,
        logspher_carrier_name: s.logspher_carrier_name || 'UGO',
        logspher_error: undefined,
      } : s);
      setLblUrlInput('');
      showToast('✅ Étiquette enregistrée');
      load();
    } finally {
      setLsSavingManual(false);
    }
  }

  // Annule l'étiquette UGO (passage en Click & Collect, commande annulée).
  async function cancelLogspherLabel() {
    if (!selected) return;
    if (!confirm(`Annuler l’étiquette UGO de ${selected.order_number} ? À faire avant le dépôt du colis.`)) return;
    setLsRetrying(true);
    try {
      const res = await adminFetch(`/api/orders/${selected.id}/logspher-label`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showToast('❌ ' + (data.error || 'Erreur LogSpher')); return; }
      setSelected(s => s ? {
        ...s,
        logspher_tracking: undefined, logspher_label_url: undefined, logspher_carrier_name: undefined, logspher_error: undefined,
        ...(data.tracking_number === null ? { tracking_number: undefined } : {}),
      } : s);
      showToast('✅ Étiquette annulée');
      load();
    } finally {
      setLsRetrying(false);
    }
  }

  function printDeliveryNote(order: Order) {
    const lines = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);
    const addr = toAddrStr(order.shipping_address || order.customer_address).replace(/,\s*/g, '\n');
    const dateStr = new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const title = L === 'en' ? 'DELIVERY NOTE' : L === 'sv' ? 'FÖLJESEDEL' : 'BON DE LIVRAISON';
    const linesRows = lines.map((l: any) =>
      `<tr><td style="padding:10px 14px;border-bottom:1px solid #eee">${(l.desc || l.name || '').replace(/</g,'&lt;')}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:center">${l.qty || 1}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:center">☐</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1C2028;margin:0;padding:40px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:20px;border-bottom:2px solid #1C2028;}
  .title{font-size:28px;font-weight:700;letter-spacing:2px;color:#1C2028;}
  .order-ref{font-size:13px;color:#6A7280;margin-top:4px;}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:32px;}
  .info-box label{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6A7280;display:block;margin-bottom:6px;}
  .info-box p{font-size:14px;line-height:1.6;white-space:pre-line;margin:0;}
  table{width:100%;border-collapse:collapse;margin-bottom:32px;}
  th{background:#1C2028;color:#fff;padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;}
  .footer{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:32px;}
  .sig-box{border-top:2px solid #1C2028;padding-top:10px;font-size:11px;color:#6A7280;text-transform:uppercase;letter-spacing:1px;}
  @media print{body{padding:20px;}}
</style></head><body>
<div class="header">
  <div>
    <div class="title">${title}</div>
    <div class="order-ref">${order.order_number} · ${dateStr}</div>
  </div>
  <div style="text-align:right;font-size:13px;color:#6A7280;">
    ${order.tracking_number ? `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${L === 'sv' ? 'Spårning' : L === 'en' ? 'Tracking' : 'Suivi'}</div><div style="font-size:16px;font-weight:700;font-family:monospace;color:#1C2028">${order.tracking_number}</div>` : ''}
  </div>
</div>
<div class="info-grid">
  <div class="info-box">
    <label>${L === 'sv' ? 'Kund' : L === 'en' ? 'Customer' : 'Client'}</label>
    <p><strong>${(order.customer_name||'').replace(/</g,'&lt;')}</strong><br>${(order.customer_email||'').replace(/</g,'&lt;')}</p>
  </div>
  <div class="info-box">
    <label>${L === 'sv' ? 'Leveransadress' : L === 'en' ? 'Delivery address' : 'Adresse de livraison'}</label>
    <p>${addr.replace(/</g,'&lt;') || '—'}</p>
  </div>
</div>
<table>
  <thead><tr>
    <th>${L === 'sv' ? 'Produkt' : L === 'en' ? 'Product' : 'Produit'}</th>
    <th style="width:80px;text-align:center">${L === 'sv' ? 'Antal' : L === 'en' ? 'Qty' : 'Qté'}</th>
    <th style="width:80px;text-align:center">${L === 'sv' ? 'OK' : 'OK'}</th>
  </tr></thead>
  <tbody>${linesRows}</tbody>
</table>
<div class="footer">
  <div class="sig-box">${L === 'sv' ? 'Mottagarens underskrift' : L === 'en' ? 'Recipient signature' : 'Signature du destinataire'}</div>
  <div class="sig-box">${L === 'sv' ? 'Expeditörens underskrift' : L === 'en' ? 'Sender signature' : "Signature de l'expéditeur"}</div>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

  /**
   * Remboursements NON répercutés dans les montants de la commande.
   * Un remboursement avec `order_modified` a déjà retiré ses lignes et ajusté
   * total/port : le déduire une seconde fois fausserait marge et stats.
   */
  function pendingRefundAdj(o: Order) {
    const hasHistory = Array.isArray(o.refunds) && o.refunds.length > 0;
    const pending = hasHistory ? o.refunds!.filter(r => !r.order_modified) : [];
    return {
      // Sans historique (remboursement antérieur à la migration 028) → considéré non répercuté
      amount:       r2(hasHistory ? pending.reduce((s, r) => s + (r.amount || 0), 0) : (o.refunded_amount || 0)),
      shippingKept: r2(pending.reduce((s, r) => s + (r.shipping_kept || 0), 0)),
      items:        pending.flatMap(r => r.items || []),
      // Montant réellement encaissé à l'origine (base des frais Stripe)
      originalCharge: r2((o.total || 0) + (hasHistory ? o.refunds!.filter(r => r.order_modified).reduce((s, r) => s + (r.amount || 0), 0) : 0)),
    };
  }

  function calcMargin(order: Order): { margin: number | null; pct: number | null; stripeFee: number; urssaf: number; transportReal: number; packagingCost: number; shippingCollected: number } {
    const empty = { margin: null, pct: null, stripeFee: 0, urssaf: 0, transportReal: 0, packagingCost: 0, shippingCollected: 0 };
    if (['cancelled', 'refunded'].includes(order.status)) return empty;
    const lines = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);
    const hasAny = lines.some((l: any) => l.product_id && costMap[l.product_id] != null);
    const adj = pendingRefundAdj(order);
    // Revenu net = montants de la commande − remboursements pas encore répercutés
    const total = r2((order.total || 0) - adj.amount);
    // Port perçu = port de la commande + port retenu sur un remboursement non répercuté
    const shippingCollected = r2((order.shipping || 0) + adj.shippingKept);
    // Stripe prélève ses frais sur l'encaissement initial et ne les restitue pas sur un partiel
    const stripeFee = order.source !== 'manual' && order.stripe_session_id
      ? r2(adj.originalCharge * 0.015 + 0.25)
      : 0;
    const urssaf = Math.round(total * 0.123 * 100) / 100;
    const transportReal = order.transport_cost_real || 0;
    const packagingCost = order.packaging_cost || 0;
    if (!hasAny && transportReal === 0 && packagingCost === 0) return { ...empty, stripeFee, urssaf, shippingCollected };
    let cost = 0;
    for (const l of lines) {
      const cp = l.product_id ? (costMap[l.product_id] || 0) : 0;
      cost += cp * (l.qty || 1);
    }
    // Articles remboursés + remis en stock : ils ne pèsent plus sur le coût de la commande
    // (si la commande a été réécrite, la ligne a déjà disparu de `lines` — rien à retirer)
    for (const it of adj.items) {
      if (it.restocked && it.product_id) cost -= (costMap[it.product_id] || 0) * (it.qty || 0);
    }
    // Revenu = total (inclut le port payé par le client)
    // transport_cost_real est déduit en coût brut — le port perçu compense via le revenu total
    // Ex: total=25€ (dont 5€ port), transport_réel=4,50€ → net transport = 4,50 - 5,00 = -0,50 (bénéfice)
    const margin = total - stripeFee - urssaf - cost - transportReal - packagingCost;
    const pct = total > 0 ? (margin / total) * 100 : 0;
    return { margin, pct, stripeFee, urssaf, transportReal, packagingCost, shippingCollected };
  }

  /* Le statut se filtre ici (la base renvoie toutes les commandes de la
     recherche) : `scoped` est ce que la puce active laisse voir, et c'est
     sur lui que portent l'en-tête et les totaux, comme avant. */
  const scoped = orders.filter(o => correspond(o, filter));
  const realOrders = scoped.filter(o => !o.is_test);
  const abandonedCount = realOrders.filter(o => o.status === 'abandoned').length;
  const _base = showTestOrders ? scoped : realOrders;
  // Masque les paniers abandonnés par défaut (sauf si on filtre dessus ou toggle activé)
  const visibleOrders = (showAbandoned || filter === 'abandoned')
    ? _base
    : _base.filter(o => o.status !== 'abandoned');
  /* Base des compteurs des puces : la liste SANS filtre de statut. */
  const pourPuces = (showTestOrders ? orders : orders.filter(o => !o.is_test))
    .filter(o => showAbandoned || o.status !== 'abandoned');
  /* Historique du client : toutes ses commandes, pas seulement celles
     de la puce active. */
  const toutesReelles = orders.filter(o => !o.is_test);
  /* Commandes réellement payées (mêmes statuts que STATUTS_PAYES de
     @/lib/fidelite-regles). « Encaissés » additionnait tout ce qui n'était
     pas annulé : paniers non payés et abandonnés compris, et les commandes
     « Hors stats » aussi. */
  const paidStatuses = ['paid', 'confirmed', 'preparing', 'partial', 'shipped', 'delivered'];
  const totalRevenue = realOrders
    .filter(o => paidStatuses.includes(o.status) && !o.exclude_from_stats)
    .reduce((s, o) => s + (o.total || 0) - pendingRefundAdj(o).amount, 0);
  const pendingCount = realOrders.filter(o => o.status === 'pending').length;
  const testCount = scoped.filter(o => o.is_test).length;

  const activeOrders = realOrders.filter(o => paidStatuses.includes(o.status) && !o.exclude_from_stats);
  const marginsWithData = activeOrders.map(o => calcMargin(o)).filter(m => m.margin !== null);
  const totalMargin = marginsWithData.reduce((s, m) => s + m.margin!, 0);
  const avgMarginPct = marginsWithData.length > 0
    ? marginsWithData.reduce((s, m) => s + m.pct!, 0) / marginsWithData.length
    : null;

  /* ═══════════════════════════════════════════════════════════════
     ÉCRAN 4 — COMMANDES (handoff §4)
     Master-detail : liste 300 px + détail, empilés sous 900 px.
     Toute la logique ci-dessus est celle de l'écran précédent, reprise
     telle quelle : remboursement partiel, Mondial Relay, marge,
     lien de paiement, avoirs, commande manuelle.
     ═══════════════════════════════════════════════════════════════ */

  const css = `
    .picker-item { display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid ${TH.borderFaint}; }
    .picker-item:last-child { border-bottom:none; }
    .picker-qty-btn { width:22px; height:22px; border-radius:5px; border:1px solid ${TH.borderField}; background:#F7F4EF; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; line-height:1; }
    .delivery-btn { flex:1; padding:8px 10px; border-radius:7px; border:1px solid ${TH.borderField}; background:#fff; cursor:pointer; font-size:12px; font-weight:500; text-align:center; min-width:80px; }
    .delivery-btn.active { background:${TH.ink}; color:#fff; border-color:${TH.ink}; }
    .o-row { display:flex; justify-content:space-between; gap:10px; padding:6px 0; font-size:12.5px; color:${TH.text2b}; }
    .o-row + .o-row { border-top:1px solid ${TH.borderFaint}; }

    /* Valeurs d'ordinateur reprises des anciens styles en ligne : seules
       les règles « téléphone » plus bas changent quelque chose. */
    .o-head { position:sticky; top:0; z-index:20; background:#fff; margin:-16px -18px 0; padding:14px 18px 10px; border-bottom:1px solid ${TH.border}; }
    .o-md { display:flex; margin:0 -18px; min-height:calc(100vh - 190px); }
    .o-detail { flex:1; min-width:0; padding:14px 18px 90px; overflow-y:auto; }
    .o-item { display:block; width:100%; text-align:left; cursor:pointer; padding:10px 14px; border:none; border-bottom:1px solid ${TH.borderFaint}; }
    .o-item-num { font-size:12.5px; font-weight:600; color:${TH.ink}; }
    .o-item-total { font-size:12.5px; font-weight:600; }
    .o-item-name { font-size:11.5px; color:${TH.text2}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
    .o-item-meta { font-size:10.5px; color:${TH.muted}; margin-top:2px; display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
    .o-item-meta .ms { font-size:14px; }
    .o-cols { display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start; }
    .o-inline { display:flex; gap:8px; }
    .sc-chip.o-chip-xs { height:26px; font-size:11px; padding:0 9px; }
    .o-link { color:inherit; text-decoration:none; }
    .o-picker-thumb { width:44px; height:44px; border-radius:6px; object-fit:cover; flex-shrink:0; background:${TH.borderFaint2}; display:flex; align-items:center; justify-content:center; }
    .o-seg { display:flex; gap:6px; flex-wrap:wrap; }
    .o-modal-flex { display:flex; flex-direction:column; }

    /* ═══ TÉLÉPHONE ═══ */
    @media (max-width: 899px) {
      .o-head { position:static; margin:-12px -12px 0; padding:12px 12px 4px; border-bottom:none; }
      .o-filterbar { position:sticky; top:0; z-index:20; background:#fff; margin:0 -12px; padding:6px 12px 8px; border-bottom:1px solid ${TH.border}; box-shadow:0 6px 12px -10px rgba(21,24,30,.25); }
      .o-search { position:relative; }
      .o-search .ms { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:20px; color:${TH.muted}; pointer-events:none; }
      .o-search .sc-input { padding-left:40px; background:${TH.surfaceAlt}; }
      .o-md { margin:0 -12px; min-height:0; }
      .o-detail { padding:0 12px; overflow:visible; }
      .o-item { padding:13px 14px; }
      .o-item-num { font-size:15px; }
      .o-item-total { font-size:15px; }
      .o-item-name { font-size:14px; }
      .o-item-meta { font-size:12.5px; margin-top:4px; }
      .o-dbar { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:6px; margin:-12px -12px 12px; padding:4px 12px 4px 4px; background:#fff; border-bottom:1px solid ${TH.border}; min-height:52px; }
      .o-dbar .sc-iconbtn { color:${TH.ink}; }
      .o-dbar-title { flex:1; min-width:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:16px; font-weight:700; color:${TH.ink}; }
      .o-cols { flex-direction:column; align-items:stretch; }
      .o-col { display:contents !important; }
      .o-s-client { order:1; } .o-s-notes { order:2; } .o-s-lines { order:3; } .o-s-ship { order:4; }
      .o-s-pay { order:5; } .o-s-track { order:6; } .o-s-refund { order:7; } .o-s-costs { order:8; } .o-s-docs { order:9; }
      .o-s-ship { scroll-margin-top:64px; }
      .o-inline { flex-direction:column; }
      .o-inline > .sc-btn { justify-content:center; }
      .o-in { font-size:16px !important; min-height:44px; }
      .o-chk { width:22px; height:22px; flex-shrink:0; }
      .o-chk-row { min-height:44px; }
      .sc-chip.o-chip-xs { height:40px; font-size:13.5px; padding:0 14px; }
      .o-mbar > .o-more { flex:0 0 48px; padding:0; justify-content:center; }
      .o-mbar > .sc-btn { min-width:0; }
      .o-mbar > .sc-btn-primary, .o-mbar > .sc-btn-green { flex:1.5 1 0; }
      @media (max-width: 379px) { .o-mbar > .sc-btn-primary, .o-mbar > .sc-btn-green { flex:2 1 0; } .o-mbar > .sc-btn { padding-left:10px; padding-right:10px; } }
      .o-mbar > .sc-btn .o-ellip { overflow:hidden; text-overflow:ellipsis; }
      .picker-qty-btn { width:40px; height:40px; font-size:18px; }
      .delivery-btn { min-height:44px; font-size:14px; }
      .o-mfoot { flex-wrap:wrap; padding-bottom:calc(12px + env(safe-area-inset-bottom)); }
      .o-mfoot > .sc-btn { flex:1 1 0; justify-content:center; }
      .o-mfoot > .o-mfoot-count { flex:0 0 100% !important; }
      .o-modal-small { align-items:flex-end !important; }
      .o-modal-small .sc-modal { height:auto; border-radius:14px 14px 0 0; }
    }
  `;

  const badgeOf = (status: string) => {
    const s = ORDER_STATUS[status] || { label: ts(status), tone: 'gray' as const };
    return <span className="sc-badge" style={{ background: BADGE[s.tone].bg, color: BADGE[s.tone].fg }}>{s.label}</span>;
  };

  const linesOf = (o: Order) => orderLinesOf(o);
  const netOf = (o: Order) => Math.round(((o.total || 0) - pendingRefundAdj(o).amount) * 100) / 100;

  /* Chips-compteurs de l'en-tête */
  const COUNTS: Array<[string, string]> = [
    ['', 'Toutes'], ['todo', 'À traiter'], ['confirmed', 'Confirmées'],
    ['shipped', 'Expédiées'], ['delivered', 'Livrées'],
  ];
  const countFor = (k: string) => pourPuces.filter(o => correspond(o, k)).length;

  /* Jalons de la timeline de suivi */
  const TRACK_STEPS: Array<{ key: string; label: string }> = [
    { key: 'pending',   label: 'Commande reçue' },
    { key: 'paid',      label: 'Paiement confirmé' },
    { key: 'confirmed', label: 'Préparation' },
    { key: 'shipped',   label: 'Expédiée' },
    { key: 'delivered', label: 'Livrée' },
  ];
  const stepIndex = (s: string) => Math.max(0, TRACK_STEPS.findIndex(x => x.key === s));

  const showList = !mobile || !mobDetail;
  const showDetail = !mobile || mobDetail;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* ── En-tête — téléphone : titre qui défile, recherche et
             filtres collés en haut ; masqué dans le détail ─────── */}
      {mobile && !mobDetail && (
        <>
          <div className="o-head">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div className="sc-title">{t('title')}</div>
                <div className="sc-sub">
                  {visibleOrders.length} commande{visibleOrders.length > 1 ? 's' : ''} · {fmt(totalRevenue)}
                  {pendingCount > 0 ? ` · ${pendingCount} ${t('pending').toLowerCase()}` : ''}
                </div>
              </div>
              <button className="sc-btn sc-btn-primary" style={{ flexShrink: 0 }} onClick={() => setShowNewModal(true)} aria-label={t('newOrderTitle')}>
                <span className="ms">add</span>{t('newShort')}
              </button>
            </div>
          </div>
          <div className="o-filterbar">
            <div className="o-search">
              <span className="ms" aria-hidden>search</span>
              <input className="sc-input" type="search" enterKeyHint="search" aria-label={t('search')}
                     placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="sc-filters" style={{ marginTop: 8 }}>
              {COUNTS.map(([k, label]) => (
                <button key={k} className={`sc-chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
                  {label}
                  <span style={{
                    minWidth: 20, height: 18, padding: '0 6px', borderRadius: 9, fontSize: 11.5, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: filter === k ? 'rgba(255,255,255,.2)' : TH.borderFaint2,
                    color: filter === k ? '#fff' : TH.text3,
                  }}>{countFor(k)}</span>
                </button>
              ))}
              {testCount > 0 && (
                <button className={`sc-chip${showTestOrders ? ' on' : ''}`} onClick={() => setShowTestOrders(v => !v)}>
                  <span className="ms" style={{ fontSize: 17 }}>science</span>{t('tests')} ({testCount})
                </button>
              )}
              {abandonedCount > 0 && (
                <button className={`sc-chip${showAbandoned ? ' on' : ''}`} onClick={() => setShowAbandoned(v => !v)}>
                  <span className="ms" style={{ fontSize: 17 }}>shopping_cart</span>{t('abandoned')} ({abandonedCount})
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── En-tête collant (ordinateur) ────────────────── */}
      {!mobile && (
      <div className="o-head">
        <div className="sc-head" style={{ marginBottom: 10 }}>
          <div>
            <div className="sc-title">{t('title')}</div>
            <div className="sc-sub">
              {visibleOrders.length} commande{visibleOrders.length > 1 ? 's' : ''} · {fmt(totalRevenue)} encaissés
              {pendingCount > 0 ? ` · ${pendingCount} en attente de paiement` : ''}
            </div>
          </div>
          <div className="sc-actions">
            {testCount > 0 && (
              <button className={`sc-chip${showTestOrders ? ' on' : ''}`} onClick={() => setShowTestOrders(v => !v)}>
                <span className="ms" style={{ fontSize: 15 }}>science</span>Tests ({testCount})
              </button>
            )}
            {abandonedCount > 0 && (
              <button className={`sc-chip${showAbandoned ? ' on' : ''}`} onClick={() => setShowAbandoned(v => !v)}>
                <span className="ms" style={{ fontSize: 15 }}>shopping_cart</span>Abandonnés ({abandonedCount})
              </button>
            )}
            <button className="sc-btn sc-btn-primary" onClick={() => setShowNewModal(true)}>
              <span className="ms">add</span>{t('newOrder')}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="sc-input" style={{ height: 32, flex: '1 1 200px', maxWidth: 280, background: '#F7F4EF' }}
                 placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
          {COUNTS.map(([k, label]) => (
            <button key={k} className={`sc-chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
              {label}
              <span style={{
                minWidth: 18, height: 16, padding: '0 5px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: filter === k ? 'rgba(255,255,255,.2)' : '#EFEBE4',
                color: filter === k ? '#fff' : '#857C71',
              }}>{countFor(k)}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      {/* ── Master-detail ───────────────────────────────── */}
      <div className="o-md">

        {/* Liste */}
        {showList && (
          <div style={{
            width: mobile ? '100%' : 300, flexShrink: 0,
            background: TH.sidebarBg, borderRight: mobile ? 'none' : `1px solid ${TH.border}`,
            overflowY: mobile ? 'visible' : 'auto',
          }}>
            {loading && <SqueletteTable lignes={7} colonnes={4} vignette />}
            {!loading && visibleOrders.length === 0 && <div className="sc-empty">{t('noOrder')}</div>}
            {visibleOrders.map(o => {
              const on = selected?.id === o.id;
              const n = linesOf(o).length;
              const mode = o.delivery_mode === 'pickup' ? { icon: 'storefront', label: t('clickCollect') }
                : o.delivery_mode === 'mondial_relay' ? { icon: 'local_shipping', label: t('modeRelay') }
                : { icon: 'home', label: t('modeHome') };
              return (
                <button key={o.id} className="o-item"
                  onClick={() => openOrder(o)}
                  style={{
                    borderLeft: on && !mobile ? '3px solid var(--accent)' : '3px solid transparent',
                    background: on && !mobile ? '#fff' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="sc-num o-item-num">{o.order_number}</span>
                    {o.is_test && <span className="sc-badge" style={{ background: BADGE.amber.bg, color: BADGE.amber.fg }}>test</span>}
                    <span style={{ flex: 1 }} />
                    <span className="sc-num o-item-total">{fmt(netOf(o))}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span className="o-item-name">{o.customer_name || '—'}</span>
                    {badgeOf(o.status)}
                  </div>
                  {mobile ? (
                    <div className="o-item-meta">
                      <span className="ms" aria-hidden>{mode.icon}</span>{mode.label}
                      <span aria-hidden>·</span>{n} art.<span aria-hidden>·</span>{fmtDate(o.created_at)}
                    </div>
                  ) : (
                    <div className="o-item-meta" style={{ display: 'block' }}>
                      {n} art. · {fmtDate(o.created_at)}
                      {o.delivery_mode === 'pickup' ? ' · Click & Collect' : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Détail */}
        {showDetail && (
          <div className="o-detail">
            {!selected && <div className="sc-empty">{t('selectOrder')}</div>}
            {selected && (() => {
              const o = selected;
              const lines = linesOf(o);
              const adj = pendingRefundAdj(o);
              const { margin, pct, stripeFee, urssaf, transportReal, packagingCost, shippingCollected } = calcMargin(o);
              const idx = stepIndex(o.status);
              const isDead = ['refunded', 'cancelled'].includes(o.status);

              return (
                <>
                  {mobile && (
                    <div className="o-dbar">
                      <button className="sc-iconbtn" onClick={closeMobDetail} aria-label={t('allOrders')}>
                        <span className="ms">arrow_back</span>
                      </button>
                      <div className="o-dbar-title">
                        <span className="sc-num">{o.order_number}</span>
                        {badgeOf(o.status)}
                        {o.is_test && <span className="sc-badge" style={{ background: BADGE.amber.bg, color: BADGE.amber.fg }}>test</span>}
                      </div>
                    </div>
                  )}

                  {/* En-tête du détail */}
                  <div className="sc-head" style={{ marginBottom: 12 }}>
                    <div>
                      {!mobile && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="sc-title">Commande {o.order_number}</span>
                          {badgeOf(o.status)}
                        </div>
                      )}
                      <div className="sc-sub">
                        {fmtDate(o.created_at)}
                        {o.source ? ` · ${o.source}` : ''}
                        {o.delivery_mode === 'pickup' ? ' · Click & Collect'
                          : o.delivery_mode === 'mondial_relay' ? ' · Point relais' : ' · Livraison'}
                        {mobile ? ` · ${fmt(netOf(o))}` : ''}
                      </div>
                    </div>
                    {!mobile && <div className="sc-actions">
                      <a className="sc-btn sc-btn-secondary" href={`/admin/documents/bon-de-livraison/${o.id}`} target="_blank" rel="noopener">
                        <span className="ms">local_shipping</span>{t('deliveryNote')}
                      </a>
                      <a className="sc-btn sc-btn-secondary" href={`/admin/documents/facture/${o.id}`} target="_blank" rel="noopener">
                        <span className="ms">print</span>{t('invoice')}
                      </a>
                      {['paid', 'confirmed'].includes(o.status) && (
                        <button className="sc-btn sc-btn-primary" onClick={() => updateStatus(o.id, 'shipped')}>
                          <span className="ms">send</span>{t('markShipped')}
                        </button>
                      )}
                    </div>}
                  </div>

                  <div className="o-cols">

                    {/* ══ Colonne principale ══ */}
                    <div className="o-col" style={{ flex: '2 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

                      {/* Articles */}
                      <div className="sc-card o-s-lines">
                        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                          <span className="sc-card-title">{t('orderLines')}</span>
                        </div>
                        <div>
                          {(() => {
                            /* Une commande partiellement expédiée affichait ses
                               lignes brutes : impossible de voir, en la
                               regardant, que quatre articles sur cinq sont
                               partis et qu'il ne reste qu'un fromage. On
                               relisait le bon de livraison pour le savoir.

                               Le reste dû se consomme dans l'ordre des lignes :
                               deux lignes peuvent porter le même produit — un
                               remplacement de rupture en crée une — et
                               `shipped_qty` ne compte que par produit. */
                            const envoye: Record<string, number> = { ...((o as any).shipped_qty || {}) };
                            const resteParLigne = lines.map((l: any) => {
                              if (!l.product_id) return 0;
                              const dispo = Number(envoye[l.product_id]) || 0;
                              const pris = Math.min(Number(l.qty) || 0, dispo);
                              envoye[l.product_id] = dispo - pris;
                              return (Number(l.qty) || 0) - pris;
                            });
                            /* Le marquage n'a de sens que sur une commande
                               partielle : jamais expédiée, tout est « à
                               livrer » ; entièrement expédiée, tout est
                               parti. Dans les deux cas, le statut le dit
                               déjà — l'écrire sur chaque ligne serait du
                               bruit. */
                            const dejaParti = o.status === 'partial'
                              && Object.keys((o as any).shipped_qty || {}).length > 0;

                          return lines.map((l: any, i: number) => {
                            const img = l.image_url || (l.product_id && imageMap[l.product_id]) || null;
                            const reste = resteParLigne[i];
                            const partiel = dejaParti && !!l.product_id;
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: mobile ? '11px 14px' : '9px 15px', borderBottom: `1px solid ${TH.borderFaint}` }}>
                                {img ? <img src={img} alt="" style={thumbStyle(l.name || 'x', mobile ? 44 : 32)} />
                                     : <div style={thumbStyle(l.name || 'x', mobile ? 44 : 32)}>{initials(l.name || l.desc || '?', 1)}</div>}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: mobile ? 14 : 12.5, color: TH.ink, lineHeight: mobile ? 1.35 : undefined }}>{l.desc || l.name || l.name_fr || '—'}</div>
                                  <div className="sc-num" style={{ fontSize: mobile ? 12.5 : 10.5, color: TH.muted, marginTop: mobile ? 2 : 0 }}>
                                    {l.qty} × {fmt(l.price || 0)}
                                    {partiel && (reste > 0
                                      ? <span style={{ color: '#B45309', fontWeight: 600 }}>
                                          {'  ·  '}{t('resteALivrer')} {reste}
                                        </span>
                                      : <span style={{ color: TH.green, fontWeight: 600 }}>
                                          {'  ·  '}{t('ligneLivree')}
                                        </span>)}
                                  </div>
                                </div>
                                <span className="sc-num" style={{ fontSize: mobile ? 14 : 12.5, fontWeight: 600 }}>{fmt((l.qty || 1) * (l.price || 0))}</span>
                              </div>
                            );
                          });
                          })()}
                        </div>
                        <div style={{ padding: '10px 15px', background: TH.surfaceAlt }}>
                          {/* Sous-total = somme des lignes, AVANT remise. La colonne
                              `subtotal` vaut « total − port » après paiement (le
                              webhook l'écrit ainsi pour la page de remerciement) :
                              l'afficher puis soustraire la remise la comptait deux fois. */}
                          <div className="o-row"><span>{tc('subtotal')}</span><span className="sc-num">{fmt(lines.length ? r2(lines.reduce((s: number, l: any) => s + (Number(l.qty) || 1) * (Number(l.price) || 0), 0)) : o.subtotal)}</span></div>
                          {o.promo_code && (
                            <div className="o-row" style={{ color: TH.green }}>
                              <span>{o.promo_code}</span><span className="sc-num">−{fmt(o.discount || 0)}</span>
                            </div>
                          )}
                          <div className="o-row"><span>{tc('shipping')}</span><span className="sc-num">{o.shipping > 0 ? fmt(o.shipping) : tc('free')}</span></div>
                          <div className="o-row"><span>TVA</span><span className="sc-num">{t('notApplicable')}</span></div>
                          <div className="o-row" style={{ fontSize: 15, fontWeight: 700, color: TH.ink, borderTop: `2px solid ${TH.ink}`, marginTop: 4, paddingTop: 8 }}>
                            <span>{tc('total')}</span><span className="sc-num">{fmt(o.total)}</span>
                          </div>
                          {(o.refunded_amount || 0) > 0 && (
                            <>
                              <div className="o-row" style={{ color: '#B45309' }}>
                                <span>{t('refunded')}</span><span className="sc-num">−{fmt(o.refunded_amount || 0)}</span>
                              </div>
                              {adj.amount > 0 && (
                                <div className="o-row" style={{ fontWeight: 700, color: TH.green }}>
                                  <span>{t('netCollected')}</span><span className="sc-num">{fmt(netOf(o))}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Coûts réels + marge */}
                      <div className="sc-card o-s-costs">
                        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="sc-card-title">{t('realCosts')}</span>
                          {savingCosts && <span style={{ fontSize: 10.5, color: TH.muted }}>{t('saving')}</span>}
                        </div>
                        <div style={{ padding: '13px 15px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                            <div>
                              <label className="sc-label">{t('realFreight')}</label>
                              <input className="sc-input sc-num" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                                     value={transportInput} onChange={e => setTransportInput(e.target.value)} onBlur={saveCosts} />
                            </div>
                            <div>
                              <label className="sc-label">{t('packaging')}</label>
                              <input className="sc-input sc-num" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                                     value={packagingInput} onChange={e => setPackagingInput(e.target.value)} onBlur={saveCosts} />
                            </div>
                          </div>
                          {margin === null ? (
                            <div style={{ fontSize: 12, color: TH.muted, fontStyle: 'italic' }}>
                              Marge indisponible : renseigne les coûts d’achat des produits.
                            </div>
                          ) : (() => {
                            const color = pct! >= 40 ? TH.green : pct! >= 20 ? '#C97A2B' : TH.red;
                            const netTransport = transportReal - shippingCollected;
                            return (
                              <div style={{ background: color + '15', border: `1px solid ${color}40`, borderRadius: 8, padding: '11px 13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color }}>{t('realMargin')}</span>
                                  <span className="sc-num" style={{ fontSize: 15, fontWeight: 800, color }}>{fmt(margin)} ({pct!.toFixed(1)} %)</span>
                                </div>
                                <div style={{ borderTop: `1px solid ${color}30`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: mobile ? 12.5 : 11, color: TH.text2b }}>
                                  {stripeFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('stripeFee')}</span><span className="sc-num">−{fmt(stripeFee)}</span></div>}
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>URSSAF (12,3 % du CA)</span><span className="sc-num">−{fmt(urssaf)}</span></div>
                                  {transportReal > 0 && (
                                    <>
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('realFreight')}</span><span className="sc-num">−{fmt(transportReal)}</span></div>
                                      {shippingCollected > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: TH.green }}><span>{t('freightCharged')}</span><span className="sc-num">+{fmt(shippingCollected)}</span></div>}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: netTransport <= 0 ? TH.green : TH.text2b, borderTop: '1px dashed #e5e7eb', paddingTop: 3 }}>
                                        <span>= Net transport</span><span className="sc-num">{netTransport <= 0 ? '+' : '−'}{fmt(Math.abs(netTransport))}</span>
                                      </div>
                                    </>
                                  )}
                                  {packagingCost > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('packaging')}</span><span className="sc-num">−{fmt(packagingCost)}</span></div>}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Remboursement partiel — panneau complet conservé */}
                      {['paid', 'confirmed', 'preparing', 'partial', 'shipped', 'delivered'].includes(o.status) && !o.is_test && (() => {
                        const { credit, shipping, net, amount, remaining } = partialTotals(o);
                        const overMax = amount > remaining + 0.005;
                        return (
                          <div className="sc-card o-s-refund" style={{ borderColor: '#FED7AA', background: '#FFF7ED' }}>
                            <div style={{ padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#9A3412' }}>
                                {t('partialRefund')}
                              </span>
                              <button className="sc-btn sc-btn-secondary" onClick={() => { setShowPartialPanel(v => !v); setPartialConfirm(false); }}>
                                {showPartialPanel ? 'Fermer' : 'Retirer des articles / rembourser'}
                              </button>
                            </div>
                            {(o.refunded_amount || 0) > 0 && (
                              <div style={{ fontSize: 12, color: '#9A3412', padding: '0 15px 10px' }}>
                                Déjà remboursé <span className="sc-num" style={{ fontWeight: 700 }}>{fmt(o.refunded_amount || 0)}</span>
                                {' · '}reste <span className="sc-num" style={{ fontWeight: 700 }}>{fmt(remaining)}</span>
                              </div>
                            )}
                            {showPartialPanel && (
                              <div style={{ padding: '0 15px 15px' }}>
                                <label className="sc-label" style={{ color: '#9A3412' }}>{t('itemsToCredit')}</label>
                                <div style={{ background: '#fff', border: '1px solid #FED7AA', borderRadius: 7, padding: '2px 10px' }}>
                                  {lines.map((l: any, i: number) => {
                                    const maxQty = Number(l.qty) || 1;
                                    const q = partialItems[i] || 0;
                                    return (
                                      <label key={i} className="o-chk-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < lines.length - 1 ? '1px solid #FFEDD5' : 'none', cursor: 'pointer' }}>
                                        <input type="checkbox" className="o-chk" checked={q > 0}
                                               onChange={e => setPartialItems(s => { const n = { ...s }; if (e.target.checked) n[i] = maxQty; else delete n[i]; return n; })} />
                                        <span style={{ flex: 1, minWidth: 0, fontSize: mobile ? 14 : 12.5 }}>
                                          {nomProduit(productList.find(p => p.id === l.product_id), lang, l)}
                                          <span style={{ color: '#9A3412', fontSize: mobile ? 12 : 10.5 }}> (× {maxQty} — {fmt(l.price || 0)}/u)</span>
                                        </span>
                                        {q > 0 && maxQty > 1 && (
                                          <input type="number" inputMode="numeric" min={1} max={maxQty} value={q} className="sc-num o-in"
                                                 onChange={e => setPartialItems(s => ({ ...s, [i]: Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)) }))}
                                                 style={{ width: 52, padding: '3px 6px', borderRadius: 5, border: '1px solid #FDBA74', fontSize: 12, textAlign: 'right' }} />
                                        )}
                                        <span className="sc-num" style={{ fontSize: mobile ? 14 : 12.5, minWidth: mobile ? 64 : 72, textAlign: 'right', fontWeight: q > 0 ? 700 : 400, color: q > 0 ? '#9A3412' : TH.muted3 }}>
                                          {fmt((l.price || 0) * (q > 0 ? q : maxQty))}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
                                  <span style={{ fontSize: mobile ? 13.5 : 12.5, color: '#7C2D12' }}>{t('freightToBill')}</span>
                                  <input className="sc-num o-in" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={partialShipping}
                                         onChange={e => { setPartialShipping(e.target.value); setPartialConfirm(false); }}
                                         style={{ width: 82, padding: '5px 8px', borderRadius: 5, border: '1px solid #FDBA74', fontSize: 12.5, textAlign: 'right' }} />
                                </div>

                                <div style={{ marginTop: 12, background: '#fff', border: '1px solid #FED7AA', borderRadius: 7, padding: '10px 12px' }}>
                                  <div className="o-row" style={{ color: '#7C2D12' }}><span>{t('creditItems')}</span><span className="sc-num">+{fmt(credit)}</span></div>
                                  <div className="o-row" style={{ color: '#7C2D12' }}><span>{t('freightBilled')}</span><span className="sc-num">−{fmt(shipping)}</span></div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #FED7AA', marginTop: 6, paddingTop: 8 }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#9A3412' }}>À rembourser au client</span>
                                    <input className="sc-num o-in" type="number" inputMode="decimal" min="0" step="0.01"
                                           value={partialOverride !== '' ? partialOverride : (net > 0 ? net.toFixed(2) : '0.00')}
                                           onChange={e => { setPartialOverride(e.target.value); setPartialConfirm(false); }}
                                           style={{ width: 94, padding: '5px 8px', borderRadius: 5, border: `1px solid ${overMax ? TH.red : '#FDBA74'}`, fontSize: 14, fontWeight: 700, textAlign: 'right', color: '#9A3412', background: '#FFFBEB' }} />
                                  </div>
                                  {overMax && <div style={{ fontSize: 11, color: TH.red, marginTop: 6, fontWeight: 600 }}>Maximum remboursable : {fmt(remaining)}</div>}
                                </div>

                                <input className="sc-input" style={{ marginTop: 10 }} placeholder={t('refundReason')}
                                       value={partialReason} onChange={e => setPartialReason(e.target.value)} />

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontSize: mobile ? 13.5 : 12, color: '#7C2D12' }}>
                                  <label className="o-chk-row" style={{ display: 'flex', gap: mobile ? 10 : 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" className="o-chk" checked={partialModifyOrder} onChange={e => setPartialModifyOrder(e.target.checked)} />
                                    Retirer ces articles de la commande et y ajouter les frais de port
                                  </label>
                                  <label className="o-chk-row" style={{ display: 'flex', gap: mobile ? 10 : 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" className="o-chk" checked={partialRestock} onChange={e => setPartialRestock(e.target.checked)} />
                                    Remettre les articles retirés en stock
                                  </label>
                                  <label className="o-chk-row" style={{ display: 'flex', gap: mobile ? 10 : 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" className="o-chk" checked={partialNotify} onChange={e => setPartialNotify(e.target.checked)} />
                                    Notifier le client par email
                                  </label>
                                  {o.delivery_mode === 'pickup' && (
                                    <label className="o-chk-row" style={{ display: 'flex', gap: mobile ? 10 : 6, alignItems: 'center', cursor: 'pointer' }}>
                                      <input type="checkbox" className="o-chk" checked={partialSwitchDelivery} onChange={e => setPartialSwitchDelivery(e.target.checked)} />
                                      Passer la commande de Click &amp; Collect à expédition
                                    </label>
                                  )}
                                </div>

                                <button className="sc-btn" onClick={handlePartialRefund} disabled={refunding || !(amount > 0) || overMax}
                                  style={{
                                    marginTop: 12, width: '100%', justifyContent: 'center',
                                    background: partialConfirm ? '#EA580C' : '#FFEDD5', color: partialConfirm ? '#fff' : '#9A3412',
                                    border: '1px solid #FDBA74', fontWeight: 700,
                                    opacity: (!(amount > 0) || overMax) ? .5 : 1,
                                  }}>
                                  {refunding ? 'Remboursement Stripe…' : partialConfirm ? `Confirmer : rembourser ${fmt(amount)} ?` : `Rembourser ${fmt(amount)} au client`}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Lien de paiement */}
                      {/* Seulement une commande pas encore payée : « preparing » et « partial » sont payées, et le serveur refuse le lien. */}
                      {['pending', 'abandoned'].includes(o.status) && (
                        <div className="sc-card o-s-pay">
                          <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                            <span className="sc-card-title">{t('stripeLink')}</span>
                          </div>
                          <div style={{ padding: '13px 15px' }}>
                            {o.payment_link_url && (
                              <div className="sc-num" style={{ fontSize: mobile ? 12 : 11, color: '#0C4A6E', wordBreak: 'break-all', background: '#F0F9FF', padding: '6px 8px', borderRadius: 5, marginBottom: 8 }}>
                                {o.payment_link_url}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {o.payment_link_url && (
                                <button className="sc-btn sc-btn-secondary" onClick={() => { navigator.clipboard?.writeText(o.payment_link_url!); showToast(t('msgLinkCopied')); }}>
                                  <span className="ms">content_copy</span>{t('copy')}
                                </button>
                              )}
                              <button className="sc-btn sc-btn-secondary" onClick={() => sendPaymentLink(false)} disabled={sendingPaymentLink}>
                                <span className="ms">link</span>{o.payment_link_url ? 'Régénérer' : 'Générer le lien'}
                              </button>
                              <button className="sc-btn sc-btn-secondary" onClick={() => sendPaymentLink(true)} disabled={sendingPaymentLink}>
                                <span className="ms">mail</span>{t('sendByEmail')}
                              </button>
                            </div>
                            {o.payment_link_sent_at && (
                              <div style={{ fontSize: mobile ? 12 : 10.5, color: TH.muted, marginTop: 6 }}>Envoyé le {fmtDate(o.payment_link_sent_at)}</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Expédition Mondial Relay */}
                      {!isDead && (
                        <div className="sc-card o-s-ship" id="o-ship">
                          <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                            <span className="sc-card-title">{t('shipment')}</span>
                          </div>
                          <div style={{ padding: '13px 15px' }}>
                            {(o.logspher_label_url || o.logspher_error || (o.delivery_mode === 'mondial_relay' && !o.mondial_relay_tracking && !['shipped', 'delivered'].includes(o.status))) && (
                              <div style={{ background: o.logspher_label_url ? '#F0FDF4' : '#FFF7ED', border: `1px solid ${o.logspher_label_url ? '#86EFAC' : '#FED7AA'}`, borderRadius: 7, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                                {o.logspher_label_url
                                  ? <>Étiquette {o.logspher_carrier_name || 'LogSpher'} · {o.logspher_tracking} · <a href={o.logspher_label_url} target="_blank" rel="noopener">{t('downloadPdf')}</a></>
                                  : o.logspher_error
                                    ? <>Erreur LogSpher : {o.logspher_error.split(/(https?:\/\/[^\s"'}]+)/).map((part, i) =>
                                        /^https?:\/\//.test(part)
                                          ? <a key={i} href={part} target="_blank" rel="noopener" style={{ wordBreak: 'break-all' }}>{part}</a>
                                          : part)}</>
                                    : <>Pas d’étiquette UGO pour ce point relais.</>}
                                <div style={{ marginTop: 8 }}>
                                  {o.logspher_label_url ? (
                                    <button className="sc-btn sc-btn-danger" onClick={cancelLogspherLabel} disabled={lsRetrying}>
                                      {lsRetrying ? 'Annulation…' : 'Annuler l’étiquette'}
                                    </button>
                                  ) : (
                                    <span style={{ display: mobile ? 'flex' : 'inline-flex', flexDirection: mobile ? 'column' : undefined, alignItems: mobile ? 'stretch' : 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <input className={mobile ? 'sc-input' : 'form-control'} type="number" inputMode="numeric" min={1} placeholder="Poids pesé (g), facultatif"
                                      value={lsWeight} onChange={e => setLsWeight(e.target.value)} style={{ width: mobile ? '100%' : 200 }} />
                                    <button className="sc-btn sc-btn-secondary" onClick={retryLogspherLabel} disabled={lsRetrying}>
                                      {lsRetrying ? 'Création…' : o.logspher_error ? 'Relancer l’étiquette UGO' : 'Créer l’étiquette UGO'}
                                    </button>
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {o.delivery_mode === 'mondial_relay' && !o.logspher_label_url && (
                              <div style={{ background: '#F8FAFC', border: `1px solid ${TH.border}`, borderRadius: 7, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>Étiquette déjà payée sur UGO ? Colle-la ici</div>
                                <div style={{ color: TH.muted, marginBottom: 8 }}>upelgo.com → Envois → cette commande → récupère le PDF et le n° de suivi. Une fois le suivi enregistré, le client est prévenu automatiquement à l’arrivée au point relais.</div>
                                <input className="sc-input" value={lblUrlInput} onChange={e => setLblUrlInput(e.target.value)} placeholder="URL du PDF de l’étiquette (https://…)" style={{ marginBottom: 6 }} />
                                <input className="sc-input" value={trackingInput} onChange={e => setTrackingInput(e.target.value)} placeholder="Numéro de suivi" style={{ marginBottom: 8 }} />
                                <button className="sc-btn sc-btn-secondary" onClick={saveLogspherManual} disabled={lsSavingManual}>
                                  <span className="ms">save</span>{lsSavingManual ? 'Enregistrement…' : 'Enregistrer l’étiquette payée'}
                                </button>
                              </div>
                            )}
                            {mrResult && (
                              <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 7, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#065F46' }}>
                                {mrResult.tracking}{mrResult.labelUrl ? <> · <a href={mrResult.labelUrl} target="_blank" rel="noopener">{t('labelPdf')}</a></> : null}
                              </div>
                            )}
                            {o.relay_point_name && (
                              <div style={{ fontSize: 12, color: TH.text2b, marginBottom: 8 }}>
                                Point relais : {o.relay_point_name} — {o.relay_point_address}
                              </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
                              <div>
                                <label className="sc-label">{t('relayDelivery')}</label>
                                <input className="sc-input" value={mrLivRel} onChange={e => setMrLivRel(e.target.value)} placeholder={t('relayCode')} />
                              </div>
                              <div>
                                <label className="sc-label">{t('relayDrop')}</label>
                                <input className="sc-input" value={mrColRel} onChange={e => setMrColRel(e.target.value)} placeholder={t('relayYours')} />
                              </div>
                              <div>
                                <label className="sc-label">{t('weightG')}</label>
                                <input className="sc-input sc-num" type="number" inputMode="numeric" min={1} value={mrWeight} onChange={e => setMrWeight(e.target.value)} />
                              </div>
                            </div>
                            <button className="sc-btn sc-btn-secondary" style={{ marginTop: 10, width: mobile ? '100%' : undefined, justifyContent: 'center' }}
                                    onClick={createMrLabel} disabled={mrLoading || !mrLivRel || !mrColRel}>
                              <span className="ms">local_shipping</span>{mrLoading ? 'Création…' : 'Créer l’étiquette'}
                            </button>

                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${TH.borderFaint}` }}>
                              <label className="sc-label">{t('tracking')}</label>
                              <div className="o-inline">
                                <input className="sc-input" autoCapitalize="characters" autoCorrect="off" spellCheck={false} value={trackingInput} onChange={e => setTrackingInput(e.target.value)} placeholder={t('trackingPlaceholder')} />
                                <button className="sc-btn sc-btn-secondary" onClick={saveTracking} disabled={savingTracking}>
                                  {savingTracking ? '…' : t('trackingSave')}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ══ Colonne latérale ══ */}
                    <div className="o-col" style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

                      {/* Client */}
                      <div className="sc-card o-s-client">
                        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                          <span className="sc-card-title">{tc('client')}</span>
                        </div>
                        <div style={{ padding: '13px 15px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                              {initials(o.customer_name || '?')}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: mobile ? 15 : 13, fontWeight: 600, color: TH.ink, overflowWrap: 'anywhere' }}>{o.customer_name || '—'}</div>
                              <div style={{ fontSize: mobile ? 13 : 11, color: TH.muted, wordBreak: 'break-all' }}>
                                {o.customer_email ? <a className="o-link" href={`mailto:${o.customer_email}`}>{o.customer_email}</a> : null}
                              </div>
                            </div>
                          </div>
                          {(o.shipping_address || o.customer_address) && (
                            <div style={{ fontSize: mobile ? 13.5 : 12, color: TH.text2b, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                              {toAddrStr(o.shipping_address || o.customer_address).replace(/,\s*/g, '\n')}
                            </div>
                          )}
                          {o.customer_phone && (
                            <div style={{ fontSize: mobile ? 13.5 : 12, color: TH.text2b, marginTop: 4 }}>
                              <a className="o-link" href={`tel:${o.customer_phone.replace(/[^\d+]/g, '')}`}>{o.customer_phone}</a>
                            </div>
                          )}
                          {mobile && (o.customer_phone || o.customer_email) && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              {o.customer_phone && (
                                <a className="sc-btn sc-btn-secondary" style={{ flex: 1, justifyContent: 'center' }} href={`tel:${o.customer_phone.replace(/[^\d+]/g, '')}`}>
                                  <span className="ms">call</span>{t('callClient')}
                                </a>
                              )}
                              {o.customer_email && (
                                <a className="sc-btn sc-btn-secondary" style={{ flex: 1, justifyContent: 'center' }} href={`mailto:${o.customer_email}?subject=${encodeURIComponent(o.order_number)}`}>
                                  <span className="ms">mail</span>{t('mailClient')}
                                </a>
                              )}
                            </div>
                          )}
                          {(() => {
                            const em = (o.customer_email || '').toLowerCase();
                            const his = em ? toutesReelles.filter(x => (x.customer_email || '').toLowerCase() === em) : [];
                            const sum = his.reduce((s, x) => s + netOf(x), 0);
                            return his.length > 1 ? (
                              <div style={{ fontSize: mobile ? 12.5 : 11, color: TH.muted, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${TH.borderFaint}` }}>
                                {his.length} commandes · {fmt(sum)} cumulés
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      {/* Suivi */}
                      <div className="sc-card o-s-track">
                        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                          <span className="sc-card-title">{t('trackingShort')}</span>
                        </div>
                        <div style={{ padding: '13px 15px' }}>
                          {isDead ? (
                            <div style={{ fontSize: 12, color: TH.muted }}>Commande {ts(o.status).toLowerCase()}.</div>
                          ) : TRACK_STEPS.map((s, i) => {
                            const done = i <= idx;
                            return (
                              <div key={s.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: done ? 'var(--accent)' : '#DCD6CC', marginTop: 4 }} />
                                  {i < TRACK_STEPS.length - 1 && <div style={{ width: 1, height: 22, background: done ? 'var(--accent)' : '#DCD6CC' }} />}
                                </div>
                                <div style={{ paddingBottom: 8 }}>
                                  <div style={{ fontSize: mobile ? 13.5 : 12, fontWeight: done ? 600 : 400, color: done ? TH.ink : TH.muted }}>{s.label}</div>
                                </div>
                              </div>
                            );
                          })}
                          {/* Langue du client — celle de ses emails et de ses
                              documents, pas celle du back-office. Deduite du pays
                              de livraison tant qu'on n'a rien choisi. */}
                          <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${TH.borderFaint}` }}>
                            <label className="sc-label">{t('langueClient')}</label>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                              {LANGUES_CLIENT.map(l => {
                                const active = langueDeCommande(o) === l;
                                return (
                                  <button key={l} className={`sc-chip o-chip-xs${active ? ' on' : ''}`}
                                          onClick={() => reglerLangue(o.id, o.lang === l ? null : l)}>
                                    {NOM_LANGUE[l]}
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ fontSize: mobile ? 12 : 10.5, color: TH.muted, marginTop: 5 }}>
                              {o.lang
                                ? t('langueChoisie')
                                : `${t('langueDeduite')} ${paysDeLivraison(o) || '—'}`}
                            </div>
                          </div>

                          <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${TH.borderFaint}` }}>
                            <label className="sc-label">{t('changeStatus')}</label>
                            <div style={{ display: 'flex', gap: mobile ? 6 : 5, flexWrap: 'wrap' }}>
                              {Object.keys(T_ORDER_STATUS).filter(k => k !== 'abandoned').map(k => (
                                <button key={k} className={`sc-chip o-chip-xs${o.status === k ? ' on' : ''}`}
                                        onClick={() => updateStatus(o.id, k)}>{ts(k)}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Documents & actions — sur téléphone, dans le menu « ⋯ »
                          de la barre du bas (mêmes actions, rien de retiré). */}
                      <div className="sc-card o-s-docs sc-hide-mobile">
                        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                          <span className="sc-card-title">{t('docsActions')}</span>
                        </div>
                        <div style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <a className="sc-btn sc-btn-secondary" style={{ justifyContent: 'flex-start' }} href={`/admin/factures/${o.id}`} target="_blank" rel="noopener">
                            <span className="ms">receipt_long</span>{t('invoiceEditor')}
                          </a>
                          <button className="sc-btn sc-btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => downloadAuth(`/api/invoices/${o.id}/pdf`, `facture-${o.order_number}.pdf`).catch((e: any) => showToast(e.message))}>
                            <span className="ms">picture_as_pdf</span>PDF facture
                          </button>
                          {avoirId && (
                            <>
                              <a className="sc-btn sc-btn-secondary" style={{ justifyContent: 'flex-start' }} href={`/admin/factures/${avoirId}`} target="_blank" rel="noopener">
                                <span className="ms">undo</span>{t('creditNote')}
                              </a>
                              <button className="sc-btn sc-btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => downloadAuth(`/api/invoices/${avoirId}/pdf`, `avoir-${o.order_number}.pdf`).catch((e: any) => showToast(e.message))}>
                                <span className="ms">picture_as_pdf</span>PDF avoir
                              </button>
                            </>
                          )}
                          <button className="sc-btn sc-btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => printDeliveryNote(o)}>
                            <span className="ms">description</span>{t('deliveryNote')}
                          </button>

                          <div style={{ borderTop: `1px solid ${TH.borderFaint}`, margin: '4px 0' }} />

                          {!o.is_test && (
                            <>
                              <button className="sc-btn sc-btn-secondary" style={{ justifyContent: 'flex-start' }}
                                      onClick={handleMarkTest} disabled={markingTest}
                                      title={t('excludeAll')}>
                                <span className="ms">science</span>
                                {markingTest ? '…' : testConfirm ? t('markTestConfirm') : t('markTest')}
                              </button>
                              <button className="sc-btn sc-btn-secondary" style={{ justifyContent: 'flex-start' }}
                                      onClick={toggleExcludeStats} disabled={togglingStats}
                                      title={t('excludeStats')}>
                                <span className="ms">query_stats</span>
                                {togglingStats ? '…' : o.exclude_from_stats ? 'Réintégrer aux stats' : 'Hors stats'}
                              </button>
                            </>
                          )}
                          {['paid', 'confirmed', 'preparing', 'partial', 'shipped'].includes(o.status) && !o.is_test && (
                            <button className="sc-btn sc-btn-danger" style={{ justifyContent: 'flex-start' }}
                                    onClick={handleRefund} disabled={refunding}>
                              <span className="ms">undo</span>
                              {refunding ? 'Remboursement…' : refundConfirm ? t('refundConfirm') : t('refund')}
                            </button>
                          )}
                        </div>
                      </div>

                      {o.notes && (
                        <div className="sc-card o-s-notes" style={{ padding: '12px 15px', fontSize: mobile ? 14 : 12, fontStyle: 'italic', color: TH.text2b, overflowWrap: 'anywhere' }}>
                          {mobile && (
                            <div style={{ fontStyle: 'normal', fontSize: 12, fontWeight: 600, letterSpacing: .6, textTransform: 'uppercase', color: TH.muted, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="ms" style={{ fontSize: 17 }}>sticky_note_2</span>{t('notesTitle')}
                            </div>
                          )}
                          {o.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Téléphone : actions principales sous le pouce ── */}
                  {mobile && (() => {
                    const labelUrl = o.logspher_label_url || mrResult?.labelUrl || o.mondial_relay_label_url || '';
                    const canShip = ['paid', 'confirmed'].includes(o.status);
                    const canPrepare = ['paid', 'confirmed', 'preparing', 'partial'].includes(o.status);
                    const prepHref = `/admin/commandes/preparation?id=${encodeURIComponent(o.id)}`;
                    return (
                      <>
                        <div className="sc-sticky-actions o-mbar">
                          <button ref={moreRef} className="sc-btn sc-btn-secondary o-more" aria-label={t('more')}
                                  aria-haspopup="menu" aria-expanded={sheetOpen} onClick={() => setSheetOpen(v => !v)}>
                            <span className="ms">more_horiz</span>
                          </button>
                          {labelUrl ? (
                            <a className="sc-btn sc-btn-secondary" href={labelUrl} target="_blank" rel="noopener">
                              <span className="ms">download</span><span className="o-ellip">{t('label')}</span>
                            </a>
                          ) : canPrepare ? (
                            <Link className="sc-btn sc-btn-secondary" href={prepHref}>
                              <span className="ms">inventory</span><span className="o-ellip">{t('prepare')}</span>
                            </Link>
                          ) : (
                            <Link className="sc-btn sc-btn-secondary" href={`/admin/documents/facture/${o.id}`}>
                              <span className="ms">receipt_long</span><span className="o-ellip">{t('invoice')}</span>
                            </Link>
                          )}
                          {canShip ? (
                            <button className={`sc-btn ${armed === 'shipped' ? 'sc-btn-green' : 'sc-btn-primary'}`}
                                    onClick={() => { if (armed !== 'shipped') { setArmed('shipped'); return; } setArmed(''); updateStatus(o.id, 'shipped'); }}>
                              <span className="ms">{armed === 'shipped' ? 'check' : 'send'}</span>
                              <span className="o-ellip">{armed === 'shipped' ? t('confirmShip') : t('markShipped')}</span>
                            </button>
                          ) : o.status === 'shipped' ? (
                            <button className={`sc-btn ${armed === 'delivered' ? 'sc-btn-green' : 'sc-btn-primary'}`}
                                    onClick={() => { if (armed !== 'delivered') { setArmed('delivered'); return; } setArmed(''); updateStatus(o.id, 'delivered'); }}>
                              <span className="ms">{armed === 'delivered' ? 'check' : 'where_to_vote'}</span>
                              <span className="o-ellip">{armed === 'delivered' ? t('confirmDeliv') : t('markDelivered')}</span>
                            </button>
                          ) : (
                            <Link className="sc-btn sc-btn-secondary" href={`/admin/documents/bon-de-livraison/${o.id}`}>
                              <span className="ms">local_shipping</span><span className="o-ellip">{t('deliveryNote')}</span>
                            </Link>
                          )}
                        </div>

                        {/* Menu « ⋯ » : documents, outils et gestes rares. Les
                            confirmations en deux temps (test, remboursement)
                            gardent le menu ouvert pour le second toucher. */}
                        <MenuActions open={sheetOpen} anchor={moreRef.current} onClose={() => { setSheetOpen(false); setTestConfirm(false); setRefundConfirm(false); }}
                                     title={<>{o.order_number} · {o.customer_name || '—'}</>}>
                          {canPrepare && labelUrl && <MenuItem icon="inventory" label={t('prepare')} href={prepHref} />}
                          <MenuItem icon="local_shipping" label={t('deliveryNote')} hint={t('documentsA4')} href={`/admin/documents/bon-de-livraison/${o.id}`} />
                          <MenuItem icon="print" label={t('invoice')} hint={t('documentsA4')} href={`/admin/documents/facture/${o.id}`} />
                          <MenuItem icon="receipt_long" label={t('invoiceEditor')} href={`/admin/factures/${o.id}`} />
                          <MenuItem icon="picture_as_pdf" label="PDF facture"
                                    onClick={() => downloadAuth(`/api/invoices/${o.id}/pdf`, `facture-${o.order_number}.pdf`).catch((e: any) => showToast(e.message))} />
                          {avoirId && <MenuItem icon="undo" label={t('creditNote')} href={`/admin/factures/${avoirId}`} />}
                          {avoirId && (
                            <MenuItem icon="picture_as_pdf" label="PDF avoir"
                                      onClick={() => downloadAuth(`/api/invoices/${avoirId}/pdf`, `avoir-${o.order_number}.pdf`).catch((e: any) => showToast(e.message))} />
                          )}
                          <MenuItem icon="description" label={`${t('deliveryNote')} (simple)`} onClick={() => printDeliveryNote(o)} />
                          {!isDead && (
                            <MenuItem icon="qr_code_2" label={t('shipment')}
                                      onClick={() => document.getElementById('o-ship')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
                          )}
                          {!o.is_test && (
                            <>
                              <MenuSep />
                              <MenuItem icon="science" keepOpen={!testConfirm} disabled={markingTest} hint={testConfirm ? undefined : t('excludeAll')}
                                        label={markingTest ? '…' : testConfirm ? t('markTestConfirm') : t('markTest')}
                                        onClick={handleMarkTest} />
                              <MenuItem icon="query_stats" keepOpen disabled={togglingStats} hint={t('excludeStats')}
                                        label={togglingStats ? '…' : o.exclude_from_stats ? 'Réintégrer aux stats' : 'Hors stats'}
                                        onClick={toggleExcludeStats} />
                            </>
                          )}
                          {['paid', 'confirmed', 'preparing', 'partial', 'shipped'].includes(o.status) && !o.is_test && (
                            <MenuItem icon="undo" danger keepOpen={!refundConfirm} disabled={refunding}
                                      label={refunding ? 'Remboursement…' : refundConfirm ? t('refundConfirm') : t('refund')}
                                      onClick={handleRefund} />
                          )}
                        </MenuActions>
                      </>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        )}
      </div>

        {showNewModal && (() => {
          const pickerLines = Object.entries(pickerSelections).filter(([, s]) => s.qty > 0).map(([pid, s]) => {
            const p = productList.find(x => x.id === pid);
            const variantObj = s.variantLabel ? p?.product_variants?.find(v => v.label === s.variantLabel) : null;
            const price = variantObj ? variantObj.price : (p?.price || s.price);
            return { pid, name: (p?.name_fr || pid) + (s.variantLabel ? ` — ${s.variantLabel}` : ''), qty: s.qty, price };
          });
          const subtotal = Math.round(pickerLines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
          const shipRules = resolveShipping(wlConfig, { isInternational: false });
          const baseShipping = subtotal >= shipRules.threshold ? 0 : shipRules.cost;
          const remise = remiseManuelle(subtotal);
          const isFreeShip = remise.freeShipping;
          const effectiveShipping = (newOrderDelivery === 'pickup' || isFreeShip) ? 0 : baseShipping;
          const discount = remise.discount;
          const total = Math.max(0, subtotal - discount) + effectiveShipping;
          /* Fenêtres sur les primitives partagées .sc-modal : centrées sur
             ordinateur, plein écran sur téléphone avec le pied (Annuler /
             Créer) collé en bas. Les anciennes classes (picker-overlay,
             grid-2…) n'existaient plus : le sélecteur d'articles
             s'affichait dans le flux de la page, sans fond ni fenêtre. */
          return (
            <div className="sc-modal-back" onClick={e => e.target === e.currentTarget && resetNewOrderModal()}>
              <div className="sc-modal o-modal-flex" role="dialog" aria-modal="true" aria-label={t('newOrderTitle')} style={{ maxWidth: 660 }}>
                <div className="sc-modal-head">
                  <span className="sc-card-title">{t('newOrderTitle')}</span>
                  <button className="sc-iconbtn" onClick={resetNewOrderModal} aria-label={t('close')}><span className="ms">close</span></button>
                </div>
                <div className="sc-modal-body" style={{ flex: 1 }}>
                  <div className="sc-grid-2" style={{ marginBottom: 14 }}>
                    <div>
                      <label className="sc-label">{t('custName')}</label>
                      <input className="sc-input" autoComplete="off" value={newOrder.customer_name} onChange={e => setNewOrder(o => ({ ...o, customer_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="sc-label">{tc('email')} *</label>
                      <input className="sc-input" type="email" inputMode="email" autoCapitalize="off" autoComplete="off" value={newOrder.customer_email} onChange={e => setNewOrder(o => ({ ...o, customer_email: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="sc-label">{tc('address')}</label>
                      <textarea className="sc-textarea" rows={2} style={{ minHeight: 60, resize: 'vertical' }} value={newOrder.customer_address} onChange={e => setNewOrder(o => ({ ...o, customer_address: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span className="sc-label" style={{ margin: 0 }}>{t('orderLines')}</span>
                      <button className="sc-btn sc-btn-secondary" onClick={() => setShowProductPicker(true)}>
                        <span className="ms">add_shopping_cart</span>Choisir des articles
                      </button>
                    </div>
                    {pickerLines.length === 0 ? (
                      <div style={{ padding: '12px 16px', background: TH.surfaceAlt, border: `1px dashed ${TH.borderField}`, borderRadius: 7, textAlign: 'center', fontSize: 13, color: TH.muted }}>
                        Aucun article — cliquez sur « Choisir des articles »
                      </div>
                    ) : (
                      <div style={{ border: `1px solid ${TH.border}`, borderRadius: 7 }}>
                        {pickerLines.map((l, i) => (
                          <div key={l.pid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 12px', borderTop: i ? `1px solid ${TH.borderFaint}` : 'none', fontSize: 13 }}>
                            <span style={{ flex: 1, minWidth: 0 }}>{nomProduit(l, lang)} <span style={{ color: TH.muted }}>× {l.qty}</span></span>
                            <span className="sc-num" style={{ fontSize: 12.5 }}>{fmt(l.qty * l.price)}</span>
                            <button className="sc-iconbtn" style={{ color: TH.red }} aria-label={tc('delete')}
                                    onClick={() => setPickerSelections(s => { const n = { ...s }; delete n[l.pid]; return n; })}>
                              <span className="ms">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label className="sc-label">{t('shippingMode')}</label>
                    <div className="o-seg">
                      <button className={`delivery-btn${newOrderDelivery === 'pickup' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('pickup')}>🏪 Click & Collect</button>
                      <button className={`delivery-btn${newOrderDelivery === 'mondial_relay' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('mondial_relay')}>📦 Point Relais</button>
                      <button className={`delivery-btn${newOrderDelivery === 'delivery' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('delivery')}>🚚 Livraison domicile</button>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label className="sc-label">{t('promoCode')}</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="sc-input sc-num" style={{ textTransform: 'uppercase', flex: 1, minWidth: 0 }} placeholder={t('promoExample')}
                        autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="go"
                        value={newOrderPromoCode}
                        onChange={e => { setNewOrderPromoCode(e.target.value.toUpperCase()); setNewOrderPromoData(null); setNewOrderPromoMsg(''); }}
                        onKeyDown={e => e.key === 'Enter' && applyPromoInNewOrder()} />
                      <button className="sc-btn sc-btn-secondary" onClick={applyPromoInNewOrder} disabled={applyingPromo} style={{ flexShrink: 0 }}>
                        {applyingPromo ? '…' : 'Appliquer'}
                      </button>
                    </div>
                    {newOrderPromoMsg && (
                      <div style={{ fontSize: 12.5, marginTop: 4, color: newOrderPromoMsg.startsWith('✅') ? TH.green : TH.red }}>{newOrderPromoMsg}</div>
                    )}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label className="sc-label">{tc('notes')}</label>
                    <input className="sc-input" value={newOrder.notes} onChange={e => setNewOrder(o => ({ ...o, notes: e.target.value }))} />
                  </div>

                  {pickerLines.length > 0 && (
                    <div style={{ background: TH.surfaceAlt, border: `1px solid ${TH.border}`, borderRadius: 7, padding: '12px 16px', fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: TH.text2b }}>
                        <span>{tc('subtotal')}</span><span className="sc-num">{fmt(subtotal)}</span>
                      </div>
                      {discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: TH.green }}>
                          <span>🎟 {newOrderPromoData.code}</span><span className="sc-num">−{fmt(discount)}</span>
                        </div>
                      )}
                      {!remise.ok && (
                        <div style={{ marginBottom: 4, color: TH.red }}>
                          🎟 {newOrderPromoData?.code} : {remise.minOrder > subtotal ? `minimum ${fmt(remise.minOrder)} non atteint` : 'code plus valable'}
                        </div>
                      )}
                      {isFreeShip && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: TH.green }}>
                          <span>🎟 {newOrderPromoData.code}</span><span className="sc-num">{t('freeShipping')}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: TH.text2b }}>
                        <span>{tc('shipping')}</span>
                        <span className="sc-num" style={{ color: effectiveShipping === 0 ? TH.green : 'inherit' }}>
                          {effectiveShipping === 0 ? 'Gratuite' : fmt(effectiveShipping)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: `1px solid ${TH.border}`, paddingTop: 8, marginTop: 4, color: TH.ink }}>
                        <span>{tc('total')}</span><span className="sc-num">{fmt(total)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="sc-modal-foot o-mfoot">
                  <button className="sc-btn sc-btn-secondary" onClick={resetNewOrderModal}>{tc('cancel')}</button>
                  <button className="sc-btn sc-btn-primary" onClick={createOrder}><span className="ms">save</span>{tc('create')}</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Sélecteur d'articles */}
        {showProductPicker && (() => {
          const filtered = productList.filter(p => {
            if (!pickerSearch) return true;
            return (p.name_fr || '').toLowerCase().includes(pickerSearch.toLowerCase());
          });
          const nSel = Object.values(pickerSelections).filter(s => s.qty > 0).length;
          return (
            <div className="sc-modal-back" onClick={e => e.target === e.currentTarget && setShowProductPicker(false)}>
              <div className="sc-modal o-modal-flex" role="dialog" aria-modal="true" aria-label="Choisir des articles" style={{ maxWidth: 600 }}>
                <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: `1px solid ${TH.border}` }}>
                  <div className="sc-modal-head" style={{ position: 'static', borderBottom: 'none', paddingBottom: 6 }}>
                    <span className="sc-card-title">🛒 Choisir des articles</span>
                    <button className="sc-iconbtn" onClick={() => setShowProductPicker(false)} aria-label={t('close')}><span className="ms">close</span></button>
                  </div>
                  <div style={{ padding: '0 16px 12px' }}>
                    <input className="sc-input" type="search" enterKeyHint="search" placeholder={t('searchProduct')} value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)} autoFocus={!mobile} />
                  </div>
                </div>
                <div style={{ padding: '0 16px', flex: 1 }}>
                  {filtered.map(p => {
                    const sel = pickerSelections[p.id];
                    const hasVariants = (p.product_variants?.length || 0) > 1;
                    const activeVariantLabel = sel?.variantLabel ?? (hasVariants ? p.product_variants![0].label : undefined);
                    const displayPrice = hasVariants
                      ? (p.product_variants!.find(v => v.label === activeVariantLabel)?.price ?? p.price)
                      : p.price;
                    return (
                      <div key={p.id} className="picker-item">
                        {p.image_url
                          ? <img src={p.image_url} alt="" className="o-picker-thumb" />
                          : <div className="o-picker-thumb">📦</div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: TH.ink, lineHeight: 1.3 }}>{nomProduit(p, lang)}</div>
                          <div className="sc-num" style={{ fontSize: 12, color: TH.muted, marginTop: 2 }}>{fmt(displayPrice)}{p.weight ? ` · ${p.weight}` : ''}</div>
                          {hasVariants && (
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                              {p.product_variants!.map(v => (
                                <button key={v.label}
                                  className={`sc-chip o-chip-xs${activeVariantLabel === v.label ? ' on' : ''}`}
                                  onClick={() => setPickerSelections(s => ({
                                    ...s,
                                    [p.id]: { qty: s[p.id]?.qty || 1, variantLabel: v.label, price: v.price },
                                  }))}>
                                  {v.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                          {sel && sel.qty > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button className="picker-qty-btn" aria-label="−" onClick={() => {
                                const newQty = (sel.qty || 1) - 1;
                                if (newQty <= 0) setPickerSelections(s => { const n = { ...s }; delete n[p.id]; return n; });
                                else setPickerSelections(s => ({ ...s, [p.id]: { ...s[p.id], qty: newQty } }));
                              }}>−</button>
                              <span className="sc-num" style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{sel.qty}</span>
                              <button className="picker-qty-btn" aria-label="+" onClick={() => setPickerSelections(s => ({
                                ...s, [p.id]: { ...s[p.id], qty: (s[p.id]?.qty || 0) + 1 },
                              }))}>+</button>
                            </div>
                          ) : (
                            <button className="sc-btn sc-btn-secondary"
                              onClick={() => setPickerSelections(s => ({
                                ...s,
                                [p.id]: { qty: 1, variantLabel: hasVariants ? p.product_variants![0].label : undefined, price: displayPrice },
                              }))}>
                              <span className="ms">add</span>Ajouter
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="sc-modal-foot o-mfoot" style={{ alignItems: 'center' }}>
                  <span className="o-mfoot-count" style={{ fontSize: 13, color: TH.text2b, flex: 1 }}>
                    {nSel} article(s)
                  </span>
                  <button className="sc-btn sc-btn-secondary" onClick={() => setShowProductPicker(false)}>{tc('cancel')}</button>
                  <button className="sc-btn sc-btn-primary" onClick={() => setShowProductPicker(false)}><span className="ms">check</span>Confirmer</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Remise en stock */}
        {showRestockModal && (
          <div className="sc-modal-back o-modal-small" onClick={e => { if (e.target === e.currentTarget) { setShowRestockModal(false); setRestockOrderId(null); } }}>
            <div className="sc-modal" role="dialog" aria-modal="true" style={{ maxWidth: 420 }}>
              <div className="sc-modal-head">
                <span className="sc-card-title">📦 Réincrémenter le stock ?</span>
              </div>
              <div className="sc-modal-body" style={{ fontSize: 14, lineHeight: 1.6, color: TH.text2 }}>
                <p style={{ margin: '0 0 8px' }}>{t('cancelledOrder')}</p>
                <p style={{ margin: 0 }}>{t('restock')}</p>
              </div>
              <div className="sc-modal-foot o-mfoot">
                <button className="sc-btn sc-btn-secondary" onClick={() => { setShowRestockModal(false); setRestockOrderId(null); }}>
                  Non, garder tel quel
                </button>
                <button className="sc-btn sc-btn-green" onClick={() => restockOrderId && doRestock(restockOrderId)}>
                  Oui, réincrémenter
                </button>
              </div>
            </div>
          </div>
        )}

      {toast && <div className="sc-toast" role="status">{toast}</div>}
    </>
  );
}
