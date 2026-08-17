'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProductForm, { ProductTab } from '@/components/ProductForm';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TNP } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   CRÉATION D'ARTICLE
   Même châssis que la fiche produit (en-tête collant + onglets
   collants), avec le formulaire complet à 4 onglets.
   Un EAN passé en query (?ean=…) pré-remplit le code-barres :
   c'est le chemin « Créer par scan » depuis la liste produits.
   ═══════════════════════════════════════════════════════════════ */

const TABS: Array<{ id: ProductTab; label: string }> = [
  { id: 'general', label: 'Général' },
  { id: 'prix',    label: 'Prix & stock' },
  { id: 'photos',  label: 'Photos' },
  { id: 'seo',     label: 'SEO & traductions' },
];

export default function NouveauProduitPage() {
  const { t, tc, lang } = useT(TNP);
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState<ProductTab>('general');
  const [initial, setInitial] = useState<any>(null);
  const [ready, setReady] = useState(false);

  const [ean, setEan] = useState('');

  useEffect(() => {
    adminFetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []));
  }, []);

  /* La query est lue côté client : useSearchParams() forcerait cette page hors
     du prérendu statique et exigerait une frontière Suspense.
     Arrivée depuis le scanner : Open Food Facts pré-remplit ce qu'il peut, sans
     jamais bloquer la création. Le formulaire n'est monté qu'une fois la
     réponse connue — ProductForm ne lit initialData qu'au montage. */
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ean') || '';
    setEan(code);
    if (!code) { setReady(true); return; }
    adminFetch(`/api/scan?ean=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => {
        // Déjà au catalogue : on ouvre la fiche au lieu de créer un doublon.
        if (d.found && d.product?.id) { router.replace(`/admin/produits/${d.product.id}`); return; }
        const s = d.suggestion || {};
        setInitial({
          ean: code,
          name_fr: s.name || '',
          brand: s.brand || '',
          weight: s.weight || '',
          image_url: s.image_url || '',
          ingredients_fr: s.ingredients || '',
          allergens_fr: s.allergens || '',
        });
      })
      .catch(() => setInitial({ ean: code }))
      .finally(() => setReady(true));
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleSave(data: any) {
    setSaving(true);
    try {
      const res = await adminFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { showToast(t('msgErreur') + (json.error || 'inconnue')); return; }
      showToast(t('msgCree'));
      setTimeout(() => router.push('/admin/produits'), 1000);
    } catch {
      showToast(t('msgReseau'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* ── En-tête collant ─────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: '#fff',
        margin: '-16px -18px 0', padding: '10px 18px 0',
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/admin/produits" className="sc-iconbtn"
                style={{ width: 30, height: 30, border: `1px solid ${T.borderField}` }} aria-label={t('retourProduits')}>
            <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          </Link>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10.5, color: T.muted }}>{t('produits')}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>{t('titre')}</div>
          </div>
          {ean && (
            <span className="sc-badge sc-num" style={{ background: '#F3EDF3', color: '#5E3B5E' }}>
              EAN {ean}
            </span>
          )}
          <span style={{ fontSize: 11, color: T.muted }}>FR / SV / EN</span>
          <div className="sc-actions">
            <Link href="/admin/produits" className="sc-btn sc-btn-secondary">{tc('cancel')}</Link>
            <button className="sc-btn sc-btn-green" form="product-form" type="submit" disabled={saving}>
              <span className="ms">save</span>{saving ? 'Création…' : 'Créer le produit'}
            </button>
          </div>
        </div>

        {/* ── Onglets collants ──────────────────────────── */}
        <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      padding: '9px 13px', fontSize: 12.5,
                      color: tab === t.id ? 'var(--accent)' : T.text2,
                      fontWeight: tab === t.id ? 600 : 400,
                      boxShadow: tab === t.id ? 'inset 0 -2px 0 var(--accent)' : 'none',
                    }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ paddingTop: 14 }}>
        {!ready ? (
          <div className="sc-empty">{t('lectureCode')}</div>
        ) : (
          <ProductForm
            initialData={initial || undefined}
            categories={categories}
            onSave={handleSave}
            saving={saving}
            toast={toast}
            tab={tab}
            hideSubmit
            formId="product-form"
          />
        )}
      </div>
    </>
  );
}
