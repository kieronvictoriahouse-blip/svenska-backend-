'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProductForm from '@/components/ProductForm';

type NavProduct = { id: string; name_fr: string };

export default function EditProduitPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [product, setProduct]     = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [toast, setToast]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [allProducts, setAllProducts] = useState<NavProduct[]>([]);

  const token = typeof window !== 'undefined' ? localStorage.getItem('sd_admin_token') || '' : '';

  useEffect(() => {
    if (!id) return;
    const t = localStorage.getItem('sd_admin_token') || '';
    Promise.all([
      fetch(`/api/products/${id}`).then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/products?limit=500', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
    ]).then(([pData, cData, allData]) => {
      const p = pData.product;
      if (p) {
        setProduct({
          ...p,
          tags: (p.tags || []).join(', '),
          rating: String(p.rating),
          reviews_count: String(p.reviews_count),
          badge: p.badge || '',
          variants: p.product_variants?.length
            ? p.product_variants.map((v: any) => ({ label: v.label, price: String(v.price) }))
            : [{ label: '', price: '' }],
        });
      }
      setCategories(cData.categories || []);
      setAllProducts((allData.products || []).map((x: any) => ({ id: x.id, name_fr: x.name_fr })));
    }).finally(() => setLoading(false));
  }, [id]);

  const currentIndex = allProducts.findIndex(p => p.id === id);
  const prevProduct  = currentIndex > 0 ? allProducts[currentIndex - 1] : null;
  const nextProduct  = currentIndex >= 0 && currentIndex < allProducts.length - 1 ? allProducts[currentIndex + 1] : null;

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleSave(data: any) {
    setSaving(true);
    try {
      const t = localStorage.getItem('sd_admin_token') || '';
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { showToast('❌ Erreur : ' + (json.error || 'inconnue')); return; }
    } catch { showToast('❌ Erreur réseau'); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Désactiver "${product?.name_fr}" ? Réversible depuis le dashboard.`)) return;
    setDeleting(true);
    const t = localStorage.getItem('sd_admin_token') || '';
    await fetch(`/api/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    showToast('🙈 Produit désactivé');
    setTimeout(() => router.push('/admin/produits'), 1200);
    setDeleting(false);
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', color: 'var(--dust)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div><p>Chargement…</p>
      </div>
    </div>
  );
  if (!product) return (
    <div className="page-content">
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--danger)', marginBottom: 16 }}>Produit introuvable.</p>
        <a href="/admin/produits" className="btn btn-secondary">← Retour</a>
      </div>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <a href="/admin/produits" style={{ color: 'var(--dust)', marginRight: 8, textDecoration: 'none' }}>Produits</a>
          <span style={{ color: 'var(--dust)' }}>/</span>
          <span style={{ marginLeft: 8 }}>{product.name_fr}</span>
        </div>
        <div className="topbar-actions">
          {/* ── Navigation prev / next ── */}
          <button
            className="btn btn-secondary btn-sm"
            disabled={!prevProduct}
            onClick={() => prevProduct && router.push(`/admin/produits/${prevProduct.id}`)}
            title={prevProduct ? `← ${prevProduct.name_fr}` : 'Premier produit'}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            ← {prevProduct
              ? <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prevProduct.name_fr}</span>
              : <span style={{ color: 'var(--dust)' }}>début</span>}
          </button>
          <span style={{ color: 'var(--dust)', fontSize: 12, padding: '0 2px' }}>
            {currentIndex >= 0 ? `${currentIndex + 1} / ${allProducts.length}` : ''}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!nextProduct}
            onClick={() => nextProduct && router.push(`/admin/produits/${nextProduct.id}`)}
            title={nextProduct ? `${nextProduct.name_fr} →` : 'Dernier produit'}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {nextProduct
              ? <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextProduct.name_fr}</span>
              : <span style={{ color: 'var(--dust)' }}>fin</span>}
            →
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? '⏳…' : '🗑 Désactiver'}
          </button>
          <a href="/admin/produits" className="btn btn-secondary btn-sm">← Liste</a>
        </div>
      </div>

      <div className="page-content">
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Éditer — {product.name_fr}</h1>
          <p className="page-subtitle">ID : {id} · Créé le {new Date(product.created_at).toLocaleDateString('fr-FR')}</p>
        </div>
        <ProductForm
          initialData={product}
          categories={categories}
          onSave={handleSave}
          saving={saving}
          toast={toast}
          autoSave
        />
      </div>
    </>
  );
}
