'use client';
import { adminFetch } from '@/lib/auth-client';
import { useState, useRef, useEffect } from 'react';
import { T } from '@/lib/admin-theme';
import BarcodeScanner from './BarcodeScanner';

/* ═══════════════════════════════════════════════════════════════
   FORMULAIRE PRODUIT — écran 3 du handoff (« Fiche produit »).
   Réparti sur 4 onglets pilotés par le parent : Général · Prix &
   stock · Photos · SEO & traductions. Deux colonnes flexibles
   (flex 2 1 420px / flex 1 1 260px) qui se replient sans media query.

   ⚠️ Les 40 champs de ProductFormData sont tous exposés — toute
   suppression fait perdre une capacité de saisie. La logique
   (serialize, autosave, upload, variantes) est inchangée.
   ═══════════════════════════════════════════════════════════════ */

type Variant = { label: string; price: string };

type Nutrition = {
  energie: string; graisses: string; dont_satures: string;
  glucides: string; dont_sucres: string; fibres: string;
  proteines: string; sel: string; portion: string;
};

type ProductFormData = {
  category_id: string;
  ean: string;
  sku: string;
  name_sv: string; name_fr: string; name_en: string;
  subtitle_sv: string; subtitle_fr: string; subtitle_en: string;
  desc_sv: string; desc_fr: string; desc_en: string;
  price: string;
  cost_price: string;
  discount_type: '' | 'percent' | 'fixed';
  discount_value: string;
  discount_start: string;
  discount_end: string;
  weight: string;
  origin_sv: string; origin_fr: string; origin_en: string;
  image_url: string;
  badge: string;
  is_bestseller: boolean;
  is_new: boolean;
  is_active: boolean;
  pickup_only: boolean;
  track_stock: boolean;
  stock: string;
  reorder_qty: string;
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
  category_id: '', ean: '', sku: '', name_sv: '', name_fr: '', name_en: '',
  subtitle_sv: '', subtitle_fr: '', subtitle_en: '',
  desc_sv: '', desc_fr: '', desc_en: '',
  price: '', cost_price: '',
  discount_type: '', discount_value: '', discount_start: '', discount_end: '',
  weight: '',
  origin_sv: 'Suède', origin_fr: 'Suède', origin_en: 'Sweden',
  image_url: '',
  badge: '', is_bestseller: false, is_new: false, is_active: true,
  pickup_only: false, track_stock: false, stock: '', reorder_qty: '',
  rating: '4.5', reviews_count: '0', tags: '',
  usage_sv: '', usage_fr: '', usage_en: '',
  ingredients_sv: '', ingredients_fr: '', ingredients_en: '',
  allergens_sv: '', allergens_fr: '', allergens_en: '',
  storage_sv: '', storage_fr: '', storage_en: '',
  nutrition: { energie: '', graisses: '', dont_satures: '', glucides: '', dont_sucres: '', fibres: '', proteines: '', sel: '', portion: '' },
  extra_images: [],
  variants: [{ label: '', price: '' }],
};

export type ProductTab = 'general' | 'prix' | 'photos' | 'seo';

type Props = {
  initialData?: Partial<ProductFormData> & { id?: string };
  categories: any[];
  onSave: (data: any) => Promise<void>;
  saving: boolean;
  toast: string;
  autoSave?: boolean;
  /** Onglet affiché ; non fourni = tout afficher (écran « nouveau produit »). */
  tab?: ProductTab;
  /** Le parent rend son propre bouton d'enregistrement (en-tête collant). */
  hideSubmit?: boolean;
  /** Remonte l'état d'auto-enregistrement au parent. */
  onStatus?: (s: string) => void;
  /** Permet au parent de déclencher la soumission. */
  formId?: string;
};

type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved';

/* ── Petites briques visuelles du handoff ─────────────────── */
const Card = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <div className="sc-card">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 15px', borderBottom: `1px solid ${T.border}` }}>
      <span className="sc-card-title">{title}</span>
      {action}
    </div>
    <div style={{ padding: '13px 15px' }}>{children}</div>
  </div>
);

const Field = ({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <label className="sc-label">{label}</label>}
    {children}
    {hint && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 4 }}>{hint}</div>}
  </div>
);

