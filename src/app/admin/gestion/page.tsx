'use client';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

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
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', late: 'En retard',
  received: 'Reçue', pending: 'En attente',
};

export default function GestionPage() {
  const [page, setPage] = useState<'dashboard' | 'factures' | 'achats' | 'marges' | 'transport' | 'params'>('dashboard');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<MarginProduct[]>([]);
  const [params, setParams] = useState<Params>({
    company: 'Svenska Delikatessen', legal: 'Auto-entrepreneur',
    siret: '', tva: '', address: '', email: 'hej@svenska-delikatessen.com',
    phone: '', website: 'svenska-delikatessen.fr', tva_rate: 20,
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
    const [{ data: inv }, { data: pur }, { data: prd }, { data: prm }] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('*').order('created_at', { ascending: false }),
      supabase.from('margin_products').select('*').order('created_at', { ascending: false }),
      supabase.from('company_settings').select('*'),
    ]);
    if (inv) setInvoices(inv);
    if (pur) setPurchases(pur);
    if (prd) setProducts(prd);
    if (prm && prm.length > 0) {
      const p: any = {};
      prm.forEach((r: any) => { p[r.key] = isNaN(r.value) ? r.value : Number(r.value) || r.value; });
      setParams(prev => ({ ...prev, ...p }));
    }
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
    if (!invForm.client_name.trim()) { showToast('⚠️ Nom du client requis'); return; }
    const { ht, tva, ttc } = calcInvoiceTotals(invoiceLines);
    const inv: Invoice = {
      id: editingInvoice?.id || uid(),
      number: invForm.number, date: invForm.date, status: invForm.status,
      client_name: invForm.client_name, client_address: invForm.client_address,
      client_email: invForm.client_email, note: invForm.note,
      lines: invoiceLines, total_ht: ht, total_tva: tva, total_ttc: ttc,
    };
    const { error } = await supabase.from('invoices').upsert({ ...inv, lines: JSON.stringify(inv.lines) });
    if (error) { showToast('❌ Erreur : ' + error.message); return; }
    if (!editingInvoice) {
      await supabase.from('company_settings').upsert({ key: 'inv_next', value: String((params.inv_next || 1) + 1) });
      setParams(p => ({ ...p, inv_next: (p.inv_next || 1) + 1 }));
    }
    setShowInvoiceModal(false);
    showToast('✅ Facture sauvegardée !');
    loadAll();
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Supprimer cette facture ?')) return;
    await supabase.from('invoices').delete().eq('id', id);
    showToast('🗑 Facture supprimée');
    loadAll();
  }

  // ── PURCHASES ──────────────────────────────────────────
  function calcPurchaseTotal(amount: string, transport: string) {
    const a = parseFloat(amount) || 0;
    const t = parseFloat(transport) || 0;
    return (a + t).toFixed(2);
  }

  async function savePurchase() {
    if (!purForm.supplier.trim()) { showToast('⚠️ Fournisseur requis'); return; }
    const { error } = await supabase.from('purchases').insert({
      id: uid(), supplier: purForm.supplier, date: purForm.date, ref: purForm.ref,
      status: purForm.status, amount: parseFloat(purForm.amount) || 0,
      transport: parseFloat(purForm.transport) || 0, total: parseFloat(purForm.total) || 0,
      products: purForm.products, notes: purForm.notes,
    });
    if (error) { showToast('❌ Erreur : ' + error.message); return; }
    setShowPurchaseModal(false);
    showToast('✅ Achat enregistré !');
    loadAll();
  }

  async function deletePurchase(id: string) {
    if (!confirm('Supprimer cet achat ?')) return;
    await supabase.from('purchases').delete().eq('id', id);
    showToast('🗑 Achat supprimé');
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
    if (!mpForm.name || !mpForm.buy || !mpForm.sell) { showToast('⚠️ Nom, prix achat et vente requis'); return; }
    const buy = parseFloat(mpForm.buy) || 0;
    const trans = parseFloat(mpForm.trans) || 0;
    const other = parseFloat(mpForm.other) || 0;
    const revient = buy + trans + other;
    const prod = {
      id: editingProduct?.id || uid(), name: mpForm.name, cat: mpForm.cat,
      buy, trans, other, revient, sell: parseFloat(mpForm.sell) || 0, stock: parseInt(mpForm.stock) || 0,
    };
    const { error } = await supabase.from('margin_products').upsert(prod);
    if (error) { showToast('❌ Erreur : ' + error.message); return; }
    setShowMarginModal(false);
    showToast('✅ Produit enregistré !');
    loadAll();
  }

  async function deleteProduct(id: string) {
    if (!confirm('Supprimer ce produit ?')) return;
    await supabase.from('margin_products').delete().eq('id', id);
    showToast('🗑 Produit supprimé');
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
    if (totalBase === 0) { showToast('⚠️ Saisissez des valeurs'); return; }
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
    if (error) { showToast('❌ Erreur : ' + error.message); return; }
    showToast('✅ Paramètres sauvegardés !');
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
  const avgMargin = products.length > 0 ? products.reduce((s, p) => s + (p.sell - p.revient) / p.sell * 100, 0) / products.length : 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Jost, sans-serif', color: '#6A7280' }}>
      Chargement…
    </div>
  );

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Mono:wght@400;500&family=Jost:wght@300;400;500;600&display=swap');
    :root{--moss:#3E5238;--moss-mid:#587050;--moss-light:#7A9468;--moss-pale:#E8EEE5;--copper:#9E5A3C;--copper-mid:#BC7455;--midnight:#1C2028;--slate:#3E4550;--dust:#6A7280;--linen:#D8CEBC;--cream:#F6F1E9;--snow:#FFFFFF;--success:#16A34A;--danger:#DC2626;--warning:#D97706;--r:6px;--font-d:'Cormorant Garamond',serif;--font-ui:'Jost',sans-serif;--font-mono:'DM Mono',monospace}
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    body{font-family:var(--font-ui);background:#EDEAE4;color:var(--midnight)}
    .g-shell{display:flex;min-height:100vh}
    .g-sidebar{width:220px;background:var(--midnight);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100}
    .g-logo{padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.06)}
    .g-logo-main{font-family:var(--font-d);font-size:17px;font-weight:600;color:#fff;display:block;line-height:1.2}
    .g-logo-tag{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--copper-mid);display:block;margin-top:3px}
    .g-nav{flex:1;padding:12px 0;overflow-y:auto}
    .g-section{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.2);padding:12px 20px 5px}
    .g-link{display:flex;align-items:center;gap:9px;padding:9px 20px;font-size:12.5px;font-weight:500;color:rgba(255,255,255,0.5);border-left:3px solid transparent;transition:all 0.18s;cursor:pointer;border:none;background:none;width:100%;text-align:left}
    .g-link:hover{color:#fff;background:rgba(255,255,255,0.05)}
    .g-link.active{color:#fff;background:rgba(255,255,255,0.08);border-left-color:var(--copper-mid)}
    .g-main{margin-left:220px;flex:1;display:flex;flex-direction:column;min-height:100vh}
    .g-topbar{height:58px;background:#fff;border-bottom:1px solid var(--linen);display:flex;align-items:center;padding:0 28px;gap:14px;position:sticky;top:0;z-index:90}
    .g-topbar-title{font-size:16px;font-weight:600;flex:1}
    .g-content{padding:28px}
    .g-page-header{margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px}
    .g-page-title{font-family:var(--font-d);font-size:30px;font-weight:600}
    .g-page-sub{font-size:13px;color:var(--dust);margin-top:3px}
    .g-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
    .g-stat{background:#fff;border:1px solid var(--linen);border-radius:var(--r);padding:18px 20px;display:flex;align-items:center;gap:14px}
    .g-stat-icon{font-size:26px;flex-shrink:0}
    .g-stat-num{font-family:var(--font-mono);font-size:22px;font-weight:500;color:var(--midnight);line-height:1}
    .g-stat-label{font-size:11px;color:var(--dust);margin-top:3px;letter-spacing:0.5px}
    .g-card{background:#fff;border:1px solid var(--linen);border-radius:var(--r);overflow:hidden;margin-bottom:20px}
    .g-card-header{padding:14px 20px;border-bottom:1px solid var(--linen);display:flex;align-items:center;justify-content:space-between;gap:10px}
    .g-card-title{font-size:14px;font-weight:600}
    .g-table{width:100%;border-collapse:collapse;font-size:13px}
    .g-table th{padding:10px 14px;text-align:left;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--dust);background:var(--cream);border-bottom:1px solid var(--linen)}
    .g-table td{padding:10px 14px;border-bottom:1px solid var(--linen)}
    .g-table tr:last-child td{border-bottom:none}
    .g-table tr:hover td{background:#FDFAF5}
    .mono{font-family:var(--font-mono)}
    .price{font-family:var(--font-mono);text-align:right}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--r);font-family:var(--font-ui);font-size:13px;font-weight:500;cursor:pointer;border:none;transition:all 0.15s}
    .btn-primary{background:var(--moss);color:#fff}.btn-primary:hover{background:var(--moss-mid)}
    .btn-secondary{background:var(--cream);color:var(--slate);border:1px solid var(--linen)}.btn-secondary:hover{background:var(--linen)}
    .btn-danger{background:#FEE2E2;color:#991B1B}.btn-danger:hover{background:#FCA5A5}
    .btn-sm{padding:5px 10px;font-size:12px}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:0.5px}
    .form-group{margin-bottom:14px}
    .form-label{display:block;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:var(--dust);margin-bottom:5px}
    .form-control{width:100%;padding:8px 10px;border:1px solid var(--linen);border-radius:var(--r);font-family:var(--font-ui);font-size:13px;background:#fff;color:var(--midnight);outline:none;transition:border 0.15s}
    .form-control:focus{border-color:var(--moss-light)}
    .form-grid{display:grid;gap:12px}
    .g-modal-overlay{position:fixed;inset:0;background:rgba(28,32,40,0.5);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto}
    .g-modal{background:#fff;border-radius:var(--r);width:100%;max-width:680px;box-shadow:0 20px 60px rgba(0,0,0,0.2);margin:auto}
    .g-modal-header{padding:16px 20px;border-bottom:1px solid var(--linen);display:flex;align-items:center;justify-content:space-between}
    .g-modal-title{font-size:16px;font-weight:600}
    .g-modal-body{padding:20px}
    .g-modal-footer{padding:14px 20px;border-top:1px solid var(--linen);display:flex;justify-content:flex-end;gap:10px}
    .g-toast{position:fixed;bottom:24px;right:24px;background:var(--midnight);color:#fff;padding:10px 18px;border-radius:var(--r);font-size:13px;z-index:999;animation:slideIn 0.2s ease}
    @keyframes slideIn{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
    .empty{padding:40px;text-align:center;color:var(--dust);font-size:13px;font-style:italic}
    .g-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .g-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
    .margin-bar{height:6px;background:var(--linen);border-radius:3px;overflow:hidden;width:80px}
    .margin-fill{height:100%;border-radius:3px}
    .result-box{background:var(--cream);border:1px solid var(--linen);border-radius:var(--r);padding:14px 16px;margin-top:12px}
    .result-row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
    .result-total{font-weight:700;font-size:14px;border-top:1px solid var(--linen);margin-top:8px;padding-top:8px}
    textarea.form-control{resize:vertical;min-height:70px}
    select.form-control{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236A7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px}
  `;

  const NAV = [
    { id: 'dashboard', icon: '📊', label: 'Vue d\'ensemble' },
    { id: 'factures', icon: '🧾', label: 'Factures clients', count: invoices.length },
    { id: 'achats', icon: '📦', label: 'Achats fournisseurs' },
    { id: 'marges', icon: '📈', label: 'Calcul des marges' },
    { id: 'transport', icon: '🚚', label: 'Répartition transport' },
    { id: 'params', icon: '⚙️', label: 'Paramètres' },
  ];

  const PAGE_TITLES: Record<string, string> = {
    dashboard: 'Vue d\'ensemble 🇸🇪', factures: 'Factures clients',
    achats: 'Achats fournisseurs', marges: 'Calcul des marges',
    transport: 'Répartition transport', params: 'Paramètres',
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="g-shell">
        {/* SIDEBAR */}
        <div className="g-sidebar">
          <div className="g-logo">
            <span className="g-logo-main">Svenska</span>
            <span className="g-logo-tag">Gestion</span>
          </div>
          <nav className="g-nav">
            {NAV.map(n => (
              <button key={n.id} className={`g-link${page === n.id ? ' active' : ''}`} onClick={() => setPage(n.id as any)}>
                <span>{n.icon}</span>
                {n.label}
                {n.count !== undefined && <span style={{ marginLeft: 'auto', background: 'var(--copper)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}>{n.count}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)' }}>
            v2.0 · Supabase
          </div>
        </div>

        {/* MAIN */}
        <div className="g-main">
          <div className="g-topbar">
            <span className="g-topbar-title">{PAGE_TITLES[page]}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {page === 'factures' && <button className="btn btn-primary btn-sm" onClick={openNewInvoice}>+ Nouvelle facture</button>}
              {page === 'achats' && <button className="btn btn-primary btn-sm" onClick={() => setShowPurchaseModal(true)}>+ Saisir un achat</button>}
              {page === 'marges' && <button className="btn btn-primary btn-sm" onClick={openNewProduct}>+ Ajouter un produit</button>}
              {page === 'params' && <button className="btn btn-primary btn-sm" onClick={saveParamsToDb}>💾 Sauvegarder</button>}
            </div>
          </div>

          <div className="g-content">

            {/* ── DASHBOARD ── */}
            {page === 'dashboard' && (
              <>
                <div className="g-stats">
                  <div className="g-stat"><span className="g-stat-icon">💶</span><div><div className="g-stat-num mono">{fmt(totalCA)}</div><div className="g-stat-label">CA FACTURÉ HT</div></div></div>
                  <div className="g-stat"><span className="g-stat-icon">🧾</span><div><div className="g-stat-num mono">{invoices.filter(i => i.status !== 'draft').length}</div><div className="g-stat-label">FACTURES ÉMISES</div></div></div>
                  <div className="g-stat"><span className="g-stat-icon">⏳</span><div><div className="g-stat-num mono">{fmt(pending)}</div><div className="g-stat-label">EN ATTENTE</div></div></div>
                  <div className="g-stat"><span className="g-stat-icon">📈</span><div><div className="g-stat-num mono">{fmtPct(avgMargin)}</div><div className="g-stat-label">MARGE MOY.</div></div></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="g-card">
                    <div className="g-card-header"><span className="g-card-title">📋 Dernières factures</span><button className="btn btn-secondary btn-sm" onClick={() => setPage('factures')}>Voir tout →</button></div>
                    {invoices.slice(0, 5).map(i => (
                      <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--linen)' }}>
                        <div><div style={{ fontSize: 13, fontWeight: 600 }}>{i.client_name || '—'}</div><div style={{ fontSize: 11, color: 'var(--dust)' }}>{i.number} · {fmtDate(i.date)}</div></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="mono" style={{ fontSize: 13 }}>{fmt(i.total_ttc)}</span>
                          <span className={`badge ${STATUS_BADGE[i.status] || ''}`}>{STATUS_LABEL[i.status] || i.status}</span>
                        </div>
                      </div>
                    ))}
                    {!invoices.length && <div className="empty">Aucune facture</div>}
                  </div>
                  <div className="g-card">
                    <div className="g-card-header"><span className="g-card-title">🏆 Top marges</span><button className="btn btn-secondary btn-sm" onClick={() => setPage('marges')}>Voir tout →</button></div>
                    {[...products].sort((a, b) => (b.sell - b.revient) / b.sell - (a.sell - a.revient) / a.sell).slice(0, 5).map(p => {
                      const pct = (p.sell - p.revient) / p.sell * 100;
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--linen)' }}>
                          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11, color: 'var(--dust)' }}>{fmt(p.revient)} revient</div></div>
                          <div className="margin-bar"><div className="margin-fill" style={{ width: `${Math.min(pct, 100)}%`, background: marginColor(pct) }}></div></div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: marginColor(pct), width: 48, textAlign: 'right' }}>{fmtPct(pct)}</span>
                        </div>
                      );
                    })}
                    {!products.length && <div className="empty">Ajoutez des produits dans "Calcul des marges"</div>}
                  </div>
                </div>
              </>
            )}

            {/* ── FACTURES ── */}
            {page === 'factures' && (
              <div className="g-card">
                <table className="g-table">
                  <thead><tr><th>N°</th><th>Client</th><th>Date</th><th>Échéance</th><th style={{ textAlign: 'right' }}>HT</th><th style={{ textAlign: 'right' }}>TVA</th><th style={{ textAlign: 'right' }}>TTC</th><th>Statut</th><th>Actions</th></tr></thead>
                  <tbody>
                    {invoices.map(i => {
                      const echeance = i.date ? new Date(new Date(i.date + 'T12:00').getTime() + (params.payment_days || 30) * 86400000).toISOString().slice(0, 10) : undefined;
                      return (
                        <tr key={i.id}>
                          <td className="mono" style={{ fontSize: 12 }}>{i.number}</td>
                          <td><strong>{i.client_name}</strong>{i.client_email && <><br /><span style={{ fontSize: 11, color: 'var(--dust)' }}>{i.client_email}</span></>}</td>
                          <td>{fmtDate(i.date)}</td>
                          <td style={{ color: 'var(--dust)' }}>{fmtDate(echeance)}</td>
                          <td className="price">{fmt(i.total_ht)}</td>
                          <td className="price">{fmt(i.total_tva)}</td>
                          <td className="price" style={{ fontWeight: 700 }}>{fmt(i.total_ttc)}</td>
                          <td><span className={`badge ${STATUS_BADGE[i.status] || ''}`}>{STATUS_LABEL[i.status] || i.status}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => openEditInvoice(i)}>✏️</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setPreviewInvoice(i)}>👁</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteInvoice(i.id)}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!invoices.length && <tr><td colSpan={9}><div className="empty">Aucune facture — cliquez sur "+ Nouvelle facture"</div></td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── ACHATS ── */}
            {page === 'achats' && (
              <div className="g-card">
                <table className="g-table">
                  <thead><tr><th>Date</th><th>Fournisseur</th><th>Réf.</th><th>Produits</th><th style={{ textAlign: 'right' }}>Montant</th><th style={{ textAlign: 'right' }}>Transport</th><th style={{ textAlign: 'right' }}>Total</th><th>Statut</th><th></th></tr></thead>
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
                    {!purchases.length && <tr><td colSpan={9}><div className="empty">Aucun achat — cliquez sur "+ Saisir un achat"</div></td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── MARGES ── */}
            {page === 'marges' && (
              <>
                <div className="g-card" style={{ marginBottom: 16, padding: '12px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                    <span>🎯 Objectif marge minimum :</span>
                    <input type="number" className="form-control mono" style={{ width: 70 }} value={marginTarget} onChange={e => setMarginTarget(parseFloat(e.target.value) || 40)} />
                    <span style={{ color: 'var(--dust)' }}>% — Alerte en dessous de ce seuil</span>
                  </div>
                </div>
                <div className="g-card">
                  <table className="g-table">
                    <thead><tr><th>Produit</th><th>Catégorie</th><th style={{ textAlign: 'right' }}>Achat</th><th style={{ textAlign: 'right' }}>Transport</th><th style={{ textAlign: 'right' }}>Autres</th><th style={{ textAlign: 'right' }}>Revient</th><th style={{ textAlign: 'right' }}>Vente</th><th style={{ textAlign: 'right' }}>Marge €</th><th style={{ textAlign: 'right' }}>Marge %</th><th></th><th></th></tr></thead>
                    <tbody>
                      {products.map(p => {
                        const pct = (p.sell - p.revient) / p.sell * 100;
                        return (
                          <tr key={p.id}>
                            <td><strong>{p.name}</strong></td>
                            <td style={{ fontSize: 12, color: 'var(--dust)' }}>{p.cat || '—'}</td>
                            <td className="price">{fmt(p.buy)}</td>
                            <td className="price">{p.trans > 0 ? fmt(p.trans) : '—'}</td>
                            <td className="price">{p.other > 0 ? fmt(p.other) : '—'}</td>
                            <td className="price" style={{ fontWeight: 600 }}>{fmt(p.revient)}</td>
                            <td className="price">{fmt(p.sell)}</td>
                            <td className="price" style={{ color: marginColor(pct) }}>{fmt(p.sell - p.revient)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: marginColor(pct) }}>{fmtPct(pct)}</td>
                            <td><div className="margin-bar"><div className="margin-fill" style={{ width: `${Math.min(pct, 100)}%`, background: marginColor(pct) }}></div></div></td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => openEditProduct(p)}>✏️</button>
                                <button className="btn btn-danger btn-sm" onClick={() => deleteProduct(p.id)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!products.length && <tr><td colSpan={11}><div className="empty">Aucun produit — cliquez sur "+ Ajouter un produit"</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── TRANSPORT ── */}
            {page === 'transport' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <div className="g-card" style={{ padding: 20 }}>
                    <div className="form-group">
                      <label className="form-label">Coût total transport *</label>
                      <input type="number" className="form-control mono" placeholder="Ex: 450.00" step="0.01" value={trCost} onChange={e => setTrCost(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Méthode de répartition</label>
                      <select className="form-control" value={trMethod} onChange={e => { setTrMethod(e.target.value); setTrResult([]); }}>
                        <option value="weight">Au poids (kg)</option>
                        <option value="value">À la valeur (€ achat)</option>
                        <option value="equal">Parts égales par unité</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--dust)', marginBottom: 8 }}>Produits</div>
                      {trLines.map((l, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 60px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                          <input className="form-control" style={{ fontSize: 12 }} value={l.name} onChange={e => { const nl = [...trLines]; nl[i].name = e.target.value; setTrLines(nl); }} placeholder="Produit" />
                          <input type="number" className="form-control mono" style={{ fontSize: 12 }} value={trMethod === 'weight' ? l.weight : l.value} step="0.01" onChange={e => { const nl = [...trLines]; if (trMethod === 'weight') nl[i].weight = e.target.value; else nl[i].value = e.target.value; setTrLines(nl); }} placeholder="0.00" />
                          <input type="number" className="form-control mono" style={{ fontSize: 12 }} value={l.qty} min={1} onChange={e => { const nl = [...trLines]; nl[i].qty = parseInt(e.target.value) || 1; setTrLines(nl); }} />
                          <button onClick={() => setTrLines(trLines.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                        </div>
                      ))}
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setTrLines([...trLines, { name: '', weight: '', value: '', qty: 1 }])}>+ Ajouter</button>
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={calcTransport}>Calculer la répartition</button>
                  </div>
                </div>
                <div>
                  {trResult.length > 0 && (
                    <div className="g-card" style={{ padding: 20 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Résultat de répartition</div>
                      <table className="g-table">
                        <thead><tr><th>Produit</th><th>Qté</th><th>%</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>/ unité</th></tr></thead>
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
                    <div className="form-group"><label className="form-label">Raison sociale</label><input className="form-control" value={params.company} onChange={e => setParams(p => ({ ...p, company: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Statut juridique</label><input className="form-control" value={params.legal} onChange={e => setParams(p => ({ ...p, legal: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">SIRET</label><input className="form-control mono" value={params.siret} onChange={e => setParams(p => ({ ...p, siret: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">N° TVA intracommunautaire</label><input className="form-control mono" value={params.tva} onChange={e => setParams(p => ({ ...p, tva: e.target.value }))} /></div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Adresse</label><textarea className="form-control" value={params.address} onChange={e => setParams(p => ({ ...p, address: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Email</label><input className="form-control" value={params.email} onChange={e => setParams(p => ({ ...p, email: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Téléphone</label><input className="form-control" value={params.phone} onChange={e => setParams(p => ({ ...p, phone: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">IBAN</label><input className="form-control mono" value={params.iban} onChange={e => setParams(p => ({ ...p, iban: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Taux TVA (%)</label><input type="number" className="form-control mono" value={params.tva_rate} onChange={e => setParams(p => ({ ...p, tva_rate: parseFloat(e.target.value) || 20 }))} /></div>
                    <div className="form-group"><label className="form-label">Délai paiement (jours)</label><input type="number" className="form-control mono" value={params.payment_days} onChange={e => setParams(p => ({ ...p, payment_days: parseInt(e.target.value) || 30 }))} /></div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Mentions légales (pied de facture)</label><textarea className="form-control" value={params.legal_mention} onChange={e => setParams(p => ({ ...p, legal_mention: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="g-card" style={{ padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🔢 Numérotation des factures</div>
                  <div className="g-grid-2">
                    <div className="form-group"><label className="form-label">Préfixe</label><input className="form-control mono" value={params.inv_prefix} onChange={e => setParams(p => ({ ...p, inv_prefix: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Prochain numéro</label><input type="number" className="form-control mono" value={params.inv_next} onChange={e => setParams(p => ({ ...p, inv_next: parseInt(e.target.value) || 1 }))} /></div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dust)', marginTop: 4 }}>Prochaine facture : <strong className="mono">{params.inv_prefix}{String(params.inv_next).padStart(4, '0')}</strong></div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── MODAL FACTURE ── */}
      {showInvoiceModal && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setShowInvoiceModal(false)}>
          <div className="g-modal">
            <div className="g-modal-header">
              <span className="g-modal-title">{editingInvoice ? 'Éditer — ' + editingInvoice.number : 'Nouvelle facture'}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowInvoiceModal(false)}>✕</button>
            </div>
            <div className="g-modal-body">
              <div className="g-grid-3" style={{ marginBottom: 14 }}>
                <div className="form-group"><label className="form-label">N° facture</label><input className="form-control mono" value={invForm.number} onChange={e => setInvForm(f => ({ ...f, number: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-control" value={invForm.date} onChange={e => setInvForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Statut</label>
                  <select className="form-control" value={invForm.status} onChange={e => setInvForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="draft">Brouillon</option><option value="sent">Envoyée</option><option value="paid">Payée</option><option value="late">En retard</option>
                  </select>
                </div>
              </div>
              <div className="g-grid-3" style={{ marginBottom: 14 }}>
                <div className="form-group"><label className="form-label">Client *</label><input className="form-control" value={invForm.client_name} onChange={e => setInvForm(f => ({ ...f, client_name: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-control" value={invForm.client_email} onChange={e => setInvForm(f => ({ ...f, client_email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Adresse</label><input className="form-control" value={invForm.client_address} onChange={e => setInvForm(f => ({ ...f, client_address: e.target.value }))} /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--dust)', marginBottom: 8 }}>Lignes</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>{['Description', 'Qté', 'P.U. HT', 'TVA %', 'Total', ''].map(h => <th key={h} style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--dust)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {invoiceLines.map((l, i) => {
                      const update = (field: string, val: any) => { const nl = [...invoiceLines]; (nl[i] as any)[field] = val; setInvoiceLines(nl); };
                      return (
                        <tr key={i}>
                          <td style={{ padding: '3px 4px' }}><input className="form-control" style={{ fontSize: 12 }} value={l.desc} onChange={e => update('desc', e.target.value)} placeholder="Description" /></td>
                          <td style={{ padding: '3px 4px', width: 60 }}><input type="number" className="form-control mono" style={{ fontSize: 12, width: 60 }} value={l.qty} min={1} onChange={e => update('qty', parseFloat(e.target.value) || 1)} /></td>
                          <td style={{ padding: '3px 4px', width: 90 }}><input type="number" className="form-control mono" style={{ fontSize: 12, width: 90 }} value={l.price} step="0.01" onChange={e => update('price', parseFloat(e.target.value) || 0)} /></td>
                          <td style={{ padding: '3px 4px', width: 65 }}><input type="number" className="form-control mono" style={{ fontSize: 12, width: 65 }} value={l.tva} min={0} max={100} onChange={e => update('tva', parseFloat(e.target.value) || 0)} /></td>
                          <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(l.qty * l.price)}</td>
                          <td><button onClick={() => setInvoiceLines(invoiceLines.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setInvoiceLines([...invoiceLines, { desc: '', qty: 1, price: 0, tva: params.tva_rate || 20 }])}>+ Ligne</button>
              </div>
              {(() => { const { ht, tva, ttc } = calcInvoiceTotals(invoiceLines); return (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div className="result-box" style={{ minWidth: 220 }}>
                    <div className="result-row"><span>Total HT</span><span className="mono">{fmt(ht)}</span></div>
                    <div className="result-row"><span>TVA</span><span className="mono">{fmt(tva)}</span></div>
                    <div className="result-row result-total"><span>Total TTC</span><span className="mono">{fmt(ttc)}</span></div>
                  </div>
                </div>
              ); })()}
              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label">Note</label>
                <textarea className="form-control" value={invForm.note} onChange={e => setInvForm(f => ({ ...f, note: e.target.value }))} placeholder="Note interne ou mention sur la facture" />
              </div>
            </div>
            <div className="g-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowInvoiceModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveInvoice}>💾 Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ACHAT ── */}
      {showPurchaseModal && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setShowPurchaseModal(false)}>
          <div className="g-modal">
            <div className="g-modal-header"><span className="g-modal-title">Saisir un achat fournisseur</span><button className="btn btn-secondary btn-sm" onClick={() => setShowPurchaseModal(false)}>✕</button></div>
            <div className="g-modal-body">
              <div className="g-grid-2">
                <div className="form-group"><label className="form-label">Fournisseur *</label><input className="form-control" value={purForm.supplier} onChange={e => setPurForm(f => ({ ...f, supplier: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-control" value={purForm.date} onChange={e => setPurForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">N° facture fournisseur</label><input className="form-control mono" value={purForm.ref} onChange={e => setPurForm(f => ({ ...f, ref: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Statut</label>
                  <select className="form-control" value={purForm.status} onChange={e => setPurForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="received">Reçue</option><option value="pending">En attente</option><option value="paid">Payée</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Montant HT</label><input type="number" className="form-control mono" value={purForm.amount} step="0.01" onChange={e => { const v = e.target.value; setPurForm(f => ({ ...f, amount: v, total: calcPurchaseTotal(v, f.transport) })); }} /></div>
                <div className="form-group"><label className="form-label">Frais de transport</label><input type="number" className="form-control mono" value={purForm.transport} step="0.01" onChange={e => { const v = e.target.value; setPurForm(f => ({ ...f, transport: v, total: calcPurchaseTotal(f.amount, v) })); }} /></div>
                <div className="form-group"><label className="form-label">Total</label><input type="number" className="form-control mono" value={purForm.total} readOnly style={{ background: 'var(--cream)' }} /></div>
                <div className="form-group"><label className="form-label">Produits (liste)</label><input className="form-control" value={purForm.products} onChange={e => setPurForm(f => ({ ...f, products: e.target.value }))} placeholder="Cardamome, Wasa, Daim…" /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Notes</label><textarea className="form-control" value={purForm.notes} onChange={e => setPurForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
            </div>
            <div className="g-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPurchaseModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={savePurchase}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MARGE ── */}
      {showMarginModal && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setShowMarginModal(false)}>
          <div className="g-modal">
            <div className="g-modal-header"><span className="g-modal-title">{editingProduct ? 'Éditer — ' + editingProduct.name : 'Nouveau produit'}</span><button className="btn btn-secondary btn-sm" onClick={() => setShowMarginModal(false)}>✕</button></div>
            <div className="g-modal-body">
              <div className="g-grid-2">
                <div className="form-group"><label className="form-label">Nom *</label><input className="form-control" value={mpForm.name} onChange={e => { const f = { ...mpForm, name: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">Catégorie</label><input className="form-control" value={mpForm.cat} onChange={e => setMpForm(f => ({ ...f, cat: e.target.value }))} placeholder="Épices, Confiseries…" /></div>
                <div className="form-group"><label className="form-label">Prix achat HT *</label><input type="number" className="form-control mono" value={mpForm.buy} step="0.01" onChange={e => { const f = { ...mpForm, buy: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">Quote-part transport</label><input type="number" className="form-control mono" value={mpForm.trans} step="0.01" onChange={e => { const f = { ...mpForm, trans: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">Autres coûts</label><input type="number" className="form-control mono" value={mpForm.other} step="0.01" onChange={e => { const f = { ...mpForm, other: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">Prix de vente *</label><input type="number" className="form-control mono" value={mpForm.sell} step="0.01" onChange={e => { const f = { ...mpForm, sell: e.target.value }; setMpForm(f); calcMpResult(f); }} /></div>
                <div className="form-group"><label className="form-label">Stock</label><input type="number" className="form-control mono" value={mpForm.stock} onChange={e => setMpForm(f => ({ ...f, stock: e.target.value }))} /></div>
              </div>
              {mpResult && (
                <div className="result-box">
                  <div className="result-row"><span>Prix de revient</span><span className="mono" style={{ fontWeight: 600 }}>{fmt(mpResult.revient)}</span></div>
                  <div className="result-row"><span>Marge brute</span><span className="mono">{fmt(mpResult.marginEur)}</span></div>
                  <div className="result-row result-total"><span>Marge %</span><span className="mono" style={{ color: marginColor(mpResult.marginPct), fontWeight: 700 }}>{fmtPct(mpResult.marginPct)}</span></div>
                  <div className="result-row" style={{ marginTop: 8, color: 'var(--dust)', fontSize: 12 }}><span>Prix suggéré ({marginTarget}% marge)</span><span className="mono">{fmt(mpResult.suggested)}</span></div>
                </div>
              )}
            </div>
            <div className="g-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMarginModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveProduct}>💾 Enregistrer</button>
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
                <button className="btn btn-secondary btn-sm" onClick={() => setPreviewInvoice(null)}>✕</button>
              </div>
            </div>
            <div className="g-modal-body">
              <div style={{ border: '1px solid var(--linen)', borderRadius: 'var(--r)', padding: 32, fontSize: 13, lineHeight: 1.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
                  <div><div style={{ fontFamily: 'var(--font-d)', fontSize: 22, fontWeight: 600, color: 'var(--moss)' }}>{params.company}</div><div style={{ fontSize: 11, color: 'var(--dust)' }}>{params.legal}</div><div style={{ fontSize: 12, color: 'var(--dust)', marginTop: 4, whiteSpace: 'pre-line' }}>{params.address}</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>FACTURE {previewInvoice.number}</div><div style={{ fontSize: 12, color: 'var(--dust)' }}>Date : {fmtDate(previewInvoice.date)}</div></div>
                </div>
                <div style={{ marginBottom: 24, padding: 12, background: 'var(--cream)', borderRadius: 'var(--r)' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--dust)', marginBottom: 4 }}>Facturé à</div>
                  <div style={{ fontWeight: 600 }}>{previewInvoice.client_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--dust)', whiteSpace: 'pre-line' }}>{previewInvoice.client_address}</div>
                </div>
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
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}><span>Total HT</span><span className="mono">{fmt(previewInvoice.total_ht)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}><span>TVA</span><span className="mono">{fmt(previewInvoice.total_tva)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, fontWeight: 700, borderTop: '2px solid var(--midnight)', marginTop: 4 }}><span>Total TTC</span><span className="mono">{fmt(previewInvoice.total_ttc)}</span></div>
                  </div>
                </div>
                {params.iban && <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--cream)', borderRadius: 4, fontSize: 12 }}><strong>Virement :</strong> {params.iban}</div>}
                {params.legal_mention && <div style={{ marginTop: 16, fontSize: 11, color: 'var(--dust)' }}>{params.legal_mention}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="g-toast">{toast}</div>}
    </>
  );
}
