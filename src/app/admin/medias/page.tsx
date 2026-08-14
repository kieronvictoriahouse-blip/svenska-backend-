'use client';
import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';

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
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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
    say(`${ok} image${ok > 1 ? 's' : ''} envoyée${ok > 1 ? 's' : ''}`);
    load();
  }

  async function remove(item: Media) {
    if (!window.confirm(`Supprimer « ${item.filename || 'ce fichier'} » ?`)) return;
    await adminFetch('/api/upload', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId: item.id }),
    });
    setMedia(m => m.filter(x => x.id !== item.id));
    say('Fichier supprimé');
  }

  const filtered = media.filter(m =>
    !search || (m.filename || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">Médiathèque</div>
          <div className="sc-sub">
            {filtered.length} fichier{filtered.length > 1 ? 's' : ''}
            {filtered.length !== media.length ? ` sur ${media.length}` : ''}
          </div>
        </div>
        <div className="sc-actions">
          <input className="sc-input" style={{ height: 32, width: 220, background: '#F7F4EF' }}
                 placeholder="Rechercher un fichier…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="sc-btn sc-btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <span className="ms">upload_file</span>{uploading ? 'Envoi…' : 'Ajouter'}
          </button>
        </div>
      </div>

      {/* Zone de dépôt */}
      <button
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
        <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>
          {uploading ? 'Envoi en cours…' : 'Dépose tes photos ici'}
        </span>
        <span style={{ fontSize: 11, color: T.muted }}>JPG, PNG, WebP — 5 Mo maximum par fichier</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
             onChange={e => upload(e.target.files)} />

      {loading && <div className="sc-empty">Chargement…</div>}
      {!loading && filtered.length === 0 && <div className="sc-empty">Aucun fichier.</div>}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          {filtered.map(m => (
            <div key={m.id} className="sc-card" style={{ overflow: 'hidden' }}>
              <div style={{ position: 'relative', aspectRatio: '1', background: '#F7F4EF' }}>
                <img src={m.url} alt={m.alt_text || ''} loading="lazy"
                     style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                {(m.width && m.height) && (
                  <span className="sc-num" style={{
                    position: 'absolute', bottom: 6, left: 6, fontSize: 9.5,
                    background: 'rgba(28,32,40,.72)', color: '#fff', padding: '2px 6px', borderRadius: 4,
                  }}>{m.width}×{m.height}</span>
                )}
                <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 3 }}>
                  <button className="sc-iconbtn" style={{ background: 'rgba(255,255,255,.92)' }}
                          onClick={() => { navigator.clipboard?.writeText(m.url); say('URL copiée'); }}
                          aria-label="Copier l’URL"><span className="ms">content_copy</span></button>
                  <button className="sc-iconbtn" style={{ background: 'rgba(255,255,255,.92)' }}
                          onClick={() => remove(m)} aria-label="Supprimer"><span className="ms">delete</span></button>
                </div>
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 11.5, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.filename || 'sans nom'}
                </div>
                <div className="sc-num" style={{ fontSize: 10.5, color: T.muted }}>{fmtSize(m.size)}</div>
              </div>
            </div>
          ))}
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
