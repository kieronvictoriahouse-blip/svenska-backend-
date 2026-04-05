'use client';
import { useEffect, useState } from 'react';

type StockProduct = {
  id: string; name_fr: string; sort_order: number;
  stock: number; stock_alert: number; track_stock: boolean;
};

export default function StockPage() {
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch('/api/stock');
    const data = await res.json();
    setProducts(data.products || []);
    setLoading(false);
  }

  async function updateStock(p: StockProduct, newStock: number, reason?: string) {
    setSaving(p.id);
    await fetch('/api/stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, stock: newStock, stock_alert: p.stock_alert, track_stock: p.track_stock, reason }),
    });
    setProducts(prods => prods.map(x => x.id === p.id ? { ...x, stock: newStock } : x));
    setSaving(null);
    showToast('✅ Stock mis à jour');
  }

  async function toggleTrack(p: StockProduct) {
    setSaving(p.id);
    await fetch('/api/stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, stock: p.stock, stock_alert: p.stock_alert, track_stock: !p.track_stock }),
    });
    setProducts(prods => prods.map(x => x.id === p.id ? { ...x, track_stock: !x.track_stock } : x));
    setSaving(null);
  }

  const filtered = products.filter(p => {
    if (filter === 'low') return p.track_stock && p.stock <= p.stock_alert && p.stock > 0;
    if (filter === 'out') return p.track_stock && p.stock === 0;
    return true;
  });

  const lowStock = products.filter(p => p.track_stock && p.stock <= p.stock_alert && p.stock > 0).length;
  const outOfStock = products.filter(p => p.track_stock && p.stock === 0).length;
  const tracked = products.filter(p => p.track_stock).length;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    .s-wrap { font-family:'Jost',sans-serif; }
    .s-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
    .s-title { font-family:'Cormorant Garamond',serif; font-size:30px; font-weight:600; color:#1C2028; }
    .s-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
    .s-stat { background:#fff; border:1px solid #D8CEBC; border-radius:6px; padding:16px 18px; }
    .s-stat-num { font-family:'DM Mono',monospace; font-size:22px; font-weight:500; }
    .s-stat-label { font-size:11px; color:#6A7280; margin-top:3px; letter-spacing:0.5px; text-transform:uppercase; }
    .s-filters { display:flex; gap:8px; margin-bottom:16px; }
    .s-filter { padding:6px 14px; border-radius:20px; border:1px solid #D8CEBC; font-family:'Jost',sans-serif; font-size:12px; cursor:pointer; background:#fff; transition:all 0.15s; }
    .s-filter.active { background:#3E5238; color:#fff; border-color:#3E5238; }
    .s-table { width:100%; border-collapse:collapse; font-size:13px; background:#fff; border:1px solid #D8CEBC; border-radius:6px; overflow:hidden; }
    .s-table th { padding:10px 14px; text-align:left; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#6A7280; background:#FDFAF5; border-bottom:1px solid #D8CEBC; }
    .s-table td { padding:10px 14px; border-bottom:1px solid #F0EBE1; vertical-align:middle; }
    .s-table tr:last-child td { border-bottom:none; }
    .s-qty { display:flex; align-items:center; gap:6px; }
    .s-qty-btn { width:28px; height:28px; border:1px solid #D8CEBC; background:#fff; border-radius:4px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; transition:background 0.15s; }
    .s-qty-btn:hover { background:#F6F1E9; }
    .s-qty-input { width:60px; padding:4px 8px; border:1px solid #D8CEBC; border-radius:4px; font-family:'DM Mono',monospace; font-size:13px; text-align:center; outline:none; }
    .s-qty-input:focus { border-color:#7A9468; }
    .s-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; }
    .s-toggle { width:36px; height:20px; border-radius:10px; border:none; cursor:pointer; position:relative; transition:background 0.2s; }
    .s-toggle::after { content:''; position:absolute; width:16px; height:16px; border-radius:50%; background:#fff; top:2px; transition:left 0.2s; }
    .s-toggle.on { background:#3E5238; } .s-toggle.on::after { left:18px; }
    .s-toggle.off { background:#D8CEBC; } .s-toggle.off::after { left:2px; }
    .toast { position:fixed; bottom:24px; right:24px; background:#1C2028; color:#fff; padding:10px 18px; border-radius:6px; font-size:13px; z-index:999; }
    .empty { padding:60px; text-align:center; color:#6A7280; font-style:italic; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="s-wrap">
        <div className="s-header">
          <div>
            <div className="s-title">Gestion des stocks</div>
            <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>Activez le suivi par produit et ajustez les quantités</div>
          </div>
        </div>

        <div className="s-stats">
          <div className="s-stat"><div className="s-stat-num">{tracked}</div><div className="s-stat-label">Produits suivis</div></div>
          <div className="s-stat"><div className="s-stat-num" style={{ color: '#F59E0B' }}>{lowStock}</div><div className="s-stat-label">Stock faible</div></div>
          <div className="s-stat"><div className="s-stat-num" style={{ color: '#EF4444' }}>{outOfStock}</div><div className="s-stat-label">Rupture</div></div>
          <div className="s-stat"><div className="s-stat-num">{products.length}</div><div className="s-stat-label">Total produits</div></div>
        </div>

        <div className="s-filters">
          {([['all', 'Tous'], ['low', `⚠️ Stock faible (${lowStock})`], ['out', `🔴 Rupture (${outOfStock})`]] as const).map(([val, label]) => (
            <button key={val} className={`s-filter ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
          ))}
        </div>

        <table className="s-table">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Suivi actif</th>
              <th>Stock actuel</th>
              <th>Seuil alerte</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}><div className="empty">Chargement…</div></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5}><div className="empty">Aucun produit</div></td></tr>
            ) : filtered.map(p => {
              const isLow = p.track_stock && p.stock <= p.stock_alert && p.stock > 0;
              const isOut = p.track_stock && p.stock === 0;
              return (
                <tr key={p.id}>
                  <td><strong>{p.name_fr}</strong></td>
                  <td>
                    <button
                      className={`s-toggle ${p.track_stock ? 'on' : 'off'}`}
                      onClick={() => toggleTrack(p)}
                      disabled={saving === p.id}
                      title={p.track_stock ? 'Désactiver le suivi' : 'Activer le suivi'}
                    />
                  </td>
                  <td>
                    {p.track_stock ? (
                      <div className="s-qty">
                        <button className="s-qty-btn" onClick={() => updateStock(p, Math.max(0, p.stock - 1))}>−</button>
                        <input
                          className="s-qty-input"
                          type="number"
                          value={p.stock}
                          min={0}
                          onChange={e => setProducts(ps => ps.map(x => x.id === p.id ? { ...x, stock: parseInt(e.target.value) || 0 } : x))}
                          onBlur={e => updateStock(p, parseInt(e.target.value) || 0, 'Ajustement manuel')}
                        />
                        <button className="s-qty-btn" onClick={() => updateStock(p, p.stock + 1)}>+</button>
                      </div>
                    ) : (
                      <span style={{ color: '#D8CEBC', fontSize: 12 }}>— Non suivi</span>
                    )}
                  </td>
                  <td>
                    {p.track_stock ? (
                      <input
                        className="s-qty-input"
                        type="number"
                        value={p.stock_alert}
                        min={0}
                        style={{ width: 60 }}
                        onChange={e => setProducts(ps => ps.map(x => x.id === p.id ? { ...x, stock_alert: parseInt(e.target.value) || 0 } : x))}
                        onBlur={e => {
                          fetch('/api/stock', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, stock: p.stock, stock_alert: parseInt(e.target.value) || 0, track_stock: p.track_stock }) });
                        }}
                      />
                    ) : <span style={{ color: '#D8CEBC', fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    {!p.track_stock ? (
                      <span className="s-badge" style={{ background: '#F6F1E9', color: '#6A7280' }}>Non suivi</span>
                    ) : isOut ? (
                      <span className="s-badge" style={{ background: '#FEE2E2', color: '#EF4444' }}>🔴 Rupture</span>
                    ) : isLow ? (
                      <span className="s-badge" style={{ background: '#FEF3C7', color: '#F59E0B' }}>⚠️ Stock faible</span>
                    ) : (
                      <span className="s-badge" style={{ background: '#D1FAE5', color: '#10B981' }}>✅ OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
