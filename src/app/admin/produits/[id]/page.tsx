'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import ProductForm, { ProductTab, FP_CSS } from '@/components/ProductForm';
import { MenuActions, MenuItem, MenuSep } from '@/components/MenuActions';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TFP } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 3 — FICHE PRODUIT
   Handoff §3 : en-tête collant (retour, fil d'ariane, nom, Aperçu,
   Enregistrer vert), onglets collants à top:53px, corps en deux
   colonnes flexibles rendu par <ProductForm>.
   ═══════════════════════════════════════════════════════════════ */

const TABS: Array<{ id: ProductTab; label: string }> = [
  { id: 'general', label: 'Général' },
  { id: 'prix',    label: 'Prix & stock' },
  { id: 'photos',  label: 'Photos' },
  { id: 'seo',     label: 'SEO & traductions' },
];

const since = (iso?: string) => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - +new Date(iso)) / 86400000);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  return `il y a ${d} j`;
};

export default function EditProduitPage() {
  const { t, tc, lang } = useT(TFP);
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [product, setProduct] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProductTab>('general');
  const [status, setStatus] = useState('');
  const [frontUrl, setFrontUrl] = useState('');
  const moreBtn = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      adminFetch(`/api/products/${id}`).then(r => r.json()),
      adminFetch('/api/categories').then(r => r.json()),
      adminFetch('/api/white-label').then(r => r.json()).catch(() => ({})),
    ]).then(([pData, cData, wl]) => {
      const p = pData.product;
      if (p) {
        setProduct({
          ...p,
          tags: (p.tags || []).join(', '),
          rating: String(p.rating ?? '4.5'),
          reviews_count: String(p.reviews_count ?? '0'),
          badge: p.badge || '',
          variants: p.product_variants?.length
            ? p.product_variants.map((v: any) => ({ label: v.label, price: String(v.price) }))
            : [{ label: '', price: '' }],
        });
      }
      setCategories(cData.categories || []);
      if (wl?.config?.front_url) setFrontUrl(wl.config.front_url);
    }).finally(() => setLoading(false));
  }, [id]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  async function handleSave(data: any) {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/products/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erreur serveur');
      }
      setProduct((p: any) => ({ ...p, ...data, updated_at: new Date().toISOString() }));
      say(t('msgEnregistre'));
    } catch (e: any) {
      say(e.message || 'Enregistrement impossible');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm(t('msgConfirmDel'))) return;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.push('/admin/produits');
    } catch {
      say(t('msgSupprKo'));
      setDeleting(false);
    }
  }

  if (loading) return <div className="sc-empty">{tc('loading')}</div>;
  if (!product) return <div className="sc-empty">{t('introuvable')}</div>;

  const category = categories.find(c => c.id === product.category_id);
  const statusText = status === 'pending' ? 'Modifications en attente…'
    : status === 'saving' ? 'Enregistrement…'
    : status === 'saved' ? 'Enregistré'
    : product.updated_at ? `Modifié ${since(product.updated_at)}` : '';
  const apercuUrl = `${frontUrl}/produit.html?id=${id}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FP_CSS }} />
      {/* ── En-tête collant ─────────────────────────────── */}
      <div className="sc-page-head sc-page-head-tabs">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/admin/produits" className="sc-iconbtn sc-back" aria-label={t('retourProduits')}>
            <span className="ms">arrow_back</span>
          </Link>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="fp-crumb">
              Produits{category ? ` · ${category.name_fr}` : ''}
            </div>
            <div className="fp-name">
              {product.name_fr || 'Sans nom'}
            </div>
          </div>
          <span className="sc-hide-mobile" style={{ fontSize: 11, color: status ? T.green : T.muted }}>
            {statusText}
          </span>
          <div className="sc-actions sc-hide-mobile">
            <button className="sc-btn sc-btn-danger" onClick={handleDelete} disabled={deleting}>
              <span className="ms">delete</span>{deleting ? '…' : 'Supprimer'}
            </button>
            <a className="sc-btn sc-btn-secondary" href={apercuUrl} target="_blank" rel="noopener">
              <span className="ms">visibility</span>{t('apercu')}
            </a>
            <button className="sc-btn sc-btn-green" form="product-form" type="submit" disabled={saving}>
              <span className="ms">save</span>{saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
          {/* Téléphone : Aperçu et Supprimer passent dans « ⋯ » ; Enregistrer
              est en bas, sous le pouce. */}
          <button ref={moreBtn} type="button" className="sc-iconbtn sc-only-mobile-flex" onClick={() => setMore(true)}
                  aria-label="Plus d’actions" aria-haspopup="menu" aria-expanded={more} style={{ border: `1px solid ${T.borderField}` }}>
            <span className="ms">more_horiz</span>
          </button>
        </div>

        {/* Onglets */}
        <div className="sc-tabstrip" role="tablist">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                    className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ paddingTop: 14 }}>
        <ProductForm
          formId="product-form"
          initialData={product}
          categories={categories}
          onSave={handleSave}
          saving={saving}
          toast={toast}
          autoSave
          tab={tab}
          hideSubmit
          onStatus={setStatus}
        />
      </div>

      {/* Téléphone : enregistrement à portée de pouce, avec l'état de
          l'enregistrement automatique. */}
      <div className="sc-sticky-actions sc-only-mobile-flex" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: status ? T.green : T.muted, lineHeight: 1.3 }}>
          {statusText}
        </span>
        <button className="sc-btn sc-btn-green" form="product-form" type="submit" disabled={saving}
                style={{ flex: '0 0 auto', minWidth: 160, justifyContent: 'center' }}>
          <span className="ms">save</span>{saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <MenuActions open={more} anchor={moreBtn.current} onClose={() => setMore(false)} title={product.name_fr}>
        <MenuItem icon="visibility" label={t('apercu')} hint="Ouvre la fiche sur le site" href={apercuUrl} external />
        <MenuSep />
        <MenuItem icon="delete" label={deleting ? '…' : 'Supprimer le produit'} danger onClick={handleDelete} disabled={deleting} />
      </MenuActions>

      {toast && <div className="sc-toast" role="status">{toast}</div>}
    </>
  );
}
