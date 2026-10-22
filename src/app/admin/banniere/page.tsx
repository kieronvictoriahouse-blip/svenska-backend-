'use client';
import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, BadgeTone } from '@/lib/admin-theme';
import { useT, formatDate } from '@/lib/admin-i18n';
import { TBA } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   BANNIÈRE D'ACCUEIL — image fixe ou carrousel

   Un seul état publié d'un coup (comme « Textes d'accueil ») : on
   compose, l'aperçu suit, rien ne part sur le site avant « Publier ».
   L'image fixe est la même clé CMS que sur « Textes d'accueil »
   (hero_image) : elle sert aussi de repli quand aucune diapositive
   n'est visible. Données : GET/PUT /api/hero.
   ═══════════════════════════════════════════════════════════════ */

type Kind = 'default' | 'custom' | 'image';
type Lang = 'fr' | 'en' | 'sv';
type Mode = 'image' | 'carousel';
const LANGS: Lang[] = ['fr', 'en', 'sv'];
const TEXTS = ['alt', 'eyebrow', 'title', 'subtitle', 'cta_label'] as const;
const KINDS: Kind[] = ['default', 'custom', 'image'];
const MAX_SLIDES = 12;
const INTERVAL_MIN = 3, INTERVAL_MAX = 20;

type Slide = {
  key: string; id?: string;
  is_active: boolean; kind: Kind;
  image_url: string; image_mobile_url: string; link_url: string;
  starts_on: string; ends_on: string;
  [texte: string]: any;   // `${champ}_${langue}` : title_fr, alt_sv…
};
type State = { mode: Mode; interval: number; image: string; slides: Slide[] };
type HeroDefaults = Record<'eyebrow' | 'title' | 'subtitle' | 'cta1' | 'cta2', Record<Lang, string>>;

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

function fromApi(s: any): Slide {
  const out: Slide = {
    key: s.id || newKey(), id: s.id,
    is_active: s.is_active !== false,
    kind: KINDS.includes(s.kind) ? s.kind : 'default',
    image_url: s.image_url || '', image_mobile_url: s.image_mobile_url || '', link_url: s.link_url || '',
    starts_on: (s.starts_on || '').slice(0, 10), ends_on: (s.ends_on || '').slice(0, 10),
  };
  for (const f of TEXTS) for (const l of LANGS) out[`${f}_${l}`] = s[`${f}_${l}`] || '';
  return out;
}

const payload = (s: State) => ({
  mode: s.mode, interval: s.interval, image: s.image,
  slides: s.slides.map(({ key, ...rest }) => rest),
});
const snapshot = (s: State) => JSON.stringify(payload(s));

function isVisible(s: Slide, today: string) {
  return s.is_active && !!s.image_url && (!s.starts_on || today >= s.starts_on) && (!s.ends_on || today <= s.ends_on);
}

/** Même règle que la vitrine : on n'interprète que <em> et <br>. */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const richText = (v: string) => esc(v || '').replace(/&lt;(\/?)em&gt;/gi, '<$1em>').replace(/&lt;br\s*\/?&gt;/gi, '<br>');
const plain = (v: string) => (v || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Pastille qui ne déborde pas sous les boutons de la ligne sur téléphone. */
const fitBadge: React.CSSProperties = { display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'top' };

/** Texte d'une diapositive dans la langue voulue, repli sur le français. */
const txt = (s: Slide, champ: string, l: Lang) => s[`${champ}_${l}`] || s[`${champ}_fr`] || '';

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', 'home');
  const res = await adminFetch('/api/upload', { method: 'POST', body: fd });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.error || '');
  return d.url;
}

