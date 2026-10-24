'use client';
import Link from 'next/link';
import { adminFetch } from '@/lib/auth-client';
import { T as TH, BADGE, thumbStyle, initials } from '@/lib/admin-theme';
import { useEffect, useRef, useState } from 'react';
import { getAdminLang, setAdminLang, subscribeAdminLang, T_COMMON, AdminLang, nomProduit } from '@/lib/admin-i18n';
import { SqueletteTable } from '@/components/Squelette';
import { MenuActions, MenuItem, MenuSep } from '@/components/MenuActions';
import { useIsMobile } from '@/lib/use-mobile';
import { TAC, tauxDuJour } from './i18n2';
import { traduire } from '@/lib/admin-i18n';

type PurchaseOrder = {
  id: string; number: string; status: string; supplier_id?: string; supplier_name?: string;
  expected_date?: string; lines: any[]; subtotal: number; tax: number; shipping: number;
  total: number; notes?: string; invoice_id?: string; created_at: string; currency?: string;
  exchange_rate?: number; payment_date?: string;
  contacts?: { company?: string; first_name?: string; last_name?: string; email?: string };
};
type Contact = { id: string; company?: string; first_name?: string; last_name?: string; email?: string };

const STATUSES = {
  draft:     { fr: 'Brouillon', en: 'Draft',     sv: 'Utkast',    color: '#6A7280' },
  sent:      { fr: 'Envoyée',   en: 'Sent',       sv: 'Skickad',   color: '#2563EB' },
  confirmed: { fr: 'Confirmée', en: 'Confirmed',  sv: 'Bekräftad', color: '#7C3AED' },
  partial:   { fr: 'Partielle', en: 'Partial',    sv: 'Partiell',  color: '#F59E0B' },
  received:  { fr: 'Reçue',     en: 'Received',   sv: 'Mottagen',  color: '#10B981' },
  cancelled: { fr: 'Annulée',   en: 'Cancelled',  sv: 'Avbruten',  color: '#EF4444' },
};

const CURRENCIES = ['EUR', 'SEK', 'NOK', 'DKK', 'GBP', 'USD'];

const T = {
  title:        { fr: 'Commandes d\'achat', en: 'Purchase orders', sv: 'Inköpsorder' },
  newBtn:       { fr: 'Nouvelle commande', en: 'New order', sv: 'Ny order' },
  newTitle:     { fr: 'Nouvelle commande d\'achat', en: 'New purchase order', sv: 'Ny inköpsorder' },
  editTitle:    { fr: 'Modifier la commande d\'achat', en: 'Edit purchase order', sv: 'Redigera inköpsorder' },
  editBtn:      { fr: '✏️', en: '✏️', sv: '✏️' },
  allStatuses:  { fr: 'Tous statuts', en: 'All statuses', sv: 'Alla status' },
  colNum:       { fr: 'N°', en: 'No.', sv: 'Nr' },
  colSupplier:  { fr: 'Fournisseur', en: 'Supplier', sv: 'Leverantör' },
  colExpected:  { fr: 'Date attendue', en: 'Expected date', sv: 'Förväntat datum' },
  colTotal:     { fr: 'Total', en: 'Total', sv: 'Totalt' },
  totalEngaged: { fr: 'Total engagé', en: 'Total committed', sv: 'Totalt belopp' },
  inProgress:   { fr: 'En cours', en: 'In progress', sv: 'Pågående' },
  received:     { fr: 'Reçues', en: 'Received', sv: 'Mottagna' },
  supplier:     { fr: 'Fournisseur *', en: 'Supplier *', sv: 'Leverantör *' },
  chooseSupplier:{ fr: '— Choisir —', en: '— Choose —', sv: '— Välj —' },
  expectedDate: { fr: 'Date de livraison attendue', en: 'Expected delivery date', sv: 'Förväntat leveransdatum' },
  paymentDate:  { fr: 'Date de paiement', en: 'Payment date', sv: 'Betalningsdatum' },
  currency:     { fr: 'Devise', en: 'Currency', sv: 'Valuta' },
  rate:         { fr: 'Taux EUR', en: 'EUR rate', sv: 'EUR-kurs' },
  convertBtn:   { fr: '↔ Convertir en EUR', en: '↔ Convert to EUR', sv: '↔ Konvertera till EUR' },
  converting:   { fr: 'Récupération du taux…', en: 'Fetching rate…', sv: 'Hämtar kurs…' },
  rateInfo:     { fr: 'Taux utilisé le', en: 'Rate used on', sv: 'Kurs använd den' },
  linesTitle:   { fr: 'Lignes de commande', en: 'Order lines', sv: 'Orderrader' },
  unitCost:     { fr: 'Prix unit. HT', en: 'Unit cost', sv: 'Enhetspris' },
  unitCostEur:  { fr: 'Prix unit. EUR', en: 'Unit cost EUR', sv: 'Enhetspris EUR' },
  reception:    { fr: '📬 Réceptionner', en: '📬 Receive', sv: '📬 Mottag' },
  recTitle:     { fr: '📬 Réception', en: '📬 Reception', sv: '📬 Mottagning' },
  ordered:      { fr: 'Commandé', en: 'Ordered', sv: 'Beställt' },
  receivedQty:  { fr: 'Reçu', en: 'Received', sv: 'Mottaget' },
  alreadyReceived: { fr: 'Déjà reçu', en: 'Already received', sv: 'Redan mottaget' },
  recWarning:   { fr: '⚠️ La validation de cette réception mettra à jour le stock automatiquement.', en: '⚠️ Validating this reception will update stock automatically.', sv: '⚠️ Bekräftelse av mottagningen uppdaterar lagret automatiskt.' },
  recValidate:  { fr: '✅ Valider la réception', en: '✅ Validate reception', sv: '✅ Bekräfta mottagning' },
};

const fmt = (n: number, currency = 'EUR') => {
  if (currency !== 'EUR') return (n || 0).toFixed(2) + ' ' + currency;
  return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
};
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

