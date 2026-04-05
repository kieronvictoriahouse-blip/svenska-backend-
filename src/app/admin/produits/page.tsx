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

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      fetch('/api/products?limit=200'),
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name_fr?.toLowerCase().includes(search.toLowerCase()) || p.name_sv?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || p.category_id === filterCat;
    const matchStatus = !filterStatus || (filterStatus === 'active' ? p.is_active : !p.is_active);
    return matchSearch && matchCat && matchStatus;
  });

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Produits <span style={{ fontWeight: 400, color: 'var(--dust)', fontSize: 14 }}>({filtered.length})</span></div>
        <div className="topbar-actions">
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
                    <th>Image</th>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th>Prix</th>
                    <th>Note</th>
                    <th>Flags</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td>
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name_fr} className="td-img" />
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