export default function BannierePage() {
  const { t, lang: uiLang } = useT(TBA);
  const [state, setState] = useState<State>({ mode: 'image', interval: 5, image: '', slides: [] });
  const [saved, setSaved] = useState('');
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [lang, setLang] = useState<Lang>('fr');
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [picker, setPicker] = useState<((url: string) => void) | null>(null);
  const [frontUrl, setFrontUrl] = useState('');
  const [accentFront, setAccentFront] = useState('');
  const [defaults, setDefaults] = useState<HeroDefaults | null>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    load();
    adminFetch('/api/white-label').then(r => r.json()).then(d => {
      if (d?.config?.front_url) setFrontUrl(d.config.front_url);
      if (d?.config?.color_secondary) setAccentFront(d.config.color_secondary);
    }).catch(() => {});
    // Textes actuels du hero, pour que l'aperçu des diapositives « Texte de l'accueil » soit fidèle.
    fetch('/api/cms').then(r => r.json()).then(d => {
      const m: Record<string, any> = Object.fromEntries((d.cms || []).map((i: any) => [i.key, i]));
      const pick = (k: string) => ({ fr: m[k]?.value_fr || '', en: m[k]?.value_en || '', sv: m[k]?.value_sv || '' });
      setDefaults({ eyebrow: pick('hero_eyebrow'), title: pick('hero_title'), subtitle: pick('hero_subtitle'), cta1: pick('hero_cta1'), cta2: pick('hero_cta2') });
    }).catch(() => {});
  }, []);

  function apply(d: any) {
    const s: State = {
      mode: d.mode === 'carousel' ? 'carousel' : 'image',
      interval: Number(d.interval) || 5,
      image: d.image || '',
      slides: (d.slides || []).map(fromApi),
    };
    setState(s);
    setSaved(snapshot(s));
    if (d.today) setToday(d.today);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await adminFetch('/api/hero?admin=1');
      if (!res.ok) throw new Error();
      apply(await res.json());
      setLoadError(false);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }

  const dirty = !loading && !loadError && snapshot(state) !== saved;

  // Quitter l'écran avec des changements non publiés : le navigateur demande confirmation.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = t('quitter'); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /* ── Erreurs bloquantes, nommées par diapositive ─────────────── */
  function slideErrors(s: Slide): string[] {
    const e: string[] = [];
    if (!s.image_url.trim()) e.push(t('imageRequise'));
    if (s.kind === 'custom' && !LANGS.some(l => plain(s[`title_${l}`]))) e.push(t('titreRequis'));
    if (s.starts_on && s.ends_on && s.starts_on > s.ends_on) e.push(t('finAvantDebut'));
    return e;
  }

  async function publish() {
    const bad = state.slides.findIndex(s => slideErrors(s).length);
    if (bad >= 0) {
      setOpen(state.slides[bad].key);
      say(`${t('diapoN')} ${bad + 1} : ${slideErrors(state.slides[bad])[0]}`);
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch('/api/hero', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(state)),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || '');
      // Les nouvelles diapositives reçoivent leur id : on garde la ligne ouverte.
      const openIdx = state.slides.findIndex(s => s.key === open);
      apply(d);
      if (openIdx >= 0 && d.slides?.[openIdx]) setOpen(d.slides[openIdx].id);
      say(t('msgPubliee'));
    } catch (e: any) { say(e?.message || t('msgPublicationKo')); }
    finally { setSaving(false); }
  }

  /* ── Édition ─────────────────────────────────────────────────── */
  const set = (patch: Partial<State>) => setState(s => ({ ...s, ...patch }));
  const setSlide = (key: string, patch: Partial<Slide>) =>
    setState(s => ({ ...s, slides: s.slides.map(x => x.key === key ? { ...x, ...patch } : x) }));

  function addSlide(image = '') {
    if (state.slides.length >= MAX_SLIDES) { say(t('maxDiapos')); return; }
    const s = fromApi({ image_url: image });
    setState(st => ({ ...st, slides: [...st.slides, s] }));
    setOpen(s.key);
  }

  function removeSlide(s: Slide) {
    if (!window.confirm(t('confirmerSuppression'))) return;
    setState(st => ({ ...st, slides: st.slides.filter(x => x.key !== s.key) }));
    if (open === s.key) setOpen(null);
  }

  function move(key: string, to: number) {
    setState(st => {
      const from = st.slides.findIndex(x => x.key === key);
      if (from < 0 || to < 0 || to >= st.slides.length || from === to) return st;
      const next = [...st.slides];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return { ...st, slides: next };
    });
  }

  function onDrop(targetKey: string) {
    if (drag && drag !== targetKey) move(drag, state.slides.findIndex(x => x.key === targetKey));
    setDrag(null);
  }

  function statusOf(s: Slide): { tone: BadgeTone; label: string } {
    if (!s.is_active) return { tone: 'gray', label: t('stMasquee') };
    if (s.starts_on && today < s.starts_on) return { tone: 'blue', label: `${t('stProgrammee')} · ${t('des')} ${formatDate(s.starts_on, uiLang)}` };
    if (s.ends_on && today > s.ends_on) return { tone: 'amber', label: `${t('stTerminee')} · ${t('le')} ${formatDate(s.ends_on, uiLang)}` };
    return { tone: 'green', label: s.ends_on ? `${t('stVisible')} · ${t('jusquau')} ${formatDate(s.ends_on, uiLang)}` : t('stVisible') };
  }

  function slideName(s: Slide): string {
    if (s.kind === 'custom') return plain(txt(s, 'title', lang)) || t('sansTitre');
    if (s.kind === 'image') return plain(txt(s, 'alt', lang)) || s.image_url.split('/').pop()?.slice(0, 48) || t('sansTitre');
    return t('texteAccueil');
  }

  const kindLabel = (k: Kind) => t(k === 'custom' ? 'kindCustom' : k === 'image' ? 'kindImage' : 'kindDefault');
  const visibles = state.slides.filter(s => isVisible(s, today));
  // En mode image fixe, la liste est masquée : l'aperçu montre l'image fixe.
  const openSlide = state.mode === 'carousel' ? state.slides.find(s => s.key === open) || null : null;

  /* ── Aperçu : la diapositive ouverte, sinon ce que montre le site ── */
  const previewSlides: Slide[] = openSlide
    ? [openSlide]
    : state.mode === 'carousel' && visibles.length
      ? visibles
      : [fromApi({ id: 'image-fixe', kind: 'default', image_url: state.image })];
  const previewCaption = openSlide
    ? `${t('apercuDiapo')} ${state.slides.indexOf(openSlide) + 1}`
    : t('apercuSite');

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">{t('sousTitre')}</div>
        </div>
        <div className="sc-actions">
          {frontUrl && (
            <a className="sc-btn sc-btn-secondary" href={frontUrl} target="_blank" rel="noopener">
              <span className="ms">visibility</span>{t('voirSite')}
            </a>
          )}
          <button className="sc-btn sc-btn-green" onClick={publish} disabled={saving || !dirty}>
            <span className="ms">publish</span>{saving ? t('publication') : dirty ? t('publier') : t('aJour')}
          </button>
        </div>
      </div>

      {loading && <BanniereSkeleton />}
      {!loading && loadError && (
        <div className="sc-card sc-card-pad" style={{ display: 'flex', gap: 10, alignItems: 'center', color: BADGE.red.fg, background: BADGE.red.bg, borderColor: '#EBD5D1' }}>
          <span className="ms">error</span>
          <span style={{ fontSize: 12.5, flex: 1 }}>{t('msgChargementKo')}</span>
          <button className="sc-btn sc-btn-secondary" onClick={load}><span className="ms">refresh</span>{t('reessayer')}</button>
        </div>
      )}

      {!loading && !loadError && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ── Affichage ── */}
            <section className="sc-card sc-card-pad">
              <div className="sc-card-title" style={{ marginBottom: 10 }}>{t('affichage')}</div>
              <div role="radiogroup" aria-label={t('affichage')}
                   style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8 }}>
                {([['image', 'image', 'modeImage', 'modeImageDesc'], ['carousel', 'slideshow', 'modeCarousel', 'modeCarouselDesc']] as const).map(([m, icon, lbl, desc]) => {
                  const on = state.mode === m;
                  return (
                    <button key={m} role="radio" aria-checked={on} onClick={() => set({ mode: m })}
                            style={{
                              display: 'flex', gap: 11, alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer',
                              padding: '11px 13px', borderRadius: 8,
                              border: `1px solid ${on ? 'var(--accent)' : T.border}`,
                              background: on ? 'color-mix(in srgb, var(--accent) 6%, #fff)' : '#fff',
                              boxShadow: on ? 'inset 0 0 0 1px var(--accent)' : 'none',
                              transition: 'border-color .12s, background .12s',
                            }}>
                      <span className="ms" style={{ fontSize: 22, color: on ? 'var(--accent)' : T.muted, marginTop: 1 }}>{icon}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{t(lbl)}</span>
                        <span style={{ fontSize: 11.5, color: T.text3, lineHeight: 1.45 }}>{t(desc)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {state.mode === 'carousel' && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.borderFaint}` }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.text2, flexWrap: 'wrap' }}>
                    {t('defilement')}
                    <input type="number" className="sc-input sc-num" min={INTERVAL_MIN} max={INTERVAL_MAX} step={1}
                           style={{ width: 64, height: 30, textAlign: 'center' }}
                           value={state.interval}
                           onChange={e => set({ interval: Number(e.target.value) || INTERVAL_MIN })}
                           onBlur={() => set({ interval: Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, Math.round(state.interval))) })} />
                    {t('secondes')}
                  </label>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>{t('defilementAide')}</div>
                </div>
              )}
            </section>

            {/* ── Diapositives ── */}
            {state.mode === 'carousel' && (
              <section className="sc-card" style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: state.slides.length ? `1px solid ${T.borderFaint}` : 'none', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div className="sc-card-title">{t('diapos')}</div>
                    {state.slides.length > 0 && (
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
                        <span className="sc-num">{visibles.length}/{state.slides.length}</span> {t('visiblesAujourdhui')}
                        {state.slides.length > 1 && <> · {t('glisser')}</>}
                      </div>
                    )}
                  </div>
                  {state.slides.length > 0 && (
                    <button className="sc-btn sc-btn-secondary" onClick={() => addSlide()} disabled={state.slides.length >= MAX_SLIDES}>
                      <span className="ms">add</span>{t('ajouter')}
                    </button>
                  )}
                </div>

                {state.slides.length === 0 && (
                  <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                    <span className="ms" style={{ fontSize: 28, color: T.muted3 }}>slideshow</span>
                    <div style={{ fontSize: 12.5, color: T.text3, margin: '6px auto 14px', maxWidth: 380, lineHeight: 1.5 }}>{t('vide')}</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button className="sc-btn sc-btn-primary" onClick={() => addSlide()}><span className="ms">add</span>{t('ajouter')}</button>
                      {state.image && (
                        <button className="sc-btn sc-btn-secondary" onClick={() => addSlide(state.image)}>
                          <span className="ms">content_copy</span>{t('partirImage')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {state.slides.length > 0 && visibles.length === 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 14px', background: BADGE.amber.bg, color: BADGE.amber.fg, fontSize: 12, borderBottom: `1px solid ${T.borderFaint}` }}>
                    <span className="ms" style={{ fontSize: 17 }}>info</span>{t('aucuneVisible')}
                  </div>
                )}

                {state.slides.map((s, idx) => {
                  const isOpen = open === s.key;
                  const st = statusOf(s);
                  const errs = slideErrors(s);
                  return (
                    <div key={s.key}
                         draggable={!isOpen}
                         onDragStart={() => setDrag(s.key)}
                         onDragEnd={() => setDrag(null)}
                         onDragOver={e => e.preventDefault()}
                         onDrop={() => onDrop(s.key)}
                         style={{
                           borderTop: idx ? `1px solid ${T.borderFaint}` : 'none',
                           opacity: drag === s.key ? .45 : 1,
                           background: isOpen ? T.surfaceAlt : '#fff',
                         }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px 9px 8px' }}>
                        <span className="ms" aria-hidden="true" style={{ fontSize: 17, color: T.muted3, cursor: isOpen ? 'default' : 'grab' }}>drag_indicator</span>
                        <div style={{
                          width: 64, height: 36, borderRadius: 5, flexShrink: 0, background: T.borderFaint2,
                          backgroundImage: s.image_url ? `url("${s.image_url.replace(/"/g, '%22')}")` : undefined,
                          backgroundSize: 'cover', backgroundPosition: 'center',
                          opacity: isVisible(s, today) ? 1 : .55,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {slideName(s)}
                          </div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap', minWidth: 0 }}>
                            <span className="sc-badge" title={st.label} style={{ ...fitBadge, background: BADGE[st.tone].bg, color: BADGE[st.tone].fg }}>{st.label}</span>
                            {s.kind !== 'default' && (
                              <span className="sc-badge" style={{ ...fitBadge, background: s.kind === 'custom' ? BADGE.plum.bg : BADGE.gray.bg, color: s.kind === 'custom' ? BADGE.plum.fg : BADGE.gray.fg }}>{kindLabel(s.kind)}</span>
                            )}
                            {errs.length > 0 && (
                              <span className="sc-badge" title={errs[0]} style={{ ...fitBadge, background: BADGE.red.bg, color: BADGE.red.fg }}>{errs[0]}</span>
                            )}
                          </div>
                        </div>
                        <button className="sc-switch" role="switch" aria-checked={s.is_active}
                                aria-label={`${t('visibilite')} — ${slideName(s)}`}
                                onClick={() => setSlide(s.key, { is_active: !s.is_active })} />
                        <button className="sc-iconbtn" onClick={() => setOpen(isOpen ? null : s.key)}
                                aria-expanded={isOpen} aria-label={`${isOpen ? t('fermer') : t('modifier')} — ${slideName(s)}`}>
                          <span className="ms">{isOpen ? 'expand_less' : 'edit'}</span>
                        </button>
                        <button className="sc-iconbtn" onClick={() => removeSlide(s)} aria-label={`${t('retirer')} — ${slideName(s)}`}>
                          <span className="ms">delete</span>
                        </button>
                      </div>

                      {isOpen && (
                        <SlideEditor
                          s={s} idx={idx} count={state.slides.length} lang={lang} setLang={setLang} t={t}
                          onChange={patch => setSlide(s.key, patch)}
                          onMove={to => move(s.key, to)}
                          onPick={cb => setPicker(() => cb)}
                          onError={m => say(m || t('msgUploadKo'))}
                        />
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* ── Image fixe (et repli du carrousel) ── */}
            <section className="sc-card sc-card-pad">
              <div className="sc-card-title">{t('imageFixe')}</div>
              <div style={{ fontSize: 11, color: T.muted, margin: '2px 0 10px' }}>{t('imageFixeAide')}</div>
              <ImageField value={state.image} onChange={v => set({ image: v })} t={t}
                          onPick={cb => setPicker(() => cb)} onError={m => say(m || t('msgUploadKo'))} />
            </section>
          </div>

          {/* ── Aperçu ── */}
          <aside style={{ flex: '1 1 300px', minWidth: 0, position: 'sticky', top: 8 }}>
            <HeroPreview slides={previewSlides} interval={state.interval} lang={lang} setLang={setLang}
                         defaults={defaults} accent={accentFront} caption={previewCaption} t={t} />
          </aside>
        </div>
      )}

      {picker && (
        <MediaPicker t={t} onClose={() => setPicker(null)}
                     onSelect={url => { picker(url); setPicker(null); }} />
      )}

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 220, maxWidth: 'calc(100vw - 48px)' }}>
          {toast}
        </div>
      )}
    </>
  );
}

