'use client';
import { useEffect, useState } from 'react';

const SECTION_LABELS: Record<string, string> = {
  hero:           '🦸 Section Hero (bannière principale)',
  featured_band:  '🎨 Bande Épices (section sombre)',
  fredagsmys_band:'🍟 Bande Fredagsmys (snacks)',
};

export default function HomepagePage() {
  const [sections, setSections]     = useState<any[]>([]);
  const [bestsellers, setBs]        = useState<any[]>([]);
  const [newArrivals, setNa]        = useState<any[]>([]);
  const [allProducts, setAll]       = useState<any[]>([]);
  const [activeSection, setActiveS] = useState<string>('hero');
  const [activeLang, setActiveLang] = useState('fr');
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState<{ msg: string; type: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [hpRes, prRes] = await Promise.all([
      fetch('/api/homepage'),
      fetch('/api/products?limit=200'),
    ]);
    const hp = await hpRes.json();
    const pr = await prRes.json();
    setSections(hp.sections || []);
    setBs(hp.bestsellers || []);
    setNa(hp.new_arrivals || []);
    setAll(pr.products || []);
    setLoading(false);
  }

  function getSection(key: string) { return sections.find(s => s.key === key) || {}; }
  function setField(key: string, field: string, val: any) {
    setSections(ss => ss.map(s => s.key === key ? { ...s, [field]: val } : s));
  }

  async function saveSection(key: string) {
    setSaving(true);
    const token = localStorage.getItem('sd_admin_token');
    const section = getSection(key);
    const res = await fetch('/api/homepage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, ...section }),
    });
    setSaving(false);
    showToast(res.ok ? '✅ Section mise à jour !' : '❌ Erreur', res.ok ? 'success' : 'error');
  }

  async function toggleBestseller(productId: string, current: boolean) {
    const token = localStorage.getItem('sd_admin_token');
    await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_bestseller: !current }),
    });
    setAll(ps => ps.map(p => p.id === productId ? { ...p, is_bestseller: !current } : p));
    setBs(ps => current ? ps.filter(p => p.id !== productId) : [...ps, allProducts.find(p => p.id === productId)]);
    showToast(!current ? '⭐ Ajouté aux best-sellers' : '🗑️ Retiré des best-sellers', 'success');
  }

  async function toggleNew(productId: string, current: boolean) {
    const token = localStorage.getItem('sd_admin_token');
    await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_new: !current }),
    });
    setAll(ps => ps.map(p => p.id === productId ? { ...p, is_new: !current } : p));
    showToast(!current ? '🆕 Marqué comme nouveauté' : '🗑️ Retiré des nouveautés', 'success');
  }

  function showToast(msg: string, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const LANGS = [
    { code: 'fr', label: '🇫🇷 FR' },
    { code: 'sv', label: '🇸🇪 SV' },
    { code: 'en', label: '🇬🇧 EN' },
  ];

  if (loading) return <div className="page-content" style={{ padding: 60, textAlign: 'center', color: 'var(--dust)' }}>Chargement…</div>;

  const sec = getSection(activeSection);

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Gestion de la page d'accueil</div>
        <div className="topbar-actions">
          <a href={process.env.NEXT_PUBLIC_FRONT_URL || '#'} target="_blank" className="btn btn-secondary btn-sm">🌐 Voir le site</a>
        </div>
      </div>

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>

          {/* Sidebar navigation sections */}
          <div>
            <div className="card">
              <div className="card-header"><span className="card-title">Sections</span></div>
              <div style={{ padding: '8px 0' }}>
                {['hero', 'featured_band', 'fredagsmys_band'].map(key => (
                  <button key={key} onClick={() => setActiveS(key)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 20px', border: 'none', background: activeSection === key ? 'var(--moss-pale)' : 'none',
                      color: activeSection === key ? 'var(--moss)' : 'var(--slate)',
                      fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: activeSection === key ? 600 : 400,
                      borderLeft: `3px solid ${activeSection === key ? 'var(--copper)' : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.18s',
                    }}
                  >
                    {SECTION_LABELS[key]?.split(' ').slice(0,2).join(' ') || key}
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--linen)', margin: '8px 0' }} />
                <button onClick={() => setActiveS('bestsellers')}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 20px', border: 'none', background: activeSection === 'bestsellers' ? 'var(--moss-pale)' : 'none',
                    color: activeSection === 'bestsellers' ? 'var(--moss)' : 'var(--slate)',
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: activeSection === 'bestsellers' ? 600 : 400,
                    borderLeft: `3px solid ${activeSection === 'bestsellers' ? 'var(--copper)' : 'transparent'}`,
                    cursor: 'pointer',
                  }}
                >⭐ Best-sellers home</button>
                <button onClick={() => setActiveS('nouveautes')}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 20px', border: 'none', background: activeSection === 'nouveautes' ? 'var(--moss-pale)' : 'none',
                    color: activeSection === 'nouveautes' ? 'var(--moss)' : 'var(--slate)',
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: activeSection === 'nouveautes' ? 600 : 400,
                    borderLeft: `3px solid ${activeSection === 'nouveautes' ? 'var(--copper)' : 'transparent'}`,
                    cursor: 'pointer',
                  }}
                >🆕 Nouveautés home</button>
              </div>
            </div>
          </div>

          {/* Éditeur */}
          <div>

            {/* Section texte éditable */}
            {['hero', 'featured_band', 'fredagsmys_band'].includes(activeSection) && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">{SECTION_LABELS[activeSection]}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label className="toggle">
                      <input type="checkbox" checked={sec.is_active ?? true} onChange={e => setField(activeSection, 'is_active', e.target.checked)} />
                      <span className="toggle-track"></span>
                      <span className="toggle-label" style={{ fontSize: 12 }}>{sec.is_active ? 'Visible' : 'Masquée'}</span>
                    </label>
                    <button className="btn btn-primary btn-sm" onClick={() => saveSection(activeSection)} disabled={saving}>
                      {saving ? '⏳' : '💾 Sauvegarder'}
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="lang-tabs">
                    {LANGS.map(l => (
                      <button key={l.code} className={`lang-tab ${activeLang === l.code ? 'active' : ''}`} onClick={() => setActiveLang(l.code)}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                  {LANGS.map(lang => (
                    <div key={lang.code} style={{ display: activeLang === lang.code ? 'block' : 'none' }}>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label className="form-label">Titre</label>
                          <input className="form-control" value={sec[`title_${lang.code}`] || ''} onChange={e => setField(activeSection, `title_${lang.code}`, e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Sous-titre / Eyebrow</label>
                          <input className="form-control" value={sec[`subtitle_${lang.code}`] || ''} onChange={e => setField(activeSection, `subtitle_${lang.code}`, e.target.value)} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Corps du texte</label>
                        <textarea className="form-control" rows={3} value={sec[`body_${lang.code}`] || ''} onChange={e => setField(activeSection, `body_${lang.code}`, e.target.value)} />
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label className="form-label">Texte du bouton CTA</label>
                          <input className="form-control" value={sec[`cta_label_${lang.code}`] || ''} onChange={e => setField(activeSection, `cta_label_${lang.code}`, e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">URL du bouton CTA</label>
                          <input className="form-control" value={sec.cta_url || ''} onChange={e => setField(activeSection, 'cta_url', e.target.value)} placeholder="boutique.html" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Image de fond (URL)</label>
                    <input className="form-control" value={sec.image_url || ''} onChange={e => setField(activeSection, 'image_url', e.target.value)} placeholder="https://…" />
                    {sec.image_url && <img src={sec.image_url} alt="" style={{ marginTop: 8, height: 80, width: '100%', objectFit: 'cover', borderRadius: 4 }} />}
                  </div>
                </div>
              </div>
            )}

            {/* Best-sellers */}
            {activeSection === 'bestsellers' && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">⭐ Best-sellers affichés sur la home</span>
                  <span style={{ fontSize: 13, color: 'var(--dust)' }}>{allProducts.filter(p => p.is_bestseller).length} / 6 recommandés max</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Image</th><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Best-seller home</th></tr></thead>
                    <tbody>
                      {allProducts.map(p => (
                        <tr key={p.id}>
                          <td><img src={p.image_url || ''} alt="" className="td-img" onError={e => { (e.target as any).style.display='none'; }} /></td>
                          <td><div className="td-name">{p.name_fr}</div><div className="td-sub">{p.subtitle_fr}</div></td>
                          <td><span style={{ fontSize: 12, color: 'var(--dust)' }}>{p.categories?.emoji} {p.categories?.name_fr}</span></td>
                          <td><span className="td-price">€{parseFloat(p.price).toFixed(2)}</span></td>
                          <td>
                            <label className="toggle">
                              <input type="checkbox" checked={p.is_bestseller} onChange={() => toggleBestseller(p.id, p.is_bestseller)} />
                              <span className="toggle-track"></span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Nouveautés */}
            {activeSection === 'nouveautes' && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">🆕 Nouveautés affichées sur la home</span>
                  <span style={{ fontSize: 13, color: 'var(--dust)' }}>{allProducts.filter(p => p.is_new).length} / 4 recommandés max</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Image</th><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Nouveauté home</th></tr></thead>
                    <tbody>
                      {allProducts.map(p => (
                        <tr key={p.id}>
                          <td><img src={p.image_url || ''} alt="" className="td-img" onError={e => { (e.target as any).style.display='none'; }} /></td>
                          <td><div className="td-name">{p.name_fr}</div><div className="td-sub">{p.subtitle_fr}</div></td>
                          <td><span style={{ fontSize: 12, color: 'var(--dust)' }}>{p.categories?.emoji} {p.categories?.name_fr}</span></td>
                          <td><span className="td-price">€{parseFloat(p.price).toFixed(2)}</span></td>
                          <td>
                            <label className="toggle">
                              <input type="checkbox" checked={p.is_new} onChange={() => toggleNew(p.id, p.is_new)} />
                              <span className="toggle-track"></span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </>
  );
}
