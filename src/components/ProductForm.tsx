'use client';
import { useState, useRef } from 'react';

type Variant = { label: string; price: string };

type Nutrition = {
  energie: string; graisses: string; dont_satures: string;
  glucides: string; dont_sucres: string; fibres: string;
  proteines: string; sel: string; portion: string;
};

type ProductFormData = {
  category_id: string;
  name_sv: string; name_fr: string; name_en: string;
  subtitle_sv: string; subtitle_fr: string; subtitle_en: string;
  desc_sv: string; desc_fr: string; desc_en: string;
  price: string;
  weight: string;
  origin_sv: string; origin_fr: string; origin_en: string;
  image_url: string;
  badge: string;
  is_bestseller: boolean;
  is_new: boolean;
  is_active: boolean;
  rating: string;
  reviews_count: string;
  tags: string;
  usage_sv: string; usage_fr: string; usage_en: string;
  ingredients_sv: string; ingredients_fr: string; ingredients_en: string;
  allergens_sv: string; allergens_fr: string; allergens_en: string;
  storage_sv: string; storage_fr: string; storage_en: string;
  nutrition: Nutrition;
  extra_images: string[];
  variants: Variant[];
};

const EMPTY: ProductFormData = {
  category_id: '', name_sv: '', name_fr: '', name_en: '',
  subtitle_sv: '', subtitle_fr: '', subtitle_en: '',
  desc_sv: '', desc_fr: '', desc_en: '',
  price: '', weight: '',
  origin_sv: 'Suède', origin_fr: 'Suède', origin_en: 'Sweden',
  image_url: '',
  badge: '', is_bestseller: false, is_new: false, is_active: true,
  rating: '4.5', reviews_count: '0', tags: '',
  usage_sv: '', usage_fr: '', usage_en: '',
  ingredients_sv: '', ingredients_fr: '', ingredients_en: '',
  allergens_sv: '', allergens_fr: '', allergens_en: '',
  storage_sv: '', storage_fr: '', storage_en: '',
  nutrition: { energie: '', graisses: '', dont_satures: '', glucides: '', dont_sucres: '', fibres: '', proteines: '', sel: '', portion: '' },
  extra_images: [],
  variants: [{ label: '', price: '' }],
};

type Props = {
  initialData?: Partial<ProductFormData & { id: string }>;
  categories: any[];
  onSave: (data: any) => Promise<void>;
  saving: boolean;
  toast: string;
};

