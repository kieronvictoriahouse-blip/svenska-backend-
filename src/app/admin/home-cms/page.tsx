'use client';
import { useEffect, useState } from 'react';

type CmsItem = {
  key: string; label: string; type: string;
  value_fr: string; value_sv: string; value_en: string;
};

export default function HomeCmsPage() {
  const [items, setItems] = useState<CmsItem[]>([]);
  const [editing, setEditing] = useState<Record<string, CmsItem>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  useEffect(() => { loadCms(); }, []);

  async function loadCms() {
    const res = await fetch('/api/cms');
    const data = await res.json();
    setItems(data.cms || []);
    const ed: Record<string, CmsItem> = {};
    (data.cms || []).forEach((i: CmsItem) => { ed[i.key] = { ...i }; });
    setEditing(ed);
    setLoading(false);
  }

  async function saveAll() {
    setSaving(true);
    const updates = Object.values(editing);
    await fetch('/api/cms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    setSaving(false);
    showToast('✅ Page d\'accueil sauvegardée !');
  }

  function update(key: string, field: string, val: string) {
    setEditing(e => ({ ...e, [key]: { ...e[key], [field]: val } }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, key: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingKey(key);
    const token = localStorage.getItem('sd_admin_token');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'homepage');
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const data = await res.json();
    setUploadingKey(null);
    if (res.ok && data.url) {
      update(key, 'value_fr', data.url);
      update(key, 'value_sv', data.url);
      update(key, 'value_en', data.url);
      showToast('✅ Image uploadée !');
    } else {
      showToast('❌ Erreur upload : ' + (data.error || 'inconnue'));
    }
  }

  if (loading) return <div style={{ padding: 40, color: '#6A7280' }}>Chargement…</div>;

  const textItems = items.filter(i => i.type === 'text');
  const imageItems = items.filter(i => i.type === 'image');

  const css = `
    .cms-wrap { max-width: 900px; }
    .cms-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; }
    .cms-title { font-family:'Cormorant Garamond',serif; font-size:30px; font-weight:600; color:#1C2028; }
    .cms-section { background:#fff; border:1px solid #D8CEBC; border-radius:6px; margin-bottom:20px; overflow:hidden; }
    .cms-section-header { padding:14px 20px; border-bottom:1px solid #D8CEBC; font-size:13px; font-weight:600; color:#1C2028; background:#FDFAF5; }
    .cms-item { padding:18px 20px; border-bottom:1px solid #F0EBE1; }
    .cms-item:last-child { border-bottom:none; }
    .cms-label { font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#6A7280; margin-bottom:10px; }
    .cms-langs { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
    .cms-lang-label { font-size:10px; font-weight:600; color:#9E5A3C; letter-spacing:1px; text-transform:uppercase; margin-bottom:4px; }
    .cms-input { width:100%; padding:8px 10px; border:1px solid #D8CEBC; border-radius:6px; font-family:'Jost',sans-serif; font-size:13px; color:#1C2028; outline:none; }
    .cms-input:focus { border-color:#7A9468; }
    textarea.cms-input { min-height:80px; resize:vertical; }
    .cms-preview { margin-top:8px; border-radius:6px; overflow:hidden; border:1px solid #D8CEBC; }
    .cms-preview img { width:100%; height:180px; object-fit:cover; display:block; }
    .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 20px; border-radius:6px; font-family:'Jost',sans-serif; font-size:13px; font-weight:500; cursor:pointer; border:none; }
    .btn-primary { background:#3E5238; color:#fff; }
    .btn-primary:hover { background:#587050; }
    .btn-primary:disabled { opacity:0.6; cursor:not-allowed; }
    .toast { position:fixed; bottom:24px; right:24px; background:#1C2028; color:#fff; padding:10px 18px; border-radius:6px; font-size:13px; font-family:'Jost',sans-serif; z-index:999; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="cms-wrap">
        <div className="cms-header">
          <div>
            <div className="cms-title">Éditeur de la page d'accueil</div>
            <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>Modifiez les textes et photos visibles sur la home</div>
          </div>
          <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
            {saving ? 'Sauvegarde…' : '💾 Sauvegarder tout'}
          </button>
        </div>

        {/* Textes */}
        <div className="cms-section">
          <div className="cms-section-header">📝 Textes</div>
          {textItems.map(item => (
            <div key={item.key} className="cms-item">
              <div className="cms-label">{item.label}</div>
              <div className="cms-langs">
                {(['fr', 'sv', 'en'] as const).map(lang => (
                  <div key={lang}>
                    <div className="cms-lang-label">{lang === 'fr' ? '🇫🇷 Français' : lang === 'sv' ? '🇸🇪 Svenska' : '🇬🇧 English'}</div>
                    {item.key.includes('subtitle') || item.key.includes('text') ? (
                      <textarea
                        className="cms-input"
                        value={editing[item.key]?.[`value_${lang}`] || ''}
                        onChange={e => update(item.key, `value_${lang}`, e.target.value)}
                      />
                    ) : (
                      <input
                        className="cms-input"
                        value={editing[item.key]?.[`value_${lang}`] || ''}
                        onChange={e => update(item.key, `value_${lang}`, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Photos */}
        <div className="cms-section">
          <div className="cms-section-header">🖼️ Photos</div>
          {imageItems.map(item => (
            <div key={item.key} className="cms-item">
              <div className="cms-label">{item.label}</div>
              <div style={{ marginBottom: 10 }}>
                <div className="cms-lang-label" style={{ marginBottom: 6 }}>URL de l'image</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="cms-input"
                    placeholder="https://..."
                    value={editing[item.key]?.value_fr || ''}
                    onChange={e => {
                      update(item.key, 'value_fr', e.target.value);
                      update(item.key, 'value_sv', e.target.value);
                      update(item.key, 'value_en', e.target.value);
                    }}
                    style={{ flex: 1 }}
                  />
                  <label
                    className="btn btn-primary"
                    style={{
                      whiteSpace: 'nowrap', flexShrink: 0,
                      cursor: uploadingKey ? 'not-allowed' : 'pointer',
                      opacity: uploadingKey === item.key ? 0.6 : 1,
                    }}
                  >
                    {uploadingKey === item.key ? '⏳ Upload…' : '📁 Uploader'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      style={{ display: 'none' }}
                      disabled={!!uploadingKey}
                      onChange={e => handleFileChange(e, item.key)}
                    />
                  </label>
                </div>
              </div>
              {editing[item.key]?.value_fr && (
                <div className="cms-preview">
                  <img src={editing[item.key].value_fr} alt={item.label} onError={e => (e.currentTarget.style.display = 'none')} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: '#6A7280', marginTop: 8 }}>
          💡 Après sauvegarde, les changements apparaissent sur le site dans les secondes qui suivent.
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