export default function AchatsPage() {
  const [lang, setLang] = useState<AdminLang>('fr');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showReception, setShowReception] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [toast, setToast] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState({
    status: 'draft', supplier_id: '', expected_date: '', notes: '',
    lines: [{ product_id: '', name: '', qty: 1, unit_cost: 0, unit_cost_eur: 0, total: 0 }],
  });
  const [recForm, setRecForm] = useState({ notes: '', invoice_id: '', lines: [] as any[] });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendOrder, setSendOrder] = useState<PurchaseOrder | null>(null);
  const [sendLang, setSendLang] = useState<'sv' | 'en'>('sv');
  const [sendEmailInput, setSendEmailInput] = useState('');
  const [sendingPdf, setSendingPdf] = useState(false);
  /* Double clic sur « Créer » / « Valider la réception » : deux commandes,
     ou deux entrées en stock. Les boutons se bloquent pendant l'envoi. */
  const [saving, setSaving] = useState(false);
  const [recSaving, setRecSaving] = useState(false);
  /* Téléphone : cartes au lieu des tableaux, actions secondaires dans « ⋯ ». */
  const mobile = useIsMobile();
  const [plus, setPlus] = useState(false);
  const plusRef = useRef<HTMLButtonElement>(null);
  /* Sur téléphone, les suggestions (souvent une douzaine de cartes) partent
     repliées : leur en-tête dit déjà combien de ruptures et de stocks
     faibles ; les commandes d'achat restent visibles sans défiler. */
  useEffect(() => { if (mobile) setShowSuggestions(false); }, [mobile]);

  const L = lang;
  const t = (key: keyof typeof T) => T[key][L] || T[key].fr;
  const t2 = (key: keyof typeof TAC) => traduire(TAC[key], L);
  const tc = (key: keyof typeof T_COMMON) => T_COMMON[key][L] || T_COMMON[key].fr;

  useEffect(() => {
    setLang(getAdminLang());
    return subscribeAdminLang(setLang);
  }, []);

  useEffect(() => { load(); loadSuppliers(); loadProducts(); loadSuggestions(); }, [filter]);

  async function loadSuggestions() {
    const res = await adminFetch('/api/purchase-suggestions');
    const data = await res.json();
    setSuggestions(data.suggestions || []);
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  async function load() {
    setLoading(true);
    const params = filter ? `?status=${filter}` : '';
    const res = await adminFetch('/api/purchase-orders' + params);
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }

  async function loadSuppliers() {
    const res = await adminFetch('/api/contacts?type=supplier');
    const data = await res.json();
    setSuppliers(data.contacts || []);
  }

  async function loadProducts() {
    const res = await adminFetch('/api/products');
    const data = await res.json();
    setProducts(data.products || []);
  }

  /** Reconvertit toutes les lignes au taux donné. */
  const reconvertir = (rate: number) => setForm(f => ({
    ...f,
    lines: f.lines.map(l => ({
      ...l,
      unit_cost_eur: parseFloat(((l.unit_cost || 0) * rate).toFixed(4)),
      total: parseFloat(((l.qty || 0) * (l.unit_cost || 0) * rate).toFixed(2)),
    })),
  }));

  async function fetchExchangeRate(curr = currency) {
    /* Retour à l'euro : les lignes gardaient leur conversion en couronnes
       — le champ affichait 29,90 € et la commande partait à 2,62 €. */
    if (curr === 'EUR') { setExchangeRate(1); reconvertir(1); return; }
    setFetchingRate(true);
    try {
      const res = await adminFetch(`/api/exchange-rate?from=${curr}&to=EUR&date=${paymentDate}`);
      const data = await res.json();
      const rate = data.rate;
      if (rate) {
        setExchangeRate(rate);
        reconvertir(rate);
        showToast(tauxDuJour(curr, rate, data.date, L));
      }
    } catch {
      showToast(t2('msgTauxKo'));
    }
    setFetchingRate(false);
  }

  function updateLine(i: number, field: string, val: any) {
    const nl = [...form.lines];
    nl[i] = { ...nl[i], [field]: val };
    if (field === 'product_id') {
      const p = products.find(x => x.id === val);
      if (p) nl[i].name = nomProduit(p, lang);
    }
    if (field === 'unit_cost' || field === 'qty') {
      if (!exchangeRate && currency !== 'EUR') {
        // rate not loaded yet — show warning in unit_cost_eur
        nl[i].unit_cost_eur = 0;
        nl[i].total = 0;
      } else {
        const rate = currency === 'EUR' ? 1 : (exchangeRate || 1);
        nl[i].unit_cost_eur = parseFloat(((nl[i].unit_cost || 0) * rate).toFixed(4));
        nl[i].total = parseFloat(((nl[i].qty || 0) * (nl[i].unit_cost || 0) * rate).toFixed(2));
      }
    }
    setForm(f => ({ ...f, lines: nl }));
  }

  const subtotalEur = form.lines.reduce((s, l) => s + (l.total || 0), 0);

  const formVide = () => ({
    status: 'draft', supplier_id: '', expected_date: '', notes: '',
    lines: [{ product_id: '', name: '', qty: 0, unit_cost: 0, unit_cost_eur: 0, total: 0 }],
  });
  /* Fermer une MODIFICATION vide le formulaire : sinon « Commander » sur
     une suggestion ajoutait sa ligne aux lignes de la commande rouverte,
     et créait une nouvelle commande qui les recopiait. Une saisie neuve
     fermée sans enregistrer, elle, reste en brouillon à l'écran. */
  const fermerSaisie = () => {
    if (editingOrder) setForm(formVide());
    setShowModal(false);
    setEditingOrder(null);
  };

  async function saveOrder() {
    if (saving) return;
    if (!form.supplier_id) { showToast('⚠️ ' + t('supplier')); return; }
    if (currency !== 'EUR' && !exchangeRate) { showToast(t2('msgTauxManquant')); return; }
    /* La ligne vide ajoutée d'office partait telle quelle : une ligne
       sans produit ni quantité dans la commande, comptée dans « Lignes ».
       Une ligne avec produit doit porter une quantité. */
    const lignes = form.lines.filter(l => l.product_id || (Number(l.qty) || 0) > 0 || (Number(l.unit_cost) || 0) > 0);
    if (!lignes.length) { showToast('⚠️ ' + t('linesTitle')); return; }
    if (lignes.some(l => !l.product_id || !((Number(l.qty) || 0) > 0))) {
      showToast('⚠️ ' + tc('product') + ' · ' + tc('qty')); return;
    }
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    const url = editingOrder ? `/api/purchase-orders/${editingOrder.id}` : '/api/purchase-orders';
    const method = editingOrder ? 'PUT' : 'POST';
    setSaving(true);
    try {
      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          supplier_name: supplier?.company || `${supplier?.first_name || ''} ${supplier?.last_name || ''}`.trim(),
          subtotal: Math.round(subtotalEur * 100) / 100,
          total: Math.round(subtotalEur * 100) / 100,
          currency,
          exchange_rate: exchangeRate,
          payment_date: currency !== 'EUR' ? paymentDate : undefined,
          /* `unit_cost` part en euros (le bon, la réception et le PMP le
             lisent ainsi). Le prix saisi dans la devise de la commande
             reste dans `unit_cost_devise` : sans lui, rouvrir une commande
             en SEK affichait les euros comme des couronnes, et la moindre
             retouche les reconvertissait (× 0,0876). */
          lines: lignes.map(l => ({
            ...l,
            unit_cost_devise: l.unit_cost,
            unit_cost: l.unit_cost_eur || l.unit_cost,
          })),
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); showToast('❌ ' + (e?.error || 'Erreur serveur')); return; }
      showToast(editingOrder ? '✅ Commande modifiée' : '✅ Commande créée');
      // Enregistrée : la prochaine saisie repart de zéro.
      setForm(formVide());
      setShowModal(false);
      setEditingOrder(null);
      load();
    } catch { showToast('❌ Erreur réseau'); }
    finally { setSaving(false); }
  }

  async function updateStatus(id: string, status: string) {
    /* Le toast annonçait le changement même quand l'API le refusait. */
    try {
      const res = await adminFetch(`/api/purchase-orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); showToast('❌ ' + (e?.error || 'Erreur serveur')); }
      else showToast('✅ ' + tc('status'));
    } catch { showToast('❌ Erreur réseau'); }
    load();
  }

  function openEdit(order: PurchaseOrder) {
    const devise = order.currency || 'EUR';
    const taux = Number(order.exchange_rate) || 0;
    const lines = (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines || [])
      .map((l: any) => {
        const eurU = Number(l.unit_cost_eur ?? l.unit_cost) || 0;
        /* Le champ de saisie est dans la devise de la commande. `unit_cost`
           est stocké en euros : on reprend le prix saisi (unit_cost_devise)
           ou, à défaut, on reconvertit l'euro au taux de la commande. */
        const enDevise = l.unit_cost_devise != null ? Number(l.unit_cost_devise) || 0
          : devise !== 'EUR' && taux > 0 ? Math.round((eurU / taux) * 100) / 100
          : Number(l.unit_cost) || 0;
        return {
          product_id: l.product_id || '',
          name: l.name || '',
          qty: l.qty || 0,
          unit_cost: enDevise,
          unit_cost_eur: eurU,
          total: l.total || 0,
        };
      });
    setForm({
      status: order.status || 'draft',
      supplier_id: order.supplier_id || '',
      expected_date: order.expected_date || '',
      notes: order.notes || '',
      lines: lines.length > 0 ? lines : [{ product_id: '', name: '', qty: 0, unit_cost: 0, unit_cost_eur: 0, total: 0 }],
    });
    setCurrency(order.currency || 'EUR');
    setExchangeRate(order.exchange_rate ?? (order.currency === 'EUR' || !order.currency ? 1 : null));
    setPaymentDate(order.payment_date || new Date().toISOString().slice(0, 10));
    setEditingOrder(order);
    setShowModal(true);
  }

  async function openReception(order: PurchaseOrder) {
    setSelected(order);
    /* Pré-rempli avec le RELIQUAT, pas avec la quantité commandée : sur
       une commande partielle, valider sans retoucher faisait entrer une
       seconde fois ce qui était déjà en rayon. `received_qty` d'une ligne
       de commande = cumul déjà reçu (tenu par le serveur) ; dans la ligne
       de réception, il devient la quantité reçue cette fois-ci. */
    const lines = (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines || [])
      .map((l: any) => {
        const deja = Math.max(0, Number(l.received_qty) || 0);
        return { ...l, deja_recu: deja, received_qty: Math.max(0, (Number(l.qty) || 0) - deja) };
      });
    setRecForm({ notes: '', invoice_id: '', lines });
    setShowReception(true);
  }

  function openSendModal(order: PurchaseOrder) {
    const sup = order.contacts as any;
    setSendOrder(order);
    setSendEmailInput(sup?.email || '');
    setSendLang('sv');
    setShowSendModal(true);
  }

  async function downloadPdf(order: PurchaseOrder, lang: 'sv' | 'en') {
    const token = localStorage.getItem('sd_admin_token') || '';
    showToast(t2('msgPdfGen'));
    try {
      const res = await adminFetch(`/api/purchase-orders/${order.id}/pdf?lang=${lang}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { showToast(t2('msgPdfGenKo')); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `purchase-order-${order.number}-${lang}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t2('msgPdfOk'));
    } catch {
      showToast(t2('msgPdfKo'));
    }
  }

  async function sendPdf() {
    if (!sendOrder) return;
    setSendingPdf(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await adminFetch(`/api/purchase-orders/${sendOrder.id}/send-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: sendEmailInput, lang: sendLang }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(t2('msgMailOk'));
        setShowSendModal(false);
      } else {
        showToast('❌ ' + (data.error || 'Erreur envoi'));
      }
    } catch {
      showToast(t2('msgMailKo'));
    } finally {
      setSendingPdf(false);
    }
  }

  async function saveReception() {
    if (!selected || recSaving) return;
    if (!recForm.lines.some((l: any) => (Number(l.received_qty) || 0) > 0)) {
      showToast('⚠️ ' + t('receivedQty') + ' = 0'); return;
    }
    setRecSaving(true);
    try {
      const res = await adminFetch('/api/receptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recForm, purchase_order_id: selected.id, supplier_id: selected.supplier_id, supplier_name: selected.supplier_name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast('❌ ' + (d?.error || 'Erreur serveur')); return; }
      /* Le serveur dit si la commande est soldée ou s'il reste un reliquat,
         et si une ligne n'a pas pu entrer en stock. */
      const statut = d.statut_commande ? ` · ${(STATUSES as any)[d.statut_commande]?.[L] || d.statut_commande}` : '';
      showToast(d.warning ? '⚠️ ' + d.warning : '✅ ' + (d.reception?.number || tc('save')) + statut);
      setShowReception(false);
      load();
    } catch { showToast('❌ Erreur réseau'); }
    finally { setRecSaving(false); }
  }

  const totalOrders = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const pendingCount = orders.filter(o => ['draft', 'sent', 'confirmed', 'partial'].includes(o.status)).length;
  /* Réceptionnable : une commande envoyée au magasin (statut posé
     automatiquement après l'envoi du bon) l'est autant qu'une commande
     confirmée — il fallait la repasser à la main en « Confirmée » pour
     voir apparaître le bouton. */
  const receptionnable = (o: PurchaseOrder) => ['sent', 'confirmed', 'partial'].includes(o.status);

  const css = `
    /* Achats — classes historiques remappees sur les tokens du nouveau
       design. Seules les modales et le panneau de suggestions les
       utilisent encore ; la liste est deja en primitives .sc-*. */

    .card { background:#fff; border:1px solid ${TH.border}; border-radius:10px; overflow:hidden; margin-bottom:12px; }
    .card-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 15px; border-bottom:1px solid ${TH.border}; }
    .card-title { font-size:12.5px; font-weight:600; color:${TH.ink}; }
    .card-body { padding:13px 15px; }

    .btn { display:inline-flex; align-items:center; gap:6px; border-radius:7px; padding:8px 14px; font-size:12.5px; font-weight:500; cursor:pointer; border:1px solid ${TH.borderField}; background:#fff; color:#3A3228; text-decoration:none; transition:background .12s; }
    .btn:hover { background:#F7F4EF; }
    .btn-primary { background:${TH.ink}; color:#fff; border-color:${TH.ink}; }
    .btn-primary:hover { background:${TH.inkHover}; }
    .btn-secondary { background:#fff; }
    .btn-info { background:#EFF6FF; color:#1D4ED8; border-color:#BFDBFE; }
    .btn-warning { background:#FDF6EA; color:#8A5B08; border-color:#E8CFA8; }
    .btn-danger { background:#fff; color:${TH.red}; border-color:#EBD5D1; }
    .btn-ghost { background:transparent; }
    .btn-sm { padding:5px 10px; font-size:11.5px; }

    .form-group { margin-bottom:12px; }
    .form-label { display:block; font-size:11px; font-weight:600; color:${TH.text2b}; margin-bottom:5px; }
    .form-control { width:100%; height:34px; border:1px solid ${TH.borderField}; border-radius:7px; padding:0 10px; font-size:12.5px; color:${TH.ink}; background:#fff; outline:none; transition:border-color .12s; }
    .form-control:focus { border-color:var(--accent); }
    textarea.form-control { height:auto; padding:8px 10px; line-height:1.5; }
    .form-hint { font-size:10.5px; color:${TH.muted}; margin-top:4px; }
    .req { color:${TH.red}; }

    .badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; letter-spacing:.3px; white-space:nowrap; }
    .mono { font-variant-numeric:tabular-nums; }
    .empty { padding:44px 20px; text-align:center; color:${TH.muted}; font-size:12.5px; }
    .toast { position:fixed; bottom:24px; right:24px; background:${TH.ink}; color:#fff; padding:10px 18px; border-radius:7px; font-size:12.5px; z-index:300; }

    .modal-overlay, .pg-modal-overlay { position:fixed; inset:0; background:rgba(21,24,30,.45); backdrop-filter:blur(2px); z-index:200; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto; }
    .modal, .pg-modal { background:#fff; border:1px solid ${TH.border}; border-radius:10px; width:100%; max-width:680px; margin:auto; box-shadow:0 20px 60px rgba(0,0,0,.2); }
    .modal-header { padding:14px 18px; border-bottom:1px solid ${TH.border}; display:flex; align-items:center; justify-content:space-between; }
    .modal-title { font-size:14px; font-weight:600; color:${TH.ink}; }
    .modal-body { padding:18px; max-height:74vh; overflow-y:auto; }
    .modal-footer { padding:13px 18px; border-top:1px solid ${TH.border}; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }

    .a-wrap { }
    .a-table { width:100%; border-collapse:collapse; background:#fff; font-size:12.5px; }
    .a-table th { padding:8px 14px; text-align:left; font-size:9px; font-weight:600; letter-spacing:1.3px; text-transform:uppercase; color:${TH.muted}; background:${TH.surfaceAlt}; border-bottom:1px solid ${TH.border}; }
    .a-table td { padding:7px 14px; border-bottom:1px solid ${TH.borderFaint}; color:${TH.text2b}; }
    .a-select { height:34px; border:1px solid ${TH.borderField}; border-radius:7px; padding:0 10px; font-size:12.5px; background:#fff; outline:none; }
    .a-select:focus { border-color:var(--accent); }
    .sugg-panel { background:#fff; border:1px solid ${TH.border}; border-radius:10px; overflow:hidden; margin-bottom:12px; }
    .sugg-header { display:flex; align-items:center; justify-content:space-between; padding:12px 15px; cursor:pointer; background:#FFF7ED; }
    .sugg-title { display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600; color:${TH.ink}; }
    .sugg-table { width:100%; border-collapse:collapse; font-size:12.5px; }
    .sugg-table th { padding:8px 14px; text-align:left; font-size:9px; font-weight:600; letter-spacing:1.3px; text-transform:uppercase; color:${TH.muted}; background:${TH.surfaceAlt}; border-bottom:1px solid ${TH.border}; }
    .sugg-table td { padding:7px 14px; border-bottom:1px solid ${TH.borderFaint}; }
    .urgency-rupture { display:inline-flex; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; background:#FBE7E4; color:#B03A2E; }
    .urgency-faible { display:inline-flex; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; background:#FCF1E4; color:#A6501F; }
    .urgency-attention { display:inline-flex; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; background:#E6EDF6; color:#1C4E80; }
    .lang-toggle { display:flex; gap:4px; }
    .lang-btn { padding:4px 10px; font-size:11px; border:1px solid ${TH.borderField}; border-radius:6px; cursor:pointer; background:#fff; }
    .lang-btn.active { background:${TH.ink}; color:#fff; border-color:${TH.ink}; }

    .ac-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(178px,1fr)); gap:10px; margin-bottom:12px; }
    .sc-actions > .ac-plus { flex:0 0 48px; width:48px; padding:0; justify-content:center; }

    /* ═══ Fenêtres « Saisie manuelle » et « Réception » ═════════
       Primitives du shell (.sc-modal, .sc-input, .sc-label, .sc-grid-*,
       .sc-table). Elles reposaient sur des classes jamais définies sur
       ordinateur (grid-2, lines-table, lines-input…) : champs nus du
       navigateur, tableau sans style. Les règles téléphone suivent. */
    @media (min-width:900px) { .sc-modal.ac-modal-l { max-width:780px; } }
    .ac-modal-titre { font-size:15px; font-weight:700; color:${TH.ink}; min-width:0; }
    .ac-bloc { margin-bottom:14px; }
    .ac-section { font-size:10px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:${TH.muted}; margin-bottom:8px; }
    .ac-devise { border:1px solid ${TH.border}; border-radius:10px; padding:12px 14px; margin-bottom:14px; background:${TH.surfaceAlt}; }
    .ac-devise-titre { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:${TH.blue}; margin-bottom:10px; }
    .ac-devise-titre .ms { font-size:16px; }
    .ac-devise-act { display:flex; align-items:flex-end; }
    .ac-devise-act .sc-btn { width:100%; justify-content:center; height:34px; }
    .ac-devise-info { font-size:12px; color:${TH.muted}; padding-bottom:9px; }
    .ac-taux { font-size:12px; margin-top:10px; color:${TH.green}; }
    .ac-lignes-wrap { border:1px solid ${TH.border}; border-radius:8px; overflow:hidden; }
    .ac-lignes td { vertical-align:middle; }
    .ac-lignes .sc-input { height:32px; }
    .ac-lignes .ac-num { text-align:right; white-space:nowrap; }
    .ac-lignes .ac-retirer { width:44px; text-align:right; }
    .ac-ajout { margin-top:8px; }
    .ac-total { display:flex; justify-content:space-between; align-items:baseline; padding:12px 0; margin-bottom:12px; border-top:1px solid ${TH.border}; font-size:13px; font-weight:600; color:${TH.ink}; }
    .ac-total .sc-num { font-size:18px; font-weight:700; }
    .ac-avert { background:#FDF6EA; border:1px solid #E8CFA8; border-radius:8px; padding:10px 13px; margin-bottom:14px; font-size:12.5px; color:#8A5B08; line-height:1.5; }

    /* ═══ Téléphone ═══════════════════════════════════════════
       Liste : cartes (commandes, suggestions) au lieu de tableaux de
       760–800 px. Fenêtres : plein écran, en-tête et pied collés, champs
       à 44 px / 16 px, lignes de commande en cartes. */
    @media (max-width: 899px) {
      .ac-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
      .ac-kpi { padding:10px 12px !important; }
      .ac-kpi-l { font-size:12px !important; letter-spacing:.8px !important; }
      .ac-kpi-v { font-size:20px !important; margin-top:3px !important; }
      .ac-statuts { margin-bottom:12px; }

      .ac-item { padding:12px 14px; border-bottom:1px solid ${TH.border}; }
      .ac-item:last-child { border-bottom:none; }
      .ac-item-l1 { display:flex; align-items:center; gap:8px; }
      .ac-item-num { font-size:15px; font-weight:700; color:${TH.ink}; }
      .ac-item-sub { font-size:13px; color:${TH.text2b}; margin-top:4px; }
      .ac-item-acts { display:flex; align-items:center; gap:6px; margin-top:10px; }
      .ac-item-acts .sc-select { flex:1; min-width:0; }
      .ac-item-acts .sc-iconbtn { border:1px solid ${TH.borderField}; background:#fff; text-decoration:none; }

      .modal-overlay, .pg-modal-overlay { padding:0; align-items:stretch; backdrop-filter:none; }
      .modal, .pg-modal { max-width:none !important; margin:0; border:none; border-radius:0; min-height:100%; display:flex; flex-direction:column; }
      .modal-header { position:sticky; top:0; z-index:2; background:#fff; padding:8px 8px 8px 16px; }
      .modal-header .btn { width:44px; height:44px; justify-content:center; padding:0; font-size:16px; }
      .modal-title { font-size:16px; }
      .modal-body { max-height:none; flex:1; overflow:visible; padding:16px; }
      .modal-footer { position:sticky; bottom:0; background:#fff; padding:10px 12px calc(10px + env(safe-area-inset-bottom)); box-shadow:0 -6px 18px rgba(21,24,30,.06); }
      .modal-footer > .btn { flex:1 1 0; justify-content:center; }
      .modal-footer > div { flex:1 1 100%; }
      .modal-footer > div > .btn { flex:1 1 0; justify-content:center; }
      .btn { min-height:44px; font-size:14px; padding:10px 14px; }
      .btn-sm { font-size:13.5px; }
      .form-label { font-size:12.5px; }
      .form-control { height:44px; font-size:16px; }
      textarea.form-control { height:auto; }
      .form-hint { font-size:12px; }
      /* Lignes des fenêtres de saisie et de réception : une carte par
         ligne, produit sur toute la largeur, chiffres deux par deux. */
      .ac-lignes-wrap { border:none; border-radius:0; }
      .ac-lignes, .ac-lignes tbody { display:block; width:100%; }
      .ac-lignes thead { display:none; }
      .ac-lignes tr { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding:12px 0; border-bottom:1px solid ${TH.border}; align-items:end; }
      .ac-lignes td { display:block; padding:0 !important; min-width:0; font-size:14px; border:none; }
      .ac-lignes td:first-child { grid-column:1 / -1; }
      .ac-lignes td[data-label]::before { content:attr(data-label); display:block; font-size:11px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; color:${TH.muted}; margin-bottom:4px; }
      .ac-lignes .ac-num { text-align:left; }
      .ac-lignes td.ac-retirer { grid-column:1 / -1; justify-self:end; width:auto; }
      .ac-lignes td.ac-retirer button { min-height:44px; padding:0 12px !important; font-size:14px; }
      .ac-lignes .sc-input { height:44px; }
      .ac-lignes tbody tr:hover td { background:none; }
      .ac-devise { padding:12px; }
      .ac-devise-act .sc-btn { height:44px; }
      .ac-devise-info { padding-bottom:0; font-size:13px; }
      .ac-taux { font-size:13px; }
      .ac-total { font-size:15px; }
      .ac-modal-l .sc-modal-foot > .sc-btn { flex:1 1 0; justify-content:center; }
    }
  `;

  /* ═══════════════════════════════════════════════════════════════
     ÉCRAN 7 — COMMANDES D'ACHAT
     Handoff §7 : 4 KPI puis table N° · Fournisseur · Émise le ·
     Lignes · Total HT · Statut · Réception.
     Le panneau de suggestions de réappro est propre à ce back-office
     et conservé : c'est lui qui déclenche les commandes.
     ═══════════════════════════════════════════════════════════════ */

  const receivedCount = orders.filter(o => o.status === 'received').length;
  const avgDelay = (() => {
    const done = orders.filter(o => o.status === 'received' && o.expected_date && o.created_at);
    if (!done.length) return null;
    const days = done.map(o => Math.max(0, Math.round(
      (+new Date(o.expected_date!) - +new Date(o.created_at!)) / 86400000)));
    return Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10;
  })();
  const linesCount = (o: any) => {
    try { const l = typeof o.lines === 'string' ? JSON.parse(o.lines) : (o.lines || []); return l.length; }
    catch { return 0; }
  };

  const A_KPIS = [
    { label: t('inProgress'),   value: String(pendingCount),   tone: BADGE.amber },
    { label: t('totalEngaged'), value: fmt(totalOrders),       tone: null },
    { label: 'Délai moyen',     value: avgDelay != null ? `${avgDelay} j` : '—', tone: null },
    { label: 'Suggestions',     value: String(suggestions.length), tone: suggestions.length ? BADGE.orange : null },
  ];

  const ouvrirSaisieManuelle = () => {
    setForm(formVide());
    setCurrency('EUR'); setExchangeRate(null); setPaymentDate(new Date().toISOString().slice(0, 10));
    setEditingOrder(null); setShowModal(true);
  };

  /** Ajoute une suggestion de réappro à une commande manuelle (même geste
   *  que le bouton « Commander » du tableau). */
  const commanderSuggestion = (s: any) => {
    setForm(f => ({
      ...f,
      lines: [...f.lines.filter(l => l.product_id), {
        product_id: s.id,
        name: s.name_fr,
        qty: s.suggested > 0 ? s.suggested : 10,
        unit_cost: s.cost_price || 0,
        unit_cost_eur: s.cost_price || 0,
        total: (s.suggested > 0 ? s.suggested : 10) * (s.cost_price || 0),
      }],
    }));
    setCurrency('EUR'); setExchangeRate(1);
    setEditingOrder(null); setShowModal(true);
  };

  const nomFournisseur = (o: PurchaseOrder) => {
    const sup = o.contacts;
    return sup?.company || `${sup?.first_name || ''} ${sup?.last_name || ''}`.trim() || o.supplier_name || '—';
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="sc-head">
        <div>
          <div className="sc-title">{t('title')}</div>
          <div className="sc-sub">
            {orders.length} commande(s) d’achat · {receivedCount} reçue(s)
          </div>
        </div>
        {mobile ? (
          /* Téléphone : l'action principale + « ⋯ » ; le filtre de statut
             passe en rangée de puces sous les indicateurs. */
          <div className="sc-actions">
            <Link href="/admin/achats/nouvelle" className="sc-btn sc-btn-primary">
              <span className="ms">auto_awesome</span>{t('newBtn')}
            </Link>
            <button ref={plusRef} className="sc-btn sc-btn-secondary ac-plus" aria-label={t2('plusActions')}
                    aria-haspopup="menu" aria-expanded={plus} onClick={() => setPlus(v => !v)}>
              <span className="ms">more_horiz</span>
            </button>
            <MenuActions open={plus} anchor={plusRef.current} onClose={() => setPlus(false)}>
              <MenuItem icon="edit_note" label={t2('saisieManuelle')} onClick={ouvrirSaisieManuelle} />
              <MenuItem icon="inventory_2" label={t2('conditionnements')} hint={t2('conditionnementsTitre')} href="/admin/achats/conditionnements" />
              <MenuItem icon="receipt_long" label={t2('saisieTicket')} href="/admin/achats/ticket" />
              <MenuSep />
              <div className="sc-menu-row">
                <span style={{ fontSize: 13, color: TH.muted, marginRight: 4 }}>{t2('langueEcran')}</span>
                {(['fr', 'en', 'sv'] as AdminLang[]).map(l => (
                  <button key={l} className={`sc-chip${lang === l ? ' on' : ''}`} aria-pressed={lang === l}
                          onClick={() => { setLang(l); setAdminLang(l); }}>{l.toUpperCase()}</button>
                ))}
              </div>
            </MenuActions>
          </div>
        ) : (
        <div className="sc-actions">
          <div style={{ display: 'flex', gap: 4 }}>
            {(['fr', 'en', 'sv'] as AdminLang[]).map(l => (
              <button key={l} className={`sc-chip${lang === l ? ' on' : ''}`}
                      style={{ height: 32, padding: '0 10px', fontSize: 11 }}
                      onClick={() => { setLang(l); setAdminLang(l); }}>{l.toUpperCase()}</button>
            ))}
          </div>
          <select className="sc-input sc-select" style={{ width: 160, height: 32 }}
                  value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">{t('allStatuses')}</option>
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{(v as any)[L] || (v as any).fr}</option>)}
          </select>
          <Link className="sc-btn" href="/admin/achats/conditionnements" title={t2('conditionnementsTitre')}>
            <span className="ms">inventory_2</span>{t2('conditionnements')}
          </Link>
          {/* La saisie manuelle reste accessible : elle sert aux cas que
              le réappro ne couvre pas, et c'est le seul chemin d'édition
              d'une commande existante. */}
          <button className="sc-btn" onClick={ouvrirSaisieManuelle}>
            <span className="ms">edit_note</span>{t2('saisieManuelle')}
          </button>
          <Link href="/admin/achats/nouvelle" className="sc-btn sc-btn-primary">
            <span className="ms">auto_awesome</span>{t('newBtn')}
          </Link>
        </div>
        )}
      </div>

      {/* KPI */}
      <div className="ac-kpis">
        {A_KPIS.map(k => (
          <div key={k.label} className="sc-card ac-kpi" style={{ padding: '13px 15px' }}>
            <div className="ac-kpi-l" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: k.tone ? k.tone.fg : TH.muted }}>
              {k.label}
            </div>
            <div className="sc-num ac-kpi-v" style={{ fontSize: 23, fontWeight: 700, marginTop: 5, color: k.tone ? k.tone.fg : TH.ink }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Téléphone : filtre de statut en puces (le menu déroulant reste sur ordinateur) */}
      {mobile && (
        <div className="sc-filters ac-statuts">
          <button className={`sc-chip${filter === '' ? ' on' : ''}`} aria-pressed={filter === ''} onClick={() => setFilter('')}>{t('allStatuses')}</button>
          {Object.entries(STATUSES).map(([k, v]) => (
            <button key={k} className={`sc-chip${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {(v as any)[L] || (v as any).fr}
            </button>
          ))}
        </div>
      )}

      {/* Suggestions de réappro */}
      {suggestions.length > 0 && (
        <div className="sc-card" style={{ marginBottom: 12, overflow: 'hidden' }}>
          <button onClick={() => setShowSuggestions(s => !s)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '12px 15px', border: 'none', background: '#FFF7ED', cursor: 'pointer', textAlign: 'left' }}>
            <span className="ms" style={{ fontSize: 18, color: BADGE.orange.fg }}>trending_up</span>
            <span className="sc-card-title">{t2('suggestions')}</span>
            <span className="sc-badge" style={{ background: BADGE.red.bg, color: BADGE.red.fg }}>
              {suggestions.filter(s => s.urgency === 'rupture').length} rupture(s)
            </span>
            <span className="sc-badge" style={{ background: BADGE.orange.bg, color: BADGE.orange.fg }}>
              {suggestions.filter(s => s.urgency === 'faible').length} faible(s)
            </span>
            <span style={{ flex: 1 }} />
            <span className="ms" style={{ fontSize: 18, color: TH.muted }}>{showSuggestions ? 'expand_less' : 'expand_more'}</span>
          </button>

          {showSuggestions && mobile && (
            <div>
              {suggestions.map(s => {
                const tone = s.urgency === 'rupture' ? BADGE.red
                  : s.urgency === 'faible' ? BADGE.orange : BADGE.blue;
                const label = s.urgency === 'rupture' ? 'Rupture'
                  : s.urgency === 'faible' ? 'Faible' : 'Attention';
                return (
                  <div key={s.id} className="ac-item">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: TH.ink, lineHeight: 1.35 }}>{nomProduit(s, lang)}</span>
                      <span className="sc-badge" style={{ background: tone.bg, color: tone.fg }}>{label}</span>
                    </div>
                    <div className="ac-item-sub sc-num">
                      {tc('stock')}{' '}
                      <b style={{ color: s.stock <= 0 ? TH.red : s.stock <= (s.stock_alert ?? 5) ? '#C97A2B' : TH.ink }}>{s.stock}</b>
                      {s.onOrder > 0 && <span style={{ color: TH.blue }}> · +{s.onOrder} {t2('enCommande')}</span>}
                      {' · '}{t2('ventes90')} {s.sold30}
                      {' · '}{s.velocity > 0 ? `${s.velocity.toFixed(2)}/j` : '—'}
                      {' · '}{t2('autonomie')}{' '}
                      <span style={{ color: s.daysLeft <= 14 ? TH.red : undefined }}>
                        {s.velocity > 0 ? (s.daysLeft >= 999 ? '∞' : `${s.daysLeft} j`) : '—'}
                      </span>
                    </div>
                    <div className="ac-item-acts">
                      <span className="sc-num" style={{ flex: 1, fontSize: 18, fontWeight: 700, color: TH.green }}>
                        {s.suggested > 0 ? `+${s.suggested}` : '—'}
                      </span>
                      <button className="sc-btn sc-btn-secondary" onClick={() => commanderSuggestion(s)}>
                        <span className="ms">add</span>{t2('commander')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showSuggestions && !mobile && (
            <div style={{ overflowX: 'auto' }}>
              <table className="sc-table" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th>{tc('product')}</th>
                    <th style={{ width: 110 }}>{t2('urgence')}</th>
                    <th className="sc-right" style={{ width: 100 }}>{tc('stock')}</th>
                    <th className="sc-right" style={{ width: 90 }}>{t2('ventes90')}</th>
                    <th className="sc-right" style={{ width: 90 }}>{t2('parJour')}</th>
                    <th className="sc-right" style={{ width: 90 }}>{t2('autonomie')}</th>
                    <th className="sc-right" style={{ width: 90 }}>Qté</th>
                    <th style={{ width: 110 }} />
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map(s => {
                    const tone = s.urgency === 'rupture' ? BADGE.red
                      : s.urgency === 'faible' ? BADGE.orange : BADGE.blue;
                    const label = s.urgency === 'rupture' ? 'Rupture'
                      : s.urgency === 'faible' ? 'Faible' : 'Attention';
                    return (
                      <tr key={s.id}>
                        <td style={{ fontSize: 13, fontWeight: 500, color: TH.ink }}>{nomProduit(s, lang)}</td>
                        <td><span className="sc-badge" style={{ background: tone.bg, color: tone.fg }}>{label}</span></td>
                        <td className="sc-num sc-right" style={{
                          fontWeight: 600,
                          color: s.stock <= 0 ? TH.red : s.stock <= (s.stock_alert ?? 5) ? '#C97A2B' : TH.ink,
                        }}>
                          {s.stock}
                          {s.onOrder > 0 && <div style={{ fontSize: 10, color: TH.blue, fontWeight: 500 }}>+{s.onOrder} en commande</div>}
                        </td>
                        <td className="sc-num sc-right">{s.sold30}</td>
                        <td className="sc-num sc-right" style={{ color: TH.muted }}>{s.velocity > 0 ? s.velocity.toFixed(2) : '—'}</td>
                        <td className="sc-num sc-right" style={{ color: s.daysLeft <= 14 ? TH.red : TH.muted }}>
                          {s.velocity > 0 ? (s.daysLeft >= 999 ? '∞' : `${s.daysLeft} j`) : '—'}
                        </td>
                        <td className="sc-num sc-right" style={{ fontWeight: 700, color: TH.green }}>
                          {s.suggested > 0 ? `+${s.suggested}` : '—'}
                        </td>
                        <td>
                          <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => commanderSuggestion(s)}>
                            <span className="ms" style={{ fontSize: 15 }}>add</span>{t2('commander')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Téléphone : une carte par commande d'achat */}
      {mobile && (
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          {loading && <SqueletteTable lignes={6} colonnes={3} entete={false} />}
          {!loading && orders.length === 0 && <div className="sc-empty">{tc('noData')}</div>}
          {!loading && orders.map(o => {
            const st: any = STATUSES[o.status as keyof typeof STATUSES] || { color: '#6A7280', fr: o.status };
            return (
              <div key={o.id} className="ac-item">
                <div className="ac-item-l1">
                  <span className="sc-num ac-item-num">{o.number}</span>
                  <span className="sc-badge" style={{ background: st.color + '20', color: st.color }}>{st[L] || st.fr}</span>
                  <span style={{ flex: 1 }} />
                  <span className="sc-num" style={{ fontSize: 15, fontWeight: 700, color: TH.ink }}>{fmt(o.total)}</span>
                </div>
                <div className="ac-item-sub">
                  {nomFournisseur(o)} · {linesCount(o)} {t2('lignes').toLowerCase()} · {t2('attendue')} {fmtDate(o.expected_date)}
                  {o.currency && o.currency !== 'EUR' && (
                    <span style={{ color: TH.blue }}> · {o.currency}{o.exchange_rate ? ` × ${o.exchange_rate}` : ''}</span>
                  )}
                </div>
                <div className="ac-item-acts">
                  <select className="sc-input sc-select" aria-label={tc('status')}
                          value={o.status} onChange={e => updateStatus(o.id, e.target.value)}>
                    {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{(v as any)[L] || (v as any).fr}</option>)}
                  </select>
                  {o.supplier_id ? (
                    <Link className="sc-iconbtn" href={`/admin/achats/nouvelle?id=${o.id}`} aria-label={t('editTitle')}>
                      <span className="ms">edit</span>
                    </Link>
                  ) : (
                    <button className="sc-iconbtn" onClick={() => openEdit(o)} aria-label={t('editTitle')}>
                      <span className="ms">edit</span>
                    </button>
                  )}
                  <a className="sc-iconbtn" href={`/admin/documents/bon-de-commande/${o.id}`} target="_blank" rel="noopener" aria-label={t2('bonA4')}>
                    <span className="ms">print</span>
                  </a>
                  <button className="sc-iconbtn" onClick={() => openSendModal(o)} aria-label={t2('pdfEnvoyer')}>
                    <span className="ms">send</span>
                  </button>
                </div>
                {receptionnable(o) && (
                  <button className="sc-btn sc-btn-green" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                          onClick={() => openReception(o)}>
                    <span className="ms">local_shipping</span>{t('reception').replace('📬 ', '')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Table des commandes d'achat */}
      {!mobile && (
      <div className="sc-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="sc-table" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>{t('colNum')}</th>
                <th>{t('colSupplier')}</th>
                <th style={{ width: 110 }}>{t('colExpected')}</th>
                <th className="sc-right" style={{ width: 70 }}>{t2('lignes')}</th>
                <th className="sc-right" style={{ width: 110 }}>{t('colTotal')}</th>
                <th style={{ width: 130 }}>{tc('status')}</th>
                <th style={{ width: 210 }}>{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ padding: 0 }}><SqueletteTable lignes={6} colonnes={5} vignette entete={false} /></td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={7}><div className="sc-empty">{tc('noData')}</div></td></tr>}
              {!loading && orders.map(o => {
                const st: any = STATUSES[o.status as keyof typeof STATUSES] || { color: '#6A7280', fr: o.status };
                const sup = o.contacts;
                const name = sup?.company || `${sup?.first_name || ''} ${sup?.last_name || ''}`.trim() || o.supplier_name || '—';
                return (
                  <tr key={o.id}>
                    <td className="sc-num" style={{ fontSize: 12, fontWeight: 600, color: TH.ink }}>
                      {o.number}
                      {o.currency && o.currency !== 'EUR' && (
                        <div style={{ fontSize: 10, color: TH.blue, fontWeight: 400 }}>
                          {o.currency}{o.exchange_rate ? ` × ${o.exchange_rate}` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={thumbStyle(name, 26)}>{initials(name)}</div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: TH.ink }}>{name}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 11.5, color: TH.muted }}>{fmtDate(o.expected_date)}</td>
                    <td className="sc-num sc-right">{linesCount(o)}</td>
                    <td className="sc-num sc-right" style={{ fontWeight: 600 }}>{fmt(o.total)}</td>
                    <td>
                      <span className="sc-badge" style={{ background: st.color + '20', color: st.color }}>
                        {st[L] || st.fr}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select className="sc-input sc-select" style={{ height: 26, width: 108, fontSize: 11, padding: '0 6px' }}
                                value={o.status} onChange={e => updateStatus(o.id, e.target.value)}>
                          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{(v as any)[L] || (v as any).fr}</option>)}
                        </select>
                        <a className="sc-iconbtn" href={`/admin/documents/bon-de-commande/${o.id}`} target="_blank" rel="noopener" title={t2('bonA4')}>
                          <span className="ms">print</span>
                        </a>
                        {/* On modifie là où l'on voit la couverture et les
                            ruptures. Sans magasin rattaché, l'écran de
                            composition n'a rien à afficher : la saisie
                            manuelle reste le seul recours. */}
                        {o.supplier_id ? (
                          <Link className="sc-iconbtn" href={`/admin/achats/nouvelle?id=${o.id}`} title={t('editTitle')}>
                            <span className="ms">edit</span>
                          </Link>
                        ) : (
                          <button className="sc-iconbtn" onClick={() => openEdit(o)} title={t('editTitle')}>
                            <span className="ms">edit</span>
                          </button>
                        )}
                        <button className="sc-iconbtn" onClick={() => openSendModal(o)} title={t2('pdfEnvoyer')}>
                          <span className="ms">send</span>
                        </button>
                        {receptionnable(o) && (
                          <button className="sc-btn sc-btn-secondary" style={{ padding: '4px 9px', fontSize: 11 }}
                                  onClick={() => openReception(o)}>
                            <span className="ms" style={{ fontSize: 15 }}>local_shipping</span>{t('reception')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

        {showModal && (
          /* Saisie manuelle : primitives du shell, fenêtre centrée sur
             ordinateur, plein écran sur téléphone (.sc-modal). */
          <div className="sc-modal-back" onClick={e => { if (e.target === e.currentTarget) fermerSaisie(); }}>
            <div className="sc-modal ac-modal-l" role="dialog" aria-modal="true" aria-labelledby="ac-saisie-titre">
              <div className="sc-modal-head">
                <div id="ac-saisie-titre" className="ac-modal-titre">{editingOrder ? `${t('editTitle')} — ${editingOrder.number}` : t('newTitle')}</div>
                <button type="button" className="sc-iconbtn" onClick={fermerSaisie} aria-label={tc('close')}>
                  <span className="ms">close</span>
                </button>
              </div>
              <div className="sc-modal-body">
                <div className="sc-grid-2 ac-bloc">
                  <div>
                    <label className="sc-label" htmlFor="ac-fournisseur">{t('supplier')}</label>
                    <select id="ac-fournisseur" className="sc-input sc-select" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                      <option value="">{t('chooseSupplier')}</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.company || `${s.first_name || ''} ${s.last_name || ''}`.trim()}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="sc-label" htmlFor="ac-attendue">{t('expectedDate')}</label>
                    <input id="ac-attendue" type="date" className="sc-input" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
                  </div>
                </div>
                {editingOrder && (
                  <div className="ac-bloc">
                    <label className="sc-label" htmlFor="ac-statut">{tc('status')}</label>
                    <select id="ac-statut" className="sc-input sc-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v[L] || v.fr}</option>)}
                    </select>
                  </div>
                )}

                {/* Devise et conversion */}
                <div className="ac-devise">
                  <div className="ac-devise-titre"><span className="ms">currency_exchange</span>{t('currency')}</div>
                  <div className="sc-grid-3">
                    <div>
                      <label className="sc-label" htmlFor="ac-devise">{t('currency')}</label>
                      <select id="ac-devise" className="sc-input sc-select" value={currency} onChange={e => { const c = e.target.value; setCurrency(c); setExchangeRate(null); fetchExchangeRate(c); }}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sc-label" htmlFor="ac-paiement">{t('paymentDate')}</label>
                      <input id="ac-paiement" type="date" className="sc-input" value={paymentDate} onChange={e => { setPaymentDate(e.target.value); if (currency !== 'EUR') { setExchangeRate(null); fetchExchangeRate(currency); } }} />
                    </div>
                    <div className="ac-devise-act">
                      {currency !== 'EUR' ? (
                        <button type="button" className="sc-btn sc-btn-secondary" onClick={() => fetchExchangeRate()} disabled={fetchingRate}>
                          {fetchingRate ? t('converting') : exchangeRate ? `↻ 1 ${currency} = ${exchangeRate} EUR` : t('convertBtn')}
                        </button>
                      ) : (
                        <div className="ac-devise-info">EUR natif — aucune conversion</div>
                      )}
                    </div>
                  </div>
                  {exchangeRate && currency !== 'EUR' && (
                    <div className="ac-taux">
                      {t('rateInfo')} {paymentDate} : 1 {currency} = <strong>{exchangeRate} EUR</strong>
                    </div>
                  )}
                </div>

                {/* Lignes */}
                <div className="ac-bloc">
                  <div className="ac-section">{t('linesTitle')}</div>
                  <div className="ac-lignes-wrap">
                    <table className="sc-table ac-lignes">
                      <thead>
                        <tr>
                          <th>{tc('product')}</th>
                          <th style={{ width: 84 }}>{tc('qty')}</th>
                          <th style={{ width: 120 }}>{currency !== 'EUR' ? t('unitCost') + ` (${currency})` : t('unitCost')}</th>
                          {currency !== 'EUR' && <th className="sc-right" style={{ width: 110 }}>{t('unitCostEur')}</th>}
                          <th className="sc-right" style={{ width: 110 }}>{tc('total')} EUR</th>
                          <th style={{ width: 44 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.lines.map((l, i) => (
                          <tr key={i}>
                            <td>
                              <select className="sc-input sc-select" aria-label={tc('product')} value={l.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                                <option value="">—</option>
                                {/* Pas de box : elle n'a pas de rayon, on achète ses sachets. */}
                                {products.filter(p => p.id === l.product_id || !(Array.isArray(p.bundle_items) && p.bundle_items.length))
                                  .map(p => <option key={p.id} value={p.id}>{nomProduit(p, lang)}</option>)}
                              </select>
                            </td>
                            <td data-label={tc('qty')}>
                              <input type="number" inputMode="numeric" className="sc-input sc-num" aria-label={tc('qty')} value={l.qty || ''} min={1} step={1} placeholder="0"
                                     onChange={e => updateLine(i, 'qty', Math.max(0, parseInt(e.target.value) || 0))} />
                            </td>
                            <td data-label={currency !== 'EUR' ? t('unitCost') + ` (${currency})` : t('unitCost')}>
                              <input type="number" inputMode="decimal" className="sc-input sc-num" aria-label={t('unitCost')} value={l.unit_cost || ''} min={0} step="0.01" placeholder="0.00"
                                     onChange={e => updateLine(i, 'unit_cost', Math.max(0, parseFloat((e.target.value || '0').replace(',', '.')) || 0))} />
                            </td>
                            {currency !== 'EUR' && (
                              <td data-label={t('unitCostEur')} className="sc-num ac-num" style={{ color: exchangeRate ? TH.blue : TH.red }}>
                                {exchangeRate ? (l.unit_cost_eur ? fmt(l.unit_cost_eur) : '—') : '⚠️ taux ?'}
                              </td>
                            )}
                            <td data-label={`${tc('total')} EUR`} className="sc-num ac-num" style={{ fontWeight: 600, color: TH.ink }}>
                              {exchangeRate || currency === 'EUR' ? fmt(l.total || 0) : '—'}
                            </td>
                            <td className="ac-retirer">
                              <button type="button" className="sc-iconbtn" aria-label={t2('retirer')} title={t2('retirer')}
                                      onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}
                                      style={{ color: TH.red, width: mobile ? 'auto' : undefined, gap: 6 }}>
                                <span className="ms">close</span>{mobile ? t2('retirer') : ''}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="sc-btn sc-btn-secondary ac-ajout"
                          onClick={() => setForm(f => ({ ...f, lines: [...f.lines, { product_id: '', name: '', qty: 0, unit_cost: 0, unit_cost_eur: 0, total: 0 }] }))}>
                    <span className="ms">add</span>{tc('product')}
                  </button>
                </div>

                <div className="ac-total">
                  <span>{tc('total')} EUR</span>
                  <span className="sc-num">{fmt(subtotalEur)}</span>
                </div>

                <div>
                  <label className="sc-label" htmlFor="ac-notes">{tc('notes')}</label>
                  <textarea id="ac-notes" className="sc-input sc-textarea" rows={3} style={{ resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="sc-modal-foot">
                <button type="button" className="sc-btn sc-btn-secondary" onClick={fermerSaisie}>{tc('cancel')}</button>
                <button type="button" className="sc-btn sc-btn-primary" onClick={saveOrder} disabled={saving}>
                  <span className="ms">save</span>{saving ? '…' : editingOrder ? tc('save') : tc('create')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal PDF / Envoi */}
        {showSendModal && sendOrder && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSendModal(false)}>
            <div className="modal" style={{ maxWidth: 460 }}>
              <div className="modal-header">
                <span className="modal-title">📄 PDF — {sendOrder.number}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowSendModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{t2('langueDoc')}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={`btn ${sendLang === 'sv' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setSendLang('sv')}
                    >
                      🇸🇪 Suédois
                    </button>
                    <button
                      className={`btn ${sendLang === 'en' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setSendLang('en')}
                    >
                      🇬🇧 Anglais
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t2('emailFournisseur')}</label>
                  <input
                    type="email"
                    className="form-control"
                    value={sendEmailInput}
                    onChange={e => setSendEmailInput(e.target.value)}
                    placeholder="fournisseur@exemple.com"
                  />
                </div>
                <p style={{ fontSize: 12, color: '#6A7280', margin: 0 }}>
                  Le PDF inclut les photos produits, quantités commandées et total.
                </p>
              </div>
              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadPdf(sendOrder, sendLang)}
                >
                  ⬇️ Télécharger PDF
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setShowSendModal(false)}>{tc('cancel')}</button>
                  <button
                    className="btn btn-primary"
                    disabled={!sendEmailInput || sendingPdf}
                    onClick={sendPdf}
                  >
                    {sendingPdf ? '⏳ Envoi…' : '📧 Envoyer par email'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal réception */}
        {showReception && selected && (
          <div className="sc-modal-back" onClick={e => { if (e.target === e.currentTarget && !recSaving) setShowReception(false); }}>
            <div className="sc-modal ac-modal-l" role="dialog" aria-modal="true" aria-labelledby="ac-reception-titre">
              <div className="sc-modal-head">
                <div id="ac-reception-titre" className="ac-modal-titre">{t('recTitle').replace('📬 ', '')} — {selected.number}</div>
                <button type="button" className="sc-iconbtn" onClick={() => setShowReception(false)} aria-label={tc('close')} disabled={recSaving}>
                  <span className="ms">close</span>
                </button>
              </div>
              <div className="sc-modal-body">
                <div className="ac-avert">{t('recWarning').replace('⚠️ ', '')}</div>
                <div className="ac-bloc">
                  <div className="ac-lignes-wrap">
                    <table className="sc-table ac-lignes">
                      <thead>
                        <tr>
                          <th>{tc('product')}</th>
                          <th className="sc-right" style={{ width: 96 }}>{t('ordered')}</th>
                          <th className="sc-right" style={{ width: 96 }}>{t('alreadyReceived')}</th>
                          <th style={{ width: 110 }}>{t('receivedQty')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recForm.lines.map((l: any, i: number) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600, color: TH.ink }}>{l.name || l.product_id}</td>
                            <td data-label={t('ordered')} className="sc-num ac-num">{l.qty}</td>
                            <td data-label={t('alreadyReceived')} className="sc-num ac-num" style={{ color: l.deja_recu ? TH.text2b : TH.muted }}>{l.deja_recu || '—'}</td>
                            <td data-label={t('receivedQty')}>
                              <input type="number" inputMode="numeric" className="sc-input sc-num" aria-label={`${t('receivedQty')} — ${l.name || ''}`}
                                     value={l.received_qty} min={0} step={1}
                                     onChange={e => {
                                       const v = Math.max(0, parseInt(e.target.value) || 0);
                                       setRecForm(r => ({ ...r, lines: r.lines.map((x: any, j: number) => j === i ? { ...x, received_qty: v } : x) }));
                                     }} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <label className="sc-label" htmlFor="ac-rec-notes">{tc('notes')}</label>
                  <textarea id="ac-rec-notes" className="sc-input sc-textarea" rows={3} value={recForm.notes} onChange={e => setRecForm(r => ({ ...r, notes: e.target.value }))} />
                </div>
              </div>
              <div className="sc-modal-foot">
                <button type="button" className="sc-btn sc-btn-secondary" onClick={() => setShowReception(false)} disabled={recSaving}>{tc('cancel')}</button>
                <button type="button" className="sc-btn sc-btn-green" onClick={saveReception} disabled={recSaving}>
                  <span className="ms">inventory</span>{recSaving ? '…' : t('recValidate').replace('✅ ', '')}
                </button>
              </div>
            </div>
          </div>
        )}
      {toast && <div className="sc-toast" role="status" style={{ zIndex: 300 }}>{toast}</div>}
    </>
  );
}