export default function ProductForm({ initialData, categories, onSave, saving, toast }: Props) {
  const [form, setForm]       = useState<ProductFormData>({ ...EMPTY, ...initialData, extra_images: (initialData as any)?.extra_images || [] });
  const [lang, setLang]       = useState<'fr' | 'sv' | 'en'>('fr');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [newExtraUrl, setNewExtraUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function set(field: keyof ProductFormData, value: any) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function setVariant(i: number, field: keyof Variant, value: string) {
    const v = [...form.variants];
    v[i] = { ...v[i], [field]: value };
    set('variants', v);
  }
  function addVariant() { set('variants', [...form.variants, { label: '', price: '' }]); }
  function removeVariant(i: number) {
    if (form.variants.length <= 1) return;
    set('variants', form.variants.filter((_, idx) => idx !== i));
  }

  // ── Upload image ──────────────────────────────────────────────────
  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true);
    const token = localStorage.getItem('sd_admin_token');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'products');
    fd.append('alt_text', form.name_fr || file.name);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (data.url) set('image_url', data.url);
      else alert('Erreur upload : ' + (data.error || 'inconnue'));
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  // ── Submit ─────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      price:         parseFloat(form.price) || 0,
      rating:        parseFloat(form.rating) || 4.5,
      reviews_count: parseInt(form.reviews_count) || 0,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      badge:         form.badge || null,
      category_id:   form.category_id || null,
      variants: form.variants
        .filter(v => v.label && v.price)
        .map(v => ({ label: v.label, price: parseFloat(v.price) })),
    };
    await onSave(payload);
  }

  const LANGS = [
    { id: 'fr', flag: '🇫🇷', label: 'Français' },
    { id: 'sv', flag: '🇸🇪', label: 'Svenska' },
    { id: 'en', flag: '🇬🇧', label: 'English' },
  ] as const;

  return (
    <form onSubmit={handleSubmit}>
      {/* ── LANG TABS ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, border: '1px solid var(--linen)', borderRadius: 'var(--radius)', overflow: 'hidden', width: 'fit-content' }}>
        {LANGS.map(l => (
          <button key={l.id} type="button"
            onClick={() => setLang(l.id)}
            style={{
              padding: '9px 20px', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.18s',
              background: lang === l.id ? 'var(--moss)' : 'var(--cream)',
              color: lang === l.id ? 'white' : 'var(--dust)',
            }}>
            {l.flag} {l.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28 }}>

        {/* ── COLONNE GAUCHE ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Infos de base */}
          <div className="card">
            <div className="card-header"><span className="card-title">📋 Informations de base</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select className="form-control" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                  <option value="">— Sélectionner une catégorie —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name_fr}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nom <span className="req">*</span></label>
                <input className="form-control" required
                  value={form[`name_${lang}`]}
                  onChange={e => set(`name_${lang}`, e.target.value)}
                  placeholder={`Nom du produit en ${lang === 'fr' ? 'français' : lang === 'sv' ? 'suédois' : 'anglais'}`}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Sous-titre / accroche</label>
                <input className="form-control"
                  value={form[`subtitle_${lang}`]}
                  onChange={e => set(`subtitle_${lang}`, e.target.value)}
                  placeholder="Ex : Le cœur du kanelbulle"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description longue</label>
                <textarea className="form-control" rows={5}
                  value={form[`desc_${lang}`]}
                  onChange={e => set(`desc_${lang}`, e.target.value)}
                  placeholder="Description détaillée du produit…"
                />
              </div>
            </div>
          </div>

          {/* Accordéon produit */}
          <div className="card">
            <div className="card-header"><span className="card-title">📖 Contenu accordéon</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">🍳 Utilisation / Recette</label>
                <textarea className="form-control" rows={3}
                  value={form[`usage_${lang}`]}
                  onChange={e => set(`usage_${lang}`, e.target.value)}
                  placeholder="Comment utiliser ce produit…"
                />
              </div>
              <div className="form-group">
                <label className="form-label">🧪 Ingrédients / Composition</label>
                <textarea className="form-control" rows={2}
                  value={form[`ingredients_${lang}`]}
                  onChange={e => set(`ingredients_${lang}`, e.target.value)}
                  placeholder="Liste des ingrédients…"
                />
              </div>
              <div className="form-group">
                <label className="form-label">⚠️ Allergènes</label>
                <input className="form-control"
                  value={form[`allergens_${lang}`]}
                  onChange={e => set(`allergens_${lang}`, e.target.value)}
                  placeholder="Ex : Contient : gluten, lait, moutarde"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">🏠 Conservation</label>
                <input className="form-control"
                  value={form[`storage_${lang}`]}
                  onChange={e => set(`storage_${lang}`, e.target.value)}
                  placeholder="Ex : Frais et sec. 24 mois."
                />
              </div>
            </div>
          </div>

          {/* Variantes */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">🔢 Variantes de conditionnement</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addVariant}>+ Ajouter</button>
            </div>
            <div className="card-body">
              <p className="form-hint" style={{ marginBottom: 16 }}>Ex : 50g, 100g, 250g — chaque variante peut avoir un prix différent.</p>
              {form.variants.map((v, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 36px', gap: 10, marginBottom: 10 }}>
                  <input className="form-control" placeholder="Libellé (ex: 50g, Kit 4 sachets)"
                    value={v.label} onChange={e => setVariant(i, 'label', e.target.value)} />
                  <input className="form-control" placeholder="Prix €" type="number" step="0.01" min="0"
                    value={v.price} onChange={e => setVariant(i, 'price', e.target.value)} />
                  <button type="button" className="btn btn-ghost btn-icon"
                    onClick={() => removeVariant(i)} disabled={form.variants.length <= 1}
                    style={{ color: 'var(--danger)', fontSize: 16 }}>✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="card">
            <div className="card-header"><span className="card-title">🏷️ Tags</span></div>
            <div className="card-body">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <input className="form-control"
                  value={form.tags}
                  onChange={e => set('tags', e.target.value)}
                  placeholder="Bio, Vegan, Sans gluten, Signature, Saisonnier, Cadeau…"
                />
                <p className="form-hint">Séparer par des virgules. Ces tags servent aux filtres de la boutique.</p>
              </div>
            </div>
          </div>

          {/* Nutrition */}
          <div className="card">
            <div className="card-header"><span className="card-title">📊 Valeurs nutritionnelles</span></div>
            <div className="card-body">
              <p className="form-hint" style={{ marginBottom: 16 }}>Pour 100g — laisser vide si non applicable. Rempli automatiquement par l&apos;import URL.</p>
              <div className="form-group">
                <label className="form-label">Taille de la portion</label>
                <input className="form-control" placeholder="Ex : 30g, 1 sachet (25g)…"
                  value={form.nutrition.portion}
                  onChange={e => set('nutrition', { ...form.nutrition, portion: e.target.value })} />
              </div>
              {([
                ['energie',      'Énergie (kcal/kJ)',     'Ex : 452 kcal / 1891 kJ'],
                ['graisses',     'Matières grasses (g)',  'Ex : 18g'],
                ['dont_satures', '— dont acides gras saturés (g)', 'Ex : 2.5g'],
                ['glucides',     'Glucides (g)',          'Ex : 62g'],
                ['dont_sucres',  '— dont sucres (g)',     'Ex : 4g'],
                ['fibres',       'Fibres (g)',            'Ex : 3g'],
                ['proteines',    'Protéines (g)',         'Ex : 8g'],
                ['sel',          'Sel (g)',               'Ex : 1.2g'],
              ] as [keyof Nutrition, string, string][]).map(([key, label, ph]) => (
                <div key={key} className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0, fontSize: 13, color: key.startsWith('dont') ? 'var(--dust)' : undefined, paddingLeft: key.startsWith('dont') ? 12 : 0 }}>
                    {label}
                  </label>
                  <input className="form-control" placeholder={ph}
                    value={(form.nutrition as any)[key] || ''}
                    onChange={e => set('nutrition', { ...form.nutrition, [key]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── COLONNE DROITE ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Actions */}
          <div className="card">
            <div className="card-header"><span className="card-title">⚙️ Publication</span></div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                <label className="toggle">
                  <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
                  <span className="toggle-track"></span>
                  <span className="toggle-label">Produit actif (visible sur le site)</span>
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={form.is_bestseller} onChange={e => set('is_bestseller', e.target.checked)} />
                  <span className="toggle-track"></span>
                  <span className="toggle-label">⭐ Best-seller (affiché en home)</span>
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={form.is_new} onChange={e => set('is_new', e.target.checked)} />
                  <span className="toggle-track"></span>
                  <span className="toggle-label">🆕 Nouveauté</span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Badge affiché</label>
                <select className="form-control" value={form.badge} onChange={e => set('badge', e.target.value)}>
                  <option value="">— Aucun badge —</option>
                  <option value="badge-pop">🔴 Best-seller</option>
                  <option value="badge-new">🟢 Nouveau</option>
                  <option value="badge-org">🌿 Bio / Organic</option>
                  <option value="badge-must">⭐ Incontournable</option>
                </select>
              </div>

              <button type="submit" disabled={saving}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14 }}>
                {saving ? '⏳ Enregistrement…' : '💾 Sauvegarder le produit'}
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="card">
            <div className="card-header"><span className="card-title">🖼️ Image produit</span></div>
            <div className="card-body">
              {form.image_url ? (
                <div style={{ marginBottom: 12 }}>
                  <img src={form.image_url} alt="Preview"
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', padding: 8, background: 'var(--cream)', borderRadius: 'var(--radius)', border: '1px solid var(--linen)' }} />
                  <button type="button" className="btn btn-danger btn-sm"
                    style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
                    onClick={() => set('image_url', '')}>
                    ✕ Supprimer l'image
                  </button>
                </div>
              ) : (
                <div
                  className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  {uploading ? (
                    <><span className="upload-zone-icon">⏳</span><p className="upload-zone-text">Upload en cours…</p></>
                  ) : (
                    <><span className="upload-zone-icon">📸</span>
                      <p className="upload-zone-text">Glisser-déposer ou cliquer</p>
                      <p className="upload-zone-hint">JPG, PNG, WebP — max 5 MB</p>
                    </>
                  )}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

              <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
                <label className="form-label">Ou coller une URL d'image</label>
                <input className="form-control" type="url"
                  value={form.image_url}
                  onChange={e => set('image_url', e.target.value)}
                  placeholder="https://images.unsplash.com/…"
                />
              </div>

              {/* Galerie complémentaire */}
              <div style={{ marginTop: 20, borderTop: '1px solid var(--linen)', paddingTop: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--dust)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  Images galerie ({form.extra_images.length})
                </p>
                {form.extra_images.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {form.extra_images.map((u, i) => (
                      <div key={i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--linen)', background: 'var(--cream)', flexShrink: 0 }}>
                        <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.opacity = '0.3'; }} />
                        <button type="button"
                          onClick={() => set('extra_images', form.extra_images.filter((_, idx) => idx !== i) as any)}
                          style={{ position: 'absolute', top: 1, right: 1, background: 'rgba(198,40,40,0.85)', border: 'none', color: '#fff', width: 16, height: 16, borderRadius: '50%', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-control" type="url" placeholder="https://... URL image galerie"
                    value={newExtraUrl} onChange={e => setNewExtraUrl(e.target.value)}
                    style={{ fontSize: 12 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newExtraUrl.trim()) {
                        e.preventDefault();
                        set('extra_images', [...form.extra_images, newExtraUrl.trim()] as any);
                        setNewExtraUrl('');
                      }
                    }}
                  />
                  <button type="button" className="btn btn-secondary btn-sm"
                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={() => {
                      if (!newExtraUrl.trim()) return;
                      set('extra_images', [...form.extra_images, newExtraUrl.trim()] as any);
                      setNewExtraUrl('');
                    }}>
                    + Ajouter
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Prix & stock */}
          <div className="card">
            <div className="card-header"><span className="card-title">💶 Prix & Détails</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Prix de base <span className="req">*</span></label>
                <input className="form-control" required type="number" step="0.01" min="0"
                  value={form.price} onChange={e => set('price', e.target.value)}
                  placeholder="6.90" />
              </div>
              <div className="form-group">
                <label className="form-label">Conditionnement / Poids</label>
                <input className="form-control"
                  value={form.weight} onChange={e => set('weight', e.target.value)}
                  placeholder="50g, 25 sachets, Kit…" />
              </div>
              <div className="form-group">
                <label className="form-label">Origine</label>
                <input className="form-control"
                  value={form[`origin_${lang}`]}
                  onChange={e => set(`origin_${lang}`, e.target.value)}
                  placeholder="Suède, Inde / Suède…" />
              </div>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Note (/5)</label>
                  <input className="form-control" type="number" step="0.1" min="0" max="5"
                    value={form.rating} onChange={e => set('rating', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nb avis</label>
                  <input className="form-control" type="number" min="0"
                    value={form.reviews_count} onChange={e => set('reviews_count', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.startsWith('✅') ? 'success' : toast.startsWith('❌') ? 'error' : ''}`}>{toast}</div>
        </div>
      )}
    </form>
  );
}
