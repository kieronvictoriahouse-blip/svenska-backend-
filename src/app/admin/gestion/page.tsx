'use client';
import { adminFetch, downloadAuth } from '@/lib/auth-client';
import { T as TH } from '@/lib/admin-theme';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useT } from '@/lib/admin-i18n';
import { useIsMobile } from '@/lib/use-mobile';
import SegTabs, { minTextCss } from '@/components/SegTabs';
import { TGE } from './i18n';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── TYPES ──────────────────────────────────────────────
type Invoice = {
  id: string; number: string; date: string; status: string;
  client_name: string; client_address?: string; client_email?: string;
  note?: string; lines: InvoiceLine[];
  total_ht: number; total_tva: number; total_ttc: number;
  created_at?: string;
};
type InvoiceLine = { desc: string; qty: number; price: number; tva: number };
type Purchase = {
  id: string; supplier: string; date: string; ref?: string; status: string;
  amount: number; transport: number; total: number; products?: string; notes?: string;
};
type MarginProduct = {
  id: string; name: string; cat?: string;
  buy: number; trans: number; other: number; revient: number; sell: number; stock?: number;
};
type Params = {
  company: string; legal: string; siret: string; tva: string; address: string;
  email: string; phone: string; website: string; tva_rate: number;
  payment_days: number; legal_mention: string; iban: string;
  inv_prefix: string; inv_next: number;
};

// ── UTILS ──────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtPct = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string) => d ? new Date(d + 'T12:00').toLocaleDateString('fr-FR') : '—';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700', late: 'bg-red-100 text-red-700',
  received: 'bg-blue-100 text-blue-700', pending: 'bg-yellow-100 text-yellow-700',
  avoir: 'bg-purple-100 text-purple-700', refunded: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', late: 'En retard',
  received: 'Reçue', pending: 'En attente',
  avoir: 'Avoir', refunded: 'Remboursée',
};

