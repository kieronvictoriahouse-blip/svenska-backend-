'use client';
import { useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Category = { id: string; name_fr: string; slug: string };

const LANG_FLAGS: Record<string, string> = { sv: '🇸🇪', fr: '🇫🇷', en: '🇬🇧' };

export default function ImportPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [selectedImg, setSelectedImg] = useState('');
  const [extraImgs, setExtraImgs] = useState<Set<string>>(new Set());
  const [lang, setLang] = useState<'fr' | 'sv' | 'en'>('fr');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }
  function get(key: string): string { return product?.[`${key}_${lang}`] || ''; }
  function set(key: string, val: string) { setProduct((p: any) => ({ ...p, [`${key}_${lang}`]: val })); }

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
      setExtraImgs(new Set());
      const match = data.categories?.find((c: Category) =>
        c.name_fr.toLowerCase().includes((data.product.category || '').toLowerCase())
      );
      setCategoryId(match?.id || '');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function addToShop() {
    if (!product) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('sd_admin_token');
      const body = {
        category_id: categoryId || null,
        name_sv: product.name_sv || '', name_fr: product.name_fr || '', name_en: product.name_en || '',
        subtitle_sv: product.subtitle_sv || '', subtitle_fr: product.subtitle_fr || '', subtitle_en: product.subtitle_en || '',
        desc_sv: product.desc_sv || '', desc_fr: product.desc_fr || '', desc_en: product.desc_en || '',
        ingredients_sv: product.ingredients_sv || '', ingredients_fr: product.ingredients_fr || '', ingredients_en: product.ingredients_en || '',
        allergens_sv: product.allergens_sv || '', allergens_fr: product.allergens_fr || '', allergens_en: product.allergens_en || '',
        storage_sv: product.storage_sv || '', storage_fr: product.storage_fr || '', storage_en: product.storage_en || '',
        usage_sv: product.usage_sv || '', usage_fr: product.usage_fr || '', usage_en: product.usage_en || '',
        nutrition: product.nutrition || {},
        price: product.price || 0,
        weight: product.weight || null,
        origin_sv: product.origin_sv || '', origin_fr: product.origin_fr || '', origin_en: product.origin_en || '',
        image_url: selectedImg || null,
        extra_images: Array.from(extraImgs).filter(u => u !== selectedImg),
        is_bestseller: product.is_bestseller || false,
        is_new: product.is_new !== false,
        is_active: true,
        tags: product.labels || [],
        rating: 4.5,
        reviews_count: 0,
      };
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      showToast(`✅ "${product.name_fr}" ajouté au catalogue !`);
      setProduct(null); setUrl('');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  const p = product;
  const nutri = p?.nutrition || {};

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1C2028', color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          {toast}
        </div>
      )}

      <div className="topbar">
        <div>
          <div className="page-title">📥 Import automatique</div>
          <div className="page-subtitle">URL → Claude extrait tout → tu valides → produit live.</div>
        </div>
      </div>

      {/* URL input */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><span className="card-title">🔗 URL du produit</span></div>
        <div style={{ padding: '20px 24px', display: 'flex', gap: 12 }}>
          <input className="form-control" style={{ flex: 1 }}
            placeholder="https://www.estrella.se/produkter/hot-holiday-dippmix/"
            value={url} onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyse()} />
          <button className="btn btn-primary" onClick={analyse} disabled={loading || !url.trim()} style={{ whiteSpace: 'nowrap', minWidth: 180 }}>
            {loading ? '⏳ Analyse...' : '🤖 Analyser avec Claude'}
          </button>
        </div>
        {error && <div style={{ padding: '0 24px 16px', color: '#C62828', fontSize: 13 }}>⚠️ {error}</div>}
        <div style={{ padding: '0 24px 16px', fontSize: 12, color: '#8B7E72' }}>
          Compatible : Estrella, ICA, Waitrose, M&amp;S, Ankorstore, et tout site e-commerce standard.
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 80, color: '#8B7E72' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🤖</div>
          <p style={{ fontSize: 15, marginBottom: 6 }}>Claude analyse la page...</p>
          <p style={{ fontSize: 13 }}>Extraction, traduction FR/EN/SV, détection allergènes &amp; nutrition</p>
        </div>
      )}

      {p && !loading && (
        <>
          {/* Lang tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, alignItems: 'center' }}>
            {(['fr', 'sv', 'en'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                style={{ padding: '8px 22px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  background: lang === l ? '#7B4F7B' : '#fff',
                  color: lang === l ? '#fff' : '#5A5248',
                  borderColor: lang === l ? '#7B4F7B' : '#E8E4DE' }}>
                {LANG_FLAGS[l]} {l.toUpperCase()}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8B7E72' }}>Édite dans les 3 langues</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 370px', gap: 20, alignItems: 'start' }}>

            {/* LEFT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Identité */}
              <div className="card">
                <div className="card-header"><span className="card-title">📝 Identité produit</span></div>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr', gap: 10, alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Emoji</label>
                      <input className="form-control" style={{ textAlign: 'center', fontSize: 22, padding: '6px 4px' }}
                        value={p.emoji || ''} onChange={e => setProduct({ ...p, emoji: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{LANG_FLAGS[lang]} Nom</label>
                      <input className="form-control" value={get('name')} onChange={e => set('name', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Marque</label>
                      <input className="form-control" value={p.brand || ''} onChange={e => setProduct({ ...p, brand: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{LANG_FLAGS[lang]} Accroche</label>
                    <input className="form-control" value={get('subtitle')} onChange={e => set('subtitle', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{LANG_FLAGS[lang]} Description</label>
                    <textarea className="form-control" rows={4} value={get('desc')} onChange={e => set('desc', e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Prix (€)</label>
                      <input className="form-control" type="number" step="0.01" value={p.price || 0}
                        onChange={e => setProduct({ ...p, price: parseFloat(e.target.value) })} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Poids / Format</label>
                      <input className="form-control" placeholder="24g, 250ml..." value={p.weight || ''}
                        onChange={e => setProduct({ ...p, weight: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{LANG_FLAGS[lang]} Origine</label>
                      <input className="form-control" value={get('origin')} onChange={e => set('origin', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Catégorie</label>
                    <select className="form-control" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                      <option value="">— Choisir —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Ingrédients & Allergènes */}
              <div className="card">
                <div className="card-header"><span className="card-title">🧪 Ingrédients &amp; Allergènes</span></div>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{LANG_FLAGS[lang]} Ingrédients</label>
                    <textarea className="form-control" rows={4} value={get('ingredients')} onChange={e => set('ingredients', e.target.value)}
                      placeholder="Salt, maltodextrin, onion powder..." />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{LANG_FLAGS[lang]} Allergènes</label>
                    <input className="form-control" value={get('allergens')} onChange={e => set('allergens', e.target.value)}
                      placeholder="Contient : gluten, lait..." />
                  </div>
                  {p.labels?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {p.labels.map((l: string) => (
                        <span key={l} style={{ background: '#E8F5E9', color: '#2E7D32', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                          ✓ {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Conservation & Usage */}
              <div className="card">
                <div className="card-header"><span className="card-title">📦 Conservation &amp; Utilisation</span></div>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{LANG_FLAGS[lang]} Conservation</label>
                    <input className="form-control" value={get('storage')} onChange={e => set('storage', e.target.value)}
                      placeholder="Conserver à l'abri de la chaleur..." />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{LANG_FLAGS[lang]} Suggestions d&apos;utilisation</label>
                    <textarea className="form-control" rows={3} value={get('usage')} onChange={e => set('usage', e.target.value)}
                      placeholder="Parfait avec des chips, en trempette..." />
                  </div>
                </div>
              </div>

              {/* Nutrition */}
              {Object.values(nutri).some((v: any) => v) && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">📊 Valeurs nutritionnelles</span>
                    {nutri.portion && <span style={{ fontSize: 12, color: '#8B7E72' }}>pour {nutri.portion}</span>}
                  </div>
                  <div style={{ padding: '0 20px 16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <tbody>
                        {[
                          ['Énergie', nutri.energie], ['Graisses', nutri.graisses],
                          ['dont Saturées', nutri.dont_satures], ['Glucides', nutri.glucides],
                          ['dont Sucres', nutri.dont_sucres], ['Fibres', nutri.fibres],
                          ['Protéines', nutri.proteines], ['Sel', nutri.sel],
                        ].filter(([, v]) => v).map(([label, val]) => (
                          <tr key={label as string} style={{ borderBottom: '1px solid #F0EDE8' }}>
                            <td style={{ padding: '8px 12px', color: '#5A5248' }}>{label}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Flags */}
              <div className="card">
                <div style={{ padding: '16px 20px', display: 'flex', gap: 32 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!p.is_new} onChange={e => setProduct({ ...p, is_new: e.target.checked })} />
                    Nouveauté
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!p.is_bestseller} onChange={e => setProduct({ ...p, is_bestseller: e.target.checked })} />
                    Best-seller
                  </label>
                </div>
              </div>
            </div>

            {/* RIGHT — image + actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <div className="card-header"><span className="card-title">🖼️ Images</span></div>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Image principale */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#5A5248', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Image principale</p>
                    <div style={{ marginBottom: 10, background: '#F8F5F0', borderRadius: 8, padding: 12, textAlign: 'center', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedImg
                        ? <img src={selectedImg} alt="" style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }} />
                        : <span style={{ color: '#A09688', fontSize: 13 }}>Aucune image sélectionnée</span>}
                    </div>
                    <input className="form-control" placeholder="https://..." value={selectedImg} onChange={e => setSelectedImg(e.target.value)} style={{ fontSize: 12 }} />
                  </div>

                  {/* Sélecteur depuis images trouvées */}
                  {p.image_urls?.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#5A5248', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                        Images trouvées — cliquer pour définir comme principale
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.image_urls.slice(0, 10).map((u: string, i: number) => (
                          <div key={i}
                            style={{ position: 'relative', width: 64, height: 64, border: `2px solid ${selectedImg === u ? '#7B4F7B' : '#E8E4DE'}`, borderRadius: 6, overflow: 'visible', background: '#F8F5F0', flexShrink: 0 }}>
                            <img src={u} alt="" onClick={() => setSelectedImg(u)}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer', borderRadius: 4 }}
                              onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                            {selectedImg !== u && (
                              <div style={{ position: 'absolute', top: -6, right: -6 }}>
                                <input type="checkbox"
                                  checked={extraImgs.has(u)}
                                  onChange={() => {
                                    setExtraImgs(prev => {
                                      const next = new Set(prev);
                                      if (next.has(u)) next.delete(u); else next.add(u);
                                      return next;
                                    });
                                  }}
                                  title="Ajouter à la galerie"
                                  style={{ width: 16, height: 16, accentColor: '#7B4F7B', cursor: 'pointer' }}
                                />
                              </div>
                            )}
                            {selectedImg === u && (
                              <div style={{ position: 'absolute', top: -6, right: -6, background: '#7B4F7B', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff' }}>★</div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: 11, color: '#A09688', marginTop: 6 }}>
                        ★ = principale · ☑ = galerie ({extraImgs.size} sélectionnée{extraImgs.size > 1 ? 's' : ''})
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div style={{ padding: '12px 20px' }}>
                  <a href={p.source_url} target="_blank" rel="noopener" style={{ fontSize: 11, color: '#7B4F7B', wordBreak: 'break-all' }}>
                    🔗 {p.source_url}
                  </a>
                </div>
              </div>

              <button className="btn btn-primary" onClick={addToShop} disabled={saving}
                style={{ padding: '16px 24px', fontSize: 14, letterSpacing: 1.5, justifyContent: 'center' }}>
                {saving ? '⏳ Ajout...' : '✅ Ajouter au catalogue'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setProduct(null); setUrl(''); }}
                style={{ justifyContent: 'center', fontSize: 13 }}>
                Annuler
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
