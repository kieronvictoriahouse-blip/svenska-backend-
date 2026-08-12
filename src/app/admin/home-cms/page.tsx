'use client';
import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 14 — PAGE D'ACCUEIL
   Handoff §14 : liste de sections (numéro d'ordre en carré 22 px,
   nom + type en pastille, aperçu du contenu tronqué, bouton edit),
   et à droite un aperçu mobile schématique. Actions : Aperçu, Publier.

   Le modèle réel est un CMS clé/valeur multilingue (`cms`), pas des
   sections réordonnables : l'ordre vient du back-end, il n'est donc
   pas modifiable ici — on ne fabrique pas une poignée qui ne ferait rien.
   ═══════════════════════════════════════════════════════════════ */

type CmsItem = { key: string; label: string; type: string; value_fr: string; value_sv: string; value_en: string };
type Lang = 'fr' | 'sv' | 'en';

export default function HomeCmsPage() {
  const [items, setItems] = useState<CmsItem[]>([]);
  const [editing, setEditing] = useState<Record<string, CmsItem>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [lang, setLang] = useState<Lang>('fr');
  const [open, setOpen] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [frontUrl, setFrontUrl] = useState('https://www.swedishcravings.fr');
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKey = useRef<string | null>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    load();
    fetch('/api/white-label').then(r => r.json()).then(d => {
      if (d?.config?.front_url) setFrontUrl(d.config.front_url);
    }).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await fetch('/api/cms').then(r => r.json());
      const list: CmsItem[] = d.cms || [];
      setItems(list);
      const ed: Record<string, CmsItem> = {};
      list.forEach(i => { ed[i.key] = { ...i }; });
      setEditing(ed);
    } finally { setLoading(false); }
  }

  const dirty = items.some(i => {
    const e = editing[i.key];
    return e && (e.value_fr !== i.value_fr || e.value_sv !== i.value_sv || e.value_en !== i.value_en);
  });

  async function saveAll() {
    setSaving(true);
    try {
      const res = await adminFetch('/api/cms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cms: Object.values(editing) }),
      });
      if (!res.ok) throw new Error();
      setItems(Object.values(editing));
      say('Page d’accueil publiée');
    } catch { say('Publication impossible'); }
    finally { setSaving(false); }
  }

  function setVal(key: string, l: Lang, v: string) {
    setEditing(e => ({ ...e, [key]: { ...e[key], [`value_${l}`]: v } as CmsItem }));
  }

  async function uploadFor(key: string, file: File) {
    setUploadingKey(key);
    const token = localStorage.getItem('sd_admin_token');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'home');
    try {
      const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await res.json();
      if (d.url) { (['fr', 'sv', 'en'] as Lang[]).forEach(l => setVal(key, l, d.url)); say('Image remplacée — pense à publier'); }
      else say('Upload impossible');
    } finally { setUploadingKey(null); }
  }

  const preview = (i: CmsItem) => {
    const v = editing[i.key]?.[`value_${lang}`] || '';
    if (!v) return 'vide';
    return i.type === 'image' ? v.split('/').pop()!.slice(0, 40) : v.replace(/<[^>]+>/g, '').slice(0, 70);
  };

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">Page d’accueil</div>
          <div className="sc-sub">{items.length} sections éditables · les modifications ne sont visibles qu’après publication</div>
        </div>
        <div className="sc-actions">
          <div style={{ display: 'flex', gap: 4 }}>
            {(['fr', 'sv', 'en'] as Lang[]).map(l => (
              <button key={l} className={`sc-chip${lang === l ? ' on' : ''}`} style={{ height: 32, padding: '0 11px' }}
                      onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
          <a className="sc-btn sc-btn-secondary" href={frontUrl} target="_blank" rel="noopener">
            <span className="ms">visibility</span>Aperçu
          </a>
          <button className="sc-btn sc-btn-green" onClick={saveAll} disabled={saving || !dirty}>
            <span className="ms">publish</span>{saving ? 'Publication…' : dirty ? 'Publier' : 'À jour'}
          </button>
        </div>
      </div>

      {loading && <div className="sc-empty">Chargement…</div>}

      {!loading && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Liste des sections */}
          <div style={{ flex: '2 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((i, idx) => {
              const isOpen = open === i.key;
              const changed = editing[i.key] && (
                editing[i.key].value_fr !== i.value_fr ||
                editing[i.key].value_sv !== i.value_sv ||
                editing[i.key].value_en !== i.value_en);
              return (
                <div key={i.key} className="sc-card" style={{ borderColor: changed ? '#FDBA74' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: T.borderFaint2, color: T.text2b,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10.5, fontWeight: 700,
                    }}>{idx + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{i.label}</span>
                        <span className="sc-badge" style={{
                          background: i.type === 'image' ? BADGE.plum.bg : BADGE.gray.bg,
                          color: i.type === 'image' ? BADGE.plum.fg : BADGE.gray.fg,
                        }}>{i.type === 'image' ? 'image' : 'texte'}</span>
                        {changed && <span className="sc-badge" style={{ background: BADGE.amber.bg, color: BADGE.amber.fg }}>modifié</span>}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {preview(i)}
                      </div>
                    </div>
                    <button className="sc-iconbtn" onClick={() => setOpen(isOpen ? null : i.key)}
                            aria-label={`Modifier ${i.label}`} aria-expanded={isOpen}>
                      <span className="ms">{isOpen ? 'expand_less' : 'edit'}</span>
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${T.borderFaint}` }}>
                      {i.type === 'image' ? (
                        <div style={{ paddingTop: 12 }}>
                          {editing[i.key]?.value_fr && (
                            <img src={editing[i.key].value_fr} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 7, marginBottom: 10 }} />
                          )}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input className="sc-input" placeholder="URL de l’image"
                                   value={editing[i.key]?.value_fr || ''}
                                   onChange={e => (['fr', 'sv', 'en'] as Lang[]).forEach(l => setVal(i.key, l, e.target.value))} />
                            <button className="sc-btn sc-btn-secondary" disabled={uploadingKey === i.key}
                                    onClick={() => { pendingKey.current = i.key; fileRef.current?.click(); }}>
                              <span className="ms">upload</span>{uploadingKey === i.key ? '…' : 'Envoyer'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ paddingTop: 12 }}>
                          <label className="sc-label">Contenu ({lang.toUpperCase()})</label>
                          <textarea className="sc-input sc-textarea" rows={3}
                                    value={editing[i.key]?.[`value_${lang}`] || ''}
                                    onChange={e => setVal(i.key, lang, e.target.value)} />
                          <div style={{ fontSize: 10.5, color: T.muted, marginTop: 4 }}>
                            Le HTML simple est accepté (&lt;em&gt; pour l’accent typographique).
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                   onChange={e => { const f = e.target.files?.[0]; if (f && pendingKey.current) uploadFor(pendingKey.current, f); }} />
          </div>

          {/* Aperçu mobile schématique */}
          <div style={{ flex: '1 1 260px', minWidth: 0, position: 'sticky', top: 8 }}>
            <div className="sc-card" style={{ padding: 14 }}>
              <div className="sc-card-title" style={{ marginBottom: 10 }}>Aperçu</div>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                <div style={{ height: 22, background: T.topbar }} />
                <div style={{
                  height: 92,
                  background: editing['hero_image']?.value_fr
                    ? `center/cover url(${editing['hero_image'].value_fr})`
                    : 'repeating-linear-gradient(45deg,#F7F4EF 0 6px,#F1EDE7 6px 12px)',
                }} />
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, marginBottom: 4 }}
                       dangerouslySetInnerHTML={{ __html: (editing['hero_title']?.[`value_${lang}`] || 'Titre').slice(0, 60) }} />
                  <div style={{ fontSize: 9.5, color: T.muted, lineHeight: 1.5, marginBottom: 10 }}>
                    {(editing['hero_subtitle']?.[`value_${lang}`] || '').replace(/<[^>]+>/g, '').slice(0, 90)}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[0, 1].map(i => (
                      <div key={i} style={{ flex: 1, height: 46, borderRadius: 6, background: 'repeating-linear-gradient(45deg,#F7F4EF 0 6px,#F1EDE7 6px 12px)' }} />
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 8 }}>
                Rendu schématique — l’aperçu réel s’ouvre sur la boutique.
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