export default function GestionPage() {
  const { t, tc, lang } = useT(TGE);
  const isMobile = useIsMobile();
  const [page, setPage] = useState<'dashboard' | 'factures' | 'achats' | 'marges' | 'transport' | 'params'>('dashboard');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<MarginProduct[]>([]);
  const [realProds, setRealProds] = useState<MarginProduct[]>([]);
  const [params, setParams] = useState<Params>({
    company: '', legal: 'Auto-entrepreneur',
    siret: '', tva: '', address: '', email: '',
    phone: '', website: '', tva_rate: 20,
    payment_days: 30, legal_mention: 'TVA non applicable - article 293B du CGI',
    iban: '', inv_prefix: 'SD-', inv_next: 1,
  });
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  // Invoice modal state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([{ desc: '', qty: 1, price: 0, tva: 20 }]);
  const [invForm, setInvForm] = useState({ number: '', date: today(), status: 'draft', client_name: '', client_address: '', client_email: '', note: '' });

  // Purchase modal state
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purForm, setPurForm] = useState({ supplier: '', date: today(), ref: '', status: 'received', amount: '', transport: '', total: '', products: '', notes: '' });

  // Margin modal state
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MarginProduct | null>(null);
  const [mpForm, setMpForm] = useState({ name: '', cat: '', buy: '', trans: '0', other: '0', sell: '', stock: '' });
  const [mpResult, setMpResult] = useState<{ revient: number; marginEur: number; marginPct: number; suggested: number } | null>(null);
  const [marginTarget, setMarginTarget] = useState(40);

  // Transport state
  const [trLines, setTrLines] = useState([{ name: '', weight: '', value: '', qty: 1 }, { name: '', weight: '', value: '', qty: 1 }]);
  const [trCost, setTrCost] = useState('');
  const [trMethod, setTrMethod] = useState('weight');
  const [trResult, setTrResult] = useState<any[]>([]);

  // Preview state
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  // ── LOAD DATA ──────────────────────────────────────────
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('sd_admin_token') || '' : '';
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const [invRes, { data: pur }, { data: prd }, { data: prm }, realRes] = await Promise.all([
      adminFetch('/api/invoices', { headers: authHeaders }),
      supabase.from('purchases').select('*').order('created_at', { ascending: false }),
      supabase.from('margin_products').select('*').order('created_at', { ascending: false }),
      supabase.from('company_settings').select('*'),
      adminFetch('/api/products?limit=500', { headers: authHeaders }),
    ]);
    if (invRes.ok) { const d = await invRes.json(); setInvoices(d.invoices || []); }
    if (pur) setPurchases(pur);
    if (prd) setProducts(prd);
    if (prm && prm.length > 0) {
      const p: any = {};
      prm.forEach((r: any) => { p[r.key] = isNaN(r.value) ? r.value : Number(r.value) || r.value; });
      setParams(prev => ({ ...prev, ...p }));
    }
    const realData = await realRes.json();
    const mapped: MarginProduct[] = (realData.products || [])
      .filter((p: any) => p.cost_price > 0 && parseFloat(p.price) > 0)
      .map((p: any) => ({
        id: p.id,
        name: p.name_fr,
        cat: p.categories?.name_fr || '',
        buy: parseFloat(p.cost_price) || 0,
        trans: 0,
        other: 0,
        revient: parseFloat(p.cost_price) || 0,
        sell: parseFloat(p.price) || 0,
        stock: p.stock ?? null,
      }));
    setRealProds(mapped);
    setLoading(false);
  }

  // ── INVOICES ───────────────────────────────────────────
  function openNewInvoice() {
    setEditingInvoice(null);
    setInvoiceLines([{ desc: '', qty: 1, price: 0, tva: params.tva_rate || 20 }]);
    setInvForm({ number: params.inv_prefix + String(params.inv_next).padStart(4, '0'), date: today(), status: 'draft', client_name: '', client_address: '', client_email: '', note: '' });
    setShowInvoiceModal(true);
  }

  function openEditInvoice(inv: Invoice) {
    setEditingInvoice(inv);
    setInvoiceLines(inv.lines || []);
    setInvForm({ number: inv.number, date: inv.date, status: inv.status, client_name: inv.client_name, client_address: inv.client_address || '', client_email: inv.client_email || '', note: inv.note || '' });
    setShowInvoiceModal(true);
  }

  function calcInvoiceTotals(lines: InvoiceLine[]) {
    let ht = 0, tva = 0;
    lines.forEach(l => { ht += l.qty * l.price; tva += l.qty * l.price * (l.tva / 100); });
    return { ht, tva, ttc: ht + tva };
  }

  async function saveInvoice() {
    if (!invForm.client_name.trim()) { showToast(t('msgClientRequis')); return; }
    const { ht, tva, ttc } = calcInvoiceTotals(invoiceLines);
    const token = typeof window !== 'undefined' ? localStorage.getItem('sd_admin_token') || '' : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const payload = {
      number: invForm.number, date: invForm.date, status: invForm.status,
      client_name: invForm.client_name, client_address: invForm.client_address,
      client_email: invForm.client_email, note: invForm.note,
      lines: JSON.stringify(invoiceLines), total_ht: ht, total_tva: tva, total_ttc: ttc,
    };

    let res: Response;
    if (editingInvoice) {
      res = await adminFetch(`/api/invoices/${editingInvoice.id}`, { method: 'PUT', headers, body: JSON.stringify({ status: invForm.status, note: invForm.note, date: invForm.date }) });
    } else {
      res = await adminFetch('/api/invoices', { method: 'POST', headers, body: JSON.stringify(payload) });
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      showToast(t('msgErreur') + (e?.error || res.status)); return;
    }
    setShowInvoiceModal(false);
    showToast(t('msgFactureOk'));
    loadAll();
  }

  async function deleteInvoice(id: string) {
    if (!confirm(t('msgFactureDel'))) return;
    await supabase.from('invoices').delete().eq('id', id);
    showToast(t('msgFactureDelOk'));
    loadAll();
  }

  // ── PURCHASES ──────────────────────────────────────────
  function calcPurchaseTotal(amount: string, transport: string) {
    const a = parseFloat(amount) || 0;
    const t = parseFloat(transport) || 0;
    return (a + t).toFixed(2);
  }

  async function savePurchase() {
    if (!purForm.supplier.trim()) { showToast(t('msgFournisseurReq')); return; }
    const { error } = await supabase.from('purchases').insert({
      id: uid(), supplier: purForm.supplier, date: purForm.date, ref: purForm.ref,
      status: purForm.status, amount: parseFloat(purForm.amount) || 0,
      transport: parseFloat(purForm.transport) || 0, total: parseFloat(purForm.total) || 0,
      products: purForm.products, notes: purForm.notes,
    });
    if (error) { showToast(t('msgErreur') + error.message); return; }
    setShowPurchaseModal(false);
    showToast(t('msgAchatOk'));
    loadAll();
  }

  async function deletePurchase(id: string) {
    if (!confirm(t('msgAchatDel'))) return;
    await supabase.from('purchases').delete().eq('id', id);
    showToast(t('msgAchatDelOk'));
    loadAll();
  }

  // ── MARGINS ────────────────────────────────────────────
  function calcMpResult(form: typeof mpForm) {
    const buy = parseFloat(form.buy) || 0;
    const trans = parseFloat(form.trans) || 0;
    const other = parseFloat(form.other) || 0;
    const sell = parseFloat(form.sell) || 0;
    if (!buy || !sell) { setMpResult(null); return; }
    const revient = buy + trans + other;
    const marginEur = sell - revient;
    const marginPct = (marginEur / sell) * 100;
    const suggested = revient / (1 - marginTarget / 100);
    setMpResult({ revient, marginEur, marginPct, suggested });
  }

  function openNewProduct() {
    setEditingProduct(null);
    const form = { name: '', cat: '', buy: '', trans: '0', other: '0', sell: '', stock: '' };
    setMpForm(form);
    setMpResult(null);
    setShowMarginModal(true);
  }

  function openEditProduct(p: MarginProduct) {
    setEditingProduct(p);
    const form = { name: p.name, cat: p.cat || '', buy: String(p.buy), trans: String(p.trans), other: String(p.other), sell: String(p.sell), stock: String(p.stock || 0) };
    setMpForm(form);
    calcMpResult(form);
    setShowMarginModal(true);
  }

  async function saveProduct() {
    if (!mpForm.name || !mpForm.buy || !mpForm.sell) { showToast(t('msgProduitReq')); return; }
    const buy = parseFloat(mpForm.buy) || 0;
    const trans = parseFloat(mpForm.trans) || 0;
    const other = parseFloat(mpForm.other) || 0;
    const revient = buy + trans + other;
    const prod = {
      id: editingProduct?.id || uid(), name: mpForm.name, cat: mpForm.cat,
      buy, trans, other, revient, sell: parseFloat(mpForm.sell) || 0, stock: parseInt(mpForm.stock) || 0,
    };
    const { error } = await supabase.from('margin_products').upsert(prod);
    if (error) { showToast(t('msgErreur') + error.message); return; }
    setShowMarginModal(false);
    showToast(t('msgProduitOk'));
    loadAll();
  }

  async function deleteProduct(id: string) {
    if (!confirm(t('msgProduitDel'))) return;
    await supabase.from('margin_products').delete().eq('id', id);
    showToast(t('msgProduitDelOk'));
    loadAll();
  }

  // ── TRANSPORT ──────────────────────────────────────────
  function calcTransport() {
    const totalCost = parseFloat(trCost) || 0;
    if (!totalCost || !trLines.length) return;
    let totalBase = 0;
    trLines.forEach(l => {
      const qty = l.qty || 1;
      if (trMethod === 'weight') totalBase += (parseFloat(l.weight) || 0) * qty;
      else if (trMethod === 'value') totalBase += (parseFloat(l.value) || 0) * qty;
      else totalBase += qty;
    });
    if (totalBase === 0) { showToast(t('msgValeurs')); return; }
    const rows = trLines.map(l => {
      const qty = l.qty || 1;
      let base = 0;
      if (trMethod === 'weight') base = (parseFloat(l.weight) || 0) * qty;
      else if (trMethod === 'value') base = (parseFloat(l.value) || 0) * qty;
      else base = qty;
      const ratio = base / totalBase;
      const totalTr = totalCost * ratio;
      const perUnit = totalTr / qty;
      return { ...l, qty, base, ratio, totalTr, perUnit };
    });
    setTrResult(rows);
  }

  // ── PARAMS ─────────────────────────────────────────────
  async function saveParamsToDb() {
    const entries = Object.entries(params).map(([key, value]) => ({ key, value: String(value) }));
    const { error } = await supabase.from('company_settings').upsert(entries);
    if (error) { showToast(t('msgErreur') + error.message); return; }
    showToast(t('msgParamsOk'));
  }

  // ── MARGIN COLOR ───────────────────────────────────────
  function marginColor(pct: number) {
    if (pct >= marginTarget) return '#16A34A';
    if (pct >= marginTarget * 0.6) return '#D97706';
    return '#DC2626';
  }

  // ── DASHBOARD STATS ────────────────────────────────────
  const totalCA = invoices.filter(i => i.status !== 'draft').reduce((s, i) => s + i.total_ht, 0);
  const pending = invoices.filter(i => i.status === 'sent' || i.status === 'late').reduce((s, i) => s + i.total_ttc, 0);
  const marginsSource = realProds.length > 0 ? realProds : products;
  const avgMargin = marginsSource.length > 0
    ? marginsSource.filter(p => p.sell > 0).reduce((s, p) => s + (p.sell - p.revient) / p.sell * 100, 0) / marginsSource.filter(p => p.sell > 0).length
    : 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Jost, sans-serif', color: '#6A7280' }}>
      Chargement…
    </div>
  );

  const css = `
    /* Facturation — classes historiques remappees sur les tokens du
       nouveau design. Les blocs de shell (g-shell, g-sidebar, g-nav,
       g-logo, g-topbar) ne sont plus rendus : la navigation vient du
       shell global et les onglets remplacent l'ancienne sidebar. */

    .g-content { padding: 0; }
    .g-page-header { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
    .g-page-title { font-size:17px; font-weight:600; letter-spacing:-.2px; color:${TH.ink}; }
    .g-page-sub { font-size:11.5px; color:${TH.text3}; margin-top:2px; }

    .g-section { background:#fff; border:1px solid ${TH.border}; border-radius:10px; padding:15px; margin-bottom:12px; }

    .g-card { background:#fff; border:1px solid ${TH.border}; border-radius:10px; overflow:hidden; margin-bottom:12px; }
    .g-card-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 15px; border-bottom:1px solid ${TH.border}; }
    .g-card-title { font-size:12.5px; font-weight:600; color:${TH.ink}; }

    .g-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(178px,1fr)); gap:10px; margin-bottom:12px; }
    .g-stat { background:#fff; border:1px solid ${TH.border}; border-radius:10px; padding:13px 15px; display:flex; align-items:center; gap:11px; }
    .g-stat-icon { display:none; }
    .g-stat-num { font-size:23px; font-weight:700; color:${TH.ink}; font-variant-numeric:tabular-nums; letter-spacing:-.4px; }
    .g-stat-label { font-size:9.5px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:${TH.muted}; margin-top:3px; }

    .g-grid-2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }
    .g-grid-3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }

    .g-table { width:100%; border-collapse:collapse; background:#fff; font-size:12.5px; }
    .g-table th { padding:8px 14px; text-align:left; font-size:9px; font-weight:600; letter-spacing:1.3px; text-transform:uppercase; color:${TH.muted}; background:${TH.surfaceAlt}; border-bottom:1px solid ${TH.border}; white-space:nowrap; }
    .g-table td { padding:7px 14px; border-bottom:1px solid ${TH.borderFaint}; color:${TH.text2b}; }
    .g-table tr:last-child td { border-bottom:none; }
    .g-table tbody tr:hover td { background:${TH.rowHover}; }

    .badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; letter-spacing:.3px; white-space:nowrap; }

    .btn { display:inline-flex; align-items:center; gap:6px; border-radius:7px; padding:8px 14px; font-size:12.5px; font-weight:500; cursor:pointer; border:1px solid ${TH.borderField}; background:#fff; color:#3A3228; text-decoration:none; transition:background .12s,border-color .12s; }
    .btn:hover { background:#F7F4EF; }
    .btn-primary { background:${TH.ink}; color:#fff; border-color:${TH.ink}; }
    .btn-primary:hover { background:${TH.inkHover}; }
    .btn-secondary { background:#fff; }
    .btn-danger { background:#fff; color:${TH.red}; border-color:#EBD5D1; }
    .btn-danger:hover { background:#FBE7E4; }
    .btn-sm { padding:5px 10px; font-size:11.5px; }

    .form-group { margin-bottom:12px; }
    .form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
    .form-label { display:block; font-size:11px; font-weight:600; color:${TH.text2b}; margin-bottom:5px; }
    .form-control { width:100%; height:34px; border:1px solid ${TH.borderField}; border-radius:7px; padding:0 10px; font-size:12.5px; color:${TH.ink}; background:#fff; outline:none; transition:border-color .12s; }
    .form-control:focus { border-color:var(--accent); }
    textarea.form-control { height:auto; padding:8px 10px; line-height:1.5; }

    .mono { font-variant-numeric:tabular-nums; }
    .price { font-variant-numeric:tabular-nums; font-weight:600; }
    .empty { padding:44px 20px; text-align:center; color:${TH.muted}; font-size:12.5px; }

    .margin-bar { height:6px; border-radius:3px; background:${TH.borderFaint2}; overflow:hidden; }
    .margin-fill { height:100%; border-radius:3px; background:var(--accent); }

    .result-box { background:#F2F5F0; border:1px solid ${TH.border}; border-radius:8px; padding:12px 14px; }
    .result-row { display:flex; justify-content:space-between; font-size:12.5px; color:${TH.text2b}; padding:5px 0; }
    .result-total { display:flex; justify-content:space-between; align-items:baseline; font-size:15px; font-weight:700; color:${TH.ink}; padding-top:8px; margin-top:4px; border-top:1px solid ${TH.border}; }

    /* Modales */
    .g-modal-overlay { position:fixed; inset:0; background:rgba(21,24,30,.45); backdrop-filter:blur(2px); z-index:200; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto; }
    .g-modal { background:#fff; border:1px solid ${TH.border}; border-radius:10px; width:100%; max-width:640px; margin:auto; box-shadow:0 20px 60px rgba(0,0,0,.2); }
    .g-modal-header { padding:14px 18px; border-bottom:1px solid ${TH.border}; display:flex; align-items:center; justify-content:space-between; }
    .g-modal-title { font-size:14px; font-weight:600; color:${TH.ink}; }
    .g-modal-body { padding:18px; max-height:74vh; overflow-y:auto; }
    .g-modal-footer { padding:13px 18px; border-top:1px solid ${TH.border}; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }

    /* Mise en page déplacée des styles en ligne (mêmes valeurs sur ordinateur) */
    .g-dash-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .g-tr-2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    .g-trline { display:grid; grid-template-columns:2fr 1fr 60px 28px; gap:6px; margin-bottom:6px; align-items:center; }
    .fs12 { font-size:12px; }
    .g-lines td { padding:3px 4px; }
    .g-lines td.g-ln-qty { width:60px; } .g-lines td.g-ln-qty .form-control { width:60px; }
    .g-lines td.g-ln-pu { width:90px; } .g-lines td.g-ln-pu .form-control { width:90px; }
    .g-lines td.g-ln-tva { width:65px; } .g-lines td.g-ln-tva .form-control { width:65px; }
    .g-lines td.g-ln-total { padding:3px 8px; font-family:var(--font-mono); font-size:12px; white-space:nowrap; }
    .g-lines td.g-ln-x { padding:0; }
    .g-totals { min-width:220px; }
    .g-prev { border:1px solid var(--linen); border-radius:var(--r); padding:32px; font-size:13px; line-height:1.6; }
    .g-prev-top { display:flex; justify-content:space-between; margin-bottom:32px; }
    .g-mlist, .g-sub { display:none; }

    /* ═══ Téléphone ═══ */
    @media (max-width: 899px) {
      .g-stats { grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
      .g-stat { padding:12px; }
      .g-stat-num { font-size:19px; letter-spacing:-.3px; }
      .g-stat-label { font-size:12px; letter-spacing:.6px; }
      .g-dash-2, .g-tr-2 { grid-template-columns:minmax(0,1fr); gap:12px; }
      .g-card-header { padding:8px 8px 8px 14px; }
      .g-card-title { font-size:14px; }
      .btn { min-height:44px; font-size:14px; justify-content:center; }
      .btn-sm { min-width:44px; padding:8px 12px; font-size:13.5px; }
      .btn-sm .ms { font-size:20px !important; }
      .form-label { font-size:12.5px; }
      .form-control, .form-control.fs12 { height:44px; font-size:16px; }
      textarea.form-control { height:auto; }
      .badge { font-size:11px; }
      .empty { font-size:14px; padding:32px 16px; }
      .result-row { font-size:14px; }
      .g-totals { min-width:0; width:100%; }

      /* Tableaux en cartes (classe partagée .sc-stack) sur deux colonnes */
      .sc-table.sc-stack.g-pairs tr { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); column-gap:14px; }
      .sc-table.sc-stack.g-pairs td.sc-stack-main, .sc-table.sc-stack.g-pairs td.sc-stack-actions, .sc-table.sc-stack.g-pairs td.g-full { grid-column:1 / -1; }
      .sc-table.sc-stack.g-pairs td { font-size:13.5px; }
      .sc-table.sc-stack td.sc-stack-main .g-sub { display:block; font-size:12.5px; font-weight:400; color:${TH.muted}; margin-top:2px; }

      /* Marges : liste compacte (une ligne par produit) */
      .g-mlist { display:block; }
      .g-mrow { display:flex; align-items:center; gap:10px; padding:10px 6px 10px 14px; border-bottom:1px solid ${TH.borderFaint}; text-decoration:none; color:inherit; min-height:56px; }
      .g-mrow:last-child { border-bottom:none; }

      /* Répartition transport : nom sur une ligne, valeur · quantité · retirer dessous */
      .g-trline { grid-template-columns:minmax(0,1fr) 76px 44px; gap:8px; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid ${TH.borderFaint}; }
      .g-trline > :first-child { grid-column:1 / -1; }
      .g-x { min-width:44px; min-height:44px; font-size:18px !important; }

      /* Lignes de facture : une carte par ligne */
      .g-lines, .g-lines tbody { display:block; width:100%; }
      .g-lines thead { display:none; }
      .g-lines tr { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; padding:10px 0; border-bottom:1px solid ${TH.border}; }
      .g-lines td, .g-lines td.g-ln-qty, .g-lines td.g-ln-pu, .g-lines td.g-ln-tva { display:block; width:auto; padding:0; }
      .g-lines td .form-control, .g-lines td.g-ln-qty .form-control, .g-lines td.g-ln-pu .form-control, .g-lines td.g-ln-tva .form-control { width:100%; }
      .g-lines td[data-label]::before { content:attr(data-label); display:block; font-size:12px; font-weight:600; color:${TH.text2b}; margin-bottom:4px; }
      .g-lines td.g-ln-desc { grid-column:1 / -1; }
      .g-lines td.g-ln-total { grid-column:1 / 3; padding:0; align-self:center; font-size:14px; font-family:inherit; }
      .g-lines td.g-ln-total::before { display:inline !important; margin-right:6px; }
      .g-lines td.g-ln-x { display:flex; justify-content:flex-end; }

      /* Fenêtres : plein écran, en-tête et pied collés */
      .g-modal-overlay { padding:0; align-items:stretch; }
      .g-modal { max-width:none !important; margin:0; border-radius:0; border:none; min-height:100%; display:flex; flex-direction:column; }
      .g-modal-header { position:sticky; top:0; z-index:2; background:#fff; padding:6px 6px 6px 16px; }
      .g-modal-body { max-height:none; flex:1; padding:16px; }
      .g-modal-footer { position:sticky; bottom:0; background:#fff; padding:10px 12px calc(10px + env(safe-area-inset-bottom)); }
      .g-modal-footer > .btn { flex:1 1 0; }
      .g-prev { padding:16px; }
      .g-prev-top { flex-wrap:wrap; gap:12px; margin-bottom:20px; }
    }
    /* globals.css (ancien thème) masque tout <span> d'un .btn sous 480 px :
       les boutons-icônes (modifier, aperçu, PDF…) devenaient des cases vides. */
    @media (max-width: 480px) { .g-root .btn span { display:inline-block; } }
    ${minTextCss('.g-root')}
  `;

  const NAV = [
    { id: 'dashboard', icon: '', label: 'Vue d\'ensemble' },
    { id: 'factures', icon: '', label: 'Factures clients', count: invoices.length },
    { id: 'achats', icon: '', label: 'Achats fournisseurs' },
    { id: 'marges', icon: '', label: 'Calcul des marges' },
    { id: 'transport', icon: '', label: 'Répartition transport' },
    { id: 'params', icon: '', label: 'Paramètres' },
  ];

  const PAGE_TITLES: Record<string, string> = {
    dashboard: 'Vue d\'ensemble ', factures: 'Factures clients',
    achats: 'Achats fournisseurs', marges: 'Calcul des marges',
    transport: 'Répartition transport', params: 'Paramètres',
  };

  const G_TABS: Array<[string, string]> = [
    ['dashboard', "Vue d'ensemble"],
    ['factures', 'Factures clients'],
    ['marges', 'Calcul des marges'],
    ['transport', 'Répartition transport'],
    ['params', 'Paramètres'],
  ];
  // Téléphone : libellés courts + icônes, les cinq onglets visibles d'un coup
  const G_TABS_M: Record<string, [string, string]> = {
    dashboard: ['Aperçu', 'space_dashboard'], factures: ['Factures', 'receipt_long'],
    marges: ['Marges', 'percent'], transport: ['Transport', 'local_shipping'], params: ['Réglages', 'settings'],
  };
  const realSorted = [...realProds].sort((a, b) => (b.sell - b.revient) / b.sell - (a.sell - a.revient) / a.sell);

  return (
    <div className="g-root">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            {invoices.length} facture(s) · {fmt(pending)} en attente d'encaissement
          </div>
        </div>
        <div className="sc-actions">
          {page === 'factures' && (
            <button className="sc-btn sc-btn-primary" onClick={openNewInvoice}>
              <span className="ms">add</span>{t('nouvelleFacture')}
            </button>
          )}
          {page === 'marges' && (
            <button className="sc-btn sc-btn-secondary" onClick={openNewProduct}>
              <span className="ms">calculate</span>{t('simulation')}
            </button>
          )}
          {page === 'params' && !isMobile && (
            <button className="sc-btn sc-btn-green" onClick={saveParamsToDb}>
              <span className="ms">save</span>{t('sauvegarder')}
            </button>
          )}
          <a className="sc-btn sc-btn-secondary" href="/admin/achats">
            <span className="ms">shopping_basket</span>{t('achats')}
          </a>
        </div>
      </div>

      <div className="sc-only-mobile" style={{ marginBottom: 12 }}>
        <SegTabs label="Sections de la facturation" value={page} onChange={k => setPage(k as any)}
                 tabs={G_TABS.map(([k, l]) => ({ key: k as typeof page, label: G_TABS_M[k][0], icon: G_TABS_M[k][1], title: l, badge: k === 'factures' ? invoices.length : undefined }))} />
      </div>

      <div className="sc-hide-mobile" style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${TH.border}`, overflowX: 'auto' }}>
        {G_TABS.map(([k, l]) => {
          const on = page === k;
          return (
            <button key={k} onClick={() => setPage(k as any)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer', padding: '9px 13px', fontSize: 12.5,
                whiteSpace: 'nowrap', fontWeight: on ? 600 : 400,
                color: on ? 'var(--accent)' : TH.text2,
                boxShadow: on ? 'inset 0 -2px 0 var(--accent)' : undefined,
              }}>
              {l}
              {k === 'factures' && invoices.length > 0 && (
                <span style={{ marginLeft: 6, background: '#EFEBE4', color: '#857C71', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}>
                  {invoices.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

          <div className="g-content">

            {/* ── DASHBOARD ── */}
            {page === 'dashboard' && (
              <>
                <div className="g-stats">
                  <div className="g-stat"><span className="g-stat-icon"></span><div><div className="g-stat-num mono">{fmt(totalCA)}</div><div className="g-stat-label">CA FACTURÉ HT</div></div></div>
                  <div className="g-stat"><span className="g-stat-icon"></span><div><div className="g-stat-num mono">{invoices.filter(i => i.status !== 'draft').length}</div><div className="g-stat-label">FACTURES ÉMISES</div></div></div>
                  <div className="g-stat"><span className="g-stat-icon"></span><div><div className="g-stat-num mono">{fmt(pending)}</div><div className="g-stat-label">EN ATTENTE</div></div></div>
                  <div className="g-stat"><span className="g-stat-icon"></span><div><div className="g-stat-num mono">{fmtPct(avgMargin)}</div><div className="g-stat-label">MARGE MOY.</div></div></div>
                </div>
                <div className="g-dash-2">
                  <div className="g-card">
                    <div className="g-card-header"><span className="g-card-title">{t('dernieres')}</span><button className="btn btn-secondary btn-sm" onClick={() => setPage('factures')}>{t('voirTout')}</button></div>
                    {invoices.slice(0, 5).map(i => (
                      <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--linen)' }}>
                        <div><div style={{ fontSize: 13, fontWeight: 600 }}>{i.client_name || '—'}</div><div style={{ fontSize: 11, color: 'var(--dust)' }}>{i.number} · {fmtDate(i.date)}</div></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="mono" style={{ fontSize: 13 }}>{fmt(i.total_ttc)}</span>
                          <span className={`badge ${STATUS_BADGE[i.status] || ''}`}>{STATUS_LABEL[i.status] || i.status}</span>
                        </div>
                      </div>
                    ))}
                    {!invoices.length && <div className="empty">{t('aucuneFacture')}</div>}
                  </div>
                  <div className="g-card">
                    <div className="g-card-header"><span className="g-card-title">🏆 Top marges</span><button className="btn btn-secondary btn-sm" onClick={() => setPage('marges')}>{t('voirTout')}</button></div>
                    {[...marginsSource].sort((a, b) => (b.sell - b.revient) / b.sell - (a.sell - a.revient) / a.sell).slice(0, 5).map(p => {
                      const pct = (p.sell - p.revient) / p.sell * 100;
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--linen)' }}>
                          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11, color: 'var(--dust)' }}>PMP {fmt(p.revient)}</div></div>
                          <div className="margin-bar"><div className="margin-fill" style={{ width: `${Math.min(pct, 100)}%`, background: marginColor(pct) }}></div></div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: marginColor(pct), width: 48, textAlign: 'right' }}>{fmtPct(pct)}</span>
                        </div>
                      );
                    })}
                    {!marginsSource.length && <div className="empty">{t('aucuneDonnee')}</div>}
                  </div>
                </div>
              </>
            )}

            {/* ── FACTURES ── */}
            {page === 'factures' && (
              <div className="g-card">
                {/* Téléphone : chaque facture devient une carte (.sc-stack) sur deux
                    colonnes ; avant, montants, statut et actions sortaient de l'écran. */}
                <table className="g-table sc-table sc-stack g-pairs">
                  <thead><tr><th>N°</th><th>{tc('client')}</th><th>Date</th><th>{t('echeance')}</th><th style={{ textAlign: 'right' }}>HT</th><th style={{ textAlign: 'right' }}>TVA</th><th style={{ textAlign: 'right' }}>TTC</th><th>{tc('status')}</th><th>{tc('actions')}</th></tr></thead>
                  <tbody>
                    {invoices.map(i => {
                      const echeance = i.date ? new Date(new Date(i.date + 'T12:00').getTime() + (params.payment_days || 30) * 86400000).toISOString().slice(0, 10) : undefined;
                      return (
                        <tr key={i.id}>
                          <td className="mono sc-hide-mobile" style={{ fontSize: 12 }}>{i.number}</td>
                          <td className="sc-stack-main"><strong>{i.client_name}</strong>{i.client_email && <><br /><span style={{ fontSize: 11, color: 'var(--dust)' }}>{i.client_email}</span></>}<span className="g-sub mono">{i.number}</span></td>
                          <td data-label="Date">{fmtDate(i.date)}</td>
                          <td data-label={t('echeance')} style={{ color: 'var(--dust)' }}>{fmtDate(echeance)}</td>
                          <td data-label="HT" className="price">{fmt(i.total_ht)}</td>
                          <td data-label="TVA" className="price">{fmt(i.total_tva)}</td>
                          <td data-label="TTC" className="price" style={{ fontWeight: 700 }}>{fmt(i.total_ttc)}</td>
                          <td data-label={tc('status')}><span className={`badge ${STATUS_BADGE[i.status] || ''}`}>{STATUS_LABEL[i.status] || i.status}</span></td>
                          <td className="sc-stack-actions">
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <button className="btn btn-secondary btn-sm" title={tc('edit')} onClick={() => openEditInvoice(i)}>
                                <span className="ms" style={{ fontSize: 16 }}>edit</span>
                              </button>
                              <button className="btn btn-secondary btn-sm" title={t('apercu')} onClick={() => setPreviewInvoice(i)}>
                                <span className="ms" style={{ fontSize: 16 }}>visibility</span>
                              </button>
                              {/* Document A4 : le meme rendu que le PDF envoye au client. */}
                              <a className="btn btn-secondary btn-sm" title={t('docA4')}
                                 href={`/admin/documents/${i.status === 'avoir' ? 'avoir' : 'facture'}/${i.id}`}
                                 target="_blank" rel="noopener">
                                <span className="ms" style={{ fontSize: 16 }}>print</span>
                              </a>
                              <button className="btn btn-secondary btn-sm" title={t('telechargerPdf')}
                                      onClick={() => downloadAuth(`/api/invoices/${i.id}/pdf`, `${i.status === 'avoir' ? 'avoir' : 'facture'}-${i.number}.pdf`).catch(e => showToast(e.message))}>
                                <span className="ms" style={{ fontSize: 16 }}>picture_as_pdf</span>
                              </button>
                              <button className="btn btn-danger btn-sm" title={tc('delete')} onClick={() => deleteInvoice(i.id)}>
                                <span className="ms" style={{ fontSize: 16 }}>delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!invoices.length && <tr><td colSpan={9}><div className="empty">{t('aucuneFactureCta')}</div></td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── ACHATS ── */}
            {page === 'achats' && (
              <>
                <div className="g-card" style={{ padding: '40px 32px', textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                  <div style={{ fontFamily: 'var(--font-d)', fontSize: 24, fontWeight: 600, marginBottom: 10 }}>{t('moduleAchats')}</div>
                  <p style={{ color: 'var(--dust)', marginBottom: 24, maxWidth: 480, margin: '0 auto 24px' }}>
                    Les commandes fournisseurs, réceptions et calcul automatique du PMP sont gérés dans le module Achats dédié.
                    Chaque réception met à jour le stock et le Prix Moyen Pondéré en temps réel.
                  </p>
                  <a href="/admin/achats" className="btn btn-primary" style={{ fontSize: 14, padding: '10px 24px' }}>
                    → Accéder aux Achats fournisseurs
                  </a>
                </div>
                {purchases.length > 0 && (
                  <div className="g-card">
                    <div className="g-card-header">
                      <span className="g-card-title">Archives — Anciennes saisies manuelles ({purchases.length})</span>
                    </div>
                    <table className="g-table">
                      <thead><tr><th>Date</th><th>{tc('supplier')}</th><th>Réf.</th><th>{tc('products')}</th><th style={{ textAlign: 'right' }}>{tc('total')}</th><th style={{ textAlign: 'right' }}>{t('transport')}</th><th style={{ textAlign: 'right' }}>{tc('total')}</th><th>{tc('status')}</th><th></th></tr></thead>
                      <tbody>
                        {purchases.map(p => (
                          <tr key={p.id}>
                            <td>{fmtDate(p.date)}</td>
                            <td><strong>{p.supplier}</strong></td>
                            <td className="mono">{p.ref || '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--dust)', maxWidth: 140 }}>{p.products || '—'}</td>
                            <td className="price">{fmt(p.amount)}</td>
                            <td className="price">{p.transport > 0 ? fmt(p.transport) : '—'}</td>
                            <td className="price" style={{ fontWeight: 700 }}>{fmt(p.total)}</td>
                            <td><span className={`badge ${STATUS_BADGE[p.status] || ''}`}>{STATUS_LABEL[p.status] || p.status}</span></td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => deletePurchase(p.id)}>🗑</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ── MARGES ── */}
            {page === 'marges' && (
              <>
                <div className="g-card" style={{ marginBottom: 16, padding: '12px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
                    <span>🎯 Objectif marge minimum :</span>
                    <input type="number" inputMode="decimal" aria-label="Objectif de marge minimum (%)" className="form-control mono" style={{ width: 70 }} value={marginTarget} onChange={e => setMarginTarget(parseFloat(e.target.value) || 40)} />
                    <span style={{ color: 'var(--dust)' }}>% — Alerte en dessous de ce seuil</span>
                    {realProds.length > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--moss)', fontWeight: 600, background: 'var(--moss-pale)', padding: '3px 10px', borderRadius: 20 }}>
                        ✅ {realProds.length} produits · données réelles (PMP)
                      </span>
                    )}
                  </div>
                </div>

                {realProds.length > 0 ? (
                  <div className="g-card">
                    {/* Téléphone : une ligne par produit (nom, marge %, PMP → prix),
                        toucher la ligne ouvre la fiche produit comme le crayon. */}
                    <div className="g-mlist">
                      {realSorted.map(p => {
                        const pct = p.sell > 0 ? (p.sell - p.revient) / p.sell * 100 : 0;
                        const st = (p as any).stock;
                        return (
                          <a key={p.id} href={`/admin/produits/${p.id}`} className="g-mrow" aria-label={`${p.name} — ${t('editerProduit')}`}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: TH.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                <span className="mono" style={{ fontSize: 14.5, fontWeight: 700, color: marginColor(pct), whiteSpace: 'nowrap' }}>{fmtPct(pct)}</span>
                              </div>
                              <div className="mono" style={{ fontSize: 12.5, color: TH.text3, marginTop: 3 }}>
                                PMP {fmt(p.revient)} → {fmt(p.sell)} · marge {fmt(p.sell - p.revient)}
                                {st != null && <> · stock <span style={{ color: st === 0 ? TH.red : st <= 3 ? TH.amberText : TH.green, fontWeight: 600 }}>{st}</span></>}
                              </div>
                              {p.cat && <div style={{ fontSize: 12, color: TH.muted, marginTop: 1 }}>{p.cat}</div>}
                            </div>
                            <span className="ms" style={{ fontSize: 20, color: TH.muted3 }}>chevron_right</span>
                          </a>
                        );
                      })}
                    </div>
                    <table className="g-table sc-hide-mobile">
                      <thead>
                        <tr>
                          <th>{tc('product')}</th>
                          <th>{t('categorie')}</th>
                          <th style={{ textAlign: 'right' }}>PMP (coût)</th>
                          <th style={{ textAlign: 'right' }}>{t('prixVente')}</th>
                          <th style={{ textAlign: 'right' }}>{tc('stock')}</th>
                          <th style={{ textAlign: 'right' }}>{t('margeEur')}</th>
                          <th style={{ textAlign: 'right' }}>{t('margePct')}</th>
                          <th></th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {realSorted.map(p => {
                          const pct = p.sell > 0 ? (p.sell - p.revient) / p.sell * 100 : 0;
                          return (
                            <tr key={p.id}>
                              <td><strong>{p.name}</strong></td>
                              <td style={{ fontSize: 12, color: 'var(--dust)' }}>{p.cat || '—'}</td>
                              <td className="price">{fmt(p.revient)}</td>
                              <td className="price">{fmt(p.sell)}</td>
                              <td style={{ textAlign: 'right', fontSize: 12 }}>
                                {(p as any).stock != null ? (
                                  <span style={{ color: (p as any).stock === 0 ? '#EF4444' : (p as any).stock <= 3 ? '#D97706' : '#10B981', fontWeight: 600 }}>
                                    {(p as any).stock}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="price" style={{ color: marginColor(pct) }}>{fmt(p.sell - p.revient)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: marginColor(pct) }}>{fmtPct(pct)}</td>
                              <td><div className="margin-bar"><div className="margin-fill" style={{ width: `${Math.min(pct, 100)}%`, background: marginColor(pct) }}></div></div></td>
                              <td>
                                <a href={`/admin/produits/${p.id}`} className="btn btn-secondary btn-sm" title={t('editerProduit')}>✏️</a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="g-card">
                    <div className="empty" style={{ padding: 48 }}>
                      Aucun produit avec PMP calculé.<br />
                      <span style={{ fontSize: 12 }}>{t('receptionnez')}</span>
                      {products.length > 0 && (
                        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--dust)' }}>
                          Données manuelles disponibles : {products.length} entrée(s) — utilisez "+ Ajouter" pour simuler.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {products.length > 0 && (
                  <div className="g-card" style={{ marginTop: 16 }}>
                    <div className="g-card-header">
                      <span className="g-card-title" style={{ fontSize: 12, color: 'var(--dust)' }}>Simulations manuelles ({products.length})</span>
                    </div>
                    <table className="g-table sc-table sc-stack g-pairs">
                      <thead><tr><th>{tc('product')}</th><th>{t('categorie')}</th><th style={{ textAlign: 'right' }}>{t('achat')}</th><th style={{ textAlign: 'right' }}>{t('transport')}</th><th style={{ textAlign: 'right' }}>{t('autres')}</th><th style={{ textAlign: 'right' }}>{t('revient')}</th><th style={{ textAlign: 'right' }}>{t('vente')}</th><th style={{ textAlign: 'right' }}>{t('margeEur')}</th><th style={{ textAlign: 'right' }}>{t('margePct')}</th><th></th><th></th></tr></thead>
                      <tbody>
                        {products.map(p => {
                          const pct = (p.sell - p.revient) / p.sell * 100;
                          return (
                            <tr key={p.id}>
                              <td className="sc-stack-main"><strong>{p.name}</strong></td>
                              <td data-label={t('categorie')} style={{ fontSize: 12, color: 'var(--dust)' }}>{p.cat || '—'}</td>
                              <td data-label={t('achat')} className="price">{fmt(p.buy)}</td>
                              <td data-label={t('transport')} className="price">{p.trans > 0 ? fmt(p.trans) : '—'}</td>
                              <td data-label={t('autres')} className="price">{p.other > 0 ? fmt(p.other) : '—'}</td>
                              <td data-label={t('revient')} className="price" style={{ fontWeight: 600 }}>{fmt(p.revient)}</td>
                              <td data-label={t('vente')} className="price">{fmt(p.sell)}</td>
                              <td data-label={t('margeEur')} className="price" style={{ color: marginColor(pct) }}>{fmt(p.sell - p.revient)}</td>
                              <td data-label={t('margePct')} style={{ textAlign: 'right', fontWeight: 700, color: marginColor(pct) }}>{fmtPct(pct)}</td>
                              <td className="sc-hide-mobile"><div className="margin-bar"><div className="margin-fill" style={{ width: `${Math.min(pct, 100)}%`, background: marginColor(pct) }}></div></div></td>
                              <td className="sc-stack-actions">
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button className="btn btn-secondary btn-sm" aria-label={tc('edit')} title={tc('edit')} onClick={() => openEditProduct(p)}>✏️</button>
                                  <button className="btn btn-danger btn-sm" aria-label={tc('delete')} title={tc('delete')} onClick={() => deleteProduct(p.id)}>🗑</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ── TRANSPORT ── */}
            {page === 'transport' && (
              <div className="g-tr-2">
                <div>
                  <div className="g-card" style={{ padding: isMobile ? 14 : 20 }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="g-trcost">{t('coutTransport')}</label>
                      <input id="g-trcost" type="number" inputMode="decimal" className="form-control mono" placeholder={t('exMontant')} step="0.01" value={trCost} onChange={e => setTrCost(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('methodeRepart')}</label>
                      <select className="form-control" value={trMethod} onChange={e => { setTrMethod(e.target.value); setTrResult([]); }}>
                        <option value="weight">{t('auPoids')}</option>
                        <option value="value">À la valeur (€ achat)</option>
                        <option value="equal">{t('partsEgales')}</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--dust)', marginBottom: 8 }}>{tc('products')}</div>
                      {trLines.map((l, i) => (
                        <div key={i} className="g-trline">
                          <input className="form-control fs12" aria-label={tc('product')} value={l.name} onChange={e => { const nl = [...trLines]; nl[i].name = e.target.value; setTrLines(nl); }} placeholder={tc('product')} />
                          <input type="number" inputMode="decimal" aria-label={trMethod === 'weight' ? 'Poids' : 'Valeur (€ achat)'} className="form-control mono fs12" value={trMethod === 'weight' ? l.weight : l.value} step="0.01" onChange={e => { const nl = [...trLines]; if (trMethod === 'weight') nl[i].weight = e.target.value; else nl[i].value = e.target.value; setTrLines(nl); }} placeholder="0.00" />
                          <input type="number" inputMode="numeric" aria-label="Quantité" className="form-control mono fs12" value={l.qty} min={1} onChange={e => { const nl = [...trLines]; nl[i].qty = parseInt(e.target.value) || 1; setTrLines(nl); }} />
                          <button className="g-x" aria-label={tc('delete')} onClick={() => setTrLines(trLines.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                        </div>
                      ))}
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setTrLines([...trLines, { name: '', weight: '', value: '', qty: 1 }])}>+ Ajouter</button>
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={calcTransport}>{t('calculerRepart')}</button>
                  </div>
                </div>
                <div>
                  {trResult.length > 0 && (
                    <div className="g-card" style={{ padding: isMobile ? 14 : 20 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{t('resultatRepart')}</div>
                      <div className="sc-scroll-x">
                      <table className="g-table">
                        <thead><tr><th>{tc('product')}</th><th>Qté</th><th>%</th><th style={{ textAlign: 'right' }}>{tc('total')}</th><th style={{ textAlign: 'right' }}>/ unité</th></tr></thead>
                        <tbody>
                          {trResult.map((r, i) => (
                            <tr key={i}>
                              <td><strong>{r.name || '—'}</strong></td>
                              <td>{r.qty}</td>
                              <td>{fmtPct(r.ratio * 100)}</td>
                              <td className="price">{fmt(r.totalTr)}</td>
                              <td className="price" style={{ fontWeight: 700, color: 'var(--copper)' }}>{fmt(r.perUnit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                      <div style={{ marginTop: 12, padding: '8px 14px', background: 'var(--moss-pale)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--moss)', fontWeight: 600 }}>
                        Total réparti : {fmt(parseFloat(trCost) || 0)}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--dust)', marginTop: 10 }}>✅ Utilisez les montants "/ unité" dans le calculateur de marges.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PARAMS ── */}
            {page === 'params' && (
              <div style={{ maxWidth: 680 }}>
                <div className="g-card" style={{ padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🏢 Informations société</div>
                  <div className="g-grid-2">
                    <div className="form-group"><label className="form-label">{t('raisonSociale')}</label><input className="form-control" value={params.company} onChange={e => setParams(p => ({ ...p, company: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">{t('statutJuridique')}</label><input className="form-control" value={params.legal} onChange={e => setParams(p => ({ ...p, legal: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">SIRET</label><input className="form-control mono" inputMode="numeric" value={params.siret} onChange={e => setParams(p => ({ ...p, siret: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">N° TVA intracommunautaire</label><input className="form-control mono" autoCapitalize="characters" spellCheck={false} value={params.tva} onChange={e => setParams(p => ({ ...p, tva: e.target.value }))} /></div>
                    {/* 1 / -1 plutôt que span 2 : sur une colonne (téléphone), span 2
                        créait une seconde colonne implicite qui débordait de l'écran. */}
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">{tc('address')}</label><textarea className="form-control" value={params.address} onChange={e => setParams(p => ({ ...p, address: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">{tc('email')}</label><input className="form-control" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={params.email} onChange={e => setParams(p => ({ ...p, email: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">{tc('phone')}</label><input className="form-control" inputMode="tel" autoComplete="tel" value={params.phone} onChange={e => setParams(p => ({ ...p, phone: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">IBAN</label><input className="form-control mono" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={params.iban} onChange={e => setParams(p => ({ ...p, iban: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">{t('tauxTva')}</label><input type="number" inputMode="decimal" className="form-control mono" value={params.tva_rate} onChange={e => setParams(p => ({ ...p, tva_rate: parseFloat(e.target.value) || 20 }))} /></div>
                    <div className="form-group"><label className="form-label">{t('delaiPaiement')}</label><input type="number" inputMode="numeric" className="form-control mono" value={params.payment_days} onChange={e => setParams(p => ({ ...p, payment_days: parseInt(e.target.value) || 30 }))} /></div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">{t('mentions')}</label><textarea className="form-control" value={params.legal_mention} onChange={e => setParams(p => ({ ...p, legal_mention: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="g-card" style={{ padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🔢 Numérotation des factures</div>
                  <div className="g-grid-2">
                    <div className="form-group"><label className="form-label">{t('prefixe')}</label><input className="form-control mono" value={params.inv_prefix} onChange={e => setParams(p => ({ ...p, inv_prefix: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">{t('prochainNum')}</label><input type="number" inputMode="numeric" className="form-control mono" value={params.inv_next} onChange={e => setParams(p => ({ ...p, inv_next: parseInt(e.target.value) || 1 }))} /></div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dust)', marginTop: 4 }}>{t('prochaineFacture')} <strong className="mono">{params.inv_prefix}{String(params.inv_next).padStart(4, '0')}</strong></div>
                </div>
                {/* Téléphone : Enregistrer reste à portée du pouce en bas de l'écran */}
                {isMobile && (
                  <div className="sc-sticky-actions">
                    <button className="sc-btn sc-btn-green" onClick={saveParamsToDb}>
                      <span className="ms">save</span>{t('sauvegarder')}
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

      {/* ── MODAL FACTURE ── */}
      {showInvoiceModal && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setShowInvoiceModal(false)}>
          <div className="g-modal">
            <div className="g-modal-header">
              <span className="g-modal-title">{editingInvoice ? 'Éditer — ' + editingInvoice.number : 'Nouvelle facture'}</span>
              <button className="btn btn-secondary btn-sm" aria-label={tc('cancel')} onClick={() => setShowInvoiceModal(false)}>✕</button>
            </div>
            <div className="g-modal-body">
              <div className="g-grid-3" style={{ marginBottom: 14 }}>
                <div className="form-group"><label className="form-label">N° facture</label><input className="form-control mono" autoCapitalize="characters" value={invForm.number} onChange={e => setInvForm(f => ({ ...f, number: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-control" value={invForm.date} onChange={e => setInvForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">{tc('status')}</label>
                  <select className="form-control" value={invForm.status} onChange={e => setInvForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="draft">{t('brouillon')}</option><option value="sent">{t('envoyee')}</option><option value="paid">{t('payee')}</option><option value="late">{t('enRetard')}</option>
                  </select>
                </div>
              </div>
              <div className="g-grid-3" style={{ marginBottom: 14 }}>
                <div className="form-group"><label className="form-label">{t('clientReq')}</label><input className="form-control" value={invForm.client_name} onChange={e => setInvForm(f => ({ ...f, client_name: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">{tc('email')}</label><input className="form-control" inputMode="email" autoCapitalize="none" spellCheck={false} value={invForm.client_email} onChange={e => setInvForm(f => ({ ...f, client_email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">{tc('address')}</label><input className="form-control" value={invForm.client_address} onChange={e => setInvForm(f => ({ ...f, client_address: e.target.value }))} /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--dust)', marginBottom: 8 }}>{t('lignes')}</div>
                {/* Téléphone : une carte par ligne (description, puis Qté · P.U. · TVA, puis total) */}
                <table className="g-lines" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>{['Description', 'Qté', 'P.U. HT', 'TVA %', 'Total', ''].map(h => <th key={h} style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--dust)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {invoiceLines.map((l, i) => {
                      const update = (field: string, val: any) => { const nl = [...invoiceLines]; (nl[i] as any)[field] = val; setInvoiceLines(nl); };
                      return (
                        <tr key={i}>
                          <td className="g-ln-desc"><input className="form-control fs12" aria-label="Description" value={l.desc} onChange={e => update('desc', e.target.value)} placeholder={t('phDescription')} /></td>
                          <td className="g-ln-qty" data-label="Qté"><input type="number" inputMode="decimal" aria-label="Quantité" className="form-control mono fs12" value={l.qty} min={1} onChange={e => update('qty', parseFloat(e.target.value) || 1)} /></td>
                          <td className="g-ln-pu" data-label="P.U. HT"><input type="number" inputMode="decimal" aria-label="Prix unitaire HT" className="form-control mono fs12" value={l.price} step="0.01" onChange={e => update('price', parseFloat(e.target.value) || 0)} /></td>
                          <td className="g-ln-tva" data-label="TVA %"><input type="number" inputMode="decimal" aria-label="TVA %" className="form-control mono fs12" value={l.tva} min={0} max={100} onChange={e => update('tva', parseFloat(e.target.value) || 0)} /></td>
                          <td className="g-ln-total" data-label="Total">{fmt(l.qty * l.price)}</td>
                          <td className="g-ln-x"><button className="g-x" aria-label={tc('delete')} onClick={() => setInvoiceLines(invoiceLines.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setInvoiceLines([...invoiceLines, { desc: '', qty: 1, price: 0, tva: params.tva_rate || 20 }])}>+ Ligne</button>
              </div>
              {(() => { const { ht, tva, ttc } = calcInvoiceTotals(invoiceLines); return (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div className="result-box g-totals">
                    <div className="result-row"><span>{t('totalHt')}</span><span className="mono">{fmt(ht)}</span></div>
                    <div className="result-row"><span>TVA</span><span className="mono">{fmt(tva)}</span></div>
                    <div className="result-row result-total"><span>{t('totalTtc')}</span><span className="mono">{fmt(ttc)}</span></div>
                  </div>
                </div>
              ); })()}
              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label">Note</label>
                <textarea className="form-control" value={invForm.note} onChange={e => setInvForm(f => ({ ...f, note: e.target.value }))} placeholder={t('phNote')} />
              </div>
            </div>
            <div className="g-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowInvoiceModal(false)}>{tc('cancel')}</button>
              <button className="btn btn-primary" onClick={saveInvoice}>{t('sauvegarder')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ACHAT ── */}
      {showPurchaseModal && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setShowPurchaseModal(false)}>
          <div className="g-modal">
            <div className="g-modal-header"><span className="g-modal-title">{t('saisirAchat')}</span><button className="btn btn-secondary btn-sm" aria-label="Fermer" onClick={() => setShowPurchaseModal(false)}>✕</button></div>
            <div className="g-modal-body">
              <div className="g-grid-2">
                <div className="form-group"><label className="form-label">{t('fournisseurReq')}</label><input className="form-control" value={purForm.supplier} onChange={e => setPurForm(f => ({ ...f, supplier: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-control" value={purForm.date} onChange={e => setPurForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">N° facture fournisseur</label><input className="form-control mono" value={purForm.ref} onChange={e => setPurForm(f => ({ ...f, ref: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">{tc('status')}</label>
                  <select className="form-control" value={purForm.status} onChange={e => setPurForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="received">{t('recue')}</option><option value="pending">{t('enAttente')}</option><option value="paid">{t('payee')}</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">{t('montantHt')}</label><input type="number" inputMode="decimal" className="form-control mono" value={purForm.amount} step="0.01" onChange={e => { const v = e.target.value; setPurForm(f => ({ ...f, amount: v, total: calcPurchaseTotal(v, f.transport) })); }} /></div>
                <div className="form-group"><label className="form-label">{t('fraisTransport')}</label><input type="number" inputMode="decimal" className="form-control mono" value={purForm.transport} step="0.01" onChange={e => { const v = e.target.value; setPurForm(f => ({ ...f, transport: v, total: calcPurchaseTotal(f.amount, v) })); }} /></div>
                <div className="form-group"><label className="form-label">{tc('total')}</label><input type="number" className="form-control mono" value={purForm.total} readOnly style={{ background: 'var(--cream)' }} /></div>
                <div className="form-group"><label className="form-label">{t('produitsListe')}</label><input className="form-control" value={purForm.products} onChange={e => setPurForm(f => ({ ...f, products: e.target.value }))} placeholder={t('phProduits')} /></div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">{tc('notes')}</label><textarea className="form-control" value={purForm.notes} onChange={e => setPurForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
            </div>
            <div className="g-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPurchaseModal(false)}>{tc('cancel')}</button>
              <button className="btn btn-primary" onClick={savePurchase}>{tc('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MARGE ── */}
      {showMarginModal && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setShowMarginModal(false)}>
          <div className="g-modal">
            <div className="g-modal-header"><span className="g-modal-title">{editingProduct ? 'Éditer — ' + editingProduct.name : 'Nouveau produit'}</span><button className="btn btn-secondary btn-sm" aria-label="Fermer" onClick={() => setShowMarginModal(false)}>✕</button></div>
            <div className="g-modal-body">
              <div className="g-grid-2">
                <div className="form-group"><label className="form-label">{t('nomReq')}</label><input className="form-control" value={mpForm.name} onChange={e => { const f = { ...mpForm, name: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">{t('categorie')}</label><input className="form-control" value={mpForm.cat} onChange={e => setMpForm(f => ({ ...f, cat: e.target.value }))} placeholder={t('phCategories')} /></div>
                <div className="form-group"><label className="form-label">{t('prixAchatReq')}</label><input type="number" inputMode="decimal" className="form-control mono" value={mpForm.buy} step="0.01" onChange={e => { const f = { ...mpForm, buy: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">{t('quotePart')}</label><input type="number" inputMode="decimal" className="form-control mono" value={mpForm.trans} step="0.01" onChange={e => { const f = { ...mpForm, trans: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">{t('autresCouts')}</label><input type="number" inputMode="decimal" className="form-control mono" value={mpForm.other} step="0.01" onChange={e => { const f = { ...mpForm, other: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">{t('prixVenteReq')}</label><input type="number" inputMode="decimal" className="form-control mono" value={mpForm.sell} step="0.01" onChange={e => { const f = { ...mpForm, sell: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">{tc('stock')}</label><input type="number" inputMode="numeric" className="form-control mono" value={mpForm.stock} onChange={e => setMpForm(f => ({ ...f, stock: e.target.value }))} /></div>
              </div>
              {mpResult && (
                <div className="result-box">
                  <div className="result-row"><span>{t('prixRevient')}</span><span className="mono" style={{ fontWeight: 600 }}>{fmt(mpResult.revient)}</span></div>
                  <div className="result-row"><span>{t('margeBrute')}</span><span className="mono">{fmt(mpResult.marginEur)}</span></div>
                  <div className="result-row result-total"><span>{t('margePct')}</span><span className="mono" style={{ color: marginColor(mpResult.marginPct), fontWeight: 700 }}>{fmtPct(mpResult.marginPct)}</span></div>
                  <div className="result-row" style={{ marginTop: 8, color: 'var(--dust)', fontSize: 12 }}><span>Prix suggéré ({marginTarget}% marge)</span><span className="mono">{fmt(mpResult.suggested)}</span></div>
                </div>
              )}
            </div>
            <div className="g-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMarginModal(false)}>{tc('cancel')}</button>
              <button className="btn btn-primary" onClick={saveProduct}>{tc('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PREVIEW FACTURE ── */}
      {previewInvoice && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setPreviewInvoice(null)}>
          <div className="g-modal" style={{ maxWidth: 760 }}>
            <div className="g-modal-header">
              <span className="g-modal-title">Facture {previewInvoice.number}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" aria-label="Fermer" onClick={() => setPreviewInvoice(null)}>✕</button>
              </div>
            </div>
            <div className="g-modal-body">
              <div className="g-prev">
                <div className="g-prev-top">
                  <div><div style={{ fontFamily: 'var(--font-d)', fontSize: 22, fontWeight: 600, color: 'var(--moss)' }}>{params.company}</div><div style={{ fontSize: 11, color: 'var(--dust)' }}>{params.legal}</div><div style={{ fontSize: 12, color: 'var(--dust)', marginTop: 4, whiteSpace: 'pre-line' }}>{params.address}</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>FACTURE {previewInvoice.number}</div><div style={{ fontSize: 12, color: 'var(--dust)' }}>Date : {fmtDate(previewInvoice.date)}</div></div>
                </div>
                <div style={{ marginBottom: 24, padding: 12, background: 'var(--cream)', borderRadius: 'var(--r)' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--dust)', marginBottom: 4 }}>{t('factureA')}</div>
                  <div style={{ fontWeight: 600 }}>{previewInvoice.client_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--dust)', whiteSpace: 'pre-line' }}>{previewInvoice.client_address}</div>
                </div>
                <div className="sc-scroll-x">
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <thead><tr style={{ background: 'var(--cream)' }}>{['Description', 'Qté', 'P.U. HT', 'TVA', 'Total HT'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Description' ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--dust)' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {(previewInvoice.lines || []).map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--linen)' }}>
                        <td style={{ padding: '8px 10px' }}>{l.desc || '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.qty}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(l.price)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.tva}%</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(l.qty * l.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}><span>{t('totalHt')}</span><span className="mono">{fmt(previewInvoice.total_ht)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}><span>TVA</span><span className="mono">{fmt(previewInvoice.total_tva)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, fontWeight: 700, borderTop: '2px solid var(--midnight)', marginTop: 4 }}><span>{t('totalTtc')}</span><span className="mono">{fmt(previewInvoice.total_ttc)}</span></div>
                  </div>
                </div>
                {params.iban && <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--cream)', borderRadius: 4, fontSize: 12 }}><strong>{t('virement')}</strong> {params.iban}</div>}
                {params.legal_mention && <div style={{ marginTop: 16, fontSize: 11, color: 'var(--dust)' }}>{params.legal_mention}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="sc-toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