/** Interrupteur 34 × 19 px, piste verte active (handoff). */
const Switch = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <div>
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <button type="button" className="sc-switch" role="switch" aria-checked={on} onClick={() => onChange(!on)} />
      <span style={{ fontSize: 12.5, color: T.text2 }}>{label}</span>
    </label>
    {hint && <div style={{ fontSize: 10.5, color: T.muted, margin: '4px 0 0 44px', lineHeight: 1.45 }}>{hint}</div>}
  </div>
);

export default function ProductForm({
  initialData, categories, onSave, saving, toast, autoSave = false,
  tab, hideSubmit = false, onStatus, formId,
}: Props) {
  const [form, setForm] = useState<ProductFormData>({
    ...EMPTY,
    ...initialData,
    price: String(initialData?.price ?? ''),
    cost_price: initialData?.cost_price != null ? String(initialData.cost_price) : '',
    discount_type: ((initialData as any)?.discount_type as any) || '',
    discount_value: (initialData as any)?.discount_value != null ? String((initialData as any).discount_value) : '',
    discount_start: (initialData as any)?.discount_start ? String((initialData as any).discount_start).slice(0, 10) : '',
    discount_end: (initialData as any)?.discount_end ? String((initialData as any).discount_end).slice(0, 10) : '',
    pickup_only: !!(initialData?.pickup_only),
    track_stock: !!(initialData?.track_stock),
    stock: initialData?.stock != null ? String(initialData.stock) : '',
    reorder_qty: (initialData as any)?.reorder_qty != null ? String((initialData as any).reorder_qty) : '',
    extra_images: (initialData as any)?.extra_images || [],
  });
  const [lang, setLang] = useState<'fr' | 'sv' | 'en'>('fr');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [newExtraUrl, setNewExtraUrl] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [eanMsg, setEanMsg] = useState('');
  const [asStatus, setAsStatus] = useState<AutoSaveStatus>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const asTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  useEffect(() => { initialized.current = true; }, []);
  useEffect(() => { onStatus?.(asStatus); }, [asStatus, onStatus]);

  /* ── Logique inchangée ──────────────────────────────────── */
  function serialize(f: ProductFormData) {
    /* Remise article : on SORT les champs du spread pour ne les renvoyer
       QUE si une remise est posée (ou l'était déjà). Ainsi, tant que la
       migration 049 n'a pas ajouté les colonnes, un produit sans remise
       s'enregistre normalement — on n'écrit jamais de colonne absente. */
    const { discount_type: _dt, discount_value: _dv, discount_start: _ds, discount_end: _de, ...rest } = f;
    const hasDisc = !!_dt && parseFloat(_dv) > 0;
    const hadDisc = !!(initialData as any)?.discount_type;
    const payload: Record<string, any> = {
      ...rest,
      price:         parseFloat(f.price) || 0,
      cost_price:    parseFloat(f.cost_price) || 0,
      rating:        parseFloat(f.rating) || 4.5,
      reviews_count: parseInt(f.reviews_count) || 0,
      tags: f.tags.split(',').map(t => t.trim()).filter(Boolean),
      badge:         f.badge || null,
      category_id:   f.category_id || null,
      ean:           f.ean?.trim() || null,
      stock:         f.track_stock && f.stock !== '' ? parseInt(f.stock) : null,
      reorder_qty:   f.reorder_qty !== '' ? parseInt(f.reorder_qty) : null,
      variants: f.variants
        .filter(v => v.label && v.price)
        .map(v => ({ label: v.label, price: parseFloat(v.price) })),
    };
    if (hasDisc || hadDisc) {
      payload.discount_type  = hasDisc ? _dt : null;
      payload.discount_value = hasDisc ? parseFloat(_dv) : null;
      payload.discount_start = hasDisc && _ds ? _ds : null;
      payload.discount_end   = hasDisc && _de ? _de : null;
    }
    return payload;
  }

  function set(field: keyof ProductFormData, value: any) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (autoSave && initialized.current) {
        if (asTimer.current) clearTimeout(asTimer.current);
        setAsStatus('pending');
        asTimer.current = setTimeout(async () => {
          setAsStatus('saving');
          await onSave(serialize(next));
          setAsStatus('saved');
          setTimeout(() => setAsStatus('idle'), 2200);
        }, 1500);
      }
      return next;
    });
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

  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true);
    const token = localStorage.getItem('sd_admin_token');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'products');
    fd.append('alt_text', form.name_fr || file.name);
    try {
      const res = await adminFetch('/api/upload', {
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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (asTimer.current) clearTimeout(asTimer.current);
    await onSave(serialize(form));
  }

  /* ── Affichage par onglet ───────────────────────────────── */
  const show = (t: ProductTab) => !tab || tab === t;
  const LANGS = [{ id: 'fr', label: 'Français' }, { id: 'sv', label: 'Svenska' }, { id: 'en', label: 'English' }] as const;

  const LangPicker = () => (
    <div style={{ display: 'flex', gap: 4 }}>
      {LANGS.map(l => (
        <button key={l.id} type="button" className={`sc-chip${lang === l.id ? ' on' : ''}`}
                style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                onClick={() => setLang(l.id)}>{l.label}</button>
      ))}
    </div>
  );

  const pv = parseFloat(form.price) || 0;
  const pa = parseFloat(form.cost_price) || 0;

  /* Remise article : aperçu du prix promo + état (active / programmée / terminée),
     miroir exact du calcul serveur (@/lib/product-price). */
  const dv = parseFloat(form.discount_value) || 0;
  const hasDiscount = !!form.discount_type && dv > 0;
  const effPrice = hasDiscount
    ? Math.max(0, Math.round((form.discount_type === 'percent' ? pv * (1 - dv / 100) : pv - dv) * 100) / 100)
    : pv;
  const todayStr = new Date().toISOString().slice(0, 10);
  const promoScheduled = hasDiscount && !!form.discount_start && todayStr < form.discount_start;
  const promoExpired = hasDiscount && !!form.discount_end && todayStr > form.discount_end;
  const promoActive = hasDiscount && !promoScheduled && !promoExpired;
  // La marge se lit sur le prix réellement encaissé (remise incluse si active).
  const pvNet = promoActive ? effPrice : pv;
  const margeEur = pa > 0 ? pvNet - pa : null;
  const margePct = pa > 0 && pvNet > 0 ? ((pvNet - pa) / pvNet) * 100 : null;
  const margeColor = margePct === null ? T.muted : margePct >= 50 ? T.green : margePct >= 30 ? '#C97A2B' : T.red;

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ══════════ COLONNE PRINCIPALE ══════════ */}
        <div style={{ flex: '2 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {show('general') && (
            <Card title="Informations" action={<LangPicker />}>
              <Field label={`Nom (${lang.toUpperCase()}) *`}>
                <input className="sc-input" required={lang === 'fr'}
                       value={form[`name_${lang}`]} onChange={e => set(`name_${lang}`, e.target.value)}
                       placeholder="Nom du produit" />
              </Field>
              <Field label="Sous-titre / accroche">
                <input className="sc-input" value={form[`subtitle_${lang}`]}
                       onChange={e => set(`subtitle_${lang}`, e.target.value)}
                       placeholder="Ex : Le cœur du kanelbulle" />
              </Field>
              <Field label="Description longue">
                <textarea className="sc-input sc-textarea" rows={4}
                          value={form[`desc_${lang}`]} onChange={e => set(`desc_${lang}`, e.target.value)}
                          placeholder="Description détaillée du produit…" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
                <Field label="Catégorie">
                  <select className="sc-input sc-select" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                    <option value="">— Aucune —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
                  </select>
                </Field>
                <Field label="Poids / contenance">
                  <input className="sc-input" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="Ex : 200 g" />
                </Field>
                <Field label={`Origine (${lang.toUpperCase()})`}>
                  <input className="sc-input" value={form[`origin_${lang}`]} onChange={e => set(`origin_${lang}`, e.target.value)} placeholder="Suède" />
                </Field>
              </div>
              <Field label="Tags" hint="Séparés par des virgules. Servent aux filtres de la boutique.">
                <input className="sc-input" value={form.tags} onChange={e => set('tags', e.target.value)}
                       placeholder="Bio, Vegan, Sans gluten, Signature…" />
              </Field>
            </Card>
          )}

          {show('prix') && (
            <>
              <Card title="Prix & marge">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
                  <Field label="Prix de vente TTC *">
                    <input className="sc-input sc-num" required type="number" step="0.01" min="0"
                           value={form.price} onChange={e => set('price', e.target.value)} placeholder="6.90" />
                  </Field>
                  <Field label="Prix d'achat (PMP)">
                    <input className="sc-input sc-num" type="number" step="0.01" min="0"
                           value={form.cost_price} onChange={e => set('cost_price', e.target.value)} placeholder="3.50" />
                  </Field>
                </div>

                {/* Encart marge recalculé à la frappe */}
                <div style={{ background: '#F2F5F0', border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: T.muted, marginBottom: 10 }}>
                    Coût & marge
                  </div>
                  {pa <= 0 ? (
                    <div style={{ fontSize: 12, color: T.muted, fontStyle: 'italic' }}>
                      Aucun PMP — valide une réception pour mettre à jour le coût.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { v: `${pa.toFixed(2)} €`, l: 'PMP', c: T.ink },
                        { v: `${margeEur! > 0 ? '+' : ''}${margeEur!.toFixed(2)} €`, l: 'Marge brute', c: margeColor },
                        { v: margePct !== null ? `${margePct.toFixed(0)} %` : '—', l: 'Taux', c: margeColor },
                      ].map(x => (
                        <div key={x.l} style={{ textAlign: 'center' }}>
                          <div className="sc-num" style={{ fontSize: 16, fontWeight: 700, color: x.c }}>{x.v}</div>
                          <div style={{ fontSize: 10.5, color: T.muted }}>{x.l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Remise / promo">
                <Field label="Type de remise" hint="La remise porte sur le prix de vente TTC et s'applique aussi aux variantes.">
                  <select className="sc-input sc-select" value={form.discount_type}
                          onChange={e => set('discount_type', e.target.value)}>
                    <option value="">— Aucune —</option>
                    <option value="percent">Pourcentage (%)</option>
                    <option value="fixed">Montant fixe (€)</option>
                  </select>
                </Field>

                {form.discount_type && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
                      <Field label={form.discount_type === 'percent' ? 'Remise (%)' : 'Remise (€)'}>
                        <input className="sc-input sc-num" type="number" step={form.discount_type === 'percent' ? '1' : '0.01'}
                               min="0" max={form.discount_type === 'percent' ? '100' : undefined}
                               value={form.discount_value} onChange={e => set('discount_value', e.target.value)}
                               placeholder={form.discount_type === 'percent' ? '20' : '1.50'} />
                      </Field>
                      <Field label="Début (optionnel)" hint="Vide = tout de suite">
                        <input className="sc-input" type="date" value={form.discount_start}
                               onChange={e => set('discount_start', e.target.value)} />
                      </Field>
                      <Field label="Fin (optionnel)" hint="Vide = sans fin">
                        <input className="sc-input" type="date" value={form.discount_end}
                               onChange={e => set('discount_end', e.target.value)} />
                      </Field>
                    </div>

                    {/* Aperçu du prix promo + état */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      background: promoActive ? '#FDECEC' : '#F5F3EF',
                      border: `1px solid ${promoActive ? '#E7B9B9' : T.border}`,
                      borderRadius: 8, padding: '11px 14px',
                    }}>
                      {hasDiscount ? (
                        <>
                          <span style={{ fontSize: 13, color: T.muted, textDecoration: 'line-through' }}>{pv.toFixed(2)} €</span>
                          <span className="sc-num" style={{ fontSize: 18, fontWeight: 800, color: '#C0392B' }}>{effPrice.toFixed(2)} €</span>
                          <span style={{
                            fontSize: 10.5, fontWeight: 700, letterSpacing: .4, padding: '2px 8px', borderRadius: 20,
                            background: promoActive ? '#C0392B' : promoScheduled ? '#8A6D1F' : T.muted,
                            color: '#fff',
                          }}>
                            {promoActive ? 'PROMO ACTIVE' : promoScheduled ? 'PROGRAMMÉE' : 'TERMINÉE'}
                          </span>
                          {form.discount_type === 'percent'
                            ? <span style={{ fontSize: 11, color: T.muted }}>−{dv}%</span>
                            : <span style={{ fontSize: 11, color: T.muted }}>−{dv.toFixed(2)} €</span>}
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: T.muted, fontStyle: 'italic' }}>
                          Renseigne une valeur de remise supérieure à 0.
                        </span>
                      )}
                    </div>
                  </>
                )}
              </Card>

              <Card title="Variantes de conditionnement"
                    action={<button type="button" className="sc-btn sc-btn-secondary" onClick={addVariant}><span className="ms">add</span>Ajouter</button>}>
                <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 10 }}>
                  Ex : 50 g, 100 g, 250 g — chaque variante peut avoir son prix.
                </div>
                {form.variants.map((v, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 30px', gap: 8, marginBottom: 8 }}>
                    <input className="sc-input" placeholder="Libellé (ex : 50 g)" value={v.label}
                           onChange={e => setVariant(i, 'label', e.target.value)} />
                    <input className="sc-input sc-num" placeholder="Prix €" type="number" step="0.01" min="0"
                           value={v.price} onChange={e => setVariant(i, 'price', e.target.value)} />
                    <button type="button" className="sc-iconbtn" onClick={() => removeVariant(i)}
                            disabled={form.variants.length <= 1} aria-label="Retirer la variante">
                      <span className="ms">delete</span>
                    </button>
                  </div>
                ))}
              </Card>
            </>
          )}

          {show('photos') && (
            <Card title="Photos">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(104px,1fr))', gap: 10 }}>
                {form.image_url && (
                  <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, background: '#F7F4EF' }}>
                    <img src={form.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    <span className="sc-badge" style={{ position: 'absolute', top: 6, left: 6, background: 'var(--accent)', color: '#fff' }}>Principale</span>
                    <button type="button" className="sc-iconbtn" onClick={() => set('image_url', '')}
                            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,255,255,.9)' }} aria-label="Retirer l'image principale">
                      <span className="ms">delete</span>
                    </button>
                  </div>
                )}
                {form.extra_images.map((u, i) => (
                  <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, background: '#F7F4EF' }}>
                    <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    <button type="button" className="sc-iconbtn" onClick={() => set('extra_images', form.extra_images.filter((_, x) => x !== i))}
                            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,255,255,.9)' }} aria-label="Retirer cette image">
                      <span className="ms">delete</span>
                    </button>
                  </div>
                ))}
                {/* Case « Déposer » pointillée */}
                <button type="button"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        style={{
                          aspectRatio: '1', borderRadius: 8, cursor: 'pointer',
                          border: `1px dashed ${dragOver ? 'var(--accent)' : T.borderField}`,
                          background: dragOver ? '#FBF9F6' : 'transparent',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                          color: T.muted, fontSize: 11,
                        }}>
                  <span className="ms" style={{ fontSize: 22 }}>{uploading ? 'hourglass_top' : 'add_photo_alternate'}</span>
                  {uploading ? 'Envoi…' : 'Déposer'}
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                <Field label="URL de l'image principale">
                  <input className="sc-input" type="url" value={form.image_url}
                         onChange={e => set('image_url', e.target.value)} placeholder="https://…" />
                </Field>
                <Field label={`Ajouter à la galerie (${form.extra_images.length})`}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="sc-input" type="url" value={newExtraUrl}
                           onChange={e => setNewExtraUrl(e.target.value)} placeholder="https://…" />
                    <button type="button" className="sc-btn sc-btn-secondary"
                            onClick={() => { if (newExtraUrl.trim()) { set('extra_images', [...form.extra_images, newExtraUrl.trim()]); setNewExtraUrl(''); } }}>
                      <span className="ms">add</span>
                    </button>
                  </div>
                </Field>
              </div>
            </Card>
          )}

          {show('seo') && (
            <>
              <Card title="Contenu de la fiche" action={<LangPicker />}>
                <Field label="Utilisation / recette">
                  <textarea className="sc-input sc-textarea" rows={3} value={form[`usage_${lang}`]}
                            onChange={e => set(`usage_${lang}`, e.target.value)} placeholder="Comment utiliser ce produit…" />
                </Field>
                <Field label="Ingrédients / composition">
                  <textarea className="sc-input sc-textarea" rows={2} value={form[`ingredients_${lang}`]}
                            onChange={e => set(`ingredients_${lang}`, e.target.value)} placeholder="Liste des ingrédients…" />
                </Field>
                <Field label="Allergènes">
                  <input className="sc-input" value={form[`allergens_${lang}`]}
                         onChange={e => set(`allergens_${lang}`, e.target.value)} placeholder="Contient : gluten, lait…" />
                </Field>
                <Field label="Conservation">
                  <input className="sc-input" value={form[`storage_${lang}`]}
                         onChange={e => set(`storage_${lang}`, e.target.value)} placeholder="Frais et sec. 24 mois." />
                </Field>
              </Card>

              <Card title="Valeurs nutritionnelles">
                <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 10 }}>
                  Pour 100 g — laisser vide si non applicable. Rempli automatiquement par l&apos;import URL.
                </div>
                <Field label="Taille de la portion">
                  <input className="sc-input" value={form.nutrition.portion}
                         onChange={e => set('nutrition', { ...form.nutrition, portion: e.target.value })}
                         placeholder="Ex : 30 g, 1 sachet" />
                </Field>
                {([
                  ['energie', 'Énergie (kcal/kJ)', '452 kcal / 1891 kJ'],
                  ['graisses', 'Matières grasses (g)', '18'],
                  ['dont_satures', '— dont acides gras saturés (g)', '2.5'],
                  ['glucides', 'Glucides (g)', '62'],
                  ['dont_sucres', '— dont sucres (g)', '4'],
                  ['fibres', 'Fibres (g)', '3'],
                  ['proteines', 'Protéines (g)', '8'],
                  ['sel', 'Sel (g)', '1.2'],
                ] as [keyof Nutrition, string, string][]).map(([key, label, ph]) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10, alignItems: 'center', marginBottom: 7 }}>
                    <span style={{ fontSize: 12, color: key.startsWith('dont') ? T.muted : T.text2, paddingLeft: key.startsWith('dont') ? 12 : 0 }}>{label}</span>
                    <input className="sc-input sc-num" style={{ height: 30 }} placeholder={ph}
                           value={(form.nutrition as any)[key] || ''}
                           onChange={e => set('nutrition', { ...form.nutrition, [key]: e.target.value })} />
                  </div>
                ))}
              </Card>

              <Card title="Avis affichés">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Note (sur 5)">
                    <input className="sc-input sc-num" type="number" step="0.1" min="0" max="5"
                           value={form.rating} onChange={e => set('rating', e.target.value)} />
                  </Field>
                  <Field label="Nombre d'avis">
                    <input className="sc-input sc-num" type="number" min="0"
                           value={form.reviews_count} onChange={e => set('reviews_count', e.target.value)} />
                  </Field>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* ══════════ COLONNE LATÉRALE ══════════ */}
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {show('general') && (
            <Card title="Publication">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                <Switch on={form.is_active}     onChange={v => set('is_active', v)}     label="Visible sur le site" />
                <Switch on={form.is_bestseller} onChange={v => set('is_bestseller', v)} label="Best-seller (affiché en home)" />
                <Switch on={form.is_new}        onChange={v => set('is_new', v)}        label="Nouveauté" />
                <Switch on={form.track_stock}   onChange={v => set('track_stock', v)}   label="Suivi de stock actif" />
                <Switch on={form.pickup_only}   onChange={v => set('pickup_only', v)}   label="Retrait uniquement"
                        hint={form.pickup_only ? 'Produit non expédiable. Tout panier le contenant passe en retrait en magasin.' : undefined} />
              </div>
              <Field label="Badge affiché">
                <select className="sc-input sc-select" value={form.badge} onChange={e => set('badge', e.target.value)}>
                  <option value="">— Aucun —</option>
                  <option value="badge-pop">Best-seller</option>
                  <option value="badge-new">Nouveau</option>
                  <option value="badge-org">Bio / Organic</option>
                  <option value="badge-must">Incontournable</option>
                </select>
              </Field>
            </Card>
          )}

          {show('prix') && (
            <Card title="Stock">
              {!form.track_stock ? (
                <div style={{ fontSize: 12, color: T.muted, fontStyle: 'italic' }}>
                  Le suivi de stock est désactivé. Active-le dans l&apos;onglet Général.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
                    <button type="button" className="sc-iconbtn"
                            onClick={() => set('stock', String(Math.max(0, (parseInt(form.stock) || 0) - 1)))}
                            aria-label="Retirer une unité"><span className="ms">remove</span></button>
                    <input className="sc-num" type="number" min="0" value={form.stock}
                           onChange={e => set('stock', e.target.value)}
                           style={{
                             width: 78, textAlign: 'center', fontSize: 22, fontWeight: 700,
                             border: `1px solid ${T.borderField}`, borderRadius: 7, padding: '4px 6px',
                             color: (parseInt(form.stock) || 0) <= 0 ? T.red : (parseInt(form.stock) || 0) <= 5 ? '#C97A2B' : T.ink,
                           }} />
                    <button type="button" className="sc-iconbtn"
                            onClick={() => set('stock', String((parseInt(form.stock) || 0) + 1))}
                            aria-label="Ajouter une unité"><span className="ms">add</span></button>
                  </div>
                  <Field label="Quantité de réappro minimum" hint="Ex. carton de 50. Défaut 10.">
                    <input className="sc-input sc-num" type="number" min="0" value={form.reorder_qty}
                           onChange={e => set('reorder_qty', e.target.value)} placeholder="10" />
                  </Field>
                </>
              )}
            </Card>
          )}

          {show('general') && (
            <Card title="Référence &amp; code-barres">
              <Field label="Référence (SKU)" hint="Identifiant stable, imprimé sur les bons de commande et de livraison. À ne pas changer une fois utilisé.">
          <input className="sc-input" value={form.sku || ''}
                 onChange={e => set('sku', e.target.value.toUpperCase())} placeholder="SC-0042" />
        </Field>

        <Field label="EAN 13" hint="Scanne l’article en magasin : nom, marque et poids sont pré-remplis depuis Open Food Facts.">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="sc-input sc-num" value={form.ean || ''} inputMode="numeric"
                         placeholder="7310865004703"
                         onChange={e => set('ean', e.target.value.replace(/[^0-9]/g, ''))} />
                  <button type="button" className="sc-btn sc-btn-primary" onClick={() => setScanOpen(v => !v)}>
                    <span className="ms">barcode_scanner</span>{scanOpen ? 'Fermer' : 'Scanner'}
                  </button>
                </div>
              </Field>

              {scanOpen && (
                <div style={{ marginBottom: 12 }}>
                  <BarcodeScanner
                    compact
                    label="Vise le code-barres de l’article"
                    onScan={async code => {
                      set('ean', code);
                      setEanMsg('Recherche…');
                      try {
                        const d = await adminFetch(`/api/scan?ean=${encodeURIComponent(code)}`, {
                          headers: { Authorization: `Bearer ${localStorage.getItem('sd_admin_token') || ''}` },
                        }).then(r => r.json());
                        if (d.found && d.product && d.product.id !== initialData?.id) {
                          setEanMsg(`Ce code est déjà utilisé par « ${d.product.name_fr} ».`);
                        } else if (d.suggestion) {
                          // Ne jamais écraser une saisie existante : on ne comble que les vides.
                          if (!form.name_fr && d.suggestion.name) set('name_fr', d.suggestion.name);
                          if (!form.weight && d.suggestion.weight) set('weight', d.suggestion.weight);
                          if (!form.image_url && d.suggestion.image_url) set('image_url', d.suggestion.image_url);
                          setEanMsg('Fiche pré-remplie depuis Open Food Facts.');
                        } else {
                          setEanMsg('Code enregistré — produit inconnu des bases publiques.');
                        }
                      } catch { setEanMsg('Code enregistré.'); }
                      setScanOpen(false);
                    }}
                  />
                </div>
              )}

              {eanMsg && <div style={{ fontSize: 11, color: T.text2b, marginBottom: 10 }}>{eanMsg}</div>}

              {/* Aperçu du code-barres : barres de 1 à 4 px dérivées du chiffre */}
              {form.ean && form.ean.length >= 8 && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 26, marginTop: 4 }}>
                  {form.ean.split('').map((d, i) => (
                    <span key={i} style={{
                      width: (Number(d) % 4) + 1, height: '100%',
                      background: T.ink, opacity: i % 2 ? .55 : 1,
                    }} />
                  ))}
                </div>
              )}
            </Card>
          )}

          {!hideSubmit && (
            <button type="submit" disabled={saving} className={`sc-btn ${autoSave ? 'sc-btn-secondary' : 'sc-btn-green'}`}
                    style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}>
              <span className="ms">save</span>
              {saving ? 'Enregistrement…' : autoSave ? 'Forcer la sauvegarde' : 'Enregistrer le produit'}
            </button>
          )}

          {toast && (
            <div style={{ background: T.ink, color: '#fff', padding: '9px 14px', borderRadius: 7, fontSize: 12 }}>{toast}</div>
          )}
        </div>
      </div>
    </form>
  );
}
