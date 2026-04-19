'use client';
import { useState } from 'react';

type Product = {
  name_sv: string; name_fr: string; name_en: string;
  subtitle_fr: string; desc_fr: string; desc_en: string;
  ingredients_fr: string; weight: number; price: number;
  category: string; labels: string[]; origin_fr: string; origin_en: string;
  emoji: string; is_bestseller: boolean; is_new: boolean;
  image_urls: string[]; source_url: string;
};

type Category = { id: string; name_fr: string; slug: string };

export default function ImportPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [selectedImg, setSelectedImg] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function analyse() {
    if (!url.trim()) return;
    setLoading(true); setError(''); setProduct(null);
    try {
      const token = localStorage.getItem('sd_admin_token');
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setProduct(data.product);
      setCategories(data.categories || []);
      setSelectedImg(data.product.image_urls?.[0] || '');
      const match = data.categories?.find((c: Category) =>
        c.name_fr.toLowerCase().includes(data.product.category?.toLowerCase())
      );
      setCategoryId(match?.id || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addToShop() {
    if (!product) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('sd_admin_token');
      const body = {
        category_id:    categoryId || null,
        name_sv:        product.name_sv,
        name_fr:        product.name_fr,
        name_en:        product.name_en,
        subtitle_fr:    product.subtitle_fr,
        subtitle_en:    '',
        desc_fr:        product.desc_fr,
        desc_en:        product.desc_en,
        ingredients_fr: product.ingredients_fr,
        ingredients_en: '',
        price:          product.price,
        weight:         product.weight || null,
        origin_fr:      product.origin_fr,
        origin_en:      product.origin_en,
        image_url:      selectedImg || null,
        is_bestseller:  product.is_bestseller,
        is_new:         product.is_new,
        is_active:      true,
        tags:           product.labels || [],
        rating:         4.5,
        reviews_count:  0,
      };
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      showToast(`✅ "${product.name_fr}" ajouté au catalogue !`);
      setProduct(null); setUrl('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1C2028', color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="topbar">
        <div>
          <div className="page-title">📥 Import automatique</div>
          <div className="page-subtitle">Collez l'URL d'un produit — Claude extrait, traduit et crée la fiche.</div>
        </div>
      </div>

      {/* URL Input */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">🔗 URL du produit à importer</span>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', gap: 12 }}>
          <input
            className="form-control"
            style={{ flex: 1 }}
            placeholder="https://www.estrella.se/produkter/hot-holiday-dippmix/"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyse()}
          />
          <button
            className="btn btn-primary"
            onClick={analyse}
            disabled={loading || !url.trim()}
            style={{ whiteSpace: 'nowrap', minWidth: 140 }}
          >
            {loading ? '⏳ Analyse...' : '🔍 Analyser'}
          </button>
        </div>
        {error && (
          <div style={{ padding: '0 24px 20px', color: '#C62828', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}
        <div style={{ padding: '0 24px 20px' }}>
          <p style={{ fontSize: 12, color: '#8B7E72' }}>
            Fonctionne avec : Estrella, ICA, Waitrose, M&S, Axfood, Ankorstore, et la plupart des sites e-commerce.
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#8B7E72' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <p style={{ fontSize: 15 }}>Claude analyse la page et traduit le contenu...</p>
        </div>
      )}

      {/* Product Preview */}
      {product && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Left — fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="card">
              <div className="card-header"><span className="card-title">📝 Informations produit</span></div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 10, alignItems: 'center' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Emoji</label>
                    <input className="form-control" style={{ textAlign: 'center', fontSize: 24, padding: '6px' }}
                      value={product.emoji} onChange={e => setProduct({ ...product, emoji: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Nom français</label>
                    <input className="form-control"
                      value={product.name_fr} onChange={e => setProduct({ ...product, name_fr: e.target.value })} />
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nom original (SV/EN)</label>
                  <input className="form-control"
                    value={product.name_sv} onChange={e => setProduct({ ...product, name_sv: e.target.value })} />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Accroche</label>
                  <input className="form-control"
                    value={product.subtitle_fr} onChange={e => setProduct({ ...product, subtitle_fr: e.target.value })} />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Description FR</label>
                  <textarea className="form-control" rows={4}
                    value={product.desc_fr} onChange={e => setProduct({ ...product, desc_fr: e.target.value })} />
                </div>

                <div className="form-two">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Prix (€)</label>
                    <input className="form-control" type="number" step="0.01"
                      value={product.price} onChange={e => setProduct({ ...product, price: parseFloat(e.target.value) })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Poids (g)</label>
                    <input className="form-control" type="number"
                      value={product.weight} onChange={e => setProduct({ ...product, weight: parseInt(e.target.value) })} />
                  </div>
                </div>

                <div className="form-two">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Catégorie</label>
                    <select className="form-control" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                      <option value="">— Choisir —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Origine</label>
                    <input className="form-control"
                      value={product.origin_fr} onChange={e => setProduct({ ...product, origin_fr: e.target.value })} />
                  </div>
                </div>

                {product.ingredients_fr && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Ingrédients</label>
                    <textarea className="form-control" rows={3}
                      value={product.ingredients_fr} onChange={e => setProduct({ ...product, ingredients_fr: e.target.value })} />
                  </div>
                )}

                {product.labels?.length > 0 && (
                  <div>
                    <label className="form-label">Labels détectés</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {product.labels.map(l => (
                        <span key={l} style={{ background: '#E8F5E9', color: '#2E7D32', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                          ✓ {l}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={product.is_new}
                      onChange={e => setProduct({ ...product, is_new: e.target.checked })} />
                    Nouveauté
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={product.is_bestseller}
                      onChange={e => setProduct({ ...product, is_bestseller: e.target.checked })} />
                    Best-seller
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Right — image selector + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="card">
              <div className="card-header"><span className="card-title">🖼️ Image principale</span></div>
              <div style={{ padding: '16px 20px' }}>
                {selectedImg ? (
                  <div style={{ marginBottom: 16, background: '#F8F5F0', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                    <img src={selectedImg} alt="" style={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }} />
                  </div>
                ) : (
                  <div style={{ background: '#F8F5F0', borderRadius: 8, padding: 40, textAlign: 'center', marginBottom: 16, color: '#A09688', fontSize: 13 }}>
                    Aucune image sélectionnée
                  </div>
                )}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">URL image (coller ou choisir)</label>
                  <input className="form-control" placeholder="https://..."
                    value={selectedImg} onChange={e => setSelectedImg(e.target.value)} />
                </div>
                {product.image_urls?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 11, color: '#8B7E72', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Images trouvées sur la page
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {product.image_urls.slice(0, 6).map((u, i) => (
                        <div key={i}
                          onClick={() => setSelectedImg(u)}
                          style={{
                            width: 72, height: 72, border: `2px solid ${selectedImg === u ? '#7B4F7B' : '#E8E4DE'}`,
                            borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#F8F5F0',
                            transition: 'border-color 0.15s',
                          }}>
                          <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">🔗 Source</span></div>
              <div style={{ padding: '12px 20px' }}>
                <a href={product.source_url} target="_blank" rel="noopener"
                  style={{ fontSize: 12, color: '#7B4F7B', wordBreak: 'break-all' }}>
                  {product.source_url}
                </a>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={addToShop}
              disabled={saving}
              style={{ padding: '16px 24px', fontSize: 14, letterSpacing: 1.5, justifyContent: 'center' }}
            >
              {saving ? '⏳ Ajout en cours...' : '✅ Ajouter au catalogue'}
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => { setProduct(null); setUrl(''); }}
              style={{ justifyContent: 'center', fontSize: 13 }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
