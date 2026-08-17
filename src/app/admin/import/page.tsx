'use client';
import { useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TIM, ajouteAuCatalogue } from './i18n';

type Category = { id: string; name_fr: string; slug: string };

const LANGS: Array<{ code: 'fr' | 'sv' | 'en'; label: string }> = [
  { code: 'fr', label: 'Français' },
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
];
const isWebpUrl = (u: string) => /\.webp(\?|$)/i.test(u);

export default function ImportPage() {
  const { t, tc, lang: langUi } = useT(TIM);
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

  /* Certaines URLs d'images renvoient 404 : on bascule silencieusement sur la suivante. */
  function handleMainImgError() {
    if (!product?.image_urls) return;
    const urls: string[] = product.image_urls;
    const currentIdx = urls.indexOf(selectedImg);
    const next = urls.slice(currentIdx + 1).find((u: string) => u !== selectedImg);
    if (next) setSelectedImg(next);
  }

  async function analyse() {
    if (!url.trim()) return;
    setLoading(true); setError(''); setProduct(null);
    try {
      const res = await adminFetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        weight: product.weight ? product.weight.replace(/^\d+\s*[xX×]\s*/, '').trim() || null : null,
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
      const res = await adminFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      showToast(ajouteAuCatalogue(product.name_fr, langUi));
      setProduct(null); setUrl('');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  const p = product;
  const nutri = p?.nutrition || {};

  const css = `
    .im-grid { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:12px; align-items:start; }
    @media (max-width: 1000px) { .im-grid { grid-template-columns:1fr; } }
    .im-card { background:#fff; border:1px solid ${T.border}; border-radius:10px; overflow:hidden; }
    .im-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 15px; border-bottom:1px solid ${T.border}; }
    .im-head-title { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; color:${T.ink}; }
    .im-body { padding:14px 15px; display:flex; flex-direction:column; gap:12px; }
    .im-label { display:block; font-size:11px; font-weight:600; color:${T.text2b}; margin-bottom:5px; }
    .im-row { display:grid; gap:10px; }
    .im-hint { font-size:10.5px; color:${T.muted}; margin-top:4px; line-height:1.45; }
    .im-eyebrow { font-size:9.5px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:${T.muted}; margin-bottom:7px; }
    .im-lang { display:flex; gap:4px; border-bottom:1px solid ${T.border}; margin-bottom:12px; }
    .im-lang button { border:none; background:none; cursor:pointer; padding:9px 14px; font-size:12.5px; color:${T.text2}; font-family:inherit; }
    .im-lang button.active { color:var(--accent); font-weight:600; box-shadow:inset 0 -2px 0 var(--accent); }
    .im-thumb { position:relative; width:62px; height:62px; border-radius:7px; background:${T.surfaceAlt}; flex-shrink:0; border:1.5px solid ${T.border}; }
    .im-thumb.sel { border-color:var(--accent); }
    .im-nutri { width:100%; border-collapse:collapse; font-size:12.5px; }
    .im-nutri td { padding:6px 0; border-bottom:1px solid ${T.borderFaint}; color:${T.text2b}; }
    .im-nutri tr:last-child td { border-bottom:none; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.2px', color: T.ink }}>{t('titre')}</div>
          <div style={{ fontSize: 11.5, color: T.text3, marginTop: 2 }}>
            Colle un lien produit : la fiche est extraite et traduite, tu valides avant publication.
          </div>
        </div>
      </div>

      {/* Barre d'analyse */}
      <div className="im-card" style={{ marginBottom: 12 }}>
        <div className="im-body" style={{ gap: 9 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 0 }}>
              <span className="ms" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 17, color: T.muted }}>link</span>
              <input className="sc-input" style={{ width: '100%', paddingLeft: 32 }}
                     placeholder="https://www.estrella.se/produkter/hot-holiday-dippmix/"
                     value={url} onChange={e => setUrl(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && analyse()} />
            </div>
            <button className="sc-btn sc-btn-primary" onClick={analyse} disabled={loading || !url.trim()}
                    style={{ whiteSpace: 'nowrap' }}>
              <span className="ms">auto_awesome</span>{loading ? 'Analyse…' : 'Analyser la page'}
            </button>
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, background: '#FBE7E4',
              border: '1px solid #EBD5D1', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#8C3A2E',
            }}>
              <span className="ms" style={{ fontSize: 17 }}>error</span>{error}
            </div>
          )}

          <div className="im-hint">
            Compatible Estrella, ICA, Waitrose, M&amp;S, Ankorstore et la plupart des sites e-commerce.
          </div>
        </div>
      </div>

      {loading && (
        <div className="im-card">
          <div style={{ padding: '54px 20px', textAlign: 'center' }}>
            <span className="ms" style={{ fontSize: 34, color: T.borderField, display: 'block', marginBottom: 10 }}>auto_awesome</span>
            <div style={{ fontSize: 13, color: T.text2b }}>{t('analyse')}</div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>
              Extraction, traduction FR / SV / EN, détection des allergènes et de la nutrition
            </div>
          </div>
        </div>
      )}

      {p && !loading && (
        <>
          {/* Langue d'édition — les 3 versions sont enregistrées ensemble */}
          <div className="im-lang">
            {LANGS.map(l => (
              <button key={l.code} className={lang === l.code ? 'active' : ''} onClick={() => setLang(l.code)}>
                {l.label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11, color: T.muted }}>
              Les trois langues sont enregistrées ensemble
            </span>
          </div>

          <div className="im-grid">
            {/* ── Colonne principale ─────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

              <div className="im-card">
                <div className="im-head"><span className="im-head-title"><span className="ms" style={{ fontSize: 17, color: T.muted }}>badge</span>{t('identite')}</span></div>
                <div className="im-body">
                  <div className="im-row" style={{ gridTemplateColumns: '58px minmax(0,1fr) minmax(0,1fr)', alignItems: 'end' }}>
                    <div>
                      <label className="im-label">{t('emoji')}</label>
                      <input className="sc-input" style={{ width: '100%', textAlign: 'center', fontSize: 18, padding: 0 }}
                             value={p.emoji || ''} onChange={e => setProduct({ ...p, emoji: e.target.value })} />
                    </div>
                    <div>
                      <label className="im-label">Nom</label>
                      <input className="sc-input" style={{ width: '100%' }} value={get('name')} onChange={e => set('name', e.target.value)} />
                    </div>
                    <div>
                      <label className="im-label">{t('marque')}</label>
                      <input className="sc-input" style={{ width: '100%' }} value={p.brand || ''} onChange={e => setProduct({ ...p, brand: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <label className="im-label">{t('accroche')}</label>
                    <input className="sc-input" style={{ width: '100%' }} value={get('subtitle')} onChange={e => set('subtitle', e.target.value)} />
                  </div>

                  <div>
                    <label className="im-label">{t('description')}</label>
                    <textarea className="sc-input" rows={4} style={{ width: '100%', height: 'auto', padding: '8px 10px', lineHeight: 1.5, resize: 'vertical' }}
                              value={get('desc')} onChange={e => set('desc', e.target.value)} />
                  </div>

                  <div className="im-row" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
                    <div>
                      <label className="im-label">{t('prixVente')}</label>
                      <input className="sc-input sc-num" type="number" step="0.01" style={{ width: '100%' }}
                             value={p.price || 0} onChange={e => setProduct({ ...p, price: parseFloat(e.target.value) })} />
                    </div>
                    <div>
                      <label className="im-label">{t('poidsFormat')}</label>
                      <input className="sc-input" style={{ width: '100%' }} placeholder="24 g, 250 ml…"
                             value={p.weight || ''} onChange={e => setProduct({ ...p, weight: e.target.value })} />
                    </div>
                    <div>
                      <label className="im-label">{t('origine')}</label>
                      <input className="sc-input" style={{ width: '100%' }} value={get('origin')} onChange={e => set('origin', e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="im-label">{t('categorie')}</label>
                    <select className="sc-input" style={{ width: '100%' }} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                      <option value="">— Choisir une catégorie —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="im-card">
                <div className="im-head"><span className="im-head-title"><span className="ms" style={{ fontSize: 17, color: T.muted }}>science</span>{t('ingredientsAllergenes')}</span></div>
                <div className="im-body">
                  <div>
                    <label className="im-label">{t('ingredients')}</label>
                    <textarea className="sc-input" rows={4} style={{ width: '100%', height: 'auto', padding: '8px 10px', lineHeight: 1.5, resize: 'vertical' }}
                              value={get('ingredients')} onChange={e => set('ingredients', e.target.value)}
                              placeholder={t('phIngredients')} />
                  </div>
                  <div>
                    <label className="im-label">{t('allergenes')}</label>
                    <input className="sc-input" style={{ width: '100%' }} value={get('allergens')} onChange={e => set('allergens', e.target.value)}
                           placeholder={t('phAllergenes')} />
                  </div>
                  {p.labels?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.labels.map((l: string) => (
                        <span key={l} className="sc-chip">{l}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="im-card">
                <div className="im-head"><span className="im-head-title"><span className="ms" style={{ fontSize: 17, color: T.muted }}>package_2</span>{t('conservationUtil')}</span></div>
                <div className="im-body">
                  <div>
                    <label className="im-label">{t('conservation')}</label>
                    <input className="sc-input" style={{ width: '100%' }} value={get('storage')} onChange={e => set('storage', e.target.value)}
                           placeholder={t('phConservation')} />
                  </div>
                  <div>
                    <label className="im-label">{t('suggestions')}</label>
                    <textarea className="sc-input" rows={3} style={{ width: '100%', height: 'auto', padding: '8px 10px', lineHeight: 1.5, resize: 'vertical' }}
                              value={get('usage')} onChange={e => set('usage', e.target.value)}
                              placeholder={t('phSuggestions')} />
                  </div>
                </div>
              </div>

              {Object.values(nutri).some((v: any) => v) && (
                <div className="im-card">
                  <div className="im-head">
                    <span className="im-head-title"><span className="ms" style={{ fontSize: 17, color: T.muted }}>monitoring</span>{t('nutrition')}</span>
                    {nutri.portion && <span style={{ fontSize: 11, color: T.muted }}>pour {nutri.portion}</span>}
                  </div>
                  <div className="im-body">
                    <table className="im-nutri">
                      <tbody>
                        {[
                          ['Énergie', nutri.energie], ['Matières grasses', nutri.graisses],
                          ['dont saturées', nutri.dont_satures], ['Glucides', nutri.glucides],
                          ['dont sucres', nutri.dont_sucres], ['Fibres', nutri.fibres],
                          ['Protéines', nutri.proteines], ['Sel', nutri.sel],
                        ].filter(([, v]) => v).map(([label, val]) => (
                          <tr key={label as string}>
                            <td>{label}</td>
                            <td className="sc-num" style={{ textAlign: 'right', fontWeight: 600, color: T.ink }}>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="im-card">
                <div className="im-body" style={{ flexDirection: 'row', gap: 26, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.text2b, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!p.is_new} onChange={e => setProduct({ ...p, is_new: e.target.checked })}
                           style={{ accentColor: 'var(--accent)' }} />
                    Marquer comme nouveauté
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.text2b, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!p.is_bestseller} onChange={e => setProduct({ ...p, is_bestseller: e.target.checked })}
                           style={{ accentColor: 'var(--accent)' }} />
                    Marquer comme best-seller
                  </label>
                </div>
              </div>
            </div>

            {/* ── Colonne latérale : images + validation ─────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div className="im-card">
                <div className="im-head"><span className="im-head-title"><span className="ms" style={{ fontSize: 17, color: T.muted }}>image</span>{t('images')}</span></div>
                <div className="im-body">
                  <div>
                    <div className="im-eyebrow">{t('imagePrincipale')}</div>
                    <div style={{
                      background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12,
                      minHeight: 138, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                    }}>
                      {selectedImg
                        ? <img src={selectedImg} alt="" onError={handleMainImgError}
                               style={{ maxHeight: 130, maxWidth: '100%', objectFit: 'contain' }} />
                        : <span style={{ fontSize: 12, color: T.muted }}>{t('aucuneImage')}</span>}
                    </div>
                    <input className="sc-input" placeholder="https://…" value={selectedImg}
                           onChange={e => setSelectedImg(e.target.value)}
                           style={{ width: '100%', fontSize: 11.5, borderColor: isWebpUrl(selectedImg) ? '#D08A3E' : undefined }} />
                    {isWebpUrl(selectedImg) && (
                      <div className="im-hint" style={{ color: '#8A5B08' }}>
                        Image WebP — le CDN peut la recadrer au carré. Choisis une autre vignette si possible.
                      </div>
                    )}
                  </div>

                  {p.image_urls?.length > 0 && (
                    <div>
                      <div className="im-eyebrow">{t('imagesTrouvees')}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {p.image_urls.slice(0, 12).map((u: string, i: number) => (
                          <div key={i} className={`im-thumb${selectedImg === u ? ' sel' : ''}`}>
                            <img src={u} alt="" onClick={() => setSelectedImg(u)}
                                 style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer', borderRadius: 5 }}
                                 onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                            {isWebpUrl(u) && (
                              <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(138,91,8,.78)',
                                fontSize: 7, letterSpacing: .4, color: '#fff', textAlign: 'center', pointerEvents: 'none',
                              }}>WEBP</div>
                            )}
                            {selectedImg === u ? (
                              <span className="ms" style={{
                                position: 'absolute', top: -7, right: -7, fontSize: 16, color: '#fff',
                                background: 'var(--accent)', borderRadius: '50%', padding: 1,
                              }}>star</span>
                            ) : (
                              <input type="checkbox" checked={extraImgs.has(u)} title={t('ajouterGalerie')}
                                     onChange={() => setExtraImgs(prev => {
                                       const next = new Set(prev);
                                       if (next.has(u)) next.delete(u); else next.add(u);
                                       return next;
                                     })}
                                     style={{ position: 'absolute', top: -6, right: -6, width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="im-hint">
                        Clic sur une vignette = image principale · case cochée = ajoutée à la galerie
                        {extraImgs.size > 0 ? ` (${extraImgs.size})` : ''}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="im-card">
                <div style={{ padding: '11px 15px' }}>
                  <div className="im-eyebrow" style={{ marginBottom: 4 }}>{t('source')}</div>
                  <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                     style={{ fontSize: 11, color: 'var(--accent)', wordBreak: 'break-all', textDecoration: 'none' }}>
                    {p.source_url}
                  </a>
                </div>
              </div>

              <button className="sc-btn sc-btn-primary" onClick={addToShop} disabled={saving}
                      style={{ justifyContent: 'center', padding: '11px 18px' }}>
                <span className="ms">check_circle</span>{saving ? 'Ajout en cours…' : 'Ajouter au catalogue'}
              </button>
              <button className="sc-btn sc-btn-secondary" onClick={() => { setProduct(null); setUrl(''); }}
                      style={{ justifyContent: 'center' }}>
                Annuler
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff',
          padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300,
        }}>{toast}</div>
      )}
    </>
  );
}
