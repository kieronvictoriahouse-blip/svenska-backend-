'use client';
import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

type Config = {
  site_name: string; site_slogan: string; logo_url: string; favicon_url: string;
  color_primary: string; color_secondary: string; color_bg: string; color_text: string;
  font_display: string; font_body: string; font_ui: string;
  email: string; phone: string; address: string; siret: string; tva: string;
  instagram: string; facebook: string; currency: string; tva_rate: number;
  free_shipping_threshold: number; smtp_host: string; smtp_user: string; smtp_from: string;
};

const FONTS_DISPLAY = ['Cormorant Garamond', 'Playfair Display', 'Libre Baskerville', 'Merriweather', 'Lora'];
const FONTS_UI = ['Jost', 'Inter', 'DM Sans', 'Plus Jakarta Sans', 'Outfit'];

const DEFAULT_CONFIG: Config = {
  site_name: 'Mon Épicerie', site_slogan: 'Saveurs authentiques', logo_url: '', favicon_url: '',
  color_primary: '#3E5238', color_secondary: '#9E5A3C', color_bg: '#F6F1E9', color_text: '#1C2028',
  font_display: 'Cormorant Garamond', font_body: 'Crimson Pro', font_ui: 'Jost',
  email: '', phone: '', address: '', siret: '', tva: '',
  instagram: '', facebook: '', currency: 'EUR', tva_rate: 20, free_shipping_threshold: 50,
  smtp_host: '', smtp_user: '', smtp_from: '',
};

function WhiteLabelInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'identity');
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [importing, setImporting] = useState(false);
  const [importType, setImportType] = useState('products');
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    const res = await fetch('/api/white-label');
    const data = await res.json();
    if (data.config && data.config.id) setConfig({ ...DEFAULT_CONFIG, ...data.config });
  }

  async function save() {
    setSaving(true);
    const res = await fetch('/api/white-label', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
    setSaving(false);
    if (res.ok) showToast('✅ Configuration sauvegardée !');
    else showToast('❌ Erreur lors de la sauvegarde');
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    const text = await file.text();
    const rows: any[] = [];

    // Parse CSV simple
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { showToast('⚠️ Fichier vide'); setImporting(false); return; }
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((h, j) => { row[h] = vals[j] || ''; });
      rows.push(row);
    }

    const res = await fetch(`/api/white-label?type=${importType}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
    });
    const result = await res.json();
    setImportResult(result);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function update(field: keyof Config, val: any) {
    setConfig(c => ({ ...c, [field]: val }));
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; }
    .wl-wrap { font-family: 'Jost', sans-serif; max-width: 900px; }
    .wl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .wl-title { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 600; color: #1C2028; }
    .wl-tabs { display: flex; gap: 0; border: 1px solid #D8CEBC; border-radius: 8px; overflow: hidden; margin-bottom: 24px; flex-wrap: wrap; }
    .wl-tab { padding: 10px 18px; font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: #fff; color: #6A7280; transition: all 0.15s; }
    .wl-tab.active { background: #1C2028; color: #fff; }
    .wl-section { background: #fff; border: 1px solid #D8CEBC; border-radius: 8px; padding: 24px; margin-bottom: 16px; }
    .wl-section-title { font-size: 14px; font-weight: 600; color: #1C2028; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #D8CEBC; }
    .form-group { margin-bottom: 14px; }
    .form-label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #6A7280; margin-bottom: 5px; }
    .form-control { width: 100%; padding: 8px 10px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; outline: none; }
    .form-control:focus { border-color: #7A9468; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
    .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 14px; }
    .color-picker { display: flex; align-items: center; gap: 10px; }
    .color-input { width: 44px; height: 36px; padding: 2px; border: 1px solid #D8CEBC; border-radius: 6px; cursor: pointer; }
    .color-text { flex: 1; }
    .preview-box { border: 1px solid #D8CEBC; border-radius: 8px; overflow: hidden; margin-top: 16px; }
    .preview-header { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; }
    .preview-nav { display: flex; gap: 16px; font-size: 12px; }
    .preview-hero { padding: 40px 24px; text-align: center; }
    .preview-title { font-size: 28px; font-weight: 300; margin-bottom: 8px; }
    .preview-sub { font-size: 14px; opacity: 0.7; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
    .btn-primary { background: #3E5238; color: #fff; } .btn-primary:hover { background: #587050; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-secondary { background: #F6F1E9; color: #3E4550; border: 1px solid #D8CEBC; }
    .btn-sm { padding: 5px 12px; font-size: 12px; }
    .import-zone { border: 2px dashed #D8CEBC; border-radius: 8px; padding: 32px; text-align: center; cursor: pointer; transition: border-color 0.15s; }
    .import-zone:hover { border-color: #7A9468; }
    .import-zone-icon { font-size: 36px; margin-bottom: 8px; }
    .import-zone-text { font-size: 14px; color: #6A7280; }
    .result-box { margin-top: 16px; padding: 14px; border-radius: 6px; font-size: 13px; }
    .result-ok { background: #D1FAE5; color: #065F46; }
    .result-err { background: #FEE2E2; color: #991B1B; }
    .font-preview { font-size: 18px; color: #1C2028; }
    select.form-control { appearance: none; }
    .mono { font-family: 'DM Mono', monospace; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #1C2028; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; z-index: 999; }
    .csv-template { background: #F6F1E9; border: 1px solid #D8CEBC; border-radius: 6px; padding: 12px 14px; font-family: 'DM Mono', monospace; font-size: 11px; color: #3E4550; margin-bottom: 14px; white-space: pre; overflow-x: auto; }
  `;

  const TEMPLATES: Record<string, string> = {
    products: 'nom,prix,poids,categorie\n"Cardamome bio",6.90,"50g","Épices"\n"Cannelle Ceylan",5.90,"30g","Épices"',
    contacts: 'prenom,nom,societe,email,telephone,adresse,ville\n"Marie","Dupont","","marie@email.fr","0612345678","1 rue de la Paix","Paris"',
    suppliers: 'societe,prenom,nom,email,telephone,adresse,ville,siret\n"Épices du Nord","Jean","Martin","contact@epices.fr","0612345678","10 rue du Port","Lyon","12345678901234"',
    stock: 'produit,stock\n"Cardamome bio",50\n"Cannelle Ceylan",30',
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="wl-wrap">
        <div className="wl-header">
          <div>
            <div className="wl-title">🎨 White Label</div>
            <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>Personnalisation complète du site</div>
          </div>
          {tab !== 'import' && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Sauvegarde…' : '💾 Sauvegarder'}</button>}
        </div>

        <div className="wl-tabs">
          {[['identity', '🏷️ Identité'], ['colors', '🎨 Couleurs'], ['fonts', '✍️ Typographie'], ['ecommerce', '🛒 E-commerce'], ['smtp', '📧 Email'], ['import', '📥 Import données']].map(([k, l]) => (
            <button key={k} className={`wl-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* IDENTITÉ */}
        {tab === 'identity' && (
          <>
            <div className="wl-section">
              <div className="wl-section-title">🏷️ Informations du site</div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Nom du site *</label><input className="form-control" value={config.site_name} onChange={e => update('site_name', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Slogan</label><input className="form-control" value={config.site_slogan} onChange={e => update('site_slogan', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">URL Logo</label><input className="form-control" value={config.logo_url} onChange={e => update('logo_url', e.target.value)} placeholder="https://..." /></div>
                <div className="form-group"><label className="form-label">URL Favicon</label><input className="form-control" value={config.favicon_url} onChange={e => update('favicon_url', e.target.value)} placeholder="https://..." /></div>
              </div>
            </div>
            <div className="wl-section">
              <div className="wl-section-title">📬 Contact</div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Email</label><input className="form-control" value={config.email} onChange={e => update('email', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Téléphone</label><input className="form-control" value={config.phone} onChange={e => update('phone', e.target.value)} /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Adresse</label><input className="form-control" value={config.address} onChange={e => update('address', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">SIRET</label><input className="form-control mono" value={config.siret} onChange={e => update('siret', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">N° TVA</label><input className="form-control mono" value={config.tva} onChange={e => update('tva', e.target.value)} /></div>
              </div>
            </div>
            <div className="wl-section">
              <div className="wl-section-title">📱 Réseaux sociaux</div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Instagram</label><input className="form-control" value={config.instagram} onChange={e => update('instagram', e.target.value)} placeholder="@moncompte" /></div>
                <div className="form-group"><label className="form-label">Facebook</label><input className="form-control" value={config.facebook} onChange={e => update('facebook', e.target.value)} placeholder="fb.com/mapage" /></div>
              </div>
            </div>
          </>
        )}

        {/* COULEURS */}
        {tab === 'colors' && (
          <>
            <div className="wl-section">
              <div className="wl-section-title">🎨 Palette de couleurs</div>
              <div className="grid-2">
                {([
                  ['color_primary', 'Couleur principale', 'Boutons, liens actifs, accents'],
                  ['color_secondary', 'Couleur secondaire', 'Accents, prix, badges'],
                  ['color_bg', 'Fond', 'Arrière-plan général'],
                  ['color_text', 'Texte', 'Couleur du texte principal'],
                ] as [keyof Config, string, string][]).map(([field, label, desc]) => (
                  <div key={field} className="form-group">
                    <label className="form-label">{label}</label>
                    <div style={{ fontSize: 11, color: '#6A7280', marginBottom: 6 }}>{desc}</div>
                    <div className="color-picker">
                      <input type="color" className="color-input" value={config[field] as string} onChange={e => update(field, e.target.value)} />
                      <input className="form-control color-text mono" value={config[field] as string} onChange={e => update(field, e.target.value)} placeholder="#3E5238" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Preview */}
            <div className="wl-section">
              <div className="wl-section-title">👁️ Aperçu</div>
              <div className="preview-box" style={{ background: config.color_bg }}>
                <div className="preview-header" style={{ background: config.color_primary }}>
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{config.site_name}</span>
                  <div className="preview-nav">
                    {['Accueil', 'Boutique', 'Contact'].map(l => <span key={l} style={{ color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>{l}</span>)}
                  </div>
                </div>
                <div className="preview-hero">
                  <div className="preview-title" style={{ color: config.color_text, fontFamily: config.font_display }}>{config.site_slogan || 'Saveurs authentiques'}</div>
                  <div className="preview-sub" style={{ color: config.color_text }}>Découvrez notre sélection de produits</div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <span style={{ background: config.color_primary, color: '#fff', padding: '8px 20px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Explorer</span>
                    <span style={{ background: 'transparent', color: config.color_primary, padding: '8px 20px', borderRadius: 4, fontSize: 13, border: `1px solid ${config.color_primary}`, cursor: 'pointer' }}>Notre histoire</span>
                  </div>
                </div>
                <div style={{ padding: '12px 24px', display: 'flex', gap: 12 }}>
                  {['Produit A', 'Produit B', 'Produit C'].map(p => (
                    <div key={p} style={{ flex: 1, background: '#fff', border: `1px solid ${config.color_secondary}20`, borderRadius: 6, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>🏷️</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: config.color_text }}>{p}</div>
                      <div style={{ fontSize: 13, color: config.color_secondary, fontWeight: 600 }}>€9.90</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* TYPOGRAPHIE */}
        {tab === 'fonts' && (
          <div className="wl-section">
            <div className="wl-section-title">✍️ Typographies</div>
            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">Police titres (Display)</label>
                <select className="form-control" value={config.font_display} onChange={e => update('font_display', e.target.value)}>
                  {FONTS_DISPLAY.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <div className="font-preview" style={{ fontFamily: config.font_display, marginTop: 10 }}>Le meilleur de l'épicerie</div>
              </div>
              <div className="form-group">
                <label className="form-label">Police UI (Interface)</label>
                <select className="form-control" value={config.font_ui} onChange={e => update('font_ui', e.target.value)}>
                  {FONTS_UI.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <div className="font-preview" style={{ fontFamily: config.font_ui, fontSize: 14, marginTop: 10 }}>Ajouter au panier • Boutique • Contact</div>
              </div>
              <div className="form-group">
                <label className="form-label">Police corps de texte</label>
                <select className="form-control" value={config.font_body} onChange={e => update('font_body', e.target.value)}>
                  {['Crimson Pro', 'Georgia', 'Lora', 'Source Serif Pro', 'EB Garamond'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <div className="font-preview" style={{ fontFamily: config.font_body, fontSize: 15, marginTop: 10 }}>Épices nordiques, flocons d'avoine, baies séchées — tout ce qu'il faut.</div>
              </div>
            </div>
          </div>
        )}

        {/* E-COMMERCE */}
        {tab === 'ecommerce' && (
          <div className="wl-section">
            <div className="wl-section-title">🛒 Paramètres e-commerce</div>
            <div className="grid-3">
              <div className="form-group"><label className="form-label">Devise</label>
                <select className="form-control" value={config.currency} onChange={e => update('currency', e.target.value)}>
                  <option value="EUR">Euro (€)</option>
                  <option value="GBP">Livre (£)</option>
                  <option value="CHF">Franc suisse (CHF)</option>
                  <option value="USD">Dollar ($)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Taux TVA (%)</label><input type="number" className="form-control mono" value={config.tva_rate} onChange={e => update('tva_rate', parseFloat(e.target.value) || 20)} /></div>
              <div className="form-group"><label className="form-label">Livraison gratuite dès (€)</label><input type="number" className="form-control mono" value={config.free_shipping_threshold} onChange={e => update('free_shipping_threshold', parseFloat(e.target.value) || 50)} /></div>
            </div>
          </div>
        )}

        {/* SMTP */}
        {tab === 'smtp' && (
          <div className="wl-section">
            <div className="wl-section-title">📧 Configuration email (SMTP)</div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1E40AF' }}>
              💡 Utilisé pour l'envoi des emails de confirmation commande, relances panier abandonné et newsletters.
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Serveur SMTP</label><input className="form-control mono" value={config.smtp_host} onChange={e => update('smtp_host', e.target.value)} placeholder="smtp.gmail.com" /></div>
              <div className="form-group"><label className="form-label">Utilisateur</label><input className="form-control" value={config.smtp_user} onChange={e => update('smtp_user', e.target.value)} placeholder="contact@monsite.fr" /></div>
              <div className="form-group"><label className="form-label">Email expéditeur</label><input className="form-control" value={config.smtp_from} onChange={e => update('smtp_from', e.target.value)} placeholder="Svenska Delikatessen <noreply@..." /></div>
            </div>
          </div>
        )}

        {/* IMPORT */}
        {tab === 'import' && (
          <>
            <div className="wl-section">
              <div className="wl-section-title">📥 Import de données CSV</div>
              <div className="form-group">
                <label className="form-label">Type de données à importer</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['products', '📦 Articles'], ['contacts', '👤 Clients'], ['suppliers', '🏭 Fournisseurs'], ['stock', '🔢 Stock']].map(([k, l]) => (
                    <button key={k} className={`btn ${importType === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setImportType(k); setImportResult(null); }}>{l}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div className="form-label">Format CSV attendu</div>
                <div className="csv-template">{TEMPLATES[importType]}</div>
              </div>

              <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleImport} />
              <div className="import-zone" onClick={() => fileRef.current?.click()}>
                <div className="import-zone-icon">{importing ? '⏳' : '📂'}</div>
                <div className="import-zone-text">{importing ? 'Import en cours…' : 'Cliquez pour sélectionner votre fichier CSV'}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Format : UTF-8, séparateur virgule</div>
              </div>

              {importResult && (
                <div className={`result-box ${importResult.errors.length === 0 ? 'result-ok' : 'result-err'}`}>
                  <strong>✅ {importResult.imported} ligne(s) importée(s)</strong>
                  {importResult.errors.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      ❌ Erreurs : {importResult.errors.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
export default function WhiteLabelPage() { return <Suspense><WhiteLabelInner /></Suspense>; }
