'use client';
import { T as TH, BADGE, thumbStyle, initials } from '@/lib/admin-theme';
import { useEffect, useState } from 'react';
import { getAdminLang, setAdminLang, subscribeAdminLang, T_COMMON, AdminLang } from '@/lib/admin-i18n';

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
  newBtn:       { fr: '+ Nouvelle commande', en: '+ New order', sv: '+ Ny order' },
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

  const L = lang;
  const t = (key: keyof typeof T) => T[key][L] || T[key].fr;
  const tc = (key: keyof typeof T_COMMON) => T_COMMON[key][L] || T_COMMON[key].fr;

  useEffect(() => {
    setLang(getAdminLang());
    return subscribeAdminLang(setLang);
  }, []);

  useEffect(() => { load(); loadSuppliers(); loadProducts(); loadSuggestions(); }, [filter]);

  async function loadSuggestions() {
    const res = await fetch('/api/purchase-suggestions');
    const data = await res.json();
    setSuggestions(data.suggestions || []);
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  async function load() {
    setLoading(true);
    const params = filter ? `?status=${filter}` : '';
    const res = await fetch('/api/purchase-orders' + params);
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }

  async function loadSuppliers() {
    const res = await fetch('/api/contacts?type=supplier');
    const data = await res.json();
    setSuppliers(data.contacts || []);
  }

  async function loadProducts() {
    const res = await fetch('/api/products');
    const data = await res.json();
    setProducts(data.products || []);
  }

  async function fetchExchangeRate(curr = currency) {
    if (curr === 'EUR') { setExchangeRate(1); return; }
    setFetchingRate(true);
    try {
      const res = await fetch(`/api/exchange-rate?from=${curr}&to=EUR&date=${paymentDate}`);
      const data = await res.json();
      const rate = data.rate;
      if (rate) {
        setExchangeRate(rate);
        setForm(f => ({
          ...f,
          lines: f.lines.map(l => ({
            ...l,
            unit_cost_eur: parseFloat((l.unit_cost * rate).toFixed(4)),
            total: parseFloat((l.qty * l.unit_cost * rate).toFixed(2)),
          })),
        }));
        showToast(`✅ 1 ${curr} = ${rate} EUR (${data.date})`);
      }
    } catch {
      showToast('❌ Impossible de récupérer le taux');
    }
    setFetchingRate(false);
  }

  function updateLine(i: number, field: string, val: any) {
    const nl = [...form.lines];
    nl[i] = { ...nl[i], [field]: val };
    if (field === 'product_id') {
      const p = products.find(x => x.id === val);
      if (p) nl[i].name = lang === 'sv' ? (p.name_sv || p.name_fr) : lang === 'en' ? (p.name_en || p.name_fr) : p.name_fr;
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

  async function saveOrder() {
    if (!form.supplier_id) { showToast('⚠️ ' + t('supplier')); return; }
    if (currency !== 'EUR' && !exchangeRate) { showToast('⚠️ Taux de change non chargé — sélectionnez la devise à nouveau'); return; }
    const token = localStorage.getItem('sd_admin_token') || '';
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    const url = editingOrder ? `/api/purchase-orders/${editingOrder.id}` : '/api/purchase-orders';
    const method = editingOrder ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...form,
        supplier_name: supplier?.company || `${supplier?.first_name} ${supplier?.last_name}`,
        subtotal: subtotalEur,
        total: subtotalEur,
        currency,
        exchange_rate: exchangeRate,
        payment_date: currency !== 'EUR' ? paymentDate : undefined,
        lines: form.lines.map(l => ({ ...l, unit_cost: l.unit_cost_eur || l.unit_cost })),
      }),
    });
    if (!res.ok) { const e = await res.json(); showToast('❌ ' + (e?.error || 'Erreur serveur')); return; }
    showToast(editingOrder ? '✅ Commande modifiée' : '✅ ' + t('newBtn'));
    setShowModal(false);
    setEditingOrder(null);
    load();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/purchase-orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    showToast('✅ ' + tc('status'));
    load();
  }

  function openEdit(order: PurchaseOrder) {
    const lines = (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines || [])
      .map((l: any) => ({
        product_id: l.product_id || '',
        name: l.name || '',
        qty: l.qty || 0,
        unit_cost: l.unit_cost || 0,
        unit_cost_eur: l.unit_cost_eur || l.unit_cost || 0,
        total: l.total || 0,
      }));
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
    const lines = (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines || [])
      .map((l: any) => ({ ...l, received_qty: l.qty }));
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
    showToast('⏳ Génération PDF…');
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/pdf?lang=${lang}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { showToast('❌ Erreur génération PDF'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `purchase-order-${order.number}-${lang}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('✅ PDF téléchargé');
    } catch {
      showToast('❌ Erreur téléchargement PDF');
    }
  }

  async function sendPdf() {
    if (!sendOrder) return;
    setSendingPdf(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await fetch(`/api/purchase-orders/${sendOrder.id}/send-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: sendEmailInput, lang: sendLang }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ PDF envoyé par email');
        setShowSendModal(false);
      } else {
        showToast('❌ ' + (data.error || 'Erreur envoi'));
      }
    } catch {
      showToast('❌ Erreur envoi email');
    } finally {
      setSendingPdf(false);
    }
  }

  async function saveReception() {
    if (!selected) return;
    const token = localStorage.getItem('sd_admin_token') || '';
    const res = await fetch('/api/receptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...recForm, purchase_order_id: selected.id, supplier_id: selected.supplier_id, supplier_name: selected.supplier_name }),
    });
    if (!res.ok) { const e = await res.json(); showToast('❌ ' + (e?.error || 'Erreur serveur')); return; }
    showToast('✅ ' + tc('save'));
    setShowReception(false);
    load();
  }

  const totalOrders = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const pendingCount = orders.filter(o => ['draft', 'sent', 'confirmed'].includes(o.status)).length;

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
          <button className="sc-btn sc-btn-primary" onClick={() => {
            setForm({ status: 'draft', supplier_id: '', expected_date: '', notes: '', lines: [{ product_id: '', name: '', qty: 0, unit_cost: 0, unit_cost_eur: 0, total: 0 }] });
            setCurrency('EUR'); setExchangeRate(null); setPaymentDate(new Date().toISOString().slice(0, 10));
            setEditingOrder(null); setShowModal(true);
          }}>
            <span className="ms">add</span>{t('newBtn')}
          </button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 10, marginBottom: 12 }}>
        {A_KPIS.map(k => (
          <div key={k.label} className="sc-card" style={{ padding: '13px 15px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: k.tone ? k.tone.fg : TH.muted }}>
              {k.label}
            </div>
            <div className="sc-num" style={{ fontSize: 23, fontWeight: 700, marginTop: 5, color: k.tone ? k.tone.fg : TH.ink }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions de réappro */}
      {suggestions.length > 0 && (
        <div className="sc-card" style={{ marginBottom: 12, overflow: 'hidden' }}>
          <button onClick={() => setShowSuggestions(s => !s)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '12px 15px', border: 'none', background: '#FFF7ED', cursor: 'pointer', textAlign: 'left' }}>
            <span className="ms" style={{ fontSize: 18, color: BADGE.orange.fg }}>trending_up</span>
            <span className="sc-card-title">Suggestions de réapprovisionnement</span>
            <span className="sc-badge" style={{ background: BADGE.red.bg, color: BADGE.red.fg }}>
              {suggestions.filter(s => s.urgency === 'rupture').length} rupture(s)
            </span>
            <span className="sc-badge" style={{ background: BADGE.orange.bg, color: BADGE.orange.fg }}>
              {suggestions.filter(s => s.urgency === 'faible').length} faible(s)
            </span>
            <span style={{ flex: 1 }} />
            <span className="ms" style={{ fontSize: 18, color: TH.muted }}>{showSuggestions ? 'expand_less' : 'expand_more'}</span>
          </button>

          {showSuggestions && (
            <div style={{ overflowX: 'auto' }}>
              <table className="sc-table" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th style={{ width: 110 }}>Urgence</th>
                    <th className="sc-right" style={{ width: 100 }}>Stock</th>
                    <th className="sc-right" style={{ width: 90 }}>Ventes 90 j</th>
                    <th className="sc-right" style={{ width: 90 }}>Par jour</th>
                    <th className="sc-right" style={{ width: 90 }}>Autonomie</th>
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
                        <td style={{ fontSize: 13, fontWeight: 500, color: TH.ink }}>{s.name_fr}</td>
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
                          <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => {
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
                          }}>
                            <span className="ms" style={{ fontSize: 15 }}>add</span>Commander
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

      {/* Table des commandes d'achat */}
      <div className="sc-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="sc-table" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>{t('colNum')}</th>
                <th>{t('colSupplier')}</th>
                <th style={{ width: 110 }}>{t('colExpected')}</th>
                <th className="sc-right" style={{ width: 70 }}>Lignes</th>
                <th className="sc-right" style={{ width: 110 }}>{t('colTotal')}</th>
                <th style={{ width: 130 }}>{tc('status')}</th>
                <th style={{ width: 210 }}>{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="sc-empty">{tc('loading')}</div></td></tr>}
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
                        <a className="sc-iconbtn" href={`/admin/documents/bon-de-commande/${o.id}`} target="_blank" rel="noopener" title="Bon de commande A4">
                          <span className="ms">print</span>
                        </a>
                        <button className="sc-iconbtn" onClick={() => openEdit(o)} title={t('editTitle')}>
                          <span className="ms">edit</span>
                        </button>
                        <button className="sc-iconbtn" onClick={() => openSendModal(o)} title="PDF / Envoyer">
                          <span className="ms">send</span>
                        </button>
                        {['confirmed', 'partial'].includes(o.status) && (
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

        {showModal && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setEditingOrder(null); } }}>
            <div className="modal">
              <div className="modal-header">
                <span className="modal-title">{editingOrder ? `${t('editTitle')} — ${editingOrder.number}` : t('newTitle')}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => { setShowModal(false); setEditingOrder(null); }}>✕</button>
              </div>
              <div className="modal-body">
                <div className="grid-2" style={{ marginBottom: 14 }}>
                  <div className="form-group">
                    <label className="form-label">{t('supplier')}</label>
                    <select className="form-control" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                      <option value="">{t('chooseSupplier')}</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.company || `${s.first_name} ${s.last_name}`}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('expectedDate')}</label>
                    <input type="date" className="form-control" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
                  </div>
                </div>
                {editingOrder && (
                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label className="form-label">{tc('status')}</label>
                    <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v[L] || v.fr}</option>)}
                    </select>
                  </div>
                )}

                {/* Currency conversion */}
                <div className="currency-box">
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#0369A1', marginBottom: 10 }}>
                    💱 {t('currency')}
                  </div>
                  <div className="grid-3">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{t('currency')}</label>
                      <select className="form-control" value={currency} onChange={e => { const c = e.target.value; setCurrency(c); setExchangeRate(null); if (c !== 'EUR') fetchExchangeRate(c); }}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{t('paymentDate')}</label>
                      <input type="date" className="form-control" value={paymentDate} onChange={e => { setPaymentDate(e.target.value); if (currency !== 'EUR') { setExchangeRate(null); fetchExchangeRate(currency); } }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
                      {currency !== 'EUR' ? (
                        <button className="btn btn-info btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => fetchExchangeRate()} disabled={fetchingRate}>
                          {fetchingRate ? t('converting') : exchangeRate ? `↻ Taux: 1 ${currency} = ${exchangeRate} EUR` : t('convertBtn')}
                        </button>
                      ) : (
                        <div style={{ fontSize: 12, color: '#6A7280', padding: '8px 0' }}>EUR natif — aucune conversion</div>
                      )}
                    </div>
                  </div>
                  {exchangeRate && currency !== 'EUR' && (
                    <div className="rate-info">
                      ✅ {t('rateInfo')} {paymentDate} : 1 {currency} = <strong>{exchangeRate} EUR</strong>
                    </div>
                  )}
                </div>

                {/* Lines */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6A7280', marginBottom: 8 }}>{t('linesTitle')}</div>
                  <table className="lines-table">
                    <thead>
                      <tr>
                        <th style={{ width: '35%' }}>{tc('product')}</th>
                        <th>{tc('qty')}</th>
                        <th>{currency !== 'EUR' ? t('unitCost') + ` (${currency})` : t('unitCost')}</th>
                        {currency !== 'EUR' && <th>{t('unitCostEur')}</th>}
                        <th>{tc('total')} EUR</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.lines.map((l, i) => (
                        <tr key={i}>
                          <td>
                            <select className="lines-input" value={l.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                              <option value="">—</option>
                              {products.map(p => <option key={p.id} value={p.id}>{lang === 'sv' ? (p.name_sv || p.name_fr) : lang === 'en' ? (p.name_en || p.name_fr) : p.name_fr}</option>)}
                            </select>
                          </td>
                          <td><input type="number" className="lines-input" style={{ width: 56 }} value={l.qty || ''} min={1} placeholder="Qté" onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 0)} /></td>
                          <td><input type="number" className="lines-input" style={{ width: 80 }} value={l.unit_cost || ''} step="0.01" placeholder="0.00" onChange={e => updateLine(i, 'unit_cost', parseFloat((e.target.value || '0').replace(',', '.')) || 0)} /></td>
                          {currency !== 'EUR' && <td className="mono" style={{ padding: '4px 8px', color: exchangeRate ? '#0369A1' : '#EF4444' }}>{exchangeRate ? (l.unit_cost_eur ? l.unit_cost_eur + ' €' : '—') : '⚠️ taux ?'}</td>}
                          <td className="mono" style={{ padding: '4px 8px' }}>{exchangeRate || currency === 'EUR' ? (l.total || 0).toFixed(2) + ' €' : '—'}</td>
                          <td><button onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer' }}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, { product_id: '', name: '', qty: 0, unit_cost: 0, unit_cost_eur: 0, total: 0 }] }))}>+ {tc('product')}</button>
                </div>

                <div className="totals-box" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{tc('total')} EUR</span>
                  <span>{subtotalEur.toFixed(2)} €</span>
                </div>

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">{tc('notes')}</label>
                  <textarea className="form-control" style={{ minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingOrder(null); }}>{tc('cancel')}</button>
                <button className="btn btn-primary" onClick={saveOrder}>💾 {editingOrder ? tc('save') : tc('create')}</button>
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
                  <label className="form-label">Langue du document</label>
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
                  <label className="form-label">Email fournisseur (pour envoi)</label>
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
                  <button className="btn btn-secondary" onClick={() => setShowSendModal(false)}>Annuler</button>
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
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReception(false)}>
            <div className="modal">
              <div className="modal-header">
                <span className="modal-title">{t('recTitle')} — {selected.number}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowReception(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
                  {t('recWarning')}
                </div>
                <table className="lines-table">
                  <thead><tr><th>{tc('product')}</th><th>{t('ordered')}</th><th>{t('receivedQty')}</th></tr></thead>
                  <tbody>
                    {recForm.lines.map((l: any, i: number) => (
                      <tr key={i}>
                        <td style={{ padding: '6px 8px' }}><strong>{l.name || l.product_id}</strong></td>
                        <td style={{ padding: '6px 8px' }} className="mono">{l.qty}</td>
                        <td style={{ padding: '6px 4px' }}>
                          <input type="number" className="lines-input" style={{ width: 80 }} value={l.received_qty} min={0} max={l.qty}
                            onChange={e => { const nl = [...recForm.lines]; nl[i].received_qty = parseInt(e.target.value) || 0; setRecForm(r => ({ ...r, lines: nl })); }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">{tc('notes')}</label>
                  <textarea className="form-control" style={{ minHeight: 60 }} value={recForm.notes} onChange={e => setRecForm(r => ({ ...r, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowReception(false)}>{tc('cancel')}</button>
                <button className="btn btn-primary" onClick={saveReception}>{t('recValidate')}</button>
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
