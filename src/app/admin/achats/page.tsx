'use client';
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
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; }
    .a-wrap { font-family: 'Jost', sans-serif; }
    .a-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
    .a-title { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 600; color: #1C2028; }
    .a-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 20px; }
    .a-stat { background: #fff; border: 1px solid #D8CEBC; border-radius: 6px; padding: 14px 18px; }
    .a-stat-num { font-family: 'DM Mono', monospace; font-size: 20px; font-weight: 500; }
    .a-stat-label { font-size: 11px; color: #6A7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .a-toolbar { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    .a-select { padding: 8px 12px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; background: #fff; outline: none; }
    .a-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; border: 1px solid #D8CEBC; border-radius: 6px; overflow: hidden; }
    .a-table th { padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #6A7280; background: #FDFAF5; border-bottom: 1px solid #D8CEBC; }
    .a-table td { padding: 11px 14px; border-bottom: 1px solid #F0EBE1; vertical-align: middle; }
    .a-table tr:last-child td { border-bottom: none; }
    .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
    .btn-primary { background: #3E5238; color: #fff; } .btn-primary:hover { background: #587050; }
    .btn-secondary { background: #F6F1E9; color: #3E4550; border: 1px solid #D8CEBC; }
    .btn-warning { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
    .btn-info { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
    .btn-sm { padding: 4px 10px; font-size: 11px; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(28,32,40,0.5); z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; overflow-y: auto; }
    .modal { background: #fff; border-radius: 8px; width: 100%; max-width: 720px; margin: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .modal-header { padding: 16px 20px; border-bottom: 1px solid #D8CEBC; display: flex; align-items: center; justify-content: space-between; }
    .modal-title { font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px; max-height: 70vh; overflow-y: auto; }
    .modal-footer { padding: 14px 20px; border-top: 1px solid #D8CEBC; display: flex; justify-content: flex-end; gap: 10px; }
    .form-group { margin-bottom: 12px; }
    .form-label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #6A7280; margin-bottom: 4px; }
    .form-control { width: 100%; padding: 8px 10px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; outline: none; }
    .form-control:focus { border-color: #7A9468; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .lines-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px; }
    .lines-table th { padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6A7280; }
    .lines-table td { padding: 4px; }
    .lines-input { width: 100%; padding: 6px 8px; border: 1px solid #D8CEBC; border-radius: 4px; font-family: 'Jost', sans-serif; font-size: 12px; outline: none; }
    .totals-box { background: #F6F1E9; border-radius: 6px; padding: 12px 16px; font-size: 14px; font-weight: 600; font-family: 'DM Mono', monospace; }
    .currency-box { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 6px; padding: 14px 16px; margin-bottom: 14px; }
    .rate-info { font-size: 12px; color: #0369A1; margin-top: 8px; }
    .mono { font-family: 'DM Mono', monospace; }
    .empty { padding: 40px; text-align: center; color: #6A7280; font-style: italic; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #1C2028; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; z-index: 999; }
    .lang-toggle { display:flex; gap:4px; }
    .lang-btn { padding:4px 10px; font-size:11px; border:1px solid #D8CEBC; border-radius:4px; cursor:pointer; background:#fff; font-family:'Jost',sans-serif; }
    .lang-btn.active { background:#3E5238; color:#fff; border-color:#3E5238; }
    .sugg-panel { background:#fff; border:1px solid #D8CEBC; border-radius:8px; margin-bottom:22px; overflow:hidden; }
    .sugg-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:#FDFAF5; border-bottom:1px solid #D8CEBC; cursor:pointer; user-select:none; }
    .sugg-title { font-size:14px; font-weight:600; color:#1C2028; display:flex; align-items:center; gap:8px; }
    .sugg-table { width:100%; border-collapse:collapse; font-size:12px; }
    .sugg-table th { padding:8px 14px; text-align:left; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#6A7280; background:#FDFAF5; border-bottom:1px solid #EEE8DC; }
    .sugg-table td { padding:10px 14px; border-bottom:1px solid #F5F0E8; vertical-align:middle; }
    .sugg-table tr:last-child td { border-bottom:none; }
    .sugg-table tr:hover td { background:#FDFAF5; }
    .urgency-rupture { background:#FEE2E2; color:#EF4444; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; }
    .urgency-faible { background:#FEF3C7; color:#F59E0B; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; }
    .urgency-attention { background:#E0F2FE; color:#0284C7; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="a-wrap">
        <div className="a-header">
          <div>
            <div className="a-title">🛍️ {t('title')}</div>
            <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>{orders.length} {t('title').toLowerCase()}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="lang-toggle">
              {(['fr','en','sv'] as AdminLang[]).map(l => (
                <button key={l} className={`lang-btn ${lang === l ? 'active' : ''}`}
                  onClick={() => { setLang(l); setAdminLang(l); }}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => {
              setForm({ status: 'draft', supplier_id: '', expected_date: '', notes: '', lines: [{ product_id: '', name: '', qty: 0, unit_cost: 0, unit_cost_eur: 0, total: 0 }] });
              setCurrency('EUR'); setExchangeRate(null); setPaymentDate(new Date().toISOString().slice(0, 10));
              setEditingOrder(null); setShowModal(true);
            }}>{t('newBtn')}</button>
          </div>
        </div>

        <div className="a-stats">
          <div className="a-stat"><div className="a-stat-num mono">{fmt(totalOrders)}</div><div className="a-stat-label">{t('totalEngaged')}</div></div>
          <div className="a-stat"><div className="a-stat-num" style={{ color: '#F59E0B' }}>{pendingCount}</div><div className="a-stat-label">{t('inProgress')}</div></div>
          <div className="a-stat"><div className="a-stat-num">{orders.filter(o => o.status === 'received').length}</div><div className="a-stat-label">{t('received')}</div></div>
        </div>

        {/* Suggestions d'achat */}
        {suggestions.length > 0 && (
          <div className="sugg-panel">
            <div className="sugg-header" onClick={() => setShowSuggestions(s => !s)}>
              <div className="sugg-title">
                💡 Suggestions d'achat
                <span style={{ background: '#FEE2E2', color: '#EF4444', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                  {suggestions.filter(s => s.urgency === 'rupture').length} rupture{suggestions.filter(s => s.urgency === 'rupture').length > 1 ? 's' : ''}
                </span>
                <span style={{ background: '#FEF3C7', color: '#F59E0B', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                  {suggestions.filter(s => s.urgency === 'faible').length} faible{suggestions.filter(s => s.urgency === 'faible').length > 1 ? 's' : ''}
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#6A7280' }}>{showSuggestions ? '▲ Réduire' : '▼ Afficher'}</span>
            </div>
            {showSuggestions && (
              <table className="sugg-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Urgence</th>
                    <th style={{ textAlign: 'right' }}>Stock actuel</th>
                    <th style={{ textAlign: 'right' }}>Ventes 30j</th>
                    <th style={{ textAlign: 'right' }}>Vitesse / jour</th>
                    <th style={{ textAlign: 'right' }}>Jours restants</th>
                    <th style={{ textAlign: 'right' }}>Qté suggérée</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500, color: '#1C2028' }}>{s.name_fr}</td>
                      <td>
                        {s.urgency === 'rupture' && <span className="urgency-rupture">🔴 Rupture</span>}
                        {s.urgency === 'faible'  && <span className="urgency-faible">⚠️ Faible</span>}
                        {s.urgency === 'attention' && <span className="urgency-attention">🔵 Attention</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', color: s.stock <= 0 ? '#EF4444' : s.stock <= (s.stock_alert ?? 5) ? '#F59E0B' : '#1C2028', fontWeight: 600 }}>
                        {s.stock}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{s.sold30}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', color: '#6A7280' }}>
                        {s.velocity > 0 ? s.velocity.toFixed(2) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', color: s.daysLeft <= 14 ? '#EF4444' : '#6A7280' }}>
                        {s.velocity > 0 ? (s.daysLeft >= 999 ? '∞' : `${s.daysLeft}j`) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: '#3E5238' }}>
                        {s.suggested > 0 ? `+${s.suggested}` : '—'}
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => {
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
                          + Commander
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="a-toolbar">
          <select className="a-select" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">{t('allStatuses')}</option>
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v[L] || v.fr}</option>)}
          </select>
        </div>

        <table className="a-table">
          <thead><tr>
            <th>{t('colNum')}</th><th>{t('colSupplier')}</th><th>{t('colExpected')}</th>
            <th>{t('colTotal')}</th><th>{tc('status')}</th><th>{tc('actions')}</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6}><div className="empty">{tc('loading')}</div></td></tr>
            : orders.length === 0 ? <tr><td colSpan={6}><div className="empty">{tc('noData')}</div></td></tr>
            : orders.map(o => {
              const st = STATUSES[o.status as keyof typeof STATUSES] || { label: o.status, color: '#6A7280', fr: o.status, en: o.status, sv: o.status };
              const supplier = o.contacts;
              const name = supplier?.company || `${supplier?.first_name || ''} ${supplier?.last_name || ''}`.trim() || o.supplier_name || '—';
              return (
                <tr key={o.id}>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {o.number}
                    {o.currency && o.currency !== 'EUR' && (
                      <div style={{ fontSize: 10, color: '#0369A1' }}>{o.currency}{o.exchange_rate ? ` × ${o.exchange_rate}` : ''}</div>
                    )}
                  </td>
                  <td><strong>{name}</strong></td>
                  <td style={{ color: '#6A7280' }}>{fmtDate(o.expected_date)}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{fmt(o.total)}</td>
                  <td><span className="badge" style={{ background: st.color + '20', color: st.color }}>{st[L] || st.fr}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <select className="a-select btn-sm" value={o.status} onChange={e => updateStatus(o.id, e.target.value)} style={{ fontSize: 11, padding: '4px 8px' }}>
                        {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v[L] || v.fr}</option>)}
                      </select>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(o)} title={t('editTitle')}>✏️</button>
                      {['confirmed', 'partial'].includes(o.status) && (
                        <button className="btn btn-warning btn-sm" onClick={() => openReception(o)}>{t('reception')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Modal nouvelle/édition commande */}
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
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
