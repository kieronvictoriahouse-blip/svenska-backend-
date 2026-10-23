'use client';
import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TME, imagesEnvoyees, confirmerSuppressionFichier, ceFichier } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 16 — MÉDIATHÈQUE
   Handoff §16 : zone de dépôt pointillée en tête, puis grille
   auto-fill minmax(150px,1fr) de cartes — carré avec dimensions en
   mono en bas à gauche, nom de fichier tronqué + poids.
   ═══════════════════════════════════════════════════════════════ */

type Media = {
  id: string; url: string; filename?: string;
  size?: number; width?: number; height?: number; alt_text?: string;
};

const fmtSize = (b?: number) =>
  !b ? '—' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(b / 1024)} Ko`;

export default function MediasPage() {
  const { t, tc, lang } = useT(TME);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  async function load() {
    setLoading(true);
    try {
      const d = await adminFetch('/api/upload?limit=200').then(r => r.json());
      setMedia(d.media || []);
    } finally { setLoading(false); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const token = localStorage.getItem('sd_admin_token');
    let ok = 0;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'library');
      const res = await adminFetch('/api/upload', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (res.ok) ok++;
    }
    setUploading(false);
    say(imagesEnvoyees(ok, lang));
    load();
  }

  async function remove(item: Media) {
    if (!window.confirm(confirmerSuppressionFichier(item.filename || ceFichier(lang), lang))) return;
    await adminFetch('/api/upload', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId: item.id }),
    });
    setMedia(m => m.filter(x => x.id !== item.id));
    say(t('msgSupprime'));
  }

  const filtered = media.filter(m =>
    !search || (m.filename || '').toLowerCase().includes(search.toLowerCase()));

  /* Téléphone : recherche pleine largeur, « Prendre une photo » ouvre
     directement l'appareil photo, grille de deux colonnes, textes lisibles. */
  const css = `
    .me-search { width: 220px; background: #F7F4EF; }
    .me-dims { font-size: 9.5px; }
    .me-file { font-size: 11.5px; }
    .me-size { font-size: 10.5px; }
    .me-drop-t { font-size: 13px; }
    .me-drop-s { font-size: 11px; }
    @media (min-width: 900px) { .me-search { height: 32px; } }
    @media (max-width: 899px) {
      .me-search { width: 100%; flex: 1 1 100%; }
      .me-drop { padding: 18px 16px !important; }
      .me-dims { font-size: 11px; }
      .me-file { font-size: 13px; }
      .me-size { font-size: 12px; }
      .me-drop-t { font-size: 14.5px; }
      .me-drop-s { font-size: 12.5px; }
      .me-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            {filtered.length} fichier{filtered.length > 1 ? 's' : ''}
            {filtered.length !== media.length ? ` sur ${media.length}` : ''}
          </div>
        </div>
        <div className="sc-actions">
          <input className="sc-input me-search" type="search"
                 placeholder={t('chercher')} value={search} onChange={e => setSearch(e.target.value)} />
          <button className="sc-btn sc-btn-secondary sc-only-mobile-flex" onClick={() => camRef.current?.click()} disabled={uploading}>
            <span className="ms">photo_camera</span>Prendre une photo
          </button>
          <button className="sc-btn sc-btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <span className="ms">upload_file</span>{uploading ? 'Envoi…' : 'Ajouter'}
          </button>
        </div>
      </div>

      {/* Zone de dépôt */}
      <button
        className="me-drop"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        style={{
          width: '100%', border: `1px dashed ${drag ? 'var(--accent)' : T.borderField}`,
          background: drag ? '#FBF9F6' : 'transparent', borderRadius: 10,
          padding: '26px 20px', cursor: 'pointer', marginBottom: 14,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
        <span className="ms" style={{ fontSize: 26, color: T.muted }}>{uploading ? 'hourglass_top' : 'cloud_upload'}</span>
        <span className="me-drop-t" style={{ fontWeight: 500, color: T.ink }}>
          {uploading ? 'Envoi en cours…' : <><span className="sc-hide-mobile">Dépose tes photos ici</span><span className="sc-only-mobile">Touche ici pour choisir des photos</span></>}
        </span>
        <span className="me-drop-s" style={{ color: T.muted }}>JPG, PNG, WebP — 5 Mo maximum par fichier</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
             onChange={e => upload(e.target.files)} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
             onChange={e => { upload(e.target.files); e.target.value = ''; }} />

      {loading && <div className="sc-empty">{tc('loading')}</div>}
      {!loading && filtered.length === 0 && <div className="sc-empty">{t('aucun')}</div>}

      {!loading && filtered.length > 0 && (
        <div className="me-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          {filtered.map(m => (
            <div key={m.id} className="sc-card" style={{ overflow: 'hidden' }}>
              <div style={{ position: 'relative', aspectRatio: '1', background: '#F7F4EF' }}>
                <img src={m.url} alt={m.alt_text || ''} loading="lazy"
                     style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                {(m.width && m.height) && (
                  <span className="sc-num me-dims" style={{
                    position: 'absolute', bottom: 6, left: 6,
                    background: 'rgba(28,32,40,.72)', color: '#fff', padding: '2px 6px', borderRadius: 4,
                  }}>{m.width}×{m.height}</span>
                )}
                <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 3 }}>
                  <button className="sc-iconbtn" style={{ background: 'rgba(255,255,255,.92)' }}
                          onClick={() => { navigator.clipboard?.writeText(m.url); say(t('msgUrlCopiee')); }}
                          aria-label={t('copierUrl')}><span className="ms">content_copy</span></button>
                  <button className="sc-iconbtn" style={{ background: 'rgba(255,255,255,.92)' }}
                          onClick={() => remove(m)} aria-label={tc('delete')}><span className="ms">delete</span></button>
                </div>
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div className="me-file" style={{ color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.filename || 'sans nom'}
                </div>
                <div className="sc-num me-size" style={{ color: T.muted }}>{fmtSize(m.size)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div className="sc-toast" role="status" style={{ zIndex: 200 }}>{toast}</div>}
    </>
  );
}
