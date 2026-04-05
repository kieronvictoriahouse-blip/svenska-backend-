'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProductForm from '@/components/ProductForm';

export default function NouveauProduitPage() {
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState('');

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []));
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleSave(data: any) {
    setSaving(true);
    try {
      const token = localStorage.getItem('sd_admin_token');
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { showToast('❌ Erreur : ' + (json.error || 'inconnue')); return; }
      showToast('✅ Produit créé avec succès !');
      setTimeout(() => router.push('/admin/produits'), 1200);
    } catch {
      showToast('❌ Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <a href="/admin/produits" style={{ color: 'var(--dust)', marginRight: 8, textDecoration: 'none' }}>Produits</a>
          <span style={{ color: 'var(--dust)' }}>/</span>
          <span style={{ marginLeft: 8 }}>Nouveau produit</span>
        </div>
        <div className="topbar-actions">
          <a href="/admin/produits" className="btn btn-secondary btn-sm">← Annuler</a>
        </div>
      </div>

      <div className="page-content">
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Nouveau produit</h1>
          <p className="page-subtitle">Remplissez les informations dans les 3 langues (FR / SV / EN)</p>
        </div>
        <ProductForm
          categories={categories}
          onSave={handleSave}
          saving={saving}
          toast={toast}
        />
      </div>
    </>
  );
}
