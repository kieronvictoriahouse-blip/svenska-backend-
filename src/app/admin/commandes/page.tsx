'use client';
import { useEffect, useState } from 'react';
import { getAdminLang, setAdminLang, subscribeAdminLang, T_COMMON, T_ORDER_STATUS, AdminLang } from '@/lib/admin-i18n';

type Order = {
  id: string; order_number: string; status: string;
  customer_name: string; customer_email: string;
  shipping_address?: string; customer_address?: string;
  lines: any[]; subtotal: number; shipping: number; total: number;
  notes?: string; source?: string; created_at: string;
  tracking_number?: string; delivery_mode?: string;
  is_test?: boolean; promo_code?: string; discount?: number;
  stripe_session_id?: string; exclude_from_stats?: boolean;
};

type ProductCost = { id: string; cost_price: number };

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
  markTest:      { fr: 'Marquer comme test', en: 'Mark as test', sv: 'Markera som test' },
  markTestConfirm: { fr: '⚠️ Confirmer ? Supprime la comptabilité associée', en: '⚠️ Confirm? Removes accounting entry', sv: '⚠️ Bekräfta? Tar bort bokföringen' },
  showTest:      { fr: 'Afficher les commandes test', en: 'Show test orders', sv: 'Visa testbeställningar' },
};

const fmt = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
// shipping_address peut être string ou objet JSONB selon la source
const toAddrStr = (v: any): string => !v ? '' : typeof v === 'string' ? v : [v.line1, v.line2, v.postal_code && v.city ? `${v.postal_code} ${v.city}` : (v.postal_code || v.city), v.country].filter(Boolean).join(', ');

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', paid: '#10B981', confirmed: '#3B82F6',
  shipped: '#8B5CF6', delivered: '#10B981', cancelled: '#EF4444', refunded: '#6B7280',
};

