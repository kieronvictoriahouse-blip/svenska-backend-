'use client';
import { adminFetch } from '@/lib/auth-client';
import { useState, useRef, useEffect, createContext, useContext } from 'react';
import { T } from '@/lib/admin-theme';
import { useIsMobile } from '@/lib/use-mobile';
import { resolveDiscount, effectiveUnitPrice } from '@/lib/product-price';
import { reduirePhoto, erreurEnvoi } from '@/lib/reduire-photo';
import { eanValide } from '@/lib/fiche-produit';
import BarcodeScanner from './BarcodeScanner';

/** Emballage d'une box (carton kraft + papier de soie), ajouté au coût
 *  des produits — règle de coût des box fixée par la boutique. */
const EMBALLAGE_BOX = 2.5;

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
  manufacturer: string;
  nutrition: Nutrition;
  extra_images: string[];
  variants: Variant[];
  /** Box (migration 054) : produits contenus. Vide = produit simple. */
  bundle_items: Array<{ product_id: string; qty: string }>;
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
  manufacturer: '',
  nutrition: { energie: '', graisses: '', dont_satures: '', glucides: '', dont_sucres: '', fibres: '', proteines: '', sel: '', portion: '' },
  extra_images: [],
  variants: [{ label: '', price: '' }],
  bundle_items: [],
};

/** Composition reçue de l'API (tableau ou chaîne JSON) → lignes éditables. */
const lireLot = (v: any): Array<{ product_id: string; qty: string }> => {
  let x = v;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = null; } }
  return Array.isArray(x)
    ? x.filter((b: any) => b?.product_id).map((b: any) => ({ product_id: String(b.product_id), qty: String(b.qty ?? 1) }))
    : [];
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

type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/* ── Téléphone ──────────────────────────────────────────────
   La fiche est longue (40 champs) : sur téléphone chaque bloc se replie
   en touchant son titre, les blocs secondaires (variantes, box, promo,
   nutrition, avis) arrivent repliés s'ils sont vides. Sur ordinateur
   rien ne change : tous les blocs restent ouverts, sans chevron. */
const PF_CSS = `
  .pf-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 15px; border-bottom: 1px solid ${T.border}; }
  .pf-card-toggle { display: flex; align-items: center; gap: 6px; border: none; background: none; padding: 0; cursor: default; text-align: left; color: inherit; min-width: 0; }
  .pf-card-toggle .pf-chev { display: none; }
  .pf-card-body { padding: 13px 15px; }
  .pf-hint { font-size: 10.5px; color: ${T.muted}; line-height: 1.45; }
  .pf-kicker { font-size: 9.5px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: ${T.muted}; margin-bottom: 10px; }
  .pf-lang { height: 26px !important; padding: 0 10px !important; font-size: 11px !important; }
  .pf-lang .pf-short { display: none; }
  .pf-var { display: grid; grid-template-columns: 1fr 120px 30px; gap: 8px; margin-bottom: 8px; }
  .pf-lot { display: grid; grid-template-columns: 1fr 70px 30px; gap: 8px; margin-bottom: 8px; }
  .pf-nut { display: grid; grid-template-columns: 1fr 130px; gap: 10px; align-items: center; margin-bottom: 7px; }
  .pf-nut-label { font-size: 12px; }
  .pf-switch-label { font-size: 12.5px; color: ${T.text2}; }
  .pf-switch-hint { margin: 4px 0 0 44px; }
  .pf-camera { display: none; }
  .pf-eanmsg { font-size: 11px; }
  .pf-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
  @media (min-width: 900px) { .pf-nut .sc-input { height: 30px; } }
  @media (max-width: 899px) {
    .pf-card-toggle { cursor: pointer; min-height: 44px; margin: -8px 0; flex: 1; }
    .pf-card-toggle .pf-chev { display: inline-block; font-size: 22px; color: ${T.muted}; transition: transform .15s; }
    .pf-card.closed .pf-chev { transform: rotate(-90deg); }
    .pf-card.closed .pf-card-head { border-bottom-color: transparent; }
    .pf-card.closed .pf-card-body { display: none; }
    .pf-card-head { padding: 10px 14px; }
    .pf-card-body { padding: 14px; }
    .pf-hint { font-size: 12.5px; }
    .pf-kicker { font-size: 12px; letter-spacing: .6px; }
    .pf-lang { height: 36px !important; padding: 0 11px !important; font-size: 13px !important; }
    .pf-lang .pf-long { display: none; }
    .pf-lang .pf-short { display: inline; }
    .pf-var { grid-template-columns: minmax(0, 1fr) 96px 44px; }
    .pf-lot { grid-template-columns: minmax(0, 1fr) 64px 44px; }
    .pf-nut { grid-template-columns: minmax(0, 1fr) 120px; }
    .pf-nut-label { font-size: 13.5px; }
    .pf-switch-label { font-size: 14.5px; }
    .pf-switch-hint { margin-left: 54px; }
    .pf-switches { gap: 16px !important; }
    .pf-photos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pf-drop { display: none !important; }
    .pf-camera { display: flex; gap: 8px; margin-top: 10px; }
    .pf-camera > .sc-btn { flex: 1; justify-content: center; }
    .pf-in-toast { display: none; }
    .pf-eanmsg { font-size: 13.5px; }
    .pf-stock-input { width: 104px !important; min-height: 48px; font-size: 24px !important; }
    .pf-scan-body { padding: 0 12px 12px; }
  }
`;

