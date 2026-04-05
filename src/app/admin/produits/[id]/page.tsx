'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProductForm from '@/components/ProductForm';

export default function EditProduitPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [product, setProduct]       = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [toast, setToast]           = useState('');
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/products/${id}`).then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ]).then(([pData, cData]) => {
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
    }).finally(() => setLoading(false));
  }, [id]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleSave(data: any) {
    setSaving(true);
    try {
      const token = localStorage.getItem('sd_admin_token');
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { showToast('❌ Erreur : ' + (json.error || 'inconnue')); return; }
      showToast('✅ Produit mis à jour !');
    } catch { showToast('❌ Erreur réseau'); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Désactiver "${product?.name_fr}" ? Réversible depuis le dashboard.`)) return;
    setDeleting(true);
    const token = localStorage.getItem('sd_admin_token');
    await fetch(`/api/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    showToast('🙈 Produit désactivé');
    setTimeout(() => router.push('/admin/produits'), 1200);
    setDeleting(false);
  }

  if (loading) return <div className="page-content" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}><div style={{textAlign:'center',color:'var(--dust)'}}><div style={{fontSize:36,marginBottom:12}}>⏳</div><p>Chargement…</p></div></div>;
  if (!product) return <div className="page-content"><div style={{textAlign:'center',padding:60}}><p style={{color:'var(--danger)',marginBottom:16}}>Produit introuvable.</p><a href="/admin/produits" className="btn btn-secondary">← Retour</a></div></div>;

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <a href="/admin/produits" style={{color:'var(--dust)',marginRight:8,textDecoration:'none'}}>Produits</a>
          <span style={{color:'var(--dust)'}}>/</span>
          <span style={{marginLeft:8}}>{product.name_fr}</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>{deleting ? '⏳…' : '🗑 Désactiver'}</button>
          <a href="/admin/produits" className="btn btn-secondary btn-sm">← Retour</a>
        </div>
      </div>
      <div className="page-content">
        <div style={{marginBottom:24}}>
          <h1 className="page-title">Éditer — {product.name_fr}</h1>
          <p className="page-subtitle">ID : {id} · Créé le {new Date(product.created_at).toLocaleDateString('fr-FR')}</p>
        </div>
        <ProductForm initialData={product} categories={categories} onSave={handleSave} saving={saving} toast={toast} />
      </div>
    </>
  );
}
