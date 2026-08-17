'use client';
import { downloadAuth, adminFetch } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getAdminLang, setAdminLang, subscribeAdminLang, T_COMMON, T_ORDER_STATUS, AdminLang, LOCALES, nomProduit } from '@/lib/admin-i18n';
import { resolveShipping } from '@/lib/shipping';
// Thème importé sous alias :  est déjà pris par le dictionnaire de traductions.
import { T as TH, BADGE, ORDER_STATUS, thumbStyle, initials } from '@/lib/admin-theme';
import { SqueletteTable } from '@/components/Squelette';
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
  newOrder:      { fr: '+ Nouvelle commande', en: '+ New order', sv: '+ Ny beställning' },
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
};

/* Les formats suivent la langue choisie : une interface anglaise qui
   affiche « 1 234,50 € » le 16/08/2026 n'est pas traduite. */
const fmtL = (n: number, lang: AdminLang) =>
  (n || 0).toLocaleString(LOCALES[lang], { minimumFractionDigits: 2 }) + ' €';
const fmtDateL = (d: string, lang: AdminLang) =>
  new Date(d).toLocaleDateString(LOCALES[lang], { day: '2-digit', month: '2-digit', year: 'numeric' });
// shipping_address peut être string ou objet JSONB selon la source
const toAddrStr = (v: any): string => !v ? '' : typeof v === 'string' ? v : [v.line1, v.line2, v.postal_code && v.city ? `${v.postal_code} ${v.city}` : (v.postal_code || v.city), v.country].filter(Boolean).join(', ');

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', paid: '#10B981', confirmed: '#3B82F6',
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
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [mrLivRel, setMrLivRel] = useState('');
  const [mrColRel, setMrColRel] = useState('');
  const [mrWeight, setMrWeight] = useState('500');
  const [mrLoading, setMrLoading] = useState(false);
  const [mrResult, setMrResult] = useState<{ tracking: string; labelUrl: string } | null>(null);
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

  useEffect(() => { load(); loadCosts(); }, [filter, search]);
  useEffect(() => { loadCosts(); }, []);
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  async function loadCosts() {
    const token = localStorage.getItem('sd_admin_token') || '';
    const res = await adminFetch('/api/products?limit=500', { headers: { Authorization: `Bearer ${token}` } });
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

  async function load() {
    setLoading(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    if (search) params.set('search', search);
    const res = await adminFetch('/api/orders?' + params.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
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
    await adminFetch(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
    showToast('✅ ' + tc('status'));
    load();
    if (selected?.id === id) setSelected(o => o ? { ...o, status } : null);
    if (status === 'cancelled' || status === 'refunded') {
      setRestockOrderId(id);
      setShowRestockModal(true);
    }
  }

  async function doRestock(orderId: string) {
    const token = localStorage.getItem('sd_admin_token') || '';
    const res = await adminFetch(`/api/orders/${orderId}/restock`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    showToast(data.restocked > 0 ? `✅ Stock réincrémenté (${data.restocked} produit${data.restocked > 1 ? 's' : ''})` : '⚠️ Aucun produit suivi à réincrémenter');
    setShowRestockModal(false);
    setRestockOrderId(null);
  }

  async function saveCosts() {
    if (!selected) return;
    const token = localStorage.getItem('sd_admin_token') || '';
    setSavingCosts(true);
    const transport_cost_real = parseFloat(transportInput) || 0;
    const packaging_cost = parseFloat(packagingInput) || 0;
    await adminFetch(`/api/orders/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transport_cost_real, packaging_cost }),
    });
    setSelected(o => o ? { ...o, transport_cost_real, packaging_cost } : null);
    load();
    setSavingCosts(false);
    showToast(t('msgCostsSaved'));
  }

  async function saveTracking() {
    if (!selected) return;
    const token = localStorage.getItem('sd_admin_token') || '';
    setSavingTracking(true);
    await adminFetch(`/api/orders/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tracking_number: trackingInput || null }),
    });
    setSelected(o => o ? { ...o, tracking_number: trackingInput || undefined } : null);
    load();
    setSavingTracking(false);
    showToast('✅ ' + t('tracking'));
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
      const now = new Date();
      if (found.valid_from && now < new Date(found.valid_from)) { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code pas encore valide'); return; }
      if (found.valid_until && now > new Date(String(found.valid_until).slice(0, 10) + 'T23:59:59')) { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code expiré'); return; }
      if (found.max_uses && (found.used_count || 0) >= found.max_uses) { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code plus disponible'); return; }
      setNewOrderPromoData(found);
      setNewOrderPromoMsg(found.type === 'percent' ? `✅ −${found.value}%` : found.type === 'fixed' ? `✅ −${found.value} €` : '✅ Livraison offerte');
    } finally {
      setApplyingPromo(false);
    }
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
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const shipRules = resolveShipping(wlConfig, { isInternational: false });
    const baseShipping = subtotal >= shipRules.threshold ? 0 : shipRules.cost;
    const isFreeShip = newOrderPromoData?.type === 'free_shipping';
    const effectiveShipping = (newOrderDelivery === 'pickup' || isFreeShip) ? 0 : baseShipping;
    let discount = 0;
    if (newOrderPromoData?.type === 'percent') discount = Math.min(subtotal, (subtotal * newOrderPromoData.value) / 100);
    else if (newOrderPromoData?.type === 'fixed') discount = Math.min(subtotal, newOrderPromoData.value);
    const total = Math.max(0, subtotal - discount) + effectiveShipping;
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

  async function createCustomerAccount() {
    if (!selected?.customer_email) return;
    setCreatingAccount(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch('/api/customer/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: selected.customer_email, name: selected.customer_name, send_email: true }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`❌ ${data.error || 'Erreur'}`); return; }
      showToast(`✅ Compte créé — email envoyé à ${selected.customer_email}`);
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
    } finally {
      setCreatingAccount(false);
    }
  }

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

  const realOrders = orders.filter(o => !o.is_test);
  const abandonedCount = realOrders.filter(o => o.status === 'abandoned').length;
  const _base = showTestOrders ? orders : realOrders;
  // Masque les paniers abandonnés par défaut (sauf si on filtre dessus ou toggle activé)
  const visibleOrders = (showAbandoned || filter === 'abandoned')
    ? _base
    : _base.filter(o => o.status !== 'abandoned');
  const totalRevenue = realOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.total || 0) - pendingRefundAdj(o).amount, 0);
  const pendingCount = realOrders.filter(o => o.status === 'pending').length;
  const testCount = orders.filter(o => o.is_test).length;

  const paidStatuses = ['paid', 'confirmed', 'shipped', 'delivered'];
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
    .o-modal-overlay { position:fixed; inset:0; background:rgba(21,24,30,.45); backdrop-filter:blur(2px); z-index:200; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto; }
    .o-modal { background:#fff; border:1px solid ${TH.border}; border-radius:10px; width:100%; max-width:640px; margin:auto; box-shadow:0 20px 60px rgba(0,0,0,.2); }
    .o-modal-header { padding:14px 18px; border-bottom:1px solid ${TH.border}; display:flex; align-items:center; justify-content:space-between; }
    .o-modal-body { padding:18px; max-height:76vh; overflow-y:auto; }
    .o-modal-footer { padding:13px 18px; border-top:1px solid ${TH.border}; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
    .picker-item { display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid ${TH.borderFaint}; }
    .picker-item:last-child { border-bottom:none; }
    .picker-qty-btn { width:22px; height:22px; border-radius:5px; border:1px solid ${TH.borderField}; background:#F7F4EF; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; line-height:1; }
    .delivery-btn { flex:1; padding:8px 10px; border-radius:7px; border:1px solid ${TH.borderField}; background:#fff; cursor:pointer; font-size:12px; font-weight:500; text-align:center; min-width:80px; }
    .delivery-btn.active { background:${TH.ink}; color:#fff; border-color:${TH.ink}; }
    .o-row { display:flex; justify-content:space-between; gap:10px; padding:6px 0; font-size:12.5px; color:${TH.text2b}; }
    .o-row + .o-row { border-top:1px solid ${TH.borderFaint}; }
  `;

  const badgeOf = (status: string) => {
    const s = ORDER_STATUS[status] || { label: ts(status), tone: 'gray' as const };
    return <span className="sc-badge" style={{ background: BADGE[s.tone].bg, color: BADGE[s.tone].fg }}>{s.label}</span>;
  };

  const linesOf = (o: Order) => orderLinesOf(o);
  const netOf = (o: Order) => Math.round(((o.total || 0) - pendingRefundAdj(o).amount) * 100) / 100;

  /* Chips-compteurs de l'en-tête */
  const COUNTS: Array<[string, string]> = [
    ['', 'Toutes'], ['paid', 'À traiter'], ['confirmed', 'Confirmées'],
    ['shipped', 'Expédiées'], ['delivered', 'Livrées'],
  ];
  const countFor = (k: string) => k ? visibleOrders.filter(o => o.status === k).length : visibleOrders.length;

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

      {/* ── En-tête collant ─────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: '#fff',
        margin: '-16px -18px 0', padding: '14px 18px 10px',
        borderBottom: `1px solid ${TH.border}`,
      }}>
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

      {/* ── Master-detail ───────────────────────────────── */}
      <div style={{ display: 'flex', margin: '0 -18px', minHeight: 'calc(100vh - 190px)' }}>

        {/* Liste */}
        {showList && (
          <div style={{
            width: mobile ? '100%' : 300, flexShrink: 0,
            background: TH.sidebarBg, borderRight: mobile ? 'none' : `1px solid ${TH.border}`,
            overflowY: 'auto',
          }}>
            {loading && <SqueletteTable lignes={7} colonnes={4} vignette />}
            {!loading && visibleOrders.length === 0 && <div className="sc-empty">{t('noOrder')}</div>}
            {visibleOrders.map(o => {
              const on = selected?.id === o.id;
              const n = linesOf(o).length;
              return (
                <button key={o.id}
                  onClick={() => {
                    setSelected(o);
                    setTrackingInput(o.tracking_number || '');
                    setTransportInput(o.transport_cost_real ? String(o.transport_cost_real) : '');
                    setPackagingInput(o.packaging_cost ? String(o.packaging_cost) : '');
                    setTestConfirm(false); setRefundConfirm(false);
                    if (mobile) setMobDetail(true);
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '10px 14px', border: 'none',
                    borderBottom: `1px solid ${TH.borderFaint}`,
                    borderLeft: on ? '3px solid var(--accent)' : '3px solid transparent',
                    background: on ? '#fff' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="sc-num" style={{ fontSize: 12.5, fontWeight: 600, color: TH.ink }}>{o.order_number}</span>
                    {o.is_test && <span className="sc-badge" style={{ background: BADGE.amber.bg, color: BADGE.amber.fg }}>test</span>}
                    <span style={{ flex: 1 }} />
                    <span className="sc-num" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmt(netOf(o))}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 11.5, color: TH.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {o.customer_name || '—'}
                    </span>
                    {badgeOf(o.status)}
                  </div>
                  <div style={{ fontSize: 10.5, color: TH.muted, marginTop: 2 }}>
                    {n} art. · {fmtDate(o.created_at)}
                    {o.delivery_mode === 'pickup' ? ' · Click & Collect' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Détail */}
        {showDetail && (
          <div style={{ flex: 1, minWidth: 0, padding: '14px 18px 90px', overflowY: 'auto' }}>
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
                    <button className="sc-btn sc-btn-secondary" style={{ marginBottom: 12 }} onClick={() => setMobDetail(false)}>
                      <span className="ms">arrow_back</span>{t('allOrders')}
                    </button>
                  )}

                  {/* En-tête du détail */}
                  <div className="sc-head" style={{ marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="sc-title">Commande {o.order_number}</span>
                        {badgeOf(o.status)}
                      </div>
                      <div className="sc-sub">
                        {fmtDate(o.created_at)}
                        {o.source ? ` · ${o.source}` : ''}
                        {o.delivery_mode === 'pickup' ? ' · Click & Collect'
                          : o.delivery_mode === 'mondial_relay' ? ' · Point relais' : ' · Livraison'}
                      </div>
                    </div>
                    <div className="sc-actions">
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
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

                    {/* ══ Colonne principale ══ */}
                    <div style={{ flex: '2 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

                      {/* Articles */}
                      <div className="sc-card">
                        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                          <span className="sc-card-title">{t('orderLines')}</span>
                        </div>
                        <div>
                          {lines.map((l: any, i: number) => {
                            const img = l.image_url || (l.product_id && imageMap[l.product_id]) || null;
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px', borderBottom: `1px solid ${TH.borderFaint}` }}>
                                {img ? <img src={img} alt="" style={thumbStyle(l.name || 'x', 32)} />
                                     : <div style={thumbStyle(l.name || 'x', 32)}>{initials(l.name || l.desc || '?', 1)}</div>}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12.5, color: TH.ink }}>{l.desc || l.name || l.name_fr || '—'}</div>
                                  <div className="sc-num" style={{ fontSize: 10.5, color: TH.muted }}>
                                    {l.qty} × {fmt(l.price || 0)}
                                  </div>
                                </div>
                                <span className="sc-num" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmt((l.qty || 1) * (l.price || 0))}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ padding: '10px 15px', background: TH.surfaceAlt }}>
                          <div className="o-row"><span>{tc('subtotal')}</span><span className="sc-num">{fmt(o.subtotal)}</span></div>
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
                      <div className="sc-card">
                        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="sc-card-title">{t('realCosts')}</span>
                          {savingCosts && <span style={{ fontSize: 10.5, color: TH.muted }}>{t('saving')}</span>}
                        </div>
                        <div style={{ padding: '13px 15px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                            <div>
                              <label className="sc-label">{t('realFreight')}</label>
                              <input className="sc-input sc-num" type="number" min="0" step="0.01" placeholder="0.00"
                                     value={transportInput} onChange={e => setTransportInput(e.target.value)} onBlur={saveCosts} />
                            </div>
                            <div>
                              <label className="sc-label">{t('packaging')}</label>
                              <input className="sc-input sc-num" type="number" min="0" step="0.01" placeholder="0.00"
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
                                <div style={{ borderTop: `1px solid ${color}30`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: TH.text2b }}>
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
                      {['paid', 'confirmed', 'shipped', 'delivered'].includes(o.status) && !o.is_test && (() => {
                        const { credit, shipping, net, amount, remaining } = partialTotals(o);
                        const overMax = amount > remaining + 0.005;
                        return (
                          <div className="sc-card" style={{ borderColor: '#FED7AA', background: '#FFF7ED' }}>
                            <div style={{ padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
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
                                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < lines.length - 1 ? '1px solid #FFEDD5' : 'none' }}>
                                        <input type="checkbox" checked={q > 0}
                                               onChange={e => setPartialItems(s => { const n = { ...s }; if (e.target.checked) n[i] = maxQty; else delete n[i]; return n; })} />
                                        <span style={{ flex: 1, fontSize: 12.5 }}>
                                          {nomProduit(productList.find(p => p.id === l.product_id), lang, l)}
                                          <span style={{ color: '#9A3412', fontSize: 10.5 }}> (× {maxQty} — {fmt(l.price || 0)}/u)</span>
                                        </span>
                                        {q > 0 && maxQty > 1 && (
                                          <input type="number" min={1} max={maxQty} value={q} className="sc-num"
                                                 onChange={e => setPartialItems(s => ({ ...s, [i]: Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)) }))}
                                                 style={{ width: 52, padding: '3px 6px', borderRadius: 5, border: '1px solid #FDBA74', fontSize: 12, textAlign: 'right' }} />
                                        )}
                                        <span className="sc-num" style={{ fontSize: 12.5, minWidth: 72, textAlign: 'right', fontWeight: q > 0 ? 700 : 400, color: q > 0 ? '#9A3412' : TH.muted3 }}>
                                          {fmt((l.price || 0) * (q > 0 ? q : maxQty))}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
                                  <span style={{ fontSize: 12.5, color: '#7C2D12' }}>{t('freightToBill')}</span>
                                  <input className="sc-num" type="number" min="0" step="0.01" placeholder="0.00" value={partialShipping}
                                         onChange={e => { setPartialShipping(e.target.value); setPartialConfirm(false); }}
                                         style={{ width: 82, padding: '5px 8px', borderRadius: 5, border: '1px solid #FDBA74', fontSize: 12.5, textAlign: 'right' }} />
                                </div>

                                <div style={{ marginTop: 12, background: '#fff', border: '1px solid #FED7AA', borderRadius: 7, padding: '10px 12px' }}>
                                  <div className="o-row" style={{ color: '#7C2D12' }}><span>{t('creditItems')}</span><span className="sc-num">+{fmt(credit)}</span></div>
                                  <div className="o-row" style={{ color: '#7C2D12' }}><span>{t('freightBilled')}</span><span className="sc-num">−{fmt(shipping)}</span></div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #FED7AA', marginTop: 6, paddingTop: 8 }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#9A3412' }}>À rembourser au client</span>
                                    <input className="sc-num" type="number" min="0" step="0.01"
                                           value={partialOverride !== '' ? partialOverride : (net > 0 ? net.toFixed(2) : '0.00')}
                                           onChange={e => { setPartialOverride(e.target.value); setPartialConfirm(false); }}
                                           style={{ width: 94, padding: '5px 8px', borderRadius: 5, border: `1px solid ${overMax ? TH.red : '#FDBA74'}`, fontSize: 14, fontWeight: 700, textAlign: 'right', color: '#9A3412', background: '#FFFBEB' }} />
                                  </div>
                                  {overMax && <div style={{ fontSize: 11, color: TH.red, marginTop: 6, fontWeight: 600 }}>Maximum remboursable : {fmt(remaining)}</div>}
                                </div>

                                <input className="sc-input" style={{ marginTop: 10 }} placeholder={t('refundReason')}
                                       value={partialReason} onChange={e => setPartialReason(e.target.value)} />

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontSize: 12, color: '#7C2D12' }}>
                                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={partialModifyOrder} onChange={e => setPartialModifyOrder(e.target.checked)} />
                                    Retirer ces articles de la commande et y ajouter les frais de port
                                  </label>
                                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={partialRestock} onChange={e => setPartialRestock(e.target.checked)} />
                                    Remettre les articles retirés en stock
                                  </label>
                                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={partialNotify} onChange={e => setPartialNotify(e.target.checked)} />
                                    Notifier le client par email
                                  </label>
                                  {o.delivery_mode === 'pickup' && (
                                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={partialSwitchDelivery} onChange={e => setPartialSwitchDelivery(e.target.checked)} />
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
                      {!['paid', 'confirmed', 'shipped', 'delivered', 'refunded', 'cancelled'].includes(o.status) && (
                        <div className="sc-card">
                          <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                            <span className="sc-card-title">{t('stripeLink')}</span>
                          </div>
                          <div style={{ padding: '13px 15px' }}>
                            {o.payment_link_url && (
                              <div className="sc-num" style={{ fontSize: 11, color: '#0C4A6E', wordBreak: 'break-all', background: '#F0F9FF', padding: '6px 8px', borderRadius: 5, marginBottom: 8 }}>
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
                              <div style={{ fontSize: 10.5, color: TH.muted, marginTop: 6 }}>Envoyé le {fmtDate(o.payment_link_sent_at)}</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Expédition Mondial Relay */}
                      {!isDead && (
                        <div className="sc-card">
                          <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                            <span className="sc-card-title">{t('shipment')}</span>
                          </div>
                          <div style={{ padding: '13px 15px' }}>
                            {(o.logspher_label_url || o.logspher_error) && (
                              <div style={{ background: o.logspher_label_url ? '#F0FDF4' : '#FFF7ED', border: `1px solid ${o.logspher_label_url ? '#86EFAC' : '#FED7AA'}`, borderRadius: 7, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                                {o.logspher_label_url
                                  ? <>Étiquette {o.logspher_carrier_name || 'LogSpher'} · {o.logspher_tracking} · <a href={o.logspher_label_url} target="_blank" rel="noopener">{t('downloadPdf')}</a></>
                                  : <>Erreur LogSpher : {o.logspher_error}</>}
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
                                <input className="sc-input sc-num" type="number" min={1} value={mrWeight} onChange={e => setMrWeight(e.target.value)} />
                              </div>
                            </div>
                            <button className="sc-btn sc-btn-secondary" style={{ marginTop: 10 }}
                                    onClick={createMrLabel} disabled={mrLoading || !mrLivRel || !mrColRel}>
                              <span className="ms">local_shipping</span>{mrLoading ? 'Création…' : 'Créer l’étiquette'}
                            </button>

                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${TH.borderFaint}` }}>
                              <label className="sc-label">{t('tracking')}</label>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <input className="sc-input" value={trackingInput} onChange={e => setTrackingInput(e.target.value)} placeholder={t('trackingPlaceholder')} />
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
                    <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

                      {/* Client */}
                      <div className="sc-card">
                        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                          <span className="sc-card-title">{tc('client')}</span>
                        </div>
                        <div style={{ padding: '13px 15px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                              {initials(o.customer_name || '?')}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: TH.ink }}>{o.customer_name || '—'}</div>
                              <div style={{ fontSize: 11, color: TH.muted, wordBreak: 'break-all' }}>{o.customer_email}</div>
                            </div>
                          </div>
                          {(o.shipping_address || o.customer_address) && (
                            <div style={{ fontSize: 12, color: TH.text2b, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                              {toAddrStr(o.shipping_address || o.customer_address).replace(/,\s*/g, '\n')}
                            </div>
                          )}
                          {o.customer_phone && <div style={{ fontSize: 12, color: TH.text2b, marginTop: 4 }}>{o.customer_phone}</div>}
                          {(() => {
                            const his = realOrders.filter(x => x.customer_email && x.customer_email === o.customer_email);
                            const sum = his.reduce((s, x) => s + netOf(x), 0);
                            return his.length > 1 ? (
                              <div style={{ fontSize: 11, color: TH.muted, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${TH.borderFaint}` }}>
                                {his.length} commandes · {fmt(sum)} cumulés
                              </div>
                            ) : null;
                          })()}
                          {o.customer_email && (
                            <button className="sc-btn sc-btn-secondary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                                    onClick={createCustomerAccount} disabled={creatingAccount}>
                              <span className="ms">person_add</span>{creatingAccount ? '…' : 'Créer compte client'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Suivi */}
                      <div className="sc-card">
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
                                  <div style={{ fontSize: 12, fontWeight: done ? 600 : 400, color: done ? TH.ink : TH.muted }}>{s.label}</div>
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
                                  <button key={l} className={`sc-chip${active ? ' on' : ''}`}
                                          style={{ height: 26, fontSize: 11, padding: '0 9px' }}
                                          onClick={() => reglerLangue(o.id, o.lang === l ? null : l)}>
                                    {NOM_LANGUE[l]}
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ fontSize: 10.5, color: TH.muted, marginTop: 5 }}>
                              {o.lang
                                ? t('langueChoisie')
                                : `${t('langueDeduite')} ${paysDeLivraison(o) || '—'}`}
                            </div>
                          </div>

                          <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${TH.borderFaint}` }}>
                            <label className="sc-label">{t('changeStatus')}</label>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              {Object.keys(T_ORDER_STATUS).filter(k => k !== 'abandoned').map(k => (
                                <button key={k} className={`sc-chip${o.status === k ? ' on' : ''}`}
                                        style={{ height: 26, fontSize: 11, padding: '0 9px' }}
                                        onClick={() => updateStatus(o.id, k)}>{ts(k)}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Documents & actions */}
                      <div className="sc-card">
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
                          {['paid', 'confirmed', 'shipped'].includes(o.status) && !o.is_test && (
                            <button className="sc-btn sc-btn-danger" style={{ justifyContent: 'flex-start' }}
                                    onClick={handleRefund} disabled={refunding}>
                              <span className="ms">undo</span>
                              {refunding ? 'Remboursement…' : refundConfirm ? t('refundConfirm') : t('refund')}
                            </button>
                          )}
                        </div>
                      </div>

                      {o.notes && (
                        <div className="sc-card" style={{ padding: '12px 15px', fontSize: 12, fontStyle: 'italic', color: TH.text2b }}>
                          {o.notes}
                        </div>
                      )}
                    </div>
                  </div>
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
          const subtotal = pickerLines.reduce((s, l) => s + l.qty * l.price, 0);
          const shipRules = resolveShipping(wlConfig, { isInternational: false });
    const baseShipping = subtotal >= shipRules.threshold ? 0 : shipRules.cost;
          const isFreeShip = newOrderPromoData?.type === 'free_shipping';
          const effectiveShipping = (newOrderDelivery === 'pickup' || isFreeShip) ? 0 : baseShipping;
          let discount = 0;
          if (newOrderPromoData?.type === 'percent') discount = Math.min(subtotal, (subtotal * newOrderPromoData.value) / 100);
          else if (newOrderPromoData?.type === 'fixed') discount = Math.min(subtotal, newOrderPromoData.value);
          const total = Math.max(0, subtotal - discount) + effectiveShipping;
          return (
            <div className="o-modal-overlay" onClick={e => e.target === e.currentTarget && resetNewOrderModal()}>
              <div className="o-modal" style={{ maxWidth: 660 }}>
                <div className="o-modal-header">
                  <span className="o-modal-title">{t('newOrderTitle')}</span>
                  <button className="btn btn-secondary btn-sm" onClick={resetNewOrderModal}>✕</button>
                </div>
                <div className="o-modal-body">
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">{t('custName')}</label>
                      <input className="form-control" value={newOrder.customer_name} onChange={e => setNewOrder(o => ({ ...o, customer_name: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{tc('email')} *</label>
                      <input className="form-control" type="email" value={newOrder.customer_email} onChange={e => setNewOrder(o => ({ ...o, customer_email: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">{tc('address')}</label>
                      <textarea className="form-control" style={{ minHeight: 60 }} value={newOrder.customer_address} onChange={e => setNewOrder(o => ({ ...o, customer_address: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6A7280' }}>{t('orderLines')}</div>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowProductPicker(true)}>🛒 Choisir des articles</button>
                    </div>
                    {pickerLines.length === 0 ? (
                      <div style={{ padding: '12px 16px', background: '#FDFAF5', border: '1px dashed #D8CEBC', borderRadius: 6, textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                        Aucun article — cliquez sur « Choisir des articles »
                      </div>
                    ) : (
                      <div className="selected-lines">
                        {pickerLines.map(l => (
                          <div key={l.pid} className="selected-line">
                            <span style={{ flex: 1 }}>{nomProduit(l, lang)} <span style={{ color: '#6A7280' }}>× {l.qty}</span></span>
                            <span className="mono" style={{ fontSize: 12, marginRight: 10 }}>{fmt(l.qty * l.price)}</span>
                            <button onClick={() => setPickerSelections(s => { const n = { ...s }; delete n[l.pid]; return n; })} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('shippingMode')}</label>
                    <div className="delivery-btn-row">
                      <button className={`delivery-btn${newOrderDelivery === 'pickup' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('pickup')}>🏪 Click & Collect</button>
                      <button className={`delivery-btn${newOrderDelivery === 'mondial_relay' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('mondial_relay')}>📦 Point Relais</button>
                      <button className={`delivery-btn${newOrderDelivery === 'delivery' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('delivery')}>🚚 Livraison domicile</button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('promoCode')}</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="form-control mono" style={{ textTransform: 'uppercase', flex: 1 }} placeholder={t('promoExample')}
                        value={newOrderPromoCode}
                        onChange={e => { setNewOrderPromoCode(e.target.value.toUpperCase()); setNewOrderPromoData(null); setNewOrderPromoMsg(''); }}
                        onKeyDown={e => e.key === 'Enter' && applyPromoInNewOrder()} />
                      <button className="btn btn-secondary btn-sm" onClick={applyPromoInNewOrder} disabled={applyingPromo} style={{ flexShrink: 0 }}>
                        {applyingPromo ? '⏳' : 'Appliquer'}
                      </button>
                    </div>
                    {newOrderPromoMsg && (
                      <div style={{ fontSize: 12, marginTop: 4, color: newOrderPromoMsg.startsWith('✅') ? '#16A34A' : '#DC2626' }}>{newOrderPromoMsg}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">{tc('notes')}</label>
                    <input className="form-control" value={newOrder.notes} onChange={e => setNewOrder(o => ({ ...o, notes: e.target.value }))} />
                  </div>

                  {pickerLines.length > 0 && (
                    <div style={{ background: '#FDFAF5', border: '1px solid #D8CEBC', borderRadius: 6, padding: '12px 16px', fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#6A7280' }}>
                        <span>{tc('subtotal')}</span><span className="mono">{fmt(subtotal)}</span>
                      </div>
                      {discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#16A34A' }}>
                          <span>🎟 {newOrderPromoData.code}</span><span className="mono">−{fmt(discount)}</span>
                        </div>
                      )}
                      {isFreeShip && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#16A34A' }}>
                          <span>🎟 {newOrderPromoData.code}</span><span className="mono">{t('freeShipping')}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#6A7280' }}>
                        <span>{tc('shipping')}</span>
                        <span className="mono" style={{ color: effectiveShipping === 0 ? '#10B981' : 'inherit' }}>
                          {effectiveShipping === 0 ? 'Gratuite' : fmt(effectiveShipping)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid #D8CEBC', paddingTop: 8, marginTop: 4 }}>
                        <span>{tc('total')}</span><span className="mono">{fmt(total)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="o-modal-footer">
                  <button className="btn btn-secondary" onClick={resetNewOrderModal}>{tc('cancel')}</button>
                  <button className="btn btn-primary" onClick={createOrder}>💾 {tc('create')}</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Product Picker Modal */}
        {showProductPicker && (() => {
          const filtered = productList.filter(p => {
            if (!pickerSearch) return true;
            return (p.name_fr || '').toLowerCase().includes(pickerSearch.toLowerCase());
          });
          return (
            <div className="picker-overlay" onClick={e => e.target === e.currentTarget && setShowProductPicker(false)}>
              <div className="picker-modal">
                <div className="o-modal-header">
                  <span className="o-modal-title">🛒 Choisir des articles</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowProductPicker(false)}>✕</button>
                </div>
                <div style={{ padding: '12px 20px 0' }}>
                  <input className="picker-search" placeholder={t('searchProduct')} value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)} autoFocus />
                </div>
                <div className="picker-body">
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
                          ? <img src={p.image_url} alt="" className="picker-item-img" />
                          : <div className="picker-item-noimg">📦</div>}
                        <div className="picker-item-info">
                          <div className="picker-item-name">{nomProduit(p, lang)}</div>
                          <div className="picker-item-price">{fmt(displayPrice)}{p.weight ? ` · ${p.weight}` : ''}</div>
                          {hasVariants && (
                            <div className="picker-variants">
                              {p.product_variants!.map(v => (
                                <button key={v.label}
                                  className={`picker-variant-btn${activeVariantLabel === v.label ? ' active' : ''}`}
                                  onClick={() => setPickerSelections(s => ({
                                    ...s,
                                    [p.id]: { qty: s[p.id]?.qty || 1, variantLabel: v.label, price: v.price },
                                  }))}>
                                  {v.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {sel && sel.qty > 0 ? (
                            <div className="picker-qty">
                              <button className="picker-qty-btn" onClick={() => {
                                const newQty = (sel.qty || 1) - 1;
                                if (newQty <= 0) setPickerSelections(s => { const n = { ...s }; delete n[p.id]; return n; });
                                else setPickerSelections(s => ({ ...s, [p.id]: { ...s[p.id], qty: newQty } }));
                              }}>−</button>
                              <span className="picker-qty-val">{sel.qty}</span>
                              <button className="picker-qty-btn" onClick={() => setPickerSelections(s => ({
                                ...s, [p.id]: { ...s[p.id], qty: (s[p.id]?.qty || 0) + 1 },
                              }))}>+</button>
                            </div>
                          ) : (
                            <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }}
                              onClick={() => setPickerSelections(s => ({
                                ...s,
                                [p.id]: { qty: 1, variantLabel: hasVariants ? p.product_variants![0].label : undefined, price: displayPrice },
                              }))}>
                              + Ajouter
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="o-modal-footer">
                  <span style={{ fontSize: 13, color: '#6A7280', flex: 1, alignSelf: 'center' }}>
                    {Object.values(pickerSelections).filter(s => s.qty > 0).length} article(s)
                  </span>
                  <button className="btn btn-secondary" onClick={() => setShowProductPicker(false)}>{tc('cancel')}</button>
                  <button className="btn btn-primary" onClick={() => setShowProductPicker(false)}>✅ Confirmer</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Restock Modal */}
        {showRestockModal && (
          <div className="o-modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowRestockModal(false); setRestockOrderId(null); } }}>
            <div className="o-modal" style={{ maxWidth: 420 }}>
              <div className="o-modal-header">
                <span className="o-modal-title">📦 Réincrémenter le stock ?</span>
              </div>
              <div className="o-modal-body" style={{ fontSize: 14, lineHeight: 1.6, color: '#374151' }}>
                <p style={{ margin: '0 0 8px' }}>{t('cancelledOrder')}</p>
                <p style={{ margin: 0 }}>{t('restock')}</p>
              </div>
              <div className="o-modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => { setShowRestockModal(false); setRestockOrderId(null); }}
                >
                  Non, garder tel quel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: '#10B981', borderColor: '#10B981' }}
                  onClick={() => restockOrderId && doRestock(restockOrderId)}
                >
                  Oui, réincrémenter
                </button>
              </div>
            </div>
          </div>
        )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: TH.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300 }}>
          {toast}
        </div>
      )}
    </>
  );
}
