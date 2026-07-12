'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ProduitsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [rehosting, setRehosting] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const token = localStorage.getItem('sd_admin_token') || '';
    const [pRes, cRes] = await Promise.all([
      fetch('/api/products?limit=200', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
      fetch('/api/categories'),
    ]);
    const pData = await pRes.json();
    const cData = await cRes.json();
    setProducts(pData.products || []);
    setCategories(cData.categories || []);
    setLoading(false);
  }

  async function toggleActive(id: string, current: boolean) {
    const token = localStorage.getItem('sd_admin_token');
    await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !current }),
    });
    setProducts(ps => ps.map(p => p.id === id ? { ...p, is_active: !current } : p));
    showToast(!current ? '✅ Produit activé' : '🙈 Produit masqué');
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const confirmed = window.confirm(`Supprimer définitivement ${selected.size} produit(s) ? Cette action est irréversible.`);
    if (!confirmed) return;
    setDeleting(true);
    const token = localStorage.getItem('sd_admin_token');
    await Promise.all(Array.from(selected).map(id =>
      fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    ));
    setProducts(ps => ps.filter(p => !selected.has(p.id)));
    setSelected(new Set());
    setDeleting(false);
    showToast(`🗑️ ${selected.size} produit(s) supprimé(s)`);
  }

  async function rehostImages() {
    if (!window.confirm('Rapatrier toutes les images externes dans le Storage ?\n\nLes images encore vivantes seront copiées chez nous (liens permanents). Les images déjà mortes (404) resteront à re-scraper.')) return;
    setRehosting(true);
    try {
      const token = localStorage.getItem('sd_admin_token');
      const res = await fetch('/api/admin/rehost-images', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      const failed = (data.failed || []).length;
      showToast(`🖼️ ${data.rehosted}/${data.total_external} rapatriées${failed ? ` · ${failed} morte(s) à re-scraper` : ''}`);
      await load();
    } catch (e: any) {
      showToast(`⚠️ ${e.message}`);
    } finally {
      setRehosting(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name_fr?.toLowerCase().includes(search.toLowerCase()) || p.name_sv?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || p.category_id === filterCat;
    const matchStatus = !filterStatus
      || (filterStatus === 'active'   && p.is_active)
      || (filterStatus === 'inactive' && !p.is_active)
      || (filterStatus === 'low'      && p.track_stock && p.stock <= (p.stock_alert ?? 3) && p.stock > 0)
      || (filterStatus === 'out'      && p.track_stock && p.stock === 0);
    return matchSearch && matchCat && matchStatus;
  });

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Produits <span style={{ fontWeight: 400, color: 'var(--dust)', fontSize: 14 }}>({filtered.length})</span></div>
        <div className="topbar-actions">
          {selected.size > 0 && (
            <button className="btn btn-sm" onClick={deleteSelected} disabled={deleting}
              style={{ background: '#C62828', color: '#fff', border: 'none' }}>
              {deleting ? '⏳' : '🗑️'} Supprimer ({selected.size})
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={rehostImages} disabled={rehosting}
            title="Copie les images externes (olw.se, etc.) dans notre Storage pour éviter les liens morts">
            {rehosting ? '⏳ Rapatriement…' : '🖼️ Rapatrier images'}
          </button>
          <Link href="/admin/produits/nouveau" className="btn btn-primary btn-sm">+ Nouveau produit</Link>
        </div>
      </div>

      <div className="page-content">
        {/* Filtres */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-bar">
            <span className="search-bar-icon">🔍</span>
            <input
              type="text" placeholder="Rechercher un produit…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="form-control" style={{ width: 'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name_fr}</option>)}
          </select>
          <select className="form-control" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            <option value="active">Actifs</option>
            <option value="inactive">Masqués</option>
            <option value="low">⚠️ Stock faible</option>
            <option value="out">🔴 Rupture</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterStatus(''); }}>↺ Réinitialiser</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--dust)' }}>Chargement…</div>
        ) : (
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={toggleSelectAll}
                        title="Tout sélectionner"
                      />
                    </th>
                    <th>Image</th>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th>Prix</th>
                    <th>Stock</th>
                    <th>Note</th>
                    <th>Flags</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{ background: selected.has(p.id) ? 'rgba(123,79,123,0.06)' : undefined }}>
                      <td>
                        <input type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </td>
                      <td>
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name_fr} className="td-img" style={{ objectFit: 'contain', background: 'var(--cream)', padding: 4 }} />
                          : <div className="td-img" style={{ display:'flex',alignItems:'center',justifyContent:'center',background:'var(--cream)',fontSize:22,borderRadius:4 }}>📦</div>
                        }
                      </td>
                      <td>
                        <div className="td-name">{p.name_fr}</div>
                        <div className="td-sub">{p.subtitle_fr || p.weight}</div>
                      </td>
                      <td><span style={{ fontSize: 12, color: 'var(--dust)' }}>{p.categories?.emoji} {p.categories?.name_fr || '—'}</span></td>
                      <td><span className="td-price">€{parseFloat(p.price).toFixed(2)}</span></td>
                      <td>
                        {!p.track_stock ? (
                          <span style={{ color: 'var(--dust)', fontSize: 11 }}>—</span>
                        ) : p.stock === 0 ? (
                          <span style={{ background: '#FEE2E2', color: '#EF4444', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>🔴 Rupture</span>
                        ) : p.stock <= (p.stock_alert ?? 3) ? (
                          <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>⚠️ {p.stock}</span>
                        ) : (
                          <span style={{ background: '#D1FAE5', color: '#10B981', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>✅ {p.stock}</span>
                        )}
                      </td>
                      <td>
                        <span style={{ color: '#D97706', fontSize: 12 }}>★ {p.rating}</span>
                        <span style={{ color: 'var(--dust)', fontSize: 11 }}> ({p.reviews_count})</span>
                      </td>
                      <td style={{ display: 'flex', gap: 3, flexWrap: 'wrap', padding: '12px 16px' }}>
                        {p.is_bestseller && <span className="badge badge-bestseller">⭐</span>}
                        {p.is_new && <span className="badge badge-new">New</span>}
                        {p.badge && <span className={`badge badge-${p.badge.replace('badge-','')}`}>{p.badge.replace('badge-','')}</span>}
                      </td>
                      <td>
                        <label className="toggle" title={p.is_active ? 'Masquer' : 'Activer'}>
                          <input type="checkbox" checked={p.is_active} onChange={() => toggleActive(p.id, p.is_active)} />
                          <span className="toggle-track"></span>
                        </label>
                      </td>
                      <td>
                        <div className="td-actions">
                          <Link href={`/admin/produits/${p.id}`} className="btn btn-secondary btn-sm btn-icon" title="Éditer">✏️</Link>
                          <button
                            className="btn btn-ghost btn-sm btn-icon" title="Dupliquer"
                            onClick={() => alert('Fonctionnalité à implémenter')}
                          >📋</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--dust)' }}>
                  Aucun produit ne correspond aux filtres.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="toast-container">
          <div className="toast success">{toast}</div>
        </div>
      )}
    </>
  );
}