export default function CommandesPage() {
  const [lang, setLang] = useState<AdminLang>('fr');
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
  const [markingTest, setMarkingTest] = useState(false);
  const [testConfirm, setTestConfirm] = useState(false);
  const [togglingStats, setTogglingStats] = useState(false);
  const [showTestOrders, setShowTestOrders] = useState(false);
  const [costMap, setCostMap] = useState<Record<string, number>>({});
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [newOrder, setNewOrder] = useState({
    customer_name: '', customer_email: '', customer_address: '', customer_country: 'France',
    notes: '', shipping: '0', lines: [{ desc: '', qty: 1, price: 0 }]
  });

  const L = lang;
  const t = (key: keyof typeof T) => T[key][L] || T[key].fr;
  const tc = (key: keyof typeof T_COMMON) => T_COMMON[key][L] || T_COMMON[key].fr;
  const ts = (status: string) => T_ORDER_STATUS[status as keyof typeof T_ORDER_STATUS]?.[L] || status;

  useEffect(() => {
    setLang(getAdminLang());
    return subscribeAdminLang(setLang);
  }, []);

  useEffect(() => { load(); loadCosts(); }, [filter, search]);
  useEffect(() => { loadCosts(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  async function loadCosts() {
    const token = localStorage.getItem('sd_admin_token') || '';
    const res = await fetch('/api/products?limit=500', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const costs: Record<string, number> = {};
    const images: Record<string, string> = {};
    for (const p of (data.products || [])) {
      if (p.cost_price > 0) costs[p.id] = p.cost_price;
      if (p.image_url) images[p.id] = p.image_url;
    }
    setCostMap(costs);
    setImageMap(images);
  }

  async function load() {
    setLoading(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    if (search) params.set('search', search);
    const res = await fetch('/api/orders?' + params.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    const token = localStorage.getItem('sd_admin_token') || '';
    await fetch(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
    showToast('✅ ' + tc('status'));
    load();
    if (selected?.id === id) setSelected(o => o ? { ...o, status } : null);
  }

  async function saveTracking() {
    if (!selected) return;
    const token = localStorage.getItem('sd_admin_token') || '';
    setSavingTracking(true);
    await fetch(`/api/orders/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tracking_number: trackingInput || null }),
    });
    setSelected(o => o ? { ...o, tracking_number: trackingInput || undefined } : null);
    load();
    setSavingTracking(false);
    showToast('✅ ' + t('tracking'));
  }

  async function createOrder() {
    if (!newOrder.customer_name || !newOrder.customer_email) { showToast('⚠️ ' + t('custName')); return; }
    const subtotal = newOrder.lines.reduce((s, l) => s + l.qty * l.price, 0);
    const shipping = parseFloat(newOrder.shipping) || 0;
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newOrder, subtotal, shipping, total: subtotal + shipping }),
    });
    setShowNewModal(false);
    showToast('✅ ' + t('newOrder'));
    load();
  }

  async function handleMarkTest() {
    if (!selected) return;
    if (!testConfirm) { setTestConfirm(true); return; }
    setMarkingTest(true);
    setTestConfirm(false);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await fetch(`/api/orders/${selected.id}/mark-test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showToast('✅ Commande marquée comme test — compta et facture nettoyées');
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
      const res = await fetch(`/api/orders/${selected.id}/exclude-stats`, {
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
      const res = await fetch(`/api/orders/${selected.id}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast('✅ Remboursement effectué — client notifié par email');
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

  function calcMargin(order: Order): { margin: number | null; pct: number | null; stripeFee: number; urssaf: number } {
    if (['cancelled', 'refunded'].includes(order.status)) return { margin: null, pct: null, stripeFee: 0, urssaf: 0 };
    const lines = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);
    const hasAny = lines.some((l: any) => l.product_id && costMap[l.product_id] != null);
    const total = order.total || 0;
    const revenue = order.subtotal || order.total || 0;
    const stripeFee = order.source !== 'manual' && order.stripe_session_id
      ? Math.round((total * 0.015 + 0.25) * 100) / 100
      : 0;
    const urssaf = Math.round(total * 0.123 * 100) / 100; // 12,3% du CA total
    if (!hasAny) return { margin: null, pct: null, stripeFee, urssaf };
    let cost = 0;
    for (const l of lines) {
      const cp = l.product_id ? (costMap[l.product_id] || 0) : 0;
      cost += cp * (l.qty || 1);
    }
    const margin = revenue - stripeFee - urssaf - cost;
    const pct = revenue > 0 ? (margin / revenue) * 100 : 0;
    return { margin, pct, stripeFee, urssaf };
  }

  const realOrders = orders.filter(o => !o.is_test);
  const visibleOrders = showTestOrders ? orders : realOrders;
  const totalRevenue = realOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0);
  const pendingCount = realOrders.filter(o => o.status === 'pending').length;
  const testCount = orders.filter(o => o.is_test).length;

  const paidStatuses = ['paid', 'confirmed', 'shipped', 'delivered'];
  const activeOrders = realOrders.filter(o => paidStatuses.includes(o.status) && !o.exclude_from_stats);
  const marginsWithData = activeOrders.map(o => calcMargin(o)).filter(m => m.margin !== null);
  const totalMargin = marginsWithData.reduce((s, m) => s + m.margin!, 0);
  const avgMarginPct = marginsWithData.length > 0
    ? marginsWithData.reduce((s, m) => s + m.pct!, 0) / marginsWithData.length
    : null;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    .o-wrap { font-family:'Jost',sans-serif; }
    .o-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
    .o-title { font-family:'Cormorant Garamond',serif; font-size:30px; font-weight:600; color:#1C2028; }
    .o-stats { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:24px; }
    .o-stat { background:#fff; border:1px solid #D8CEBC; border-radius:6px; padding:16px 18px; }
    .o-stat-num { font-family:'DM Mono',monospace; font-size:22px; font-weight:500; color:#1C2028; }
    .o-stat-label { font-size:11px; color:#6A7280; margin-top:3px; letter-spacing:0.5px; text-transform:uppercase; }
    .o-toolbar { display:flex; gap:10px; margin-bottom:16px; align-items:center; flex-wrap:wrap; }
    .o-search { flex:1; min-width:200px; padding:8px 12px; border:1px solid #D8CEBC; border-radius:6px; font-family:'Jost',sans-serif; font-size:13px; outline:none; }
    .o-filter { padding:8px 12px; border:1px solid #D8CEBC; border-radius:6px; font-family:'Jost',sans-serif; font-size:13px; background:#fff; outline:none; }
    .o-table { width:100%; border-collapse:collapse; font-size:13px; background:#fff; border:1px solid #D8CEBC; border-radius:6px; overflow:hidden; }
    .o-table th { padding:10px 14px; text-align:left; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#6A7280; background:#FDFAF5; border-bottom:1px solid #D8CEBC; }
    .o-table td { padding:12px 14px; border-bottom:1px solid #F0EBE1; vertical-align:middle; }
    .o-table tr:last-child td { border-bottom:none; }
    .o-table tr:hover td { background:#FDFAF5; cursor:pointer; }
    .o-badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:600; }
    .o-modal-overlay { position:fixed; inset:0; background:rgba(28,32,40,0.5); z-index:200; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto; }
    .o-modal { background:#fff; border-radius:6px; width:100%; max-width:640px; margin:auto; box-shadow:0 20px 60px rgba(0,0,0,0.2); }
    .o-modal-header { padding:16px 20px; border-bottom:1px solid #D8CEBC; display:flex; align-items:center; justify-content:space-between; }
    .o-modal-title { font-size:16px; font-weight:600; }
    .o-modal-body { padding:20px; max-height:80vh; overflow-y:auto; }
    .o-modal-footer { padding:14px 20px; border-top:1px solid #D8CEBC; display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; }
    .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:6px; font-family:'Jost',sans-serif; font-size:13px; font-weight:500; cursor:pointer; border:none; }
    .btn-primary { background:#3E5238; color:#fff; } .btn-primary:hover { background:#587050; }
    .btn-secondary { background:#F6F1E9; color:#3E4550; border:1px solid #D8CEBC; } .btn-secondary:hover { background:#D8CEBC; }
    .btn-info { background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; }
    .btn-sm { padding:4px 10px; font-size:11px; }
    .form-group { margin-bottom:12px; }
    .form-label { display:block; font-size:11px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#6A7280; margin-bottom:4px; }
    .form-control { width:100%; padding:8px 10px; border:1px solid #D8CEBC; border-radius:6px; font-family:'Jost',sans-serif; font-size:13px; outline:none; }
    .form-control:focus { border-color:#7A9468; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .mono { font-family:'DM Mono',monospace; }
    .toast { position:fixed; bottom:24px; right:24px; background:#1C2028; color:#fff; padding:10px 18px; border-radius:6px; font-size:13px; z-index:999; }
    .empty { padding:60px; text-align:center; color:#6A7280; font-style:italic; font-size:14px; }
    .detail-row { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; border-bottom:1px solid #F0EBE1; }
    .detail-row:last-child { border-bottom:none; }
    .tracking-box { background:#F0F9FF; border:1px solid #BAE6FD; border-radius:6px; padding:14px 16px; margin-top:16px; }
    .tracking-row { display:flex; gap:8px; align-items:center; margin-top:8px; }
    .lang-toggle { display:flex; gap:4px; }
    .lang-btn { padding:4px 10px; font-size:11px; border:1px solid #D8CEBC; border-radius:4px; cursor:pointer; background:#fff; font-family:'Jost',sans-serif; }
    .lang-btn.active { background:#3E5238; color:#fff; border-color:#3E5238; }
    .test-badge { display:inline-flex; align-items:center; padding:2px 7px; border-radius:4px; font-size:9px; font-weight:700; letter-spacing:1px; background:#FEF9C3; color:#854D0E; border:1px solid #FDE68A; margin-left:6px; }
    .btn-warning { background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; }
    .btn-warning:hover { background:#FDE68A; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="o-wrap">
        <div className="o-header">
          <div>
            <div className="o-title">{t('title')}</div>
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
            <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>{t('newOrder')}</button>
          </div>
        </div>

        <div className="o-stats">
          <div className="o-stat"><div className="o-stat-num mono">{realOrders.length}</div><div className="o-stat-label">{t('totalOrders')}</div></div>
          <div className="o-stat"><div className="o-stat-num mono" style={{ color: '#F59E0B' }}>{pendingCount}</div><div className="o-stat-label">{t('pending')}</div></div>
          <div className="o-stat"><div className="o-stat-num mono">{fmt(totalRevenue)}</div><div className="o-stat-label">{t('revenue')}</div></div>
          <div className="o-stat"><div className="o-stat-num mono">{realOrders.length > 0 ? fmt(totalRevenue / (realOrders.filter(o => o.status !== 'cancelled').length || 1)) : '0,00 €'}</div><div className="o-stat-label">{t('avgCart')}</div></div>
          <div className="o-stat">
            <div className="o-stat-num mono" style={{ color: avgMarginPct !== null ? (avgMarginPct >= 40 ? '#10B981' : avgMarginPct >= 20 ? '#F59E0B' : '#EF4444') : '#6A7280' }}>
              {marginsWithData.length > 0 ? fmt(totalMargin) : '—'}
            </div>
            <div className="o-stat-label">Marge réelle totale</div>
            {avgMarginPct !== null && (
              <div style={{ fontSize: 11, color: avgMarginPct >= 40 ? '#10B981' : avgMarginPct >= 20 ? '#F59E0B' : '#EF4444', marginTop: 2, fontFamily: 'DM Mono,monospace' }}>
                moy. {avgMarginPct.toFixed(1)}%
              </div>
            )}
          </div>
        </div>

        <div className="o-toolbar">
          <input className="o-search" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
          <select className="o-filter" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">{t('allStatuses')}</option>
            {Object.keys(T_ORDER_STATUS).map(k => <option key={k} value={k}>{ts(k)}</option>)}
          </select>
          {testCount > 0 && (
            <button
              className={`btn btn-sm ${showTestOrders ? 'btn-warning' : 'btn-secondary'}`}
              onClick={() => setShowTestOrders(v => !v)}
            >
              🧪 {showTestOrders ? `Masquer tests (${testCount})` : `Tests (${testCount})`}
            </button>
          )}
        </div>

        <table className="o-table">
          <thead><tr>
            <th>{t('colOrder')}</th><th>{t('colClient')}</th><th>{t('colDate')}</th>
            <th>{t('colTotal')}</th><th>Marge réelle</th><th>{tc('status')}</th><th>{tc('actions')}</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><div className="empty">{tc('loading')}</div></td></tr>
            ) : visibleOrders.length === 0 ? (
              <tr><td colSpan={6}><div className="empty">{tc('noData')}</div></td></tr>
            ) : visibleOrders.map(o => (
              <tr key={o.id} onClick={() => { setSelected(o); setTrackingInput(o.tracking_number || ''); setShowModal(true); setTestConfirm(false); setRefundConfirm(false); }}
                style={o.is_test ? { opacity: 0.6 } : {}}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="mono" style={{ fontSize: 12 }}>{o.order_number}</span>
                    {o.is_test && <span className="test-badge">TEST</span>}
                    {o.exclude_from_stats && !o.is_test && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1, background: '#EDE9FE', color: '#5B21B6', border: '1px solid #DDD6FE' }}>HORS STATS</span>}
                  </div>
                  {o.delivery_mode === 'pickup' && <div style={{ fontSize: 10, color: '#7C3AED', marginTop: 2, fontWeight: 600 }}>🏪 {t('clickCollect')}</div>}
                  {o.tracking_number && <div style={{ fontSize: 10, color: '#0EA5E9', marginTop: 2 }}>📦 {o.tracking_number}</div>}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                  <div style={{ fontSize: 11, color: '#6A7280' }}>{o.customer_email}</div>
                </td>
                <td style={{ color: '#6A7280' }}>{fmtDate(o.created_at)}</td>
                <td>
                  <span className="mono" style={{ fontWeight: 600 }}>{fmt(o.total)}</span>
                  {o.promo_code && <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, marginTop: 2 }}>🎟️ {o.promo_code}</div>}
                </td>
                <td>{(() => {
                  const { margin, pct } = calcMargin(o);
                  if (margin === null) return <span style={{ color: '#9CA3AF', fontSize: 11 }}>—</span>;
                  const color = pct! >= 40 ? '#10B981' : pct! >= 20 ? '#F59E0B' : '#EF4444';
                  return <span className="mono" style={{ color, fontWeight: 600, fontSize: 12 }}>{fmt(margin)}<br/><span style={{ fontSize: 10, opacity: 0.8 }}>{pct!.toFixed(0)}%</span></span>;
                })()}</td>
                <td>
                  <span className="o-badge" style={{ background: (STATUS_COLORS[o.status] || '#6A7280') + '20', color: STATUS_COLORS[o.status] || '#6A7280' }}>
                    {ts(o.status)}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <select className="o-filter btn-sm" value={o.status} onChange={e => updateStatus(o.id, e.target.value)} style={{ fontSize: 11, padding: '4px 8px' }}>
                    {Object.keys(T_ORDER_STATUS).map(k => <option key={k} value={k}>{ts(k)}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Detail Modal */}
        {showModal && selected && (
          <div className="o-modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setRefundConfirm(false); } }}>
            <div className="o-modal">
              <div className="o-modal-header">
                <span className="o-modal-title">{selected.order_number}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => { setShowModal(false); setRefundConfirm(false); }}>✕</button>
              </div>
              <div className="o-modal-body">
                <div className="grid-2" style={{ marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6A7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>{tc('client')}</div>
                    <div style={{ fontWeight: 600 }}>{selected.customer_name}</div>
                    <div style={{ fontSize: 13, color: '#6A7280' }}>{selected.customer_email}</div>
                    {(selected.shipping_address || selected.customer_address) &&
                      <div style={{ fontSize: 12, color: '#6A7280', marginTop: 4, whiteSpace: 'pre-line' }}>
                        {toAddrStr(selected.shipping_address || selected.customer_address).replace(/,\s*/g, '\n')}
                      </div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6A7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>{t('details')}</div>
                    <div style={{ fontSize: 13 }}>{tc('date')} : {fmtDate(selected.created_at)}</div>
                    {selected.source && <div style={{ fontSize: 13 }}>{t('source')} : {selected.source}</div>}
                    <div style={{ marginTop: 6 }}>
                      <span className="o-badge" style={{ background: (STATUS_COLORS[selected.status] || '#6A7280') + '20', color: STATUS_COLORS[selected.status] || '#6A7280' }}>
                        {ts(selected.status)}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#FDFAF5', border: '1px solid #D8CEBC', borderRadius: 6, marginBottom: 16 }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #D8CEBC', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: '#6A7280' }}>{t('orderLines')}</div>
                  {(typeof selected.lines === 'string' ? JSON.parse(selected.lines) : selected.lines || []).map((l: any, i: number) => {
                    const imgUrl = l.image_url || (l.product_id && imageMap[l.product_id]) || null;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #F0EBE1' }}>
                        {imgUrl
                          ? <img src={imgUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #D8CEBC', flexShrink: 0 }} />
                          : <div style={{ width: 44, height: 44, borderRadius: 6, border: '1px solid #D8CEBC', background: '#F0EBE1', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                        }
                        <span style={{ flex: 1, fontSize: 13 }}>{l.desc || l.name || l.name_fr || '—'} <strong>× {l.qty}</strong></span>
                        <span className="mono" style={{ fontSize: 13 }}>{fmt((l.qty || 1) * (l.price || 0))}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ minWidth: 220 }}>
                    <div className="detail-row"><span>{tc('subtotal')}</span><span className="mono">{fmt(selected.subtotal)}</span></div>
                    {selected.promo_code && (
                      <div className="detail-row" style={{ color: '#16A34A' }}>
                        <span>🎟️ {selected.promo_code}</span>
                        <span className="mono">−{fmt(selected.discount || 0)}</span>
                      </div>
                    )}
                    <div className="detail-row"><span>{tc('shipping')}</span><span className="mono">{selected.shipping > 0 ? fmt(selected.shipping) : tc('free')}</span></div>
                    <div className="detail-row" style={{ fontWeight: 700, fontSize: 15, borderTop: '2px solid #1C2028', marginTop: 4, paddingTop: 8 }}>
                      <span>{tc('total')}</span><span className="mono">{fmt(selected.total)}</span>
                    </div>
                    {(() => {
                      const { margin, pct, stripeFee, urssaf } = calcMargin(selected);
                      if (margin === null) return null;
                      const color = pct! >= 40 ? '#10B981' : pct! >= 20 ? '#F59E0B' : '#EF4444';
                      return (
                        <div style={{ marginTop: 8, background: color + '15', border: `1px solid ${color}40`, borderRadius: 6, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color }}>Marge réelle</span>
                            <span className="mono" style={{ fontSize: 15, fontWeight: 800, color }}>{fmt(margin)} ({pct!.toFixed(1)}%)</span>
                          </div>
                          <div style={{ borderTop: '1px solid ' + color + '30', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {stripeFee > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                                <span>Stripe (~1,5% + 0,25€)</span>
                                <span className="mono">−{fmt(stripeFee)}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                              <span>URSSAF (12,3% du CA)</span>
                              <span className="mono">−{fmt(urssaf)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {selected.notes && <div style={{ marginTop: 12, padding: '10px 14px', background: '#F6F1E9', borderRadius: 6, fontSize: 12, fontStyle: 'italic', color: '#3E4550' }}>{selected.notes}</div>}

                {/* Tracking / Pickup */}
                {selected.delivery_mode === 'pickup' ? (
                  <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 6, padding: '14px 16px', marginTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#7C3AED' }}>🏪 {t('clickCollect')}</div>
                    <div style={{ fontSize: 13, color: '#5B21B6', marginTop: 6 }}>{t('pickupReady')}</div>
                  </div>
                ) : (
                  <div className="tracking-box">
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#0369A1' }}>{t('tracking')}</div>
                    {selected.tracking_number && (
                      <div style={{ fontSize: 14, fontFamily: 'DM Mono,monospace', color: '#0C4A6E', marginTop: 6, marginBottom: 8 }}>
                        {selected.tracking_number}
                      </div>
                    )}
                    <div className="tracking-row">
                      <input
                        className="form-control"
                        style={{ flex: 1 }}
                        placeholder={t('trackingPlaceholder')}
                        value={trackingInput}
                        onChange={e => setTrackingInput(e.target.value)}
                      />
                      <button className="btn btn-info btn-sm" onClick={saveTracking} disabled={savingTracking}>
                        {savingTracking ? '…' : '💾'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Status */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: '#6A7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>{t('changeStatus')}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.keys(T_ORDER_STATUS).map(k => (
                      <button key={k} className={`btn btn-sm ${selected.status === k ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => updateStatus(selected.id, k)}>
                        {ts(k)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="o-modal-footer">
                {!selected.is_test && (
                  <button
                    className="btn btn-sm btn-warning"
                    onClick={handleMarkTest}
                    disabled={markingTest}
                    title="Exclut la commande des stats ET de la comptabilité"
                  >
                    {markingTest ? '⏳…' : testConfirm ? t('markTestConfirm') : `🧪 ${t('markTest')}`}
                  </button>
                )}
                {!selected.is_test && (
                  <button
                    className="btn btn-sm"
                    onClick={toggleExcludeStats}
                    disabled={togglingStats}
                    title="Exclut des stats de marge uniquement — la compta reste intacte"
                    style={{
                      background: selected.exclude_from_stats ? '#EDE9FE' : '#F5F3FF',
                      color: '#5B21B6', border: '1px solid #DDD6FE',
                    }}
                  >
                    {togglingStats ? '⏳…' : selected.exclude_from_stats ? '📊 Réintégrer stats' : '📊 Hors stats'}
                  </button>
                )}
                {['paid', 'confirmed', 'shipped'].includes(selected.status) && !selected.is_test && (
                  <button
                    className="btn btn-sm"
                    style={{
                      background: refundConfirm ? '#EF4444' : '#FEE2E2',
                      color: refundConfirm ? '#fff' : '#991B1B',
                      border: '1px solid #FECACA',
                    }}
                    onClick={handleRefund}
                    disabled={refunding}
                  >
                    {refunding ? '⏳ Remboursement…' : refundConfirm ? t('refundConfirm') : `🔄 ${t('refund')}`}
                  </button>
                )}
                <a
                  href={`/admin/factures/${selected.id}`}
                  target="_blank"
                  rel="noopener"
                  className="btn btn-info"
                  style={{ textDecoration: 'none' }}
                >
                  🧾 Facture
                </a>
                <button className="btn btn-secondary" onClick={() => printDeliveryNote(selected)}>📄 {t('deliveryNote')}</button>
                <button className="btn btn-secondary" onClick={() => { setShowModal(false); setRefundConfirm(false); }}>{tc('cancel')}</button>
              </div>
            </div>
          </div>
        )}

        {/* New Order Modal */}
        {showNewModal && (
          <div className="o-modal-overlay" onClick={e => e.target === e.currentTarget && setShowNewModal(false)}>
            <div className="o-modal">
              <div className="o-modal-header"><span className="o-modal-title">{t('newOrderTitle')}</span><button className="btn btn-secondary btn-sm" onClick={() => setShowNewModal(false)}>✕</button></div>
              <div className="o-modal-body">
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">{t('custName')}</label><input className="form-control" value={newOrder.customer_name} onChange={e => setNewOrder(o => ({ ...o, customer_name: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">{tc('email')} *</label><input className="form-control" value={newOrder.customer_email} onChange={e => setNewOrder(o => ({ ...o, customer_email: e.target.value }))} /></div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">{tc('address')}</label><textarea className="form-control" style={{ minHeight: 60 }} value={newOrder.customer_address} onChange={e => setNewOrder(o => ({ ...o, customer_address: e.target.value }))} /></div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6A7280', marginBottom: 8 }}>{t('orderLines')}</div>
                  {newOrder.lines.map((l, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 90px 28px', gap: 6, marginBottom: 6 }}>
                      <input className="form-control" placeholder={tc('product')} value={l.desc} onChange={e => { const nl = [...newOrder.lines]; nl[i].desc = e.target.value; setNewOrder(o => ({ ...o, lines: nl })); }} />
                      <input type="number" className="form-control mono" placeholder={tc('qty')} value={l.qty} min={1} onChange={e => { const nl = [...newOrder.lines]; nl[i].qty = parseInt(e.target.value) || 1; setNewOrder(o => ({ ...o, lines: nl })); }} />
                      <input type="number" className="form-control mono" placeholder={tc('price')} value={l.price} step="0.01" onChange={e => { const nl = [...newOrder.lines]; nl[i].price = parseFloat(e.target.value) || 0; setNewOrder(o => ({ ...o, lines: nl })); }} />
                      <button onClick={() => setNewOrder(o => ({ ...o, lines: o.lines.filter((_, j) => j !== i) }))} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-sm" onClick={() => setNewOrder(o => ({ ...o, lines: [...o.lines, { desc: '', qty: 1, price: 0 }] }))}>{t('addLine')}</button>
                </div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">{t('shippingFee')}</label><input type="number" className="form-control mono" value={newOrder.shipping} step="0.01" onChange={e => setNewOrder(o => ({ ...o, shipping: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">{tc('notes')}</label><input className="form-control" value={newOrder.notes} onChange={e => setNewOrder(o => ({ ...o, notes: e.target.value }))} /></div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, fontFamily: 'DM Mono,monospace' }}>
                  {tc('total')} : {fmt(newOrder.lines.reduce((s, l) => s + l.qty * l.price, 0) + (parseFloat(newOrder.shipping) || 0))}
                </div>
              </div>
              <div className="o-modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>{tc('cancel')}</button>
                <button className="btn btn-primary" onClick={createOrder}>💾 {tc('create')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
