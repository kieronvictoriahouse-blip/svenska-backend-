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
  discount_type?: string | null; discount_value?: number | string | null;
  discount_start?: string | null; discount_end?: string | null;
};

const slugify = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const dayISO = () => new Date().toISOString().slice(0, 10);
/** Une promo de catégorie est-elle active AUJOURD'HUI ? (miroir de isDiscountActive) */
function promoActive(c: Category): boolean {
  const t = c.discount_type; const v = Number(c.discount_value);
  if ((t !== 'percent' && t !== 'fixed') || !(v > 0)) return false;
  const s = (c.discount_start || '').slice(0, 10); const e = (c.discount_end || '').slice(0, 10);
  const today = dayISO();
  if (s && today < s) return false;
  if (e && today > e) return false;
  return true;
}
/** Libellé court de la remise : « -10 % » ou « -1,50 € », ou null si aucune. */
function promoLabel(c: Category): string | null {
  const v = Number(c.discount_value);
  if ((c.discount_type !== 'percent' && c.discount_type !== 'fixed') || !(v > 0)) return null;
  return c.discount_type === 'percent'
    ? `-${v % 1 === 0 ? v : v.toFixed(2)} %`
    : `-${v.toFixed(2).replace('.', ',')} €`;
}

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
  const [promo, setPromo] = useState<Category | null>(null);   // catégorie en cours d'édition de promo

  async function savePromo() {
    if (!promo) return;
    const type = promo.discount_type === 'percent' || promo.discount_type === 'fixed' ? promo.discount_type : null;
    const val = Number(promo.discount_value);
    const payload = type && val > 0
      ? { discount_type: type, discount_value: val, discount_start: promo.discount_start || null, discount_end: promo.discount_end || null }
      : { discount_type: null, discount_value: null, discount_start: null, discount_end: null };
    await patch(promo.id, payload as Partial<Category>);
    setPromo(null);
    say(payload.discount_type ? 'Promo enregistrée' : 'Promo retirée');
  }
  async function clearPromo(c: Category) {
    await patch(c.id, { discount_type: null, discount_value: null, discount_start: null, discount_end: null } as Partial<Category>);
    say('Promo retirée');
  }

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
            <table className="sc-table" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>{t('categorie')}</th>
                  <th style={{ width: 150 }}>{t('nomSv')}</th>
                  <th style={{ width: 160 }}>URL</th>
                  <th style={{ width: 80 }}>{tc('products')}</th>
                  <th style={{ width: 120 }}>Promo</th>
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
                      {promoLabel(c) ? (
                        <button
                          onClick={() => setPromo({ ...c, discount_start: (c.discount_start || '').slice(0, 10), discount_end: (c.discount_end || '').slice(0, 10) })}
                          title={promoActive(c) ? 'Promo active — cliquer pour modifier' : 'Promo programmée ou terminée — cliquer pour modifier'}
                          style={{
                            border: 'none', cursor: 'pointer', padding: '3px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700,
                            background: promoActive(c) ? '#E7F0E4' : '#F1ECE2', color: promoActive(c) ? '#3D6B3A' : '#9A8F7F',
                          }}>
                          {promoLabel(c)}{promoActive(c) ? '' : ' •'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setPromo({ ...c, discount_type: 'percent', discount_value: '' as any, discount_start: '', discount_end: '' })}
                          style={{ border: '1px dashed #CDBFA6', background: 'transparent', cursor: 'pointer', padding: '3px 9px', borderRadius: 9, fontSize: 11, color: '#9A8F7F' }}>
                          + Promo
                        </button>
                      )}
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

      {promo && (
        <div onClick={() => setPromo(null)}
             style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,22,.38)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="sc-card" style={{ width: 'min(440px,100%)', padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 2 }}>Promo — {promo.name_fr}</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
              S’applique à tous les produits de cette catégorie. Une remise posée sur un produit précis reste prioritaire.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="sc-label">Type</label>
                <select className="sc-input" value={promo.discount_type || 'percent'}
                        onChange={e => setPromo(p => p && ({ ...p, discount_type: e.target.value }))}>
                  <option value="percent">Pourcentage (%)</option>
                  <option value="fixed">Montant fixe (€)</option>
                </select>
              </div>
              <div>
                <label className="sc-label">{promo.discount_type === 'fixed' ? 'Montant (€)' : 'Remise (%)'}</label>
                <input className="sc-input sc-num" type="number" min={0} step={promo.discount_type === 'fixed' ? '0.01' : '1'}
                       value={promo.discount_value ?? ''}
                       onChange={e => setPromo(p => p && ({ ...p, discount_value: e.target.value }))}
                       placeholder={promo.discount_type === 'fixed' ? '1,50' : '10'} />
              </div>
              <div>
                <label className="sc-label">Début (optionnel)</label>
                <input className="sc-input" type="date" value={promo.discount_start || ''}
                       onChange={e => setPromo(p => p && ({ ...p, discount_start: e.target.value }))} />
              </div>
              <div>
                <label className="sc-label">Fin (optionnel)</label>
                <input className="sc-input" type="date" value={promo.discount_end || ''}
                       onChange={e => setPromo(p => p && ({ ...p, discount_end: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
              <button type="button" className="sc-btn sc-btn-secondary"
                      onClick={() => { const c = promo; setPromo(null); if (promoLabel(c)) clearPromo(c); }}>
                Retirer la promo
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="sc-btn sc-btn-secondary" onClick={() => setPromo(null)}>Annuler</button>
                <button type="button" className="sc-btn sc-btn-green" onClick={savePromo}>
                  <span className="ms">save</span>Enregistrer
                </button>
              </div>
            </div>
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