/** En-tête des pages fiche / création (classes .fp-*) : sur téléphone le
 *  nom du produit tient sur deux lignes au lieu d'être coupé. */
export const FP_CSS = `
  .fp-crumb { font-size: 10.5px; color: ${T.muted}; }
  .fp-name { font-size: 16px; font-weight: 600; color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 899px) {
    .fp-crumb { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fp-name { line-height: 1.25; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  }
`;

/** Signal « tout déplier » : un champ obligatoire invalide dans un bloc
 *  replié empêcherait la soumission sans rien montrer. */
const OpenAll = createContext(0);

/* ── Petites briques visuelles du handoff ─────────────────── */
const Card = ({ title, action, children, defaultOpen = true }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
  /** Téléphone seulement : bloc replié à l'arrivée. */
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const signal = useContext(OpenAll);
  useEffect(() => { if (signal) setOpen(true); }, [signal]);
  return (
    <div className={`sc-card pf-card${open ? '' : ' closed'}`}>
      <div className="pf-card-head">
        <button type="button" className="pf-card-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="sc-card-title">{title}</span>
          <span className="ms pf-chev" aria-hidden="true">expand_more</span>
        </button>
        {/* Une action d'en-tête (Ajouter…) ouvre le bloc qu'elle remplit */}
        {action && <div onClickCapture={() => setOpen(true)} style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      <div className="pf-card-body">{children}</div>
    </div>
  );
};

const Field = ({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <label className="sc-label">{label}</label>}
    {children}
    {hint && <div className="pf-hint" style={{ marginTop: 4 }}>{hint}</div>}
  </div>
);

/** Interrupteur 34 × 19 px, piste verte active (handoff). */
const Switch = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <div>
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <button type="button" className="sc-switch" role="switch" aria-checked={on} onClick={() => onChange(!on)} />
      <span className="pf-switch-label">{label}</span>
    </label>
    {hint && <div className="pf-hint pf-switch-hint">{hint}</div>}
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
    bundle_items: lireLot((initialData as any)?.bundle_items),
  });
  /* Catalogue pour composer une box : chargé une fois, à la demande. */
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [lang, setLang] = useState<'fr' | 'sv' | 'en'>('fr');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [newExtraUrl, setNewExtraUrl] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [eanMsg, setEanMsg] = useState('');
  const [asStatus, setAsStatus] = useState<AutoSaveStatus>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  /* Téléphone : « Prendre une photo » ouvre directement l'appareil photo
     (capture), « Galerie » garde le choix du système. */
  const camRef = useRef<HTMLInputElement>(null);
  const mobile = useIsMobile();
  const [openAll, setOpenAll] = useState(0);
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
    const { discount_type: _dt, discount_value: _dv, discount_start: _ds, discount_end: _de, bundle_items: _bi, ...rest } = f;
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
      sku:           f.sku?.trim() || null,
      stock:         f.track_stock && f.stock !== '' ? parseInt(f.stock) : null,
      reorder_qty:   f.reorder_qty !== '' ? parseInt(f.reorder_qty) : null,
      variants: f.variants
        .filter(v => v.label && v.price)
        .map(v => ({ label: v.label, price: parseFloat(v.price) })),
    };
    /* Stock : envoyé seulement s'il a été modifié ici. L'autosave renvoie
       tout le formulaire à chaque frappe ; avec le stock lu à l'ouverture,
       une description retouchée après une expédition reposait l'ancienne
       quantité (« correction » journalisée, mais fausse). */
    const stockLu = initialData?.stock != null ? String(initialData.stock) : '';
    if (initialData?.id && f.stock === stockLu) delete payload.stock;
    /* Champs de la fiche chargée qui ne sont pas des colonnes modifiables
       (id, catégorie embarquée, variantes brutes, dates…) : la route les
       ignore, inutile de les envoyer. */
    for (const k of ['id', 'categories', 'product_variants', 'lot_disponible', 'lot_contenu', 'created_at', 'updated_at', 'brand'])
      delete payload[k];
    /* Box (migration 054) : n'est envoyée que si elle existe (ou existait),
       et une box n'a jamais de stock propre — ce sont ses sachets. */
    const lot = (_bi || [])
      .map(b => ({ product_id: b.product_id, qty: parseInt(b.qty) || 0 }))
      .filter(b => b.product_id && b.qty > 0);
    if (lot.length || lireLot((initialData as any)?.bundle_items).length) {
      payload.bundle_items = lot.length ? lot : null;
    }
    if (lot.length) { payload.track_stock = false; payload.stock = null; }
    /* Fabricant (migration 060) : envoyé seulement s'il est saisi (ou l'était),
       pour qu'un produit s'enregistre même avant l'ajout de la colonne. */
    const fab = String(f.manufacturer || '').trim();
    if (fab || (initialData as any)?.manufacturer) payload.manufacturer = fab || null;
    else delete payload.manufacturer;
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
          /* Un enregistrement refusé (prix vide, EAN invalide…) ne doit pas
             s'afficher « Enregistré » : le parent rejette, on le montre. */
          try {
            await onSave(serialize(next));
            setAsStatus('saved');
            setTimeout(() => setAsStatus(s => (s === 'saved' ? 'idle' : s)), 2200);
          } catch { setAsStatus('error'); }
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
  /* ── Box : lignes de composition ────────────────────────── */
  const estBox = form.bundle_items.some(b => b.product_id);
  function setLot(i: number, field: 'product_id' | 'qty', value: string) {
    const v = [...form.bundle_items];
    v[i] = { ...v[i], [field]: value };
    set('bundle_items', v);
  }
  const ajouterAuLot = () => set('bundle_items', [...form.bundle_items, { product_id: '', qty: '1' }]);
  const retirerDuLot = (i: number) => set('bundle_items', form.bundle_items.filter((_, idx) => idx !== i));
  useEffect(() => {
    if (tab && tab !== 'prix') return;
    if (catalogue.length) return;
    adminFetch('/api/products?limit=1000').then(r => r.json())
      .then(d => setCatalogue((d.products || []).filter((p: any) => p.id !== initialData?.id)))
      .catch(() => {});
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  function removeVariant(i: number) {
    if (form.variants.length <= 1) return;
    set('variants', form.variants.filter((_, idx) => idx !== i));
  }

  async function uploadFile(brut: File) {
    if (!brut) return;
    setUploading(true);
    try {
      // Photo de téléphone : réduite ici, sinon refusée au-delà de 4 Mo (cf. lib/reduire-photo).
      const file = await reduirePhoto(brut);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'products');
      fd.append('alt_text', form.name_fr || file.name);
      const res = await adminFetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) { alert('Erreur upload : ' + await erreurEnvoi(res)); return; }
      const data = await res.json().catch(() => ({}));
      if (data.url) set('image_url', data.url);
      else alert('Erreur upload : ' + (data.error || 'inconnue'));
    } catch {
      alert('Erreur upload : réseau indisponible.');
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
    // Le nom FR n'est « required » que sous l'onglet FR : on y ramène si vide.
    if (!String(form.name_fr || '').trim()) setLang('fr');
    try {
      await onSave(serialize(form));
      if (autoSave) setAsStatus('idle');
    } catch { if (autoSave) setAsStatus('error'); }
  }

  /* ── Affichage par onglet ───────────────────────────────── */
  const show = (t: ProductTab) => !tab || tab === t;
  const LANGS = [{ id: 'fr', label: 'Français' }, { id: 'sv', label: 'Svenska' }, { id: 'en', label: 'English' }] as const;

  const LangPicker = () => (
    <div style={{ display: 'flex', gap: 4 }}>
      {LANGS.map(l => (
        <button key={l.id} type="button" className={`sc-chip pf-lang${lang === l.id ? ' on' : ''}`}
                onClick={() => setLang(l.id)} aria-pressed={lang === l.id} aria-label={l.label}>
          <span className="pf-long">{l.label}</span><span className="pf-short">{l.id.toUpperCase()}</span>
        </button>
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
  /* La marge se lit sur le prix réellement encaissé : remise du produit si
     active, sinon celle de sa catégorie — la règle du checkout et de la
     vitrine (lib/product-price), pas une copie. La promo de catégorie
     n'apparaissait nulle part sur la fiche. */
  const remiseProduit = {
    discount_type: form.discount_type || null, discount_value: form.discount_value,
    discount_start: form.discount_start || null, discount_end: form.discount_end || null,
  };
  const categorie = categories.find(c => c.id === form.category_id);
  const remiseEffective = resolveDiscount(remiseProduit, categorie);
  const promoCategorie = remiseEffective !== remiseProduit ? remiseEffective : null;
  const pvNet = effectiveUnitPrice(pv, remiseEffective);
  const margeEur = pa > 0 ? pvNet - pa : null;
  const margePct = pa > 0 && pvNet > 0 ? ((pvNet - pa) / pvNet) * 100 : null;
  const margeColor = margePct === null ? T.muted : margePct >= 50 ? T.green : margePct >= 30 ? '#C97A2B' : T.red;

  /* Blocs secondaires repliés à l'arrivée sur téléphone s'ils sont vides. */
  const aDesVariantes = form.variants.some(v => v.label || v.price);
  const aUneNutrition = Object.values(form.nutrition || {}).some(v => String(v || '').trim());

  return (
    <OpenAll.Provider value={openAll}>
    <form id={formId} onSubmit={handleSubmit} onInvalidCapture={() => setOpenAll(n => n + 1)}>
      <style dangerouslySetInnerHTML={{ __html: PF_CSS }} />
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
                  <div className="pf-kicker">
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
                          <div className="pf-hint">{x.l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {promoCategorie && (
                  <div className="pf-hint" style={{ marginTop: 8, color: '#C0392B' }}>
                    Promo de la catégorie « {categorie?.name_fr} » en cours :{' '}
                    {promoCategorie.discount_type === 'percent'
                      ? `−${Number(promoCategorie.discount_value)} %`
                      : `−${Number(promoCategorie.discount_value).toFixed(2)} €`}
                    {' '}→ {pvNet.toFixed(2)} € payés par le client. La marge ci-dessus est calculée sur ce prix.
                  </div>
                )}
              </Card>

              <Card title="Remise / promo" defaultOpen={!!form.discount_type}>
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

              <Card title="Variantes de conditionnement" defaultOpen={aDesVariantes}
                    action={<button type="button" className="sc-btn sc-btn-secondary" onClick={addVariant}><span className="ms">add</span>Ajouter</button>}>
                <div className="pf-hint" style={{ marginBottom: 10 }}>
                  Ex : 50 g, 100 g, 250 g — chaque variante peut avoir son prix.
                </div>
                {form.variants.map((v, i) => (
                  <div key={i} className="pf-var">
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

              <Card title="Composition de la box" defaultOpen={estBox}
                    action={<button type="button" className="sc-btn sc-btn-secondary" onClick={ajouterAuLot}><span className="ms">add</span>Ajouter un produit</button>}>
                <div className="pf-hint" style={{ marginBottom: 10, lineHeight: 1.5 }}>
                  Ajouter des produits transforme cette fiche en <b>box</b> : elle n&apos;a plus de stock propre.
                  Elle est en vente tant que chacun de ses produits est disponible, une box payée les réserve,
                  et ce sont eux qui sortent du stock à l&apos;expédition.
                </div>
                {form.bundle_items.map((b, i) => (
                  <div key={i} className="pf-lot">
                    <select className="sc-input sc-select" value={b.product_id} onChange={e => setLot(i, 'product_id', e.target.value)}>
                      <option value="">— Choisir un produit —</option>
                      {catalogue
                        .filter(p => !lireLot(p.bundle_items).length)
                        .sort((a, c) => String(a.name_fr).localeCompare(String(c.name_fr), 'fr'))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name_fr} — {(Number(p.price) || 0).toFixed(2)} €
                            {p.track_stock ? ` · rayon ${p.stock ?? 0}` : ' · non suivi'}{!p.is_active ? ' · désactivé' : ''}
                          </option>
                        ))}
                    </select>
                    <input className="sc-input sc-num" type="number" min="1" step="1" value={b.qty}
                           onChange={e => setLot(i, 'qty', e.target.value)} aria-label="Quantité dans la box" />
                    <button type="button" className="sc-iconbtn" onClick={() => retirerDuLot(i)} aria-label="Retirer de la box">
                      <span className="ms">delete</span>
                    </button>
                  </div>
                ))}
                {estBox && (() => {
                  const lignes = form.bundle_items
                    .map(b => ({ p: catalogue.find(x => x.id === b.product_id), q: parseInt(b.qty) || 0 }))
                    .filter(x => x.p && x.q > 0);
                  const valeur = lignes.reduce((s, x) => s + (Number(x.p.price) || 0) * x.q, 0);
                  const cout = lignes.reduce((s, x) => s + (Number(x.p.cost_price) || 0) * x.q, 0);
                  const sansPA = lignes.filter(x => !(Number(x.p.cost_price) > 0));
                  const prix = parseFloat(form.price) || 0;
                  const ecart = valeur - prix;
                  const dispo = (initialData as any)?.lot_disponible;
                  const ligne = (label: string, val: React.ReactNode, color?: string) => (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '3px 0', color: color || T.text2 }}>
                      <span>{label}</span><b>{val}</b>
                    </div>
                  );
                  return (
                    <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                      {ligne('Valeur des produits au prix du site', `${valeur.toFixed(2)} €`)}
                      {prix > 0 && (ecart > 0.004
                        ? ligne('Le client économise', `${ecart.toFixed(2)} € (${Math.round(ecart / valeur * 100)} %)`, T.green)
                        : ecart < -0.004
                          ? ligne('La box coûte de plus qu’à l’unité', `${(-ecart).toFixed(2)} €`, '#C97A2B')
                          : ligne('Prix identique aux produits à l’unité', '='))}
                      {ligne('Coût d’achat des produits', `${cout.toFixed(2)} €`)}
                      {sansPA.length > 0 && (
                        <div className="pf-hint" style={{ color: '#C97A2B', margin: '2px 0 4px' }}>
                          Sans prix d&apos;achat (compté 0 €) : {sansPA.map(x => x.p.name_fr).join(', ')}
                        </div>
                      )}
                      {/* Règle des box : coût = produits + 2,50 € d'emballage. Le
                          bouton reportait les produits seuls et laissait l'ajout à
                          faire de tête ; la marge affichée était donc trop belle. */}
                      {ligne('Emballage (carton, papier de soie)', `${EMBALLAGE_BOX.toFixed(2)} €`)}
                      <button type="button" className="sc-btn sc-btn-secondary" style={{ marginTop: 6 }}
                              onClick={() => set('cost_price', (cout + EMBALLAGE_BOX).toFixed(2))}>
                        Reporter {(cout + EMBALLAGE_BOX).toFixed(2)} € dans le prix d&apos;achat
                      </button>
                      <div className="pf-hint" style={{ marginTop: 4 }}>
                        Produits + {EMBALLAGE_BOX.toFixed(2).replace('.', ',')} € d&apos;emballage.
                      </div>
                      {typeof dispo === 'number' && ligne('Box vendables maintenant', String(Math.max(0, dispo)), dispo > 0 ? T.ink : T.red)}
                    </div>
                  );
                })()}
              </Card>
            </>
          )}

          {show('photos') && (
            <Card title="Photos">
              <div className="pf-photos">
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
                {/* Case « Déposer » pointillée (téléphone : remplacée par les
                    boutons Appareil photo / Galerie sous la grille) */}
                <button type="button" className="pf-drop"
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
                  {uploading ? 'Envoi…' : <><span className="sc-hide-mobile">Déposer</span><span className="sc-only-mobile">Galerie</span></>}
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              {/* Téléphone : photo prise sur le moment, sans passer par la galerie */}
              <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                     onChange={e => { handleFileChange(e); e.target.value = ''; }} />
              <div className="pf-camera">
                <button type="button" className="sc-btn sc-btn-primary" onClick={() => camRef.current?.click()} disabled={uploading}>
                  <span className="ms">photo_camera</span>{uploading ? 'Envoi…' : 'Prendre une photo'}
                </button>
                <button type="button" className="sc-btn sc-btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <span className="ms">photo_library</span>Galerie
                </button>
              </div>
              <div className="pf-hint sc-only-mobile" style={{ marginTop: 6 }}>La photo envoyée devient l’image principale.</div>

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
                <Field label="Fabricant" hint="Nom et adresse tels qu’imprimés sur l’emballage (mention obligatoire, la même dans les trois langues).">
                  <input className="sc-input" value={form.manufacturer || ''}
                         onChange={e => set('manufacturer', e.target.value)} placeholder="Cloetta Sverige AB, Box 12, 172 21 Sundbyberg, Suède" />
                </Field>
              </Card>

              <Card title="Valeurs nutritionnelles" defaultOpen={aUneNutrition}>
                <div className="pf-hint" style={{ marginBottom: 10 }}>
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
                  <div key={key} className="pf-nut">
                    <span className="pf-nut-label" style={{ color: key.startsWith('dont') ? T.muted : T.text2, paddingLeft: key.startsWith('dont') ? 12 : 0 }}>{label}</span>
                    <input className="sc-input sc-num" placeholder={ph} aria-label={label}
                           value={(form.nutrition as any)[key] || ''}
                           onChange={e => set('nutrition', { ...form.nutrition, [key]: e.target.value })} />
                  </div>
                ))}
              </Card>

              <Card title="Avis affichés" defaultOpen={false}>
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
              <div className="pf-switches" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                <Switch on={form.is_active}    onChange={v => set('is_active', v)}     label="Visible sur le site" />
                <Switch on={form.is_bestseller} onChange={v => set('is_bestseller', v)} label="Best-seller (affiché en home)" />
                <Switch on={form.is_new}        onChange={v => set('is_new', v)}        label="Nouveauté" />
                {!estBox && (
                  <Switch on={form.track_stock}   onChange={v => set('track_stock', v)}   label="Suivi de stock actif" />
                )}
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
              {estBox ? (
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.5 }}>
                  C&apos;est une <b>box</b> : pas de stock propre. Elle se vend tant que ses produits sont disponibles
                  {typeof (initialData as any)?.lot_disponible === 'number'
                    ? <> — <b>{Math.max(0, (initialData as any).lot_disponible)}</b> box possibles maintenant.</>
                    : '.'}
                  {' '}Pour en préparer davantage, réapprovisionne ses produits (Réceptions).
                </div>
              ) : !form.track_stock ? (
                <div style={{ fontSize: 12, color: T.muted, fontStyle: 'italic' }}>
                  Le suivi de stock est désactivé. Active-le dans l&apos;onglet Général.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
                    <button type="button" className="sc-iconbtn"
                            onClick={() => set('stock', String(Math.max(0, (parseInt(form.stock) || 0) - 1)))}
                            aria-label="Retirer une unité"><span className="ms">remove</span></button>
                    <input className="sc-num pf-stock-input" type="number" min="0" inputMode="numeric" value={form.stock}
                           onChange={e => set('stock', e.target.value)} aria-label="Stock"
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
                {/* Même contrôle qu'à l'enregistrement : longueur et clé de contrôle */}
                {!!form.ean && form.ean !== String(initialData?.ean ?? '') && !eanValide(form.ean) && (
                  <div className="pf-hint" style={{ color: T.red, marginTop: 4 }}>
                    Code incomplet ou erroné (8, 12, 13 ou 14 chiffres, clé de contrôle incluse) : la fiche ne sera pas enregistrée.
                  </div>
                )}
              </Field>

              {/* Lecteur : en ligne sur ordinateur, plein écran sur téléphone
                  (caméra allumée d'office : on vient de toucher « Scanner »). */}
              {scanOpen && (
                <div className="sc-scan-sheet" style={{ marginBottom: 12 }}>
                  <div className="sc-scan-sheet-head">
                    <div className="sc-scan-sheet-title">
                      Scanner l’EAN
                      <div className="sc-scan-sheet-sub">Nom, poids et photo manquants sont pré-remplis.</div>
                    </div>
                    <button type="button" onClick={() => setScanOpen(false)} aria-label="Fermer le scanner">
                      <span className="ms" style={{ fontSize: 26 }}>close</span>
                    </button>
                  </div>
                  <div className="pf-scan-body">
                  <BarcodeScanner
                    compact
                    autoStart={mobile}
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
                </div>
              )}

              {eanMsg && <div className="pf-eanmsg" style={{ color: T.text2b, marginBottom: 10 }}>{eanMsg}</div>}

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
            <div className="pf-in-toast" style={{ background: T.ink, color: '#fff', padding: '9px 14px', borderRadius: 7, fontSize: 12 }}>{toast}</div>
          )}
        </div>
      </div>
    </form>
    </OpenAll.Provider>
  );
}