/* ═══ Éditeur d'une diapositive ═══════════════════════════════════ */

type TFn = (k: keyof typeof TBA & string) => string;

function SlideEditor({ s, idx, count, lang, setLang, t, onChange, onMove, onPick, onError }: {
  s: Slide; idx: number; count: number; lang: Lang; setLang: (l: Lang) => void; t: TFn;
  onChange: (patch: Partial<Slide>) => void; onMove: (to: number) => void;
  onPick: (cb: (url: string) => void) => void; onError: (m: string) => void;
}) {
  const field = (champ: string) => s[`${champ}_${lang}`] || '';
  const setField = (champ: string, v: string) => onChange({ [`${champ}_${lang}`]: v });
  const kindDesc = s.kind === 'custom' ? 'kindCustomDesc' : s.kind === 'image' ? 'kindImageDesc' : 'kindDefaultDesc';
  const dateError = s.starts_on && s.ends_on && s.starts_on > s.ends_on;
  const sub: React.CSSProperties = { fontSize: 10.5, color: T.muted, marginTop: 4, lineHeight: 1.5 };

  return (
    <div style={{ padding: '4px 14px 14px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Type */}
      <div>
        <div className="sc-label">{t('type')}</div>
        <div role="radiogroup" aria-label={t('type')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {KINDS.map(k => (
            <button key={k} role="radio" aria-checked={s.kind === k}
                    className={`sc-chip${s.kind === k ? ' on' : ''}`} onClick={() => onChange({ kind: k })}>
              <span className="ms" style={{ fontSize: 16 }}>{k === 'custom' ? 'title' : k === 'image' ? 'wallpaper' : 'home'}</span>
              {t(k === 'custom' ? 'kindCustom' : k === 'image' ? 'kindImage' : 'kindDefault')}
            </button>
          ))}
        </div>
        <div style={sub}>{t(kindDesc)}</div>
      </div>

      {/* Images */}
      <div>
        <div className="sc-label">{t('image')}</div>
        <ImageField value={s.image_url} onChange={v => onChange({ image_url: v })} t={t} onPick={onPick} onError={onError} />
        <div style={sub}>{t('imageAide')}</div>
      </div>
      {s.kind === 'image' && (
        <div>
          <div className="sc-label">{t('imageMobile')}</div>
          <ImageField value={s.image_mobile_url} onChange={v => onChange({ image_mobile_url: v })} t={t} onPick={onPick} onError={onError} portrait />
          <div style={sub}>{t('imageMobileAide')}</div>
        </div>
      )}

      {/* Textes, par langue du contenu */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: '#fff', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text2b }}>{t('textesEn')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {LANGS.map(l => (
              <button key={l} className={`sc-chip${lang === l ? ' on' : ''}`} style={{ height: 26, padding: '0 9px', fontSize: 11 }}
                      aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {s.kind === 'custom' && (
            <>
              <div>
                <label className="sc-label" htmlFor={`eb-${s.key}`}>{t('surtitre')}</label>
                <input id={`eb-${s.key}`} className="sc-input" value={field('eyebrow')} maxLength={80}
                       placeholder={lang === 'fr' ? t('phSurtitre') : txt(s, 'eyebrow', 'fr')} onChange={e => setField('eyebrow', e.target.value)} />
              </div>
              <div>
                <label className="sc-label" htmlFor={`ti-${s.key}`}>{t('titreChamp')}</label>
                <input id={`ti-${s.key}`} className="sc-input" value={field('title')} maxLength={160}
                       placeholder={lang === 'fr' ? t('phTitre') : plain(txt(s, 'title', 'fr'))} onChange={e => setField('title', e.target.value)} />
                <div style={sub}>{t('titreAide')}</div>
              </div>
              <div>
                <label className="sc-label" htmlFor={`st-${s.key}`}>{t('sousTitreChamp')}</label>
                <textarea id={`st-${s.key}`} className="sc-input sc-textarea" rows={2} value={field('subtitle')} maxLength={400}
                          placeholder={lang === 'fr' ? '' : txt(s, 'subtitle', 'fr')} onChange={e => setField('subtitle', e.target.value)} />
              </div>
              <div>
                <label className="sc-label" htmlFor={`cta-${s.key}`}>{t('bouton')}</label>
                <input id={`cta-${s.key}`} className="sc-input" value={field('cta_label')} maxLength={40}
                       placeholder={lang === 'fr' ? t('phBouton') : txt(s, 'cta_label', 'fr')} onChange={e => setField('cta_label', e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className="sc-label" htmlFor={`alt-${s.key}`}>{t('alt')}</label>
            <input id={`alt-${s.key}`} className="sc-input" value={field('alt')} maxLength={200}
                   placeholder={lang === 'fr' ? '' : txt(s, 'alt', 'fr')} onChange={e => setField('alt', e.target.value)} />
            <div style={sub}>{t(s.kind === 'image' ? 'altAideImage' : 'altAide')}</div>
          </div>
        </div>
      </div>

      {/* Lien */}
      {s.kind !== 'default' && (
        <div>
          <label className="sc-label" htmlFor={`ln-${s.key}`}>{t('lien')}</label>
          <input id={`ln-${s.key}`} className="sc-input" value={s.link_url} placeholder={t('phLien')}
                 onChange={e => onChange({ link_url: e.target.value })} />
          <div style={sub}>{t(s.kind === 'image' ? 'lienAideImage' : 'lienAideCustom')}</div>
        </div>
      )}

      {/* Période */}
      <div>
        <div className="sc-label">{t('periode')}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: T.text3, flex: '1 1 140px' }}>
            {t('debut')}
            <input type="date" className="sc-input" value={s.starts_on} onChange={e => onChange({ starts_on: e.target.value })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: T.text3, flex: '1 1 140px' }}>
            {t('fin')}
            <input type="date" className="sc-input" value={s.ends_on} min={s.starts_on || undefined}
                   style={dateError ? { borderColor: T.red } : undefined}
                   onChange={e => onChange({ ends_on: e.target.value })} />
          </label>
        </div>
        <div style={{ ...sub, color: dateError ? T.red : T.muted }}>{dateError ? t('finAvantDebut') : t('periodeAide')}</div>
      </div>

      {/* Ordre, au clavier comme à la souris */}
      {count > 1 && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sc-btn sc-btn-secondary" onClick={() => onMove(idx - 1)} disabled={idx === 0}>
            <span className="ms">arrow_upward</span>{t('monter')}
          </button>
          <button className="sc-btn sc-btn-secondary" onClick={() => onMove(idx + 1)} disabled={idx === count - 1}>
            <span className="ms">arrow_downward</span>{t('descendre')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══ Champ image : vignette, adresse, envoi, médiathèque ═════════ */

function ImageField({ value, onChange, t, onPick, onError, portrait }: {
  value: string; onChange: (v: string) => void; t: TFn;
  onPick: (cb: (url: string) => void) => void; onError: (m: string) => void; portrait?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try { onChange(await uploadImage(file)); }
    catch (e: any) { onError(e?.message || ''); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{
        width: portrait ? 64 : 128, aspectRatio: portrait ? '4 / 5' : '16 / 9', flexShrink: 0, borderRadius: 6,
        background: value ? `${T.borderFaint2} center / cover no-repeat url("${value.replace(/"/g, '%22')}")` : T.borderFaint2,
        border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!value && <span className="ms" style={{ fontSize: 20, color: T.muted3 }}>image</span>}
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input className="sc-input" value={value} placeholder={t('phUrl')} onChange={e => onChange(e.target.value.trim())} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="sc-btn sc-btn-secondary" style={{ padding: '6px 11px' }} disabled={busy} onClick={() => fileRef.current?.click()}>
            <span className="ms">upload</span>{busy ? t('envoi') : t('envoyer')}
          </button>
          <button className="sc-btn sc-btn-secondary" style={{ padding: '6px 11px' }} onClick={() => onPick(onChange)}>
            <span className="ms">perm_media</span>{t('mediatheque')}
          </button>
          {value && (
            <button className="sc-iconbtn" style={{ width: 32, height: 32 }} onClick={() => onChange('')} aria-label={t('retirerImage')}>
              <span className="ms">close</span>
            </button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
             onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </div>
  );
}

/* ═══ Aperçu animé ═════════════════════════════════════════════════
   Reprend la composition du hero de la vitrine (voile, surtitre, titre
   Cormorant avec <em> coloré, boutons, traits de progression) à petite
   échelle. Volontairement simplifié : la vérité reste le site. */

function HeroPreview({ slides, interval, lang, setLang, defaults, accent, caption, t }: {
  slides: Slide[]; interval: number; lang: Lang; setLang: (l: Lang) => void;
  defaults: HeroDefaults | null; accent: string; caption: string; t: TFn;
}) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [idx, setIdx] = useState(0);
  const sig = slides.map(s => s.key).join('|');
  const ms = Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, interval || 5)) * 1000;

  useEffect(() => { setIdx(0); }, [sig]);
  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => setIdx(i => (i + 1) % slides.length), ms);
    return () => window.clearInterval(id);
  }, [sig, ms]);

  const phone = device === 'phone';
  const d = (k: keyof HeroDefaults) => defaults?.[k]?.[lang] || defaults?.[k]?.fr || '';
  const emColor = accent || '#8CAE86';

  return (
    <div className="sc-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <div className="sc-card-title">{t('apercu')}</div>
        <div style={{ fontSize: 11, color: T.muted, flex: 1 }}>· {caption}</div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['desktop', 'phone'] as const).map(v => (
          <button key={v} className={`sc-chip${device === v ? ' on' : ''}`} style={{ height: 28, padding: '0 10px', fontSize: 11.5 }}
                  aria-pressed={device === v} onClick={() => setDevice(v)}>
            <span className="ms" style={{ fontSize: 15 }}>{v === 'phone' ? 'smartphone' : 'desktop_windows'}</span>
            {t(v === 'phone' ? 'telephone' : 'ordinateur')}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {LANGS.map(l => (
            <button key={l} className={`sc-chip${lang === l ? ' on' : ''}`} style={{ height: 28, padding: '0 9px', fontSize: 11 }}
                    aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 8, background: '#16091a',
        aspectRatio: phone ? '9 / 16' : '16 / 10', width: phone ? 'min(100%, 230px)' : '100%', margin: '0 auto',
      }}>
        {slides.map((s, i) => {
          const src = (phone && s.image_mobile_url) || s.image_url;
          const on = i === idx % slides.length;
          const custom = s.kind === 'custom';
          return (
            <div key={s.key} aria-hidden={!on}
                 style={{ position: 'absolute', inset: 0, opacity: on ? 1 : 0, transition: 'opacity .9s ease' }}>
              {src
                ? <div style={{ position: 'absolute', inset: 0, background: `center 35% / cover no-repeat url("${src.replace(/"/g, '%22')}")` }} />
                : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)', fontSize: 11 }}>{t('pasImage')}</div>}
              {s.kind !== 'image' && (
                <>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(155deg, rgba(18,8,22,.62) 0%, rgba(18,8,22,.2) 48%, rgba(18,8,22,.78) 100%)' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 8%', color: '#fff' }}>
                    {(custom ? txt(s, 'eyebrow', lang) : d('eyebrow')) && (
                      <div style={{ fontSize: phone ? 6 : 7, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,.55)', marginBottom: 8 }}>
                        {plain(custom ? txt(s, 'eyebrow', lang) : d('eyebrow'))}
                      </div>
                    )}
                    <div className="sc-preview-title"
                         style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: phone ? 21 : 27, lineHeight: 1, letterSpacing: -.5, marginBottom: 8 }}
                         dangerouslySetInnerHTML={{ __html: richText(custom ? txt(s, 'title', lang) : d('title')) || '&nbsp;' }} />
                    {(custom ? txt(s, 'subtitle', lang) : d('subtitle')) && (
                      <div style={{ fontSize: phone ? 8 : 8.5, lineHeight: 1.6, color: 'rgba(255,255,255,.62)', maxWidth: 240, marginBottom: 10 }}>
                        {plain(custom ? txt(s, 'subtitle', lang) : d('subtitle')).slice(0, 140)}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 5 }}>
                      {custom
                        ? (s.link_url && <PreviewBtn label={txt(s, 'cta_label', lang) || t('phBouton')} filled accent={emColor} />)
                        : <><PreviewBtn label={d('cta1')} filled accent={emColor} /><PreviewBtn label={d('cta2')} accent={emColor} /></>}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {slides.length > 1 && (
          <div style={{ position: 'absolute', right: phone ? '50%' : 12, transform: phone ? 'translateX(50%)' : undefined, bottom: 10, display: 'flex', gap: 4 }}>
            {slides.map((s, i) => (
              <span key={s.key} style={{ width: 16, height: 2, background: 'rgba(255,255,255,.35)', position: 'relative', overflow: 'hidden' }}>
                {i === idx % slides.length && (
                  <span key={idx} style={{ position: 'absolute', inset: 0, background: '#fff', transformOrigin: 'left', animation: `sc-hero-progress ${ms}ms linear forwards` }} />
                )}
              </span>
            ))}
          </div>
        )}
        <style>{`
          @keyframes sc-hero-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
          .sc-preview-title em { font-style: italic; color: ${emColor}; }
        `}</style>
      </div>
      <div style={{ fontSize: 10.5, color: T.muted, marginTop: 8 }}>{t('apercuNote')}</div>
    </div>
  );
}

function PreviewBtn({ label, filled, accent }: { label: string; filled?: boolean; accent: string }) {
  if (!label) return null;
  return (
    <span style={{
      fontSize: 5.5, letterSpacing: 1.2, textTransform: 'uppercase', padding: '5px 9px', borderRadius: 1,
      background: filled ? accent : 'transparent', color: '#fff', border: filled ? 'none' : '1px solid rgba(255,255,255,.35)',
      whiteSpace: 'nowrap',
    }}>{plain(label)}</span>
  );
}

/* ═══ Médiathèque : choisir une image déjà envoyée ════════════════ */

function MediaPicker({ t, onClose, onSelect }: { t: TFn; onClose: () => void; onSelect: (url: string) => void }) {
  const [items, setItems] = useState<{ id: string; url: string; filename?: string; mime_type?: string }[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    adminFetch('/api/upload?limit=120').then(r => r.json())
      .then(d => setItems((d.media || []).filter((m: any) => !m.mime_type || m.mime_type.startsWith('image/'))))
      .catch(() => setItems([]));
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,22,.38)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('choisirImage')}
           onClick={e => e.stopPropagation()} className="sc-card"
           style={{ width: 'min(760px,100%)', maxHeight: 'min(640px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column', outline: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${T.borderFaint}` }}>
          <div className="sc-card-title" style={{ flex: 1 }}>{t('choisirImage')}</div>
          <button className="sc-iconbtn" onClick={onClose} aria-label={t('fermer')}><span className="ms">close</span></button>
        </div>
        <div style={{ overflowY: 'auto', padding: 12 }}>
          {items === null && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="sc-skel" style={{ aspectRatio: '1' }} />)}
            </div>
          )}
          {items?.length === 0 && <div className="sc-empty">{t('mediathequeVide')}</div>}
          {!!items?.length && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>
              {items.map(m => (
                <button key={m.id} onClick={() => onSelect(m.url)} title={m.filename || ''}
                        style={{ padding: 0, border: `1px solid ${T.border}`, borderRadius: 7, overflow: 'hidden', cursor: 'pointer', background: '#F7F4EF', aspectRatio: '1' }}>
                  <img src={m.url} alt={m.filename || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ Silhouette de chargement : la forme définitive de l'écran ═══ */

function BanniereSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }} aria-busy="true">
      <div style={{ flex: '2 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="sc-card sc-card-pad">
          <div className="sc-skel" style={{ width: 90, height: 12, marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8 }}>
            <div className="sc-skel" style={{ height: 62 }} />
            <div className="sc-skel" style={{ height: 62 }} />
          </div>
        </div>
        <div className="sc-card sc-card-pad">
          <div className="sc-skel" style={{ width: 120, height: 12, marginBottom: 12 }} />
          {[72, 56, 64].map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: i ? 12 : 0 }}>
              <div className="sc-skel" style={{ width: 64, height: 36 }} />
              <div style={{ flex: 1 }}>
                <div className="sc-skel" style={{ width: `${w}%`, height: 11 }} />
                <div className="sc-skel" style={{ width: 90, height: 9, marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        <div className="sc-card sc-card-pad">
          <div className="sc-skel" style={{ width: 70, height: 12, marginBottom: 12 }} />
          <div className="sc-skel" style={{ aspectRatio: '16 / 10' }} />
        </div>
      </div>
    </div>
  );
}
