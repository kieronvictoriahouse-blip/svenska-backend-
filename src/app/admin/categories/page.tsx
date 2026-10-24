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
    /* Refus (ex. 150 %) : la fenêtre reste ouverte avec le message du
       serveur, au lieu de se fermer sur « Promo enregistrée ». */
    if (!await patch(promo.id, payload as Partial<Category>)) return;
    setPromo(null);
    say(payload.discount_type ? 'Promo enregistrée' : 'Promo retirée');
  }
  async function clearPromo(c: Category) {
    if (await patch(c.id, { discount_type: null, discount_value: null, discount_start: null, discount_end: null } as Partial<Category>)) {
      say('Promo retirée');
    }
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

  /** Écrit puis confirme ; renvoie false (et recharge l'état réel) si refusé. */
  async function patch(id: string, payload: Partial<Category>): Promise<boolean> {
    setCats(cs => cs.map(c => c.id === id ? { ...c, ...payload } as Category : c));
    const res = await adminFetch(`/api/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      say(d.error || t('msgEnregKo'));
      load();
      return false;
    }
    return true;
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
    reorder(drag, targetId);
    setDrag(null);
  }

  /* Téléphone : le glisser-déposer HTML ne marche pas au doigt. Les
     flèches ↑ ↓ font le même déplacement, avec la même persistance. */
  function moveBy(id: string, delta: number) {
    const i = cats.findIndex(c => c.id === id);
    const target = cats[i + delta];
    if (i < 0 || !target) return;
    reorder(id, target.id);
  }

  function reorder(fromId: string, targetId: string) {
    const from = cats.findIndex(c => c.id === fromId);
    const to = cats.findIndex(c => c.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...cats];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setCats(next.map((c, i) => ({ ...c, sort_order: i })));
    /* Persistance : uniquement les lignes dont l'ordre a réellement changé.
       Les réponses sont vérifiées : un échec annonçait quand même « ordre
       enregistré », et le rayon reprenait sa place au rechargement. */
    const changes = next.map((c, i) => ({ c, i })).filter(({ c, i }) => c.sort_order !== i);
    Promise.all(changes.map(({ c, i }) =>
      adminFetch(`/api/categories/${c.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: i }),
      }).then(r => r.ok).catch(() => false)))
      .then(oks => {
        if (oks.every(Boolean)) say(t('msgOrdre'));
        else { say(t('msgEnregKo')); load(); }
      });
  }

  /* Téléphone : le tableau (800 px de large) devient une carte par
     catégorie ; l'ordre se change avec ↑ ↓ ; la fenêtre promo passe en
     plein écran. */
  const css = `
    .ca-count { min-width: 22px; height: 18px; padding: 0 7px; border-radius: 9px; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; background: #EFEBE4; color: #857C71; }
    .ca-promo { cursor: pointer; padding: 3px 9px; border-radius: 9px; font-size: 11px; }
    .ca-name { border: none; background: none; cursor: text; font-size: 13px; font-weight: 500; color: ${T.ink}; padding: 0; text-align: left; }
    @media (min-width: 900px) {
      .ca-table { min-width: 800px; }
      .ca-rename { height: 28px; }
    }
    @media (max-width: 899px) {
      .ca-count { height: 24px; min-width: 28px; font-size: 12.5px; border-radius: 12px; }
      .ca-promo { min-height: 36px; padding: 6px 12px; font-size: 13px; border-radius: 10px; }
      .ca-name { font-size: 15.5px; font-weight: 600; min-height: 40px; overflow-wrap: anywhere; flex: 1; }
      .sc-table.sc-stack td.ca-main { display: flex; align-items: center; gap: 10px; }
      .sc-table.sc-stack td.sc-stack-actions { gap: 8px; }
      /* Carte compacte : les champs vont deux par deux, libellé au-dessus */
      .sc-table.sc-stack.ca-table tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
      .sc-table.sc-stack.ca-table td { flex-direction: column; align-items: flex-start; justify-content: flex-start; text-align: left; gap: 5px; padding: 0; }
      .sc-table.sc-stack.ca-table td.sc-stack-main, .sc-table.sc-stack.ca-table td.sc-stack-actions { grid-column: 1 / -1; }
      .sc-table.sc-stack.ca-table td.sc-stack-actions { flex-direction: row; align-items: center; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            {cats.length} catégorie{cats.length > 1 ? 's' : ''}
            <span className="sc-hide-mobile"> · glisse une ligne pour changer l’ordre en boutique</span>
            <span className="sc-only-mobile"> · ↑ ↓ pour changer l’ordre en boutique</span>
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
            <table className="sc-table sc-stack ca-table">
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
                {cats.map((c, i) => (
                  <tr key={c.id}
                      draggable
                      onDragStart={() => setDrag(c.id)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => onDrop(c.id)}
                      style={{ opacity: drag === c.id ? .45 : 1, cursor: 'grab' }}>
                    <td className="sc-hide-mobile"><span className="ms" style={{ fontSize: 17, color: T.muted3 }}>drag_indicator</span></td>
                    <td className="sc-stack-main ca-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <div style={thumbStyle(c.name_fr, 28)}>{c.emoji || initials(c.name_fr, 1)}</div>
                        {editing?.id === c.id ? (
                          <input className="sc-input ca-rename" autoFocus defaultValue={c.name_fr}
                                 aria-label={t('nomFr')}
                                 onBlur={e => {
                                   // Nom vidé ou inchangé : rien à écrire (un rayon sans nom s'affichait vide en boutique).
                                   const v = e.target.value.trim();
                                   if (v && v !== c.name_fr) patch(c.id, { name_fr: v });
                                   setEditing(null);
                                 }}
                                 onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                        ) : (
                          <button className="ca-name" onClick={() => setEditing(c)} title="Renommer">
                            {c.name_fr}
                          </button>
                        )}
                      </div>
                    </td>
                    <td data-label={t('nomSv')} style={{ color: T.text2b }}>{c.name_sv || '—'}</td>
                    <td data-label="URL" className="sc-num" style={{ fontSize: 11.5, color: T.muted, overflowWrap: 'anywhere' }}>/{c.slug}</td>
                    <td data-label={tc('products')}>
                      <span className="ca-count">{counts[c.id] || 0}</span>
                    </td>
                    <td data-label="Promo">
                      {promoLabel(c) ? (
                        <button
                          className="ca-promo"
                          onClick={() => setPromo({ ...c, discount_start: (c.discount_start || '').slice(0, 10), discount_end: (c.discount_end || '').slice(0, 10) })}
                          title={promoActive(c) ? 'Promo active — cliquer pour modifier' : 'Promo programmée ou terminée — cliquer pour modifier'}
                          style={{
                            border: 'none', fontWeight: 700,
                            background: promoActive(c) ? '#E7F0E4' : '#F1ECE2', color: promoActive(c) ? '#3D6B3A' : '#9A8F7F',
                          }}>
                          {promoLabel(c)}{promoActive(c) ? '' : ' •'}
                        </button>
                      ) : (
                        <button
                          className="ca-promo"
                          onClick={() => setPromo({ ...c, discount_type: 'percent', discount_value: '' as any, discount_start: '', discount_end: '' })}
                          style={{ border: '1px dashed #CDBFA6', background: 'transparent', color: '#9A8F7F' }}>
                          + Promo
                        </button>
                      )}
                    </td>
                    <td data-label={t('visible')}>
                      <button className="sc-switch" role="switch" aria-checked={c.is_active !== false}
                              onClick={() => patch(c.id, { is_active: !(c.is_active !== false) })}
                              aria-label={`Visibilité de ${c.name_fr}`} />
                    </td>
                    <td className="sc-stack-actions">
                      <button className="sc-iconbtn sc-only-mobile-flex" onClick={() => moveBy(c.id, -1)} disabled={i === 0}
                              aria-label={`Monter ${c.name_fr}`} style={{ border: `1px solid ${T.borderField}` }}>
                        <span className="ms">arrow_upward</span>
                      </button>
                      <button className="sc-iconbtn sc-only-mobile-flex" onClick={() => moveBy(c.id, 1)} disabled={i === cats.length - 1}
                              aria-label={`Descendre ${c.name_fr}`} style={{ border: `1px solid ${T.borderField}` }}>
                        <span className="ms">arrow_downward</span>
                      </button>
                      <span className="sc-only-mobile-flex" style={{ flex: 1 }} />
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
        <div className="sc-modal-back" onClick={() => setPromo(null)} style={{ zIndex: 210 }}>
          <div onClick={e => e.stopPropagation()} className="sc-modal" role="dialog" aria-modal="true" aria-label={`Promo — ${promo.name_fr}`} style={{ maxWidth: 440 }}>
            <div className="sc-modal-head">
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, minWidth: 0 }}>Promo — {promo.name_fr}</div>
              <button type="button" className="sc-iconbtn" onClick={() => setPromo(null)} aria-label={tc('close')}><span className="ms">close</span></button>
            </div>
            <div className="sc-modal-body">
            <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
              S’applique à tous les produits de cette catégorie. Une remise posée sur un produit précis reste prioritaire.
            </div>
            <div className="sc-grid-2">

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
            </div>
            <div className="sc-modal-foot" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button type="button" className="sc-btn sc-btn-secondary"
                      onClick={() => { const c = promo; setPromo(null); if (promoLabel(c)) clearPromo(c); }}>
                Retirer la promo
              </button>
              <div style={{ display: 'flex', gap: 8, flex: '1 1 auto', justifyContent: 'flex-end' }}>
                <button type="button" className="sc-btn sc-btn-secondary" onClick={() => setPromo(null)}>Annuler</button>
                <button type="button" className="sc-btn sc-btn-green" onClick={savePromo}>
                  <span className="ms">save</span>Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="sc-toast" role="status" style={{ zIndex: 220 }}>{toast}</div>}
    </>
  );
}
