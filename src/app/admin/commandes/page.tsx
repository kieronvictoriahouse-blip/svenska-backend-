'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getAdminLang, setAdminLang, subscribeAdminLang, T_COMMON, T_ORDER_STATUS, AdminLang } from '@/lib/admin-i18n';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Order = {
  id: string; order_number: string; status: string;
  customer_name: string; customer_email: string; customer_phone?: string;
  shipping_address?: string; customer_address?: string;
  lines: any[]; subtotal: number; shipping: number; total: number;
  notes?: string; source?: string; created_at: string;
  tracking_number?: string; delivery_mode?: string;
  transport_cost_real?: number; packaging_cost?: number;
  is_test?: boolean; promo_code?: string; discount?: number;
  stripe_session_id?: string; exclude_from_stats?: boolean;
  relay_point_id?: string; relay_point_name?: string; relay_point_address?: string; relay_point_pays?: string;
  mondial_relay_tracking?: string; mondial_relay_label_url?: string;
  payment_link_url?: string; payment_link_sent_at?: string;
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
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockOrderId, setRestockOrderId] = useState<string | null>(null);
  const [markingTest, setMarkingTest] = useState(false);
  const [testConfirm, setTestConfirm] = useState(false);
  const [togglingStats, setTogglingStats] = useState(false);
  const [showTestOrders, setShowTestOrders] = useState(false);
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
  const [newOrder, setNewOrder] = useState({ customer_name: '', customer_email: '', customer_address: '', customer_country: 'France', notes: '' });
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelections, setPickerSelections] = useState<Record<string, { qty: number; variantLabel?: string; price: number }>>({});
  const [newOrderDelivery, setNewOrderDelivery] = useState<'pickup' | 'mondial_relay' | 'delivery'>('pickup');
  const [newOrderPromoCode, setNewOrderPromoCode] = useState('');
  const [newOrderPromoData, setNewOrderPromoData] = useState<any>(null);
  const [newOrderPromoMsg, setNewOrderPromoMsg] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);

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
  useEffect(() => {
    if (!selected || selected.status !== 'refunded') { setAvoirId(null); return; }
    const token = localStorage.getItem('sd_admin_token') || '';
    fetch(`/api/invoices?order_id=${selected.id}&status=avoir`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setAvoirId(d.invoices?.[0]?.id || null))
      .catch(() => setAvoirId(null));
  }, [selected?.id, selected?.status]);

  useEffect(() => {
    if (!selected) { setMrResult(null); return; }
    setMrLivRel(selected.relay_point_id || '');
    setMrResult(selected.mondial_relay_tracking
      ? { tracking: selected.mondial_relay_tracking, labelUrl: selected.mondial_relay_label_url || '' }
      : null);
    const token = localStorage.getItem('sd_admin_token') || '';
    fetch('/api/mondial-relay/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.mr_col_rel) setMrColRel(d.mr_col_rel); })
      .catch(() => {});
  }, [selected?.id]);

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
    setProductList(data.products || []);
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
    if (status === 'cancelled' || status === 'refunded') {
      setRestockOrderId(id);
      setShowRestockModal(true);
    }
  }

  async function doRestock(orderId: string) {
    const token = localStorage.getItem('sd_admin_token') || '';
    const res = await fetch(`/api/orders/${orderId}/restock`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
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
    await fetch(`/api/orders/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transport_cost_real, packaging_cost }),
    });
    setSelected(o => o ? { ...o, transport_cost_real, packaging_cost } : null);
    load();
    setSavingCosts(false);
    showToast('✅ Coûts enregistrés');
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

  function resetNewOrderModal() {
    setNewOrder({ customer_name: '', customer_email: '', customer_address: '', customer_country: 'France', notes: '' });
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
      const res = await fetch('/api/marketing?tab=promo', { headers: { Authorization: `Bearer ${token}` } });
      const { codes } = await res.json();
      const found = (codes || []).find((c: any) => c.code === code);
      if (!found || !found.is_active) { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code invalide ou inactif'); return; }
      const now = new Date();
      if (found.valid_from && now < new Date(found.valid_from)) { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code pas encore valide'); return; }
      if (found.valid_until && now > new Date(found.valid_until)) { setNewOrderPromoData(null); setNewOrderPromoMsg('❌ Code expiré'); return; }
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
    if (lines.length === 0) { showToast('⚠️ Ajoutez au moins un article'); return; }
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const baseShipping = subtotal >= 50 ? 0 : 4.90;
    const isFreeShip = newOrderPromoData?.type === 'free_shipping';
    const effectiveShipping = (newOrderDelivery === 'pickup' || isFreeShip) ? 0 : baseShipping;
    let discount = 0;
    if (newOrderPromoData?.type === 'percent') discount = Math.min(subtotal, (subtotal * newOrderPromoData.value) / 100);
    else if (newOrderPromoData?.type === 'fixed') discount = Math.min(subtotal, newOrderPromoData.value);
    const total = Math.max(0, subtotal - discount) + effectiveShipping;
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customer_name: newOrder.customer_name, customer_email: newOrder.customer_email,
          customer_address: newOrder.customer_address, customer_country: newOrder.customer_country,
          notes: newOrder.notes || null, lines, subtotal, shipping: effectiveShipping, total,
          delivery_mode: newOrderDelivery, source: 'manual',
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
    showToast('✅ Commande créée');
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

  async function sendPaymentLink(byEmail: boolean) {
    if (!selected) return;
    setSendingPaymentLink(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    try {
      const res = await fetch(`/api/orders/${selected.id}/payment-link`, {
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
      const res = await fetch('/api/customer/create-account', {
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
      const res = await fetch('/api/mondial-relay/label', {
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
      showToast('✅ Étiquette Mondial Relay créée !');
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

  function calcMargin(order: Order): { margin: number | null; pct: number | null; stripeFee: number; urssaf: number; transportReal: number; packagingCost: number; shippingCollected: number } {
    const empty = { margin: null, pct: null, stripeFee: 0, urssaf: 0, transportReal: 0, packagingCost: 0, shippingCollected: 0 };
    if (['cancelled', 'refunded'].includes(order.status)) return empty;
    const lines = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);
    const hasAny = lines.some((l: any) => l.product_id && costMap[l.product_id] != null);
    const total = order.total || 0;
    const shippingCollected = order.shipping || 0; // ce que le client a payé pour le port
    const stripeFee = order.source !== 'manual' && order.stripe_session_id
      ? Math.round((total * 0.015 + 0.25) * 100) / 100
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
    // Revenu = total (inclut le port payé par le client)
    // transport_cost_real est déduit en coût brut — le port perçu compense via le revenu total
    // Ex: total=25€ (dont 5€ port), transport_réel=4,50€ → net transport = 4,50 - 5,00 = -0,50 (bénéfice)
    const margin = total - stripeFee - urssaf - cost - transportReal - packagingCost;
    const pct = total > 0 ? (margin / total) * 100 : 0;
    return { margin, pct, stripeFee, urssaf, transportReal, packagingCost, shippingCollected };
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
    .btn-teal { background:#ECFDF5; color:#065F46; border:1px solid #6EE7B7; }
    .btn-teal:hover { background:#D1FAE5; }
    .btn-violet { background:#EDE9FE; color:#5B21B6; border:1px solid #DDD6FE; }
    .btn-violet:hover { background:#DDD6FE; }
    .payment-link-box { background:#F0F9FF; border:1px solid #BAE6FD; border-radius:6px; padding:14px 16px; margin-top:12px; }
    .payment-link-url { font-family:'DM Mono',monospace; font-size:11px; color:#0C4A6E; word-break:break-all; background:#E0F2FE; padding:6px 8px; border-radius:4px; margin-bottom:8px; }
    .picker-overlay { position:fixed; inset:0; background:rgba(28,32,40,0.6); z-index:300; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto; }
    .picker-modal { background:#fff; border-radius:6px; width:100%; max-width:560px; margin:auto; box-shadow:0 20px 60px rgba(0,0,0,0.25); }
    .picker-body { padding:4px 20px 16px; max-height:55vh; overflow-y:auto; }
    .picker-search { width:100%; padding:8px 12px; border:1px solid #D8CEBC; border-radius:6px; font-family:'Jost',sans-serif; font-size:13px; outline:none; box-sizing:border-box; margin-bottom:4px; }
    .picker-item { display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid #F0EBE1; }
    .picker-item:last-child { border-bottom:none; }
    .picker-item-img { width:44px; height:44px; object-fit:cover; border-radius:6px; border:1px solid #D8CEBC; flex-shrink:0; }
    .picker-item-noimg { width:44px; height:44px; border-radius:6px; border:1px solid #D8CEBC; background:#F0EBE1; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:18px; }
    .picker-item-info { flex:1; min-width:0; }
    .picker-item-name { font-size:13px; font-weight:600; color:#1C2028; margin-bottom:3px; }
    .picker-item-price { font-size:12px; color:#6A7280; font-family:'DM Mono',monospace; }
    .picker-variants { display:flex; gap:4px; flex-wrap:wrap; margin-top:4px; }
    .picker-variant-btn { padding:2px 8px; border-radius:4px; font-size:11px; border:1px solid #D8CEBC; background:#fff; cursor:pointer; font-family:'Jost',sans-serif; }
    .picker-variant-btn.active { background:#3E5238; color:#fff; border-color:#3E5238; }
    .picker-qty { display:flex; align-items:center; gap:4px; margin-top:6px; }
    .picker-qty-btn { width:22px; height:22px; border-radius:4px; border:1px solid #D8CEBC; background:#F6F1E9; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; line-height:1; }
    .picker-qty-val { font-family:'DM Mono',monospace; font-size:13px; min-width:20px; text-align:center; }
    .delivery-btn-row { display:flex; gap:6px; margin-bottom:4px; flex-wrap:wrap; }
    .delivery-btn { flex:1; padding:8px 10px; border-radius:6px; border:1px solid #D8CEBC; background:#F6F1E9; cursor:pointer; font-family:'Jost',sans-serif; font-size:12px; font-weight:500; text-align:center; min-width:80px; }
    .delivery-btn.active { background:#3E5238; color:#fff; border-color:#3E5238; }
    .selected-lines { margin-bottom:4px; }
    .selected-line { display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:#FDFAF5; border:1px solid #D8CEBC; border-radius:6px; margin-bottom:4px; font-size:13px; }
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
              <tr key={o.id} onClick={() => { setSelected(o); setTrackingInput(o.tracking_number || ''); setTransportInput(o.transport_cost_real ? String(o.transport_cost_real) : ''); setPackagingInput(o.packaging_cost ? String(o.packaging_cost) : ''); setShowModal(true); setTestConfirm(false); setRefundConfirm(false); }}
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

                    {/* Coûts réels */}
                    <div style={{ marginTop: 10, padding: '10px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#92400E', marginBottom: 8 }}>💸 Coûts réels (marge)</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: '#78350F' }}>🚚 Transport réel</span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number" min="0" step="0.01"
                            value={transportInput}
                            onChange={e => setTransportInput(e.target.value)}
                            onBlur={saveCosts}
                            placeholder="0.00"
                            className="mono"
                            style={{ width: 75, padding: '3px 6px', borderRadius: 4, border: '1px solid #FCD34D', fontSize: 12, textAlign: 'right', background: '#FFFBEB' }}
                          />
                          <span style={{ fontSize: 11, color: '#92400E' }}>€</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#78350F' }}>📦 Emballage</span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number" min="0" step="0.01"
                            value={packagingInput}
                            onChange={e => setPackagingInput(e.target.value)}
                            onBlur={saveCosts}
                            placeholder="0.00"
                            className="mono"
                            style={{ width: 75, padding: '3px 6px', borderRadius: 4, border: '1px solid #FCD34D', fontSize: 12, textAlign: 'right', background: '#FFFBEB' }}
                          />
                          <span style={{ fontSize: 11, color: '#92400E' }}>€</span>
                        </div>
                      </div>
                      {savingCosts && <div style={{ fontSize: 10, color: '#92400E', marginTop: 4, textAlign: 'right' }}>⏳ Sauvegarde…</div>}
                    </div>

                    {(() => {
                      const { margin, pct, stripeFee, urssaf, transportReal, packagingCost, shippingCollected } = calcMargin(selected);
                      if (margin === null) return null;
                      const color = pct! >= 40 ? '#10B981' : pct! >= 20 ? '#F59E0B' : '#EF4444';
                      const netTransport = transportReal - shippingCollected;
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
                            {transportReal > 0 && (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                                  <span>🚚 Transport réel</span>
                                  <span className="mono">−{fmt(transportReal)}</span>
                                </div>
                                {shippingCollected > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#10B981' }}>
                                    <span>✅ Port perçu client</span>
                                    <span className="mono">+{fmt(shippingCollected)}</span>
                                  </div>
                                )}
                                {shippingCollected === 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#F59E0B', fontStyle: 'italic' }}>
                                    <span>Livraison offerte (+50€) — transport à 100% à charge</span>
                                    <span />
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: netTransport <= 0 ? '#10B981' : '#6B7280', borderTop: '1px dashed #e5e7eb', paddingTop: 3, marginTop: 1 }}>
                                  <span>= Net transport</span>
                                  <span className="mono">{netTransport <= 0 ? '+' : '−'}{fmt(Math.abs(netTransport))}</span>
                                </div>
                              </>
                            )}
                            {packagingCost > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                                <span>📦 Emballage</span>
                                <span className="mono">−{fmt(packagingCost)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {selected.notes && <div style={{ marginTop: 12, padding: '10px 14px', background: '#F6F1E9', borderRadius: 6, fontSize: 12, fontStyle: 'italic', color: '#3E4550' }}>{selected.notes}</div>}

                {/* Lien de paiement */}
                {!['paid','confirmed','shipped','delivered','refunded','cancelled'].includes(selected.status) && (
                  <div className="payment-link-box">
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#0369A1', marginBottom: 10 }}>
                      💳 Lien de paiement Stripe
                    </div>
                    {selected.payment_link_url ? (
                      <>
                        <div className="payment-link-url">{selected.payment_link_url}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-sm btn-info" onClick={() => { navigator.clipboard?.writeText(selected.payment_link_url!); showToast('✅ Lien copié !'); }}>
                            📋 Copier le lien
                          </button>
                          <button className="btn btn-sm btn-info" onClick={() => sendPaymentLink(true)} disabled={sendingPaymentLink}>
                            {sendingPaymentLink ? '⏳…' : '📧 Renvoyer par email'}
                          </button>
                        </div>
                        {selected.payment_link_sent_at && (
                          <div style={{ fontSize: 10, color: '#6A7280', marginTop: 6 }}>
                            Dernier envoi : {new Date(selected.payment_link_sent_at).toLocaleString('fr-FR')}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-info" onClick={() => sendPaymentLink(false)} disabled={sendingPaymentLink}>
                          {sendingPaymentLink ? '⏳…' : '🔗 Générer le lien'}
                        </button>
                        {selected.customer_email && (
                          <button className="btn btn-sm btn-info" onClick={() => sendPaymentLink(true)} disabled={sendingPaymentLink}>
                            {sendingPaymentLink ? '⏳…' : '📧 Générer + envoyer par email'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

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

                {/* Mondial Relay */}
                {!['refunded', 'cancelled'].includes(selected.status) && (
                  <div className="tracking-box" style={{ background: '#F0F9FF', borderColor: '#BAE6FD', marginTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#0369A1', marginBottom: 10 }}>
                      🚚 Expédition Mondial Relay
                    </div>
                    {mrResult && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 12px', background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#065F46' }}>✅ {mrResult.tracking}</span>
                        {mrResult.labelUrl && (
                          <a href={mrResult.labelUrl} target="_blank" rel="noopener" style={{ fontSize: 12, color: '#0369A1', fontWeight: 600, textDecoration: 'none' }}>⬇️ Étiquette PDF</a>
                        )}
                      </div>
                    )}
                    {selected.relay_point_name && (
                      <div style={{ fontSize: 12, color: '#0C4A6E', marginBottom: 8, fontWeight: 600 }}>
                        📍 {selected.relay_point_name} — {selected.relay_point_address}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 8 }}>
                      <div>
                        <div className="form-label">Point relais livraison</div>
                        <input className="form-control" style={{ fontSize: 12 }} value={mrLivRel} onChange={e => setMrLivRel(e.target.value)} placeholder="Code relais (ex: 022546)" />
                      </div>
                      <div>
                        <div className="form-label">Relais de dépôt</div>
                        <input className="form-control" style={{ fontSize: 12 }} value={mrColRel} onChange={e => setMrColRel(e.target.value)} placeholder="Votre relais dépôt" />
                      </div>
                      <div>
                        <div className="form-label">Poids (g)</div>
                        <input type="number" className="form-control mono" style={{ fontSize: 12 }} value={mrWeight} min={1} onChange={e => setMrWeight(e.target.value)} />
                      </div>
                    </div>
                    <button
                      onClick={createMrLabel}
                      disabled={mrLoading || !mrLivRel || !mrColRel}
                      style={{
                        marginTop: 10,
                        background: mrLoading || !mrLivRel || !mrColRel ? '#93C5FD' : '#0369A1',
                        color: '#fff', border: 'none', borderRadius: 6,
                        padding: '8px 16px', fontSize: 13, fontWeight: 600,
                        cursor: mrLoading || !mrLivRel || !mrColRel ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {mrLoading ? '⏳ Création…' : '📦 Créer l\'étiquette'}
                    </button>
                  </div>
                )}
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
                {selected.customer_email && (
                  <button className="btn btn-sm btn-violet" onClick={createCustomerAccount} disabled={creatingAccount}
                    title="Crée le compte client et lui envoie un email avec son lien d'accès">
                    {creatingAccount ? '⏳…' : '👤 Créer compte client'}
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
                <a
                  href={`/api/invoices/${selected.id}/pdf`}
                  download
                  className="btn btn-sm"
                  style={{ textDecoration: 'none', background: '#ECFDF5', color: '#065F46', border: '1px solid #6EE7B7' }}
                >
                  ⬇️ PDF
                </a>
                {avoirId && (
                  <a
                    href={`/admin/factures/${avoirId}`}
                    target="_blank"
                    rel="noopener"
                    className="btn btn-sm"
                    style={{ textDecoration: 'none', background: '#EDE9FE', color: '#5B21B6', border: '1px solid #DDD6FE' }}
                  >
                    ↩️ Avoir
                  </a>
                )}
                {avoirId && (
                  <a
                    href={`/api/invoices/${avoirId}/pdf`}
                    download
                    className="btn btn-sm"
                    style={{ textDecoration: 'none', background: '#F5F3FF', color: '#5B21B6', border: '1px solid #DDD6FE' }}
                  >
                    ⬇️ PDF avoir
                  </a>
                )}
                <button className="btn btn-secondary" onClick={() => printDeliveryNote(selected)}>📄 {t('deliveryNote')}</button>
                <button className="btn btn-secondary" onClick={() => { setShowModal(false); setRefundConfirm(false); }}>{tc('cancel')}</button>
              </div>
            </div>
          </div>
        )}

        {/* New Order Modal */}
        {showNewModal && (() => {
          const pickerLines = Object.entries(pickerSelections).filter(([, s]) => s.qty > 0).map(([pid, s]) => {
            const p = productList.find(x => x.id === pid);
            const variantObj = s.variantLabel ? p?.product_variants?.find(v => v.label === s.variantLabel) : null;
            const price = variantObj ? variantObj.price : (p?.price || s.price);
            return { pid, name: (p?.name_fr || pid) + (s.variantLabel ? ` — ${s.variantLabel}` : ''), qty: s.qty, price };
          });
          const subtotal = pickerLines.reduce((s, l) => s + l.qty * l.price, 0);
          const baseShipping = subtotal >= 50 ? 0 : 4.90;
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
                            <span style={{ flex: 1 }}>{l.name} <span style={{ color: '#6A7280' }}>× {l.qty}</span></span>
                            <span className="mono" style={{ fontSize: 12, marginRight: 10 }}>{fmt(l.qty * l.price)}</span>
                            <button onClick={() => setPickerSelections(s => { const n = { ...s }; delete n[l.pid]; return n; })} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Mode de livraison</label>
                    <div className="delivery-btn-row">
                      <button className={`delivery-btn${newOrderDelivery === 'pickup' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('pickup')}>🏪 Click & Collect</button>
                      <button className={`delivery-btn${newOrderDelivery === 'mondial_relay' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('mondial_relay')}>📦 Point Relais</button>
                      <button className={`delivery-btn${newOrderDelivery === 'delivery' ? ' active' : ''}`} onClick={() => setNewOrderDelivery('delivery')}>🚚 Livraison domicile</button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Code promo (optionnel)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="form-control mono" style={{ textTransform: 'uppercase', flex: 1 }} placeholder="Ex: SWEDISH10"
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
                        <span>Sous-total</span><span className="mono">{fmt(subtotal)}</span>
                      </div>
                      {discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#16A34A' }}>
                          <span>🎟 {newOrderPromoData.code}</span><span className="mono">−{fmt(discount)}</span>
                        </div>
                      )}
                      {isFreeShip && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#16A34A' }}>
                          <span>🎟 {newOrderPromoData.code}</span><span className="mono">Livraison offerte</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#6A7280' }}>
                        <span>Livraison</span>
                        <span className="mono" style={{ color: effectiveShipping === 0 ? '#10B981' : 'inherit' }}>
                          {effectiveShipping === 0 ? 'Gratuite' : fmt(effectiveShipping)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid #D8CEBC', paddingTop: 8, marginTop: 4 }}>
                        <span>Total</span><span className="mono">{fmt(total)}</span>
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
                  <input className="picker-search" placeholder="Rechercher un produit..." value={pickerSearch}
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
                          <div className="picker-item-name">{p.name_fr}</div>
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
                  <button className="btn btn-secondary" onClick={() => setShowProductPicker(false)}>Annuler</button>
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
                <p style={{ margin: '0 0 8px' }}>Cette commande a été annulée ou remboursée.</p>
                <p style={{ margin: 0 }}>Voulez-vous remettre les articles en stock ?</p>
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
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
