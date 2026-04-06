'use client';
import { useEffect, useState } from 'react';

type PurchaseOrder = {
  id: string; number: string; status: string; supplier_id?: string; supplier_name?: string;
  expected_date?: string; lines: any[]; subtotal: number; tax: number; shipping: number;
  total: number; notes?: string; invoice_id?: string; created_at: string;
  contacts?: { company?: string; first_name?: string; last_name?: string; email?: string };
};
type Contact = { id: string; company?: string; first_name?: string; last_name?: string; email?: string };

const STATUS = { draft: { label: 'Brouillon', color: '#6A7280' }, sent: { label: 'Envoyée', color: '#2563EB' }, confirmed: { label: 'Confirmée', color: '#7C3AED' }, partial: { label: 'Partielle', color: '#F59E0B' }, received: { label: 'Reçue', color: '#10B981' }, cancelled: { label: 'Annulée', color: '#EF4444' } };
const fmt = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

export default function AchatsPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showReception, setShowReception] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ supplier_id: '', supplier_name: '', expected_date: '', notes: '', lines: [{ product_id: '', name: '', qty: 1, unit_cost: 0, total: 0 }] });
  const [recForm, setRecForm] = useState({ notes: '', invoice_id: '', lines: [] as any[] });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { load(); loadSuppliers(); loadProducts(); }, [filter]);

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

  function calcLines(lines: any[]) {
    return lines.map(l => ({ ...l, total: (l.qty || 0) * (l.unit_cost || 0) }));
  }

  function updateLine(i: number, field: string, val: any) {
    const nl = [...form.lines];
    nl[i] = { ...nl[i], [field]: val };
    if (field === 'product_id') {
      const p = products.find(x => x.id === val);
      if (p) nl[i].name = p.name_fr;
    }
    setForm(f => ({ ...f, lines: calcLines(nl) }));
  }

  const subtotal = form.lines.reduce((s, l) => s + (l.total || 0), 0);

  async function saveOrder() {
    if (!form.supplier_id) { showToast('⚠️ Fournisseur requis'); return; }
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, supplier_name: supplier?.company || `${supplier?.first_name} ${supplier?.last_name}`, subtotal, total: subtotal }),
    });
    if (!res.ok) { showToast('❌ Erreur'); return; }
    showToast('✅ Commande créée !');
    setShowModal(false);
    load();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/purchase-orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    showToast('✅ Statut mis à jour');
    load();
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
    const res = await fetch('/api/receptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...recForm, purchase_order_id: selected.id, supplier_id: selected.supplier_id, supplier_name: selected.supplier_name }),
    });
    if (!res.ok) { showToast('❌ Erreur'); return; }
    showToast('✅ Réception enregistrée — stock mis à jour !');
    setShowReception(false);
    load();
  }

  const totalOrders = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const pending = orders.filter(o => ['draft', 'sent', 'confirmed'].includes(o.status)).length;

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
    .btn-sm { padding: 4px 10px; font-size: 11px; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(28,32,40,0.5); z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; overflow-y: auto; }
    .modal { background: #fff; border-radius: 8px; width: 100%; max-width: 700px; margin: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .modal-header { padding: 16px 20px; border-bottom: 1px solid #D8CEBC; display: flex; align-items: center; justify-content: space-between; }
    .modal-title { font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px; max-height: 70vh; overflow-y: auto; }
    .modal-footer { padding: 14px 20px; border-top: 1px solid #D8CEBC; display: flex; justify-content: flex-end; gap: 10px; }
    .form-group { margin-bottom: 12px; }
    .form-label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #6A7280; margin-bottom: 4px; }
    .form-control { width: 100%; padding: 8px 10px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; outline: none; }
    .form-control:focus { border-color: #7A9468; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .lines-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px; }
    .lines-table th { padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6A7280; }
    .lines-table td { padding: 4px; }
    .lines-input { width: 100%; padding: 6px 8px; border: 1px solid #D8CEBC; border-radius: 4px; font-family: 'Jost', sans-serif; font-size: 12px; outline: none; }
    .totals-box { background: #F6F1E9; border-radius: 6px; padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 600; font-family: 'DM Mono', monospace; }
    .mono { font-family: 'DM Mono', monospace; }
    .empty { padding: 40px; text-align: center; color: #6A7280; font-style: italic; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #1C2028; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; z-index: 999; }
    select.form-control { appearance: none; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="a-wrap">
        <div className="a-header">
          <div>
            <div className="a-title">🛍️ Commandes d'achat</div>
            <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>{orders.length} commandes</div>
          </div>
          <button className="btn btn-primary" onClick={() => { setForm({ supplier_id: '', supplier_name: '', expected_date: '', notes: '', lines: [{ product_id: '', name: '', qty: 1, unit_cost: 0, total: 0 }] }); setShowModal(true); }}>+ Nouvelle commande</button>
        </div>

        <div className="a-stats">
          <div className="a-stat"><div className="a-stat-num mono">{fmt(totalOrders)}</div><div className="a-stat-label">Total engagé</div></div>
          <div className="a-stat"><div className="a-stat-num" style={{ color: '#F59E0B' }}>{pending}</div><div className="a-stat-label">En cours</div></div>
          <div className="a-stat"><div className="a-stat-num">{orders.filter(o => o.status === 'received').length}</div><div className="a-stat-label">Reçues</div></div>
        </div>

        <div className="a-toolbar">
          <select className="a-select" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <table className="a-table">
          <thead><tr><th>N°</th><th>Fournisseur</th><th>Date attendue</th><th>Total</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6}><div className="empty">Chargement…</div></td></tr>
            : orders.length === 0 ? <tr><td colSpan={6}><div className="empty">Aucune commande d'achat</div></td></tr>
            : orders.map(o => {
              const st = STATUS[o.status as keyof typeof STATUS] || { label: o.status, color: '#6A7280' };
              const supplier = o.contacts;
              const name = supplier?.company || `${supplier?.first_name || ''} ${supplier?.last_name || ''}`.trim() || o.supplier_name || '—';
              return (
                <tr key={o.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{o.number}</td>
                  <td><strong>{name}</strong></td>
                  <td style={{ color: '#6A7280' }}>{fmtDate(o.expected_date)}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{fmt(o.total)}</td>
                  <td><span className="badge" style={{ background: st.color + '20', color: st.color }}>{st.label}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <select className="a-select btn-sm" value={o.status} onChange={e => updateStatus(o.id, e.target.value)} style={{ fontSize: 11, padding: '4px 8px' }}>
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      {['confirmed', 'partial'].includes(o.status) && (
                        <button className="btn btn-warning btn-sm" onClick={() => openReception(o)}>📬 Réceptionner</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Modal nouvelle commande */}
        {showModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="modal">
              <div className="modal-header"><span className="modal-title">Nouvelle commande d'achat</span><button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button></div>
              <div className="modal-body">
                <div className="grid-2" style={{ marginBottom: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Fournisseur *</label>
                    <select className="form-control" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                      <option value="">— Choisir —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.company || `${s.first_name} ${s.last_name}`}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Date de livraison attendue</label><input type="date" className="form-control" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} /></div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6A7280', marginBottom: 8 }}>Lignes de commande</div>
                  <table className="lines-table">
                    <thead><tr><th style={{ width: '40%' }}>Produit</th><th>Qté</th><th>Prix unit. HT</th><th>Total</th><th></th></tr></thead>
                    <tbody>
                      {form.lines.map((l, i) => (
                        <tr key={i}>
                          <td>
                            <select className="lines-input" value={l.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                              <option value="">— Produit —</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name_fr}</option>)}
                            </select>
                          </td>
                          <td><input type="number" className="lines-input" style={{ width: 60 }} value={l.qty} min={1} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} /></td>
                          <td><input type="number" className="lines-input" style={{ width: 80 }} value={l.unit_cost} step="0.01" onChange={e => updateLine(i, 'unit_cost', parseFloat(e.target.value) || 0)} /></td>
                          <td className="mono" style={{ padding: '4px 8px' }}>{fmt(l.total || 0)}</td>
                          <td><button onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer' }}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, { product_id: '', name: '', qty: 1, unit_cost: 0, total: 0 }] }))}>+ Ligne</button>
                </div>

                <div className="totals-box">Total HT : {fmt(subtotal)}</div>

                <div className="form-group" style={{ marginTop: 12 }}><label className="form-label">Notes</label><textarea className="form-control" style={{ minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={saveOrder}>💾 Créer la commande</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal réception */}
        {showReception && selected && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReception(false)}>
            <div className="modal">
              <div className="modal-header"><span className="modal-title">📬 Réception — {selected.number}</span><button className="btn btn-secondary btn-sm" onClick={() => setShowReception(false)}>✕</button></div>
              <div className="modal-body">
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
                  ⚠️ La validation de cette réception mettra à jour le stock automatiquement.
                </div>
                <table className="lines-table">
                  <thead><tr><th>Produit</th><th>Commandé</th><th>Reçu</th></tr></thead>
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
                <div className="form-group" style={{ marginTop: 12 }}><label className="form-label">Notes</label><textarea className="form-control" style={{ minHeight: 60 }} value={recForm.notes} onChange={e => setRecForm(r => ({ ...r, notes: e.target.value }))} /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowReception(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={saveReception}>✅ Valider la réception</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
