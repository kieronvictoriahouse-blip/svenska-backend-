'use client';
import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, thumbStyle, initials } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TCA, confirmerSuppressionCategorie } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 6 — CATÉGORIES
   Handoff §6 : table réordonnable (poignée, vignette + nom, nom SV,
   URL en mono, nombre de produits en pastille, interrupteur de
   visibilité, menu). Le glisser-déposer change réellement l'ordre
   d'affichage en boutique (persisté via sort_order).
   ═══════════════════════════════════════════════════════════════ */

type Category = {
  id: string; slug: string; emoji: string;
  name_sv: string; name_fr: string; name_en: string;
  sort_order: number; is_active: boolean;
};

const slugify = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function CategoriesPage() {
  const { t, tc, lang } = useT(TCA);
  const [cats, setCats] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: '', emoji: '', name_fr: '', name_sv: '', name_en: '' });

  useEffect(() => { load(); }, []);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  async function load() {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        adminFetch('/api/categories').then(r => r.json()).catch(() => ({})),
        adminFetch('/api/products?limit=1000').then(r => r.json()).catch(() => ({})),
      ]);
      const list: Category[] = (c.categories || []).slice()
        .sort((a: Category, b: Category) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setCats(list);
      const n: Record<string, number> = {};
      for (const prod of (p.products || [])) {
        if (prod.category_id) n[prod.category_id] = (n[prod.category_id] || 0) + 1;
      }
      setCounts(n);
    } finally { setLoading(false); }
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await adminFetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          emoji: form.emoji || '',
          name_sv: form.name_sv || form.name_fr,
          name_en: form.name_en || form.name_fr,
          sort_order: cats.length,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur'); }
      say(t('msgCreee'));
      setForm({ slug: '', emoji: '', name_fr: '', name_sv: '', name_en: '' });
      setShowForm(false);
      load();
    } catch (e: any) { say(e.message); }
    finally { setSaving(false); }
  }

  async function patch(id: string, payload: Partial<Category>) {
    setCats(cs => cs.map(c => c.id === id ? { ...c, ...payload } as Category : c));
    const res = await adminFetch(`/api/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { say(t('msgEnregKo')); load(); }
  }

  async function remove(c: Category) {
    if (!window.confirm(confirmerSuppressionCategorie(c.name_fr, lang))) return;
    const res = await adminFetch(`/api/categories/${c.id}`, { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { say(d.error || 'Suppression impossible'); return; }
    setCats(cs => cs.filter(x => x.id !== c.id));
    say(t('msgSupprimee'));
  }

  /* ── Glisser-déposer : réordonne puis persiste les sort_order ── */
  function onDrop(targetId: string) {
    if (!drag || drag === targetId) { setDrag(null); return; }
    const from = cats.findIndex(c => c.id === drag);
    const to = cats.findIndex(c => c.id === targetId);
    if (from < 0 || to < 0) { setDrag(null); return; }
    const next = [...cats];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setCats(next);
    setDrag(null);
    // Persistance : uniquement les lignes dont l'ordre a réellement changé
    next.forEach((c, i) => {
      if (c.sort_order !== i) {
        adminFetch(`/api/categories/${c.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: i }),
        }).catch(() => {});
      }
    });
    say(t('msgOrdre'));
  }

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            {cats.length} catégorie{cats.length > 1 ? 's' : ''} · glisse une ligne pour changer l’ordre en boutique
          </div>
        </div>
        <div className="sc-actions">
          <button className="sc-btn sc-btn-primary" onClick={() => setShowForm(v => !v)}>
            <span className="ms">{showForm ? 'close' : 'add'}</span>{showForm ? 'Annuler' : 'Nouvelle catégorie'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="sc-card" style={{ padding: 15, marginBottom: 12 }} onSubmit={createCategory}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            <div>
              <label className="sc-label">{t('nomFr')}</label>
              <input className="sc-input" required value={form.name_fr}
                     onChange={e => setForm(f => ({ ...f, name_fr: e.target.value, slug: slugify(e.target.value) }))}
                     placeholder="Épices & aromates" />
            </div>
            <div>
              <label className="sc-label">{t('nomSv')}</label>
              <input className="sc-input" value={form.name_sv} onChange={e => setForm(f => ({ ...f, name_sv: e.target.value }))} placeholder="Kryddor" />
            </div>
            <div>
              <label className="sc-label">{t('nomEn')}</label>
              <input className="sc-input" value={form.name_en} onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))} placeholder="Spices" />
            </div>
            <div>
              <label className="sc-label">URL (slug)</label>
              <input className="sc-input sc-num" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" className="sc-btn sc-btn-secondary" onClick={() => setShowForm(false)}>{tc('cancel')}</button>
            <button type="submit" className="sc-btn sc-btn-green" disabled={saving}>
              <span className="ms">save</span>{saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      {loading && <div className="sc-empty">{tc('loading')}</div>}
      {!loading && cats.length === 0 && <div className="sc-empty">{t('aucune')}</div>}

      {!loading && cats.length > 0 && (
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table" style={{ minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>{t('categorie')}</th>
                  <th style={{ width: 150 }}>{t('nomSv')}</th>
                  <th style={{ width: 180 }}>URL</th>
                  <th style={{ width: 90 }}>{tc('products')}</th>
                  <th style={{ width: 90 }}>{t('visible')}</th>
                  <th style={{ width: 50 }} />
                </tr>
              </thead>
              <tbody>
                {cats.map(c => (
                  <tr key={c.id}
                      draggable
                      onDragStart={() => setDrag(c.id)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => onDrop(c.id)}
                      style={{ opacity: drag === c.id ? .45 : 1, cursor: 'grab' }}>
                    <td><span className="ms" style={{ fontSize: 17, color: T.muted3 }}>drag_indicator</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={thumbStyle(c.name_fr, 28)}>{c.emoji || initials(c.name_fr, 1)}</div>
                        {editing?.id === c.id ? (
                          <input className="sc-input" autoFocus defaultValue={c.name_fr}
                                 style={{ height: 28 }}
                                 onBlur={e => { patch(c.id, { name_fr: e.target.value }); setEditing(null); }}
                                 onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                        ) : (
                          <button onClick={() => setEditing(c)}
                                  style={{ border: 'none', background: 'none', cursor: 'text', fontSize: 13, fontWeight: 500, color: T.ink, padding: 0 }}>
                            {c.name_fr}
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ color: T.text2b }}>{c.name_sv || '—'}</td>
                    <td className="sc-num" style={{ fontSize: 11.5, color: T.muted }}>/{c.slug}</td>
                    <td>
                      <span style={{
                        minWidth: 22, height: 18, padding: '0 7px', borderRadius: 9, fontSize: 10.5, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: '#EFEBE4', color: '#857C71',
                      }}>{counts[c.id] || 0}</span>
                    </td>
                    <td>
                      <button className="sc-switch" role="switch" aria-checked={c.is_active !== false}
                              onClick={() => patch(c.id, { is_active: !(c.is_active !== false) })}
                              aria-label={`Visibilité de ${c.name_fr}`} />
                    </td>
                    <td>
                      <button className="sc-iconbtn" onClick={() => remove(c)} aria-label={`Supprimer ${c.name_fr}`}>
                        <span className="ms">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 200 }}>
          {toast}
        </div>
      )}
    </>
  );
}
