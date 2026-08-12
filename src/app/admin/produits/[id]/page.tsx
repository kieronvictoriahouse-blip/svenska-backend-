'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import ProductForm, { ProductTab } from '@/components/ProductForm';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';

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
  const [frontUrl, setFrontUrl] = useState('https://www.swedishcravings.fr');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      adminFetch(`/api/products/${id}`).then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/white-label').then(r => r.json()).catch(() => ({})),
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
      say('Produit enregistré');
    } catch (e: any) {
      say(e.message || 'Enregistrement impossible');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm('Supprimer définitivement ce produit ? Cette action est irréversible.')) return;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.push('/admin/produits');
    } catch {
      say('Suppression impossible');
      setDeleting(false);
    }
  }

  if (loading) return <div className="sc-empty">Chargement…</div>;
  if (!product) return <div className="sc-empty">Produit introuvable.</div>;

  const category = categories.find(c => c.id === product.category_id);

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
                style={{ width: 30, height: 30, border: `1px solid ${T.borderField}` }} aria-label="Retour aux produits">
            <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          </Link>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10.5, color: T.muted }}>
              Produits{category ? ` · ${category.name_fr}` : ''}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {product.name_fr || 'Sans nom'}
            </div>
          </div>
          <span style={{ fontSize: 11, color: status ? T.green : T.muted }}>
            {status === 'pending' ? 'Modifications en attente…'
              : status === 'saving' ? 'Enregistrement…'
              : status === 'saved' ? 'Enregistré'
              : product.updated_at ? `Modifié ${since(product.updated_at)}` : ''}
          </span>
          <div className="sc-actions">
            <button className="sc-btn sc-btn-danger" onClick={handleDelete} disabled={deleting}>
              <span className="ms">delete</span>{deleting ? '…' : 'Supprimer'}
            </button>
            <a className="sc-btn sc-btn-secondary" href={`${frontUrl}/produit.html?id=${id}`} target="_blank" rel="noopener">
              <span className="ms">visibility</span>Aperçu
            </a>
            <button className="sc-btn sc-btn-green" form="product-form" type="submit" disabled={saving}>
              <span className="ms">save</span>{saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto' }}>
          {TABS.map(t => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  padding: '8px 12px', fontSize: 12.5, whiteSpace: 'nowrap',
                  fontWeight: on ? 600 : 400,
                  color: on ? 'var(--accent)' : T.text2,
                  boxShadow: on ? 'inset 0 -2px 0 var(--accent)' : undefined,
                }}>
                {t.label}
              </button>
            );
          })}
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

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 120 }}>
          {toast}
        </div>
      )}
    </>
  );
}
