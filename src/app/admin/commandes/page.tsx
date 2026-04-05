'use client';
import { useEffect, useState } from 'react';

type Order = {
  id: string; order_number: string; status: string;
  customer_name: string; customer_email: string; customer_address?: string;
  lines: any[]; subtotal: number; shipping: number; total: number;
  notes?: string; source: string; created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', confirmed: '#3B82F6', shipped: '#8B5CF6',
  delivered: '#10B981', cancelled: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente', confirmed: 'Confirmée', shipped: 'Expédiée',
  delivered: 'Livrée', cancelled: 'Annulée',
};

const fmt = (n: number) => n?.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function CommandesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [toast, setToast] = useState('');
  const [newOrder, setNewOrder] = useState({
    customer_name: '', customer_email: '', customer_address: '',
    notes: '', shipping: '0', lines: [{ desc: '', qty: 1, price: 0 }]
  });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  useEffect(() => { load(); }, [filter, search]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    if (search) params.set('search', search);
    const res = await fetch('/api/orders?' + params.toString());
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    showToast('✅ Statut mis à jour');
    load();
    if (selected?.id === id) setSelected(o => o ? { ...o, status } : null);
  }

  async function createOrder() {
    if (!newOrder.customer_name || !newOrder.customer_email) { showToast('⚠️ Nom et email requis'); return; }
    const subtotal = newOrder.lines.reduce((s, l) => s + l.qty * l.price, 0);
    const shipping = parseFloat(newOrder.shipping) || 0;
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newOrder, subtotal, shipping, total: subtotal + shipping }),
    });
    setShowNewModal(false);
    showToast('✅ Commande créée !');
    load();
  }

  const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const pending = orders.filter(o => o.status === 'pending').length;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    .o-wrap { font-family:'Jost',sans-serif; }
    .o-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
    .o-title { font-family:'Cormorant Garamond',serif; font-size:30px; font-weight:600; color:#1C2028; }
    .o-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
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
    .o-modal-body { padding:20px; }
    .o-modal-footer { padding:14px 20px; border-top:1px solid #D8CEBC; display:flex; justify-content:flex-end; gap:10px; }
    .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:6px; font-family:'Jost',sans-serif; font-size:13px; font-weight:500; cursor:pointer; border:none; }
    .btn-primary { background:#3E5238; color:#fff; } .btn-primary:hover { background:#587050; }
    .btn-secondary { background:#F6F1E9; color:#3E4550; border:1px solid #D8CEBC; } .btn-secondary:hover { background:#D8CEBC; }
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
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="o-wrap">
        <div className="o-header">
          <div>
            <div className="o-title">Commandes</div>
            <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>{orders.length} commandes</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>+ Nouvelle commande</button>
        </div>

        {/* Stats */}
        <div className="o-stats">
          <div className="o-stat"><div className="o-stat-num mono">{orders.length}</div><div className="o-stat-label">Total commandes</div></div>
          <div className="o-stat"><div className="o-stat-num mono" style={{ color: '#F59E0B' }}>{pending}</div><div className="o-stat-label">En attente</div></div>
          <div className="o-stat"><div className="o-stat-num mono">{fmt(totalRevenue)}</div><div className="o-stat-label">Chiffre d'affaires</div></div>
          <div className="o-stat"><div className="o-stat-num mono">{orders.length > 0 ? fmt(totalRevenue / orders.filter(o => o.status !== 'cancelled').length || 1) : '0,00 €'}</div><div className="o-stat-label">Panier moyen</div></div>
        </div>

        {/* Toolbar */}
        <div className="o-toolbar">
          <input className="o-search" placeholder="Rechercher client, email, n° commande…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="o-filter" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Table */}
        <table className="o-table">
          <thead><tr><th>N° Commande</th><th>Client</th><th>Date</th><th>Total</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><div className="empty">Chargement…</div></td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6}><div className="empty">Aucune commande</div></td></tr>
            ) : orders.map(o => (
              <tr key={o.id} onClick={() => { setSelected(o); setShowModal(true); }}>
                <td className="mono" style={{ fontSize: 12 }}>{o.order_number}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                  <div style={{ fontSize: 11, color: '#6A7280' }}>{o.customer_email}</div>
                </td>
                <td style={{ color: '#6A7280' }}>{fmtDate(o.created_at)}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{fmt(o.total)}</td>
                <td>
                  <span className="o-badge" style={{ background: STATUS_COLORS[o.status] + '20', color: STATUS_COLORS[o.status] }}>
                    {STATUS_LABELS[o.status] || o.status}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <select
                    className="o-filter btn-sm"
                    value={o.status}
                    onChange={e => updateStatus(o.id, e.target.value)}
                    style={{ fontSize: 11, padding: '4px 8px' }}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Detail Modal */}
        {showModal && selected && (
          <div className="o-modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="o-modal">
              <div className="o-modal-header">
                <span className="o-modal-title">Commande {selected.order_number}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
              </div>
              <div className="o-modal-body">
                <div className="grid-2" style={{ marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6A7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Client</div>
                    <div style={{ fontWeight: 600 }}>{selected.customer_name}</div>
                    <div style={{ fontSize: 13, color: '#6A7280' }}>{selected.customer_email}</div>
                    {selected.customer_address && <div style={{ fontSize: 12, color: '#6A7280', marginTop: 4, whiteSpace: 'pre-line' }}>{selected.customer_address}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6A7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Détails</div>
                    <div style={{ fontSize: 13 }}>Date : {fmtDate(selected.created_at)}</div>
                    <div style={{ fontSize: 13 }}>Source : {selected.source}</div>
                    <div style={{ marginTop: 6 }}>
                      <span className="o-badge" style={{ background: STATUS_COLORS[selected.status] + '20', color: STATUS_COLORS[selected.status] }}>
                        {STATUS_LABELS[selected.status]}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lines */}
                <div style={{ background: '#FDFAF5', border: '1px solid #D8CEBC', borderRadius: 6, marginBottom: 16 }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #D8CEBC', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: '#6A7280' }}>Lignes</div>
                  {(typeof selected.lines === 'string' ? JSON.parse(selected.lines) : selected.lines || []).map((l: any, i: number) => (
                    <div key={i} className="detail-row" style={{ padding: '8px 14px' }}>
                      <span>{l.desc || l.name || '—'} × {l.qty}</span>
                      <span className="mono">{fmt(l.qty * l.price)}</span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ minWidth: 220 }}>
                    <div className="detail-row"><span>Sous-total</span><span className="mono">{fmt(selected.subtotal)}</span></div>
                    <div className="detail-row"><span>Livraison</span><span className="mono">{fmt(selected.shipping)}</span></div>
                    <div className="detail-row" style={{ fontWeight: 700, fontSize: 15, borderTop: '2px solid #1C2028', marginTop: 4, paddingTop: 8 }}><span>Total</span><span className="mono">{fmt(selected.total)}</span></div>
                  </div>
                </div>

                {selected.notes && <div style={{ marginTop: 12, padding: '10px 14px', background: '#F6F1E9', borderRadius: 6, fontSize: 12, fontStyle: 'italic', color: '#3E4550' }}>{selected.notes}</div>}

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: '#6A7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Changer le statut</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <button key={k} className={`btn btn-sm ${selected.status === k ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => updateStatus(selected.id, k)}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Order Modal */}
        {showNewModal && (
          <div className="o-modal-overlay" onClick={e => e.target === e.currentTarget && setShowNewModal(false)}>
            <div className="o-modal">
              <div className="o-modal-header"><span className="o-modal-title">Nouvelle commande manuelle</span><button className="btn btn-secondary btn-sm" onClick={() => setShowNewModal(false)}>✕</button></div>
              <div className="o-modal-body">
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Nom client *</label><input className="form-control" value={newOrder.customer_name} onChange={e => setNewOrder(o => ({ ...o, customer_name: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Email *</label><input className="form-control" value={newOrder.customer_email} onChange={e => setNewOrder(o => ({ ...o, customer_email: e.target.value }))} /></div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Adresse</label><textarea className="form-control" style={{ minHeight: 60 }} value={newOrder.customer_address} onChange={e => setNewOrder(o => ({ ...o, customer_address: e.target.value }))} /></div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6A7280', marginBottom: 8 }}>Lignes</div>
                  {newOrder.lines.map((l, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 90px 28px', gap: 6, marginBottom: 6 }}>
                      <input className="form-control" placeholder="Produit" value={l.desc} onChange={e => { const nl = [...newOrder.lines]; nl[i].desc = e.target.value; setNewOrder(o => ({ ...o, lines: nl })); }} />
                      <input type="number" className="form-control mono" placeholder="Qté" value={l.qty} min={1} onChange={e => { const nl = [...newOrder.lines]; nl[i].qty = parseInt(e.target.value) || 1; setNewOrder(o => ({ ...o, lines: nl })); }} />
                      <input type="number" className="form-control mono" placeholder="Prix" value={l.price} step="0.01" onChange={e => { const nl = [...newOrder.lines]; nl[i].price = parseFloat(e.target.value) || 0; setNewOrder(o => ({ ...o, lines: nl })); }} />
                      <button onClick={() => setNewOrder(o => ({ ...o, lines: o.lines.filter((_, j) => j !== i) }))} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-sm" onClick={() => setNewOrder(o => ({ ...o, lines: [...o.lines, { desc: '', qty: 1, price: 0 }] }))}>+ Ligne</button>
                </div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Frais de livraison</label><input type="number" className="form-control mono" value={newOrder.shipping} step="0.01" onChange={e => setNewOrder(o => ({ ...o, shipping: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Notes</label><input className="form-control" value={newOrder.notes} onChange={e => setNewOrder(o => ({ ...o, notes: e.target.value }))} /></div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, fontFamily: 'DM Mono,monospace' }}>
                  Total : {fmt(newOrder.lines.reduce((s, l) => s + l.qty * l.price, 0) + (parseFloat(newOrder.shipping) || 0))}
                </div>
              </div>
              <div className="o-modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={createOrder}>💾 Créer la commande</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
