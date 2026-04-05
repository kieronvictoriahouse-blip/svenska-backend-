'use client';
import { useEffect, useState, useRef } from 'react';

export default function MediasPage() {
  const [media, setMedia]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast]       = useState<{ msg: string; type: string } | null>(null);
  const [search, setSearch]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadMedia(); }, []);

  async function loadMedia() {
    setLoading(true);
    const token = localStorage.getItem('sd_admin_token');
    const res = await fetch('/api/upload?limit=100', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setMedia(data.media || []);
    setLoading(false);
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const token = localStorage.getItem('sd_admin_token');
    let success = 0;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'library');
      const res = await fetch('/api/upload', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (res.ok) success++;
    }
    setUploading(false);
    showToast(`✅ ${success} image${success > 1 ? 's' : ''} uploadée${success > 1 ? 's' : ''} !`, 'success');
    loadMedia();
  }

  async function deleteMedia(item: any) {
    if (!confirm(`Supprimer "${item.filename}" ?`)) return;
    const token = localStorage.getItem('sd_admin_token');
    await fetch('/api/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mediaId: item.id }),
    });
    setMedia(m => m.filter(x => x.id !== item.id));
    showToast('🗑️ Supprimé', 'success');
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    showToast('📋 URL copiée !', 'success');
  }

  function showToast(msg: string, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function formatSize(bytes?: number) {
    if (!bytes) return '—';
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  const filtered = media.filter(m =>
    !search || m.filename.toLowerCase().includes(search.toLowerCase()) || m.alt_text?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Médiathèque <span style={{ fontWeight: 400, color: 'var(--dust)', fontSize: 14 }}>({filtered.length} fichiers)</span></div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '⏳ Upload…' : '+ Uploader des images'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => handleUpload(e.target.files)} />
        </div>
      </div>

      <div className="page-content">
        {/* Upload zone drag & drop */}
        <div
          className="upload-zone" style={{ marginBottom: 24 }}
          onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
          onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
          onClick={() => fileRef.current?.click()}
        >
          <span className="upload-zone-icon">{uploading ? '⏳' : '📸'}</span>
          <div className="upload-zone-text">{uploading ? 'Upload en cours…' : 'Glisser des images ici ou cliquer pour sélectionner'}</div>
          <div className="upload-zone-hint">JPEG, PNG, WebP · Max 5 MB par fichier · Plusieurs fichiers autorisés</div>
        </div>

        {/* Barre de recherche */}
        <div style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="search-bar">
            <span className="search-bar-icon">🔍</span>
            <input placeholder="Rechercher une image…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {selected && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--moss-pale)', padding: '8px 16px', borderRadius: 'var(--radius)' }}>
              <span style={{ fontSize: 13, color: 'var(--moss)' }}>Image sélectionnée</span>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const item = media.find(m => m.id === selected);
                if (item) copyUrl(item.url);
              }}>📋 Copier l'URL</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>
          )}
        </div>

        {/* Grille médias */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--dust)' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
            <p style={{ color: 'var(--dust)' }}>Aucun média uploadé. Commencez par ajouter des images !</p>
          </div>
        ) : (
          <div className="media-grid">
            {filtered.map(item => (
              <div
                key={item.id}
                className={`media-item ${selected === item.id ? 'selected' : ''}`}
                onClick={() => setSelected(selected === item.id ? null : item.id)}
              >
                <img
                  src={item.url} alt={item.alt_text || item.filename}
                  onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23EDE5D8" width="100" height="100"/><text y="55" x="35" font-size="30">📦</text></svg>'; }}
                />
                <div className="media-item-select">✓</div>
                <div className="media-item-info">
                  <div className="media-item-name" title={item.filename}>{item.filename}</div>
                  <div style={{ fontSize: 10, color: 'var(--birch)' }}>{formatSize(item.size)}</div>
                </div>
                {/* Actions au hover */}
                <div style={{
                  position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4,
                  opacity: selected === item.id ? 1 : 0, transition: 'opacity 0.18s',
                }}>
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    style={{ padding: '4px 6px', fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); copyUrl(item.url); }}
                    title="Copier l'URL"
                  >📋</button>
                  <button
                    className="btn btn-danger btn-sm btn-icon"
                    style={{ padding: '4px 6px', fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); deleteMedia(item); }}
                    title="Supprimer"
                  >🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Détail image sélectionnée */}
        {selected && (() => {
          const item = media.find(m => m.id === selected);
          if (!item) return null;
          return (
            <div style={{
              position: 'fixed', bottom: 24, left: 280 + 24, right: 24,
              background: 'white', border: '1px solid var(--linen)', borderRadius: 'var(--radius)',
              padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16,
              boxShadow: 'var(--shadow-md)', zIndex: 50,
            }}>
              <img src={item.url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.filename}</div>
                <div style={{ fontSize: 12, color: 'var(--dust)', marginTop: 2 }}>
                  {formatSize(item.size)} · {new Date(item.uploaded_at).toLocaleDateString('fr-FR')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--birch)', marginTop: 4, wordBreak: 'break-all' }}>{item.url}</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => copyUrl(item.url)}>📋 Copier l'URL</button>
              <button className="btn btn-danger btn-sm" onClick={() => deleteMedia(item)}>🗑️ Supprimer</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>
          );
        })()}
      </div>

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </>
  );
}
