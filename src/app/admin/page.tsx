'use client';
import { useEffect, useState } from 'react';

type Stats = {
  total_products: number;
  active_products: number;
  categories: number;
  bestsellers: number;
  new_products: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sd_admin_token');
    Promise.all([
      fetch('/api/products?limit=100').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ]).then(([products, cats]) => {
      const ps = products.products || [];
      setStats({
        total_products: ps.length,
        active_products: ps.filter((p: any) => p.is_active).length,
        categories: (cats.categories || []).length,
        bestsellers: ps.filter((p: any) => p.is_bestseller).length,
        new_products: ps.filter((p: any) => p.is_new).length,
      });
      setRecentProducts(ps.slice(0, 8));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', color: 'var(--dust)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🇸🇪</div>
        <p>Chargement du tableau de bord…</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Tableau de bord</div>
        <div className="topbar-actions">
          <a href="/admin/produits/nouveau" className="btn btn-primary btn-sm">+ Nouveau produit</a>
        </div>
      </div>

      <div className="page-content">
        {/* Welcome */}
        <div style={{ marginBottom: 28 }}>
          <h1 className="page-title">Bonjour 🇸🇪</h1>
          <p className="page-subtitle">Voici l'état de votre boutique Svenska Delikatessen</p>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon">📦</span>
            <div>
              <div className="stat-num">{stats?.total_products}</div>
              <div className="stat-label">Produits total</div>
            </div>
            <span className="stat-trend up">✓ actifs : {stats?.active_products}</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🗂️</span>
            <div>
              <div className="stat-num">{stats?.categories}</div>
              <div className="stat-label">Catégories</div>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">⭐</span>
            <div>
              <div className="stat-num">{stats?.bestsellers}</div>
              <div className="stat-label">Best-sellers</div>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🆕</span>
            <div>
              <div className="stat-num">{stats?.new_products}</div>
              <div className="stat-label">Nouveautés</div>
            </div>
          </div>
        </div>

        {/* Raccourcis */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { href: '/admin/produits/nouveau', icon: '➕', label: 'Ajouter un produit' },
            { href: '/admin/medias',           icon: '📸', label: 'Uploader des images' },
            { href: '/admin/homepage',         icon: '🖼️', label: 'Éditer la home' },
            { href: '/admin/categories',       icon: '🗂️', label: 'Gérer les catégories' },
          ].map(s => (
            <a key={s.href} href={s.href} style={{
              background: 'white', border: '1px solid var(--linen)',
              borderRadius: 'var(--radius)', padding: '20px 18px',
              textDecoration: 'none', textAlign: 'center',
              transition: 'all 0.18s', display: 'block',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#587050')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--linen)')}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--midnight)' }}>{s.label}</div>
            </a>
          ))}
        </div>

        {/* Produits récents */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Derniers produits</span>
            <a href="/admin/produits" className="btn btn-ghost btn-sm">Voir tous →</a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Nom (FR)</th>
                  <th>Catégorie</th>
                  <th>Prix</th>
                  <th>Statut</th>
                  <th>Flags</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentProducts.map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name_fr} className="td-img" />
                        : <div className="td-img" style={{ display:'flex',alignItems:'center',justifyContent:'center',fontSize:24 }}>📦</div>
                      }
                    </td>
                    <td>
                      <div className="td-name">{p.name_fr}</div>
                      <div className="td-sub">{p.subtitle_fr}</div>
                    </td>
                    <td><span style={{ fontSize: 12, color: 'var(--dust)' }}>{p.categories?.name_fr || '—'}</span></td>
                    <td><span className="td-price">€{parseFloat(p.price).toFixed(2)}</span></td>
                    <td>
                      <span className={`badge ${p.is_active ? 'badge-active' : 'badge-inactive'}`}>
                        {p.is_active ? 'Actif' : 'Masqué'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.is_bestseller && <span className="badge badge-bestseller">⭐ BS</span>}
                      {p.is_new && <span className="badge badge-new">Nouveau</span>}
                      {p.badge && <span className={`badge badge-${p.badge.replace('badge-','')}`}>{p.badge.replace('badge-','')}</span>}
                    </td>
                    <td>
                      <div className="td-actions">
                        <a href={`/admin/produits/${p.id}`} className="btn btn-ghost btn-sm btn-icon" title="Éditer">✏️</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
