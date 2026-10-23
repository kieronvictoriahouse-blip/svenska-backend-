'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { T as TH } from '@/lib/admin-theme';
import { adminFetch } from '@/lib/auth-client';
import { useT } from '@/lib/admin-i18n';
import { useIsMobile } from '@/lib/use-mobile';
import SegTabs, { minTextCss } from '@/components/SegTabs';
import { TWL } from './i18n';

type Config = {
  site_name: string; site_slogan: string; logo_url: string; favicon_url: string; front_url: string;
  color_primary: string; color_secondary: string; color_bg: string; color_text: string;
  font_display: string; font_body: string; font_ui: string;
  email: string; phone: string; address: string; siret: string; tva: string;
  legal_name: string; rcs_city: string; shop_city: string;
  instagram: string; facebook: string; pinterest: string;
  currency: string; tva_rate: number; free_shipping_threshold: number;
  smtp_host: string; smtp_port: string; smtp_user: string; smtp_pass: string; smtp_from: string;
  announcement_fr: string; announcement_sv: string; announcement_en: string;
  footer_desc_fr: string; footer_desc_sv: string; footer_desc_en: string;
  footer_tagline_fr: string; footer_tagline_sv: string; footer_tagline_en: string;
};

const FONTS_DISPLAY = ['Cormorant Garamond', 'Playfair Display', 'Libre Baskerville', 'Merriweather', 'Lora'];
const FONTS_BODY = ['Crimson Pro', 'Lora', 'Source Serif 4', 'EB Garamond', 'Spectral'];
const FONTS_UI = ['Jost', 'Inter', 'DM Sans', 'Plus Jakarta Sans', 'Outfit'];

const DEFAULT_CONFIG: Config = {
  site_name: 'Mon Épicerie', site_slogan: 'Saveurs authentiques', logo_url: '', favicon_url: '', front_url: '',
  color_primary: '#3E5238', color_secondary: '#9E5A3C', color_bg: '#F6F1E9', color_text: '#1C2028',
  font_display: 'Cormorant Garamond', font_body: 'Crimson Pro', font_ui: 'Jost',
  email: '', phone: '', address: '', siret: '', tva: '',
  legal_name: '', rcs_city: '', shop_city: '',
  instagram: '', facebook: '', pinterest: '',
  currency: 'EUR', tva_rate: 20, free_shipping_threshold: 50,
  smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_from: '',
  announcement_fr: 'Livraison gratuite dès 50€ · Produits authentiques · Paiement sécurisé',
  announcement_sv: 'Fri frakt från 50€ · Autentiska produkter · Säker betalning',
  announcement_en: 'Free delivery from €50 · Authentic products · Secure payment',
  footer_desc_fr: '', footer_desc_sv: '', footer_desc_en: '',
  footer_tagline_fr: '', footer_tagline_sv: '', footer_tagline_en: '',
};

function WhiteLabelInner() {
  const { t, tc, lang } = useT(TWL);
  const isMobile = useIsMobile();
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
    const res = await adminFetch('/api/white-label');
    const data = await res.json();
    if (data.config && data.config.id) setConfig({ ...DEFAULT_CONFIG, ...data.config });
  }

  async function save() {
    setSaving(true);
    const res = await adminFetch('/api/white-label', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
    setSaving(false);
    if (res.ok) showToast(t('msgSauve'));
    else showToast(t('msgErrSauve'));
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
    if (lines.length < 2) { showToast(t('msgFichierVide')); setImporting(false); return; }
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((h, j) => { row[h] = vals[j] || ''; });
      rows.push(row);
    }

    const res = await adminFetch(`/api/white-label?type=${importType}`, {
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

  /* ═══════════════════════════════════════════════════════════════
     ÉCRAN 19 — WHITE LABEL
     Handoff §19 : 5 pastilles de couleur 44 px, sélecteurs de police,
     zones de dépôt logo/favicon, et aperçu en direct à droite.
     Les onglets Contact, Emails et Import sont conservés : ils portent
     des réglages réels absents de la maquette.
     ═══════════════════════════════════════════════════════════════ */

  const css = `
    .form-group { margin-bottom:12px; }
    .form-label { display:block; font-size:11px; font-weight:600; color:${TH.text2b}; margin-bottom:5px; }
    .form-control { width:100%; height:34px; border:1px solid ${TH.borderField}; border-radius:7px; padding:0 10px; font-size:12.5px; background:#fff; outline:none; }
    .form-control:focus { border-color:var(--accent); }
    textarea.form-control { height:auto; padding:8px 10px; line-height:1.5; }
    .form-hint { font-size:10.5px; color:${TH.muted}; margin-top:4px; }
    .card { background:#fff; border:1px solid ${TH.border}; border-radius:10px; margin-bottom:12px; }
    .card-header { padding:12px 15px; border-bottom:1px solid ${TH.border}; display:flex; align-items:center; justify-content:space-between; }
    .card-title { font-size:12.5px; font-weight:600; color:${TH.ink}; }
    .card-body { padding:13px 15px; }
    .btn { display:inline-flex; align-items:center; gap:6px; border-radius:7px; padding:8px 14px; font-size:12.5px; font-weight:500; cursor:pointer; border:1px solid ${TH.borderField}; background:#fff; color:#3A3228; }
    .btn-primary { background:${TH.ink}; color:#fff; border-color:${TH.ink}; }
    .btn-sm { padding:6px 11px; font-size:11.5px; }
    .grid-2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
    .wl-swatches { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; }
    .wl-hex { height:26px; font-size:11px; text-align:center; margin-top:4px; }
    .wl-toggle { width:100%; background:none; border:0; border-bottom:1px solid ${TH.border}; cursor:pointer; text-align:left; color:inherit; font:inherit; }

    /* ═══ Téléphone ═══ */
    @media (max-width: 899px) {
      .form-group { margin-bottom:14px; }
      .form-label { font-size:12.5px; }
      .form-control { height:44px; font-size:16px; }
      textarea.form-control { height:auto; }
      .form-hint { font-size:12px; }
      .card-header { padding:12px 14px; min-height:52px; }
      .card-title { font-size:14.5px; }
      .card-body { padding:14px; }
      .btn { min-height:44px; font-size:14px; justify-content:center; }
      .grid-2 { grid-template-columns:minmax(0,1fr); gap:0 12px; }
      .wl-swatches { grid-template-columns:repeat(2, minmax(0,1fr)); }
      .wl-hex { height:44px; font-size:16px; }
      .wl-chip { min-height:44px; font-size:14px !important; }
      .wl-test { width:100%; min-height:48px; }
      .wl-toggle[aria-expanded="false"] { border-bottom-color:transparent; }
    }
    /* globals.css (ancien thème) masque tout <span> d'un .btn sous 480 px */
    @media (max-width: 480px) { .wl-root .btn span { display:inline-block; } }
    ${minTextCss('.wl-root')}
  `;

  const TABS: Array<[string, string]> = [
    ['identity', 'Identité'], ['contact', 'Contact & légal'],
    ['emails', 'Emails'], ['import', 'Import données'],
  ];

  const SWATCHES: Array<{ key: keyof Config; label: string }> = [
    { key: 'color_primary',   label: 'Primaire' },
    { key: 'color_secondary', label: 'Secondaire' },
    { key: 'color_bg',        label: 'Fond' },
    { key: 'color_text',      label: 'Encre' },
  ];

  const TABS_M: Record<string, [string, string]> = {
    identity: ['Identité', 'palette'], contact: ['Contact', 'storefront'], emails: ['Emails', 'mail'], import: ['Import', 'upload_file'],
  };

  const saveBtn = (
    <button className="sc-btn sc-btn-green" onClick={save} disabled={saving}>
      <span className="ms">save</span>{saving ? 'Enregistrement…' : 'Enregistrer'}
    </button>
  );

  // Aperçu en direct : colonne de droite sur ordinateur, dans la carte
  // « Couleurs » sur téléphone (sinon il tombait tout en bas, loin des réglages).
  const preview = (
    <>
      <div style={{
        background: config.color_bg || '#F6F1E9', borderRadius: 10, padding: 20,
        border: `1px solid ${TH.border}`,
      }}>
        {config.logo_url
          ? <img src={config.logo_url} alt="" style={{ maxHeight: 34, maxWidth: '100%', marginBottom: 10 }} />
          : null}
        <div style={{
          fontFamily: `'${config.font_display}', serif`, fontSize: 24, fontWeight: 600,
          color: config.color_text || '#1C2028', lineHeight: 1.15,
        }}>{config.site_name}</div>
        <div style={{
          fontFamily: `'${config.font_body}', serif`, fontSize: 12.5,
          color: config.color_text || '#1C2028', opacity: .7, marginTop: 5,
        }}>{config.site_slogan}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <span style={{
            background: config.color_primary, color: '#fff', borderRadius: 7,
            padding: '8px 14px', fontSize: 12.5, fontWeight: 500,
            fontFamily: `'${config.font_ui}', sans-serif`,
          }}>{t('decouvrir')}</span>
          <span style={{
            background: config.color_secondary + '22', color: config.color_secondary,
            borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 600,
            fontFamily: `'${config.font_ui}', sans-serif`,
          }}>{t('nouveaute')}</span>
        </div>
      </div>
      <div className="sc-num" style={{ fontSize: 10.5, color: TH.muted, marginTop: 8, textAlign: 'center' }}>
        {config.color_primary} · {config.color_secondary} · {config.color_bg} · {config.color_text}
      </div>
    </>
  );

  return (
    <div className="wl-root">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">{t('sous')}</div>
        </div>
        {/* Téléphone : Enregistrer passe dans la barre collée en bas */}
        {!isMobile && <div className="sc-actions">{saveBtn}</div>}
      </div>

      <div className="sc-only-mobile" style={{ marginBottom: 12 }}>
        <SegTabs label="Sections des réglages" value={tab} onChange={setTab}
                 tabs={TABS.map(([k, l]) => ({ key: k, label: TABS_M[k][0], icon: TABS_M[k][1], title: l }))} />
      </div>

      <div className="sc-hide-mobile" style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${TH.border}`, overflowX: 'auto' }}>
        {TABS.map(([k, l]) => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer', padding: '9px 13px', fontSize: 12.5,
                whiteSpace: 'nowrap', fontWeight: on ? 600 : 400,
                color: on ? 'var(--accent)' : TH.text2,
                boxShadow: on ? 'inset 0 -2px 0 var(--accent)' : undefined,
              }}>{l}</button>
          );
        })}
      </div>

      {/* ══════════ IDENTITÉ ══════════
          Téléphone : sections repliables (la première ouverte), chacune
          résumée quand elle est fermée ; Enregistrer collé en bas. */}
      {tab === 'identity' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 420px', minWidth: 0 }}>

            <Section title={t('marque')} mobile={isMobile} defaultOpen hint={[config.site_name, config.front_url].filter(Boolean).join(' · ')}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">{t('nomBoutique')}</label>
                    <input className="form-control" value={config.site_name} onChange={e => update('site_name', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('slogan')}</label>
                    <input className="form-control" value={config.site_slogan} onChange={e => update('site_slogan', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">URL de la boutique</label>
                    <input className="form-control" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={config.front_url} onChange={e => update('front_url', e.target.value)} placeholder="https://www.votre-boutique.fr" />
                  </div>
                </div>
            </Section>

            <Section title={t('couleurs')} mobile={isMobile}
                     hint={<span style={{ display: 'inline-flex', gap: 5, verticalAlign: 'middle' }}>{SWATCHES.map(s => <span key={String(s.key)} style={{ width: 16, height: 16, borderRadius: 4, background: String(config[s.key] || '#fff'), border: `1px solid ${TH.border}` }} />)}</span>}>
                <div className="wl-swatches">
                  {SWATCHES.map(s => (
                    <div key={String(s.key)} style={{ textAlign: 'center' }}>
                      <label style={{ cursor: 'pointer', display: 'inline-block' }}>
                        <span style={{
                          display: 'block', width: 44, height: 44, borderRadius: 10, margin: '0 auto 7px',
                          background: String(config[s.key] || '#fff'), border: `1px solid ${TH.border}`,
                        }} />
                        <input type="color" aria-label={`Couleur ${s.label}`} value={String(config[s.key] || '#000000')}
                               onChange={e => update(s.key, e.target.value)}
                               style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                      </label>
                      <div style={{ fontSize: 11, fontWeight: 600, color: TH.ink }}>{s.label}</div>
                      <input className="form-control sc-num wl-hex" aria-label={`Code couleur ${s.label}`} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                             value={String(config[s.key] || '')} onChange={e => update(s.key, e.target.value)} />
                    </div>
                  ))}
                </div>
                {isMobile && (
                  <div style={{ marginTop: 16 }}>
                    <div className="form-label" style={{ marginBottom: 8 }}>{t('apercu')}</div>
                    {preview}
                  </div>
                )}
            </Section>

            <Section title={t('typoLogo')} mobile={isMobile} hint={[config.font_display, config.font_body, config.font_ui].join(' · ')}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">{t('policeTitres')}</label>
                    <select className="form-control" value={config.font_display} onChange={e => update('font_display', e.target.value)}>
                      {FONTS_DISPLAY.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('policeTexte')}</label>
                    <select className="form-control" value={config.font_body} onChange={e => update('font_body', e.target.value)}>
                      {FONTS_BODY.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('policeUi')}</label>
                    <select className="form-control" value={config.font_ui} onChange={e => update('font_ui', e.target.value)}>
                      {FONTS_UI.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid-2" style={{ marginTop: 4 }}>
                  <div className="form-group">
                    <label className="form-label">{t('logoPrincipal')}</label>
                    <input className="form-control" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={config.logo_url} onChange={e => update('logo_url', e.target.value)} placeholder="https://…" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('favicon')}</label>
                    <input className="form-control" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={config.favicon_url} onChange={e => update('favicon_url', e.target.value)} placeholder="https://…" />
                  </div>
                </div>
            </Section>

            <Section title={t('bandeau')} mobile={isMobile} hint={config.announcement_fr}>
                {(['fr', 'sv', 'en'] as const).map(l => (
                  <div className="form-group" key={l}>
                    <label className="form-label">{l.toUpperCase()}</label>
                    <input className="form-control" value={(config as any)[`announcement_${l}`] || ''}
                           onChange={e => update(`announcement_${l}` as keyof Config, e.target.value)} />
                  </div>
                ))}
            </Section>
          </div>

          {/* Aperçu en direct (ordinateur) */}
          {!isMobile && (
            <div style={{ flex: '1 1 280px', minWidth: 0, position: 'sticky', top: 8 }}>
              <div className="card">
                <div className="card-header"><span className="card-title">{t('apercu')}</span></div>
                <div className="card-body">{preview}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ CONTACT & LÉGAL ══════════ */}
      {tab === 'contact' && (
        <div style={{ maxWidth: 720 }}>
          <Section title={t('coordonnees')} mobile={isMobile} defaultOpen hint={[config.email, config.phone].filter(Boolean).join(' · ')}>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">{tc('email')}</label><input className="form-control" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={config.email} onChange={e => update('email', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{tc('phone')}</label><input className="form-control" inputMode="tel" autoComplete="tel" value={config.phone} onChange={e => update('phone', e.target.value)} /></div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">{tc('address')}</label><input className="form-control" value={config.address} onChange={e => update('address', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">SIRET</label><input className="form-control sc-num" inputMode="numeric" value={config.siret} onChange={e => update('siret', e.target.value)} /></div>
                {/* Identité légale : ce qui figure sur les factures. Vide,
                    la ligne est omise du document — jamais remplacée par
                    un nom par défaut. */}
                <div className="form-group"><label className="form-label">Dénomination légale (ex. EI Prénom Nom)</label><input className="form-control" value={config.legal_name || ''} onChange={e => update('legal_name', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Ville du greffe (RCS)</label><input className="form-control" value={config.rcs_city || ''} onChange={e => update('rcs_city', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Ville de l&rsquo;atelier (citée dans les emails)</label><input className="form-control" value={config.shop_city || ''} onChange={e => update('shop_city', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">N° TVA</label><input className="form-control sc-num" autoCapitalize="characters" spellCheck={false} value={config.tva} onChange={e => update('tva', e.target.value)} /></div>
              </div>
          </Section>
          <Section title={t('reseaux')} mobile={isMobile} hint={[config.instagram, config.facebook, config.pinterest].filter(Boolean).length + ' renseigné(s)'}>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Instagram</label><input className="form-control" inputMode="url" autoCapitalize="none" spellCheck={false} value={config.instagram} onChange={e => update('instagram', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Facebook</label><input className="form-control" inputMode="url" autoCapitalize="none" spellCheck={false} value={config.facebook} onChange={e => update('facebook', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Pinterest</label><input className="form-control" inputMode="url" autoCapitalize="none" spellCheck={false} value={config.pinterest} onChange={e => update('pinterest', e.target.value)} /></div>
              </div>
          </Section>
          <Section title={t('commerce')} mobile={isMobile} hint={`${config.currency} · TVA ${config.tva_rate} % · franco ${config.free_shipping_threshold} €`}>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">{t('devise')}</label><input className="form-control" autoCapitalize="characters" value={config.currency} onChange={e => update('currency', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t('tauxTva')}</label><input className="form-control sc-num" type="number" inputMode="decimal" value={config.tva_rate} onChange={e => update('tva_rate', parseFloat(e.target.value) || 0)} /></div>
                <div className="form-group">
                  <label className="form-label">{t('franco')}</label>
                  <input className="form-control sc-num" type="number" inputMode="decimal" value={config.free_shipping_threshold}
                         onChange={e => update('free_shipping_threshold', parseFloat(e.target.value) || 50)} />
                  <div className="form-hint">{t('francoNote')}</div>
                </div>
              </div>
          </Section>
          <Section title={t('piedPage')} mobile={isMobile}>
              {(['fr', 'sv', 'en'] as const).map(l => (
                <div className="grid-2" key={l}>
                  <div className="form-group">
                    <label className="form-label">Description {l.toUpperCase()}</label>
                    <textarea className="form-control" rows={2} value={(config as any)[`footer_desc_${l}`] || ''}
                              onChange={e => update(`footer_desc_${l}` as keyof Config, e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Accroche {l.toUpperCase()}</label>
                    <input className="form-control" value={(config as any)[`footer_tagline_${l}`] || ''}
                           onChange={e => update(`footer_tagline_${l}` as keyof Config, e.target.value)} />
                  </div>
                </div>
              ))}
          </Section>
        </div>
      )}

      {/* ══════════ EMAILS ══════════ */}
      {tab === 'emails' && (
        <div style={{ maxWidth: 720 }}>
          <SmtpSection config={config} update={update} />
        </div>
      )}

      {/* ══════════ IMPORT ══════════ */}
      {tab === 'import' && (
        <div style={{ maxWidth: 620 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">{t('importDonnees')}</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">{t('typeDonnees')}</label>
                <select className="form-control" value={importType} onChange={e => setImportType(e.target.value)}>
                  <option value="products">{tc('products')}</option>
                  <option value="contacts">{t('contacts')}</option>
                </select>
              </div>
              <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                <span className="ms">upload_file</span>
                {importing ? 'Import en cours…' : 'Choisir un fichier CSV'}
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} disabled={importing} />
              </label>
              {importResult && (
                <div style={{ marginTop: 12, padding: '11px 13px', background: '#F2F5F0', borderRadius: 7, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: TH.green }}>{importResult.imported} ligne(s) importée(s)</div>
                  {importResult.errors.length > 0 && (
                    <ul style={{ margin: '6px 0 0 16px', color: TH.red }}>
                      {importResult.errors.slice(0, 8).map((er, i) => <li key={i}>{er}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Téléphone : Enregistrer collé en bas de l'écran, au-dessus des onglets */}
      {isMobile && <div className="sc-sticky-actions">{saveBtn}</div>}

      {toast && <div className="sc-toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
export default function WhiteLabelPage() {
  return <Suspense><WhiteLabelInner /></Suspense>; }

/* Carte de réglages. Sur ordinateur : en-tête + contenu, comme avant.
   Sur téléphone : l'en-tête devient un bouton qui replie la section, et
   un résumé (valeurs actuelles) s'affiche quand elle est fermée. */
function Section({ title, hint, mobile, defaultOpen = false, children }: {
  title: React.ReactNode; hint?: React.ReactNode; mobile: boolean; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!mobile) {
    return (
      <div className="card">
        <div className="card-header"><span className="card-title">{title}</span></div>
        <div className="card-body">{children}</div>
      </div>
    );
  }
  return (
    <div className="card">
      <button type="button" className="card-header wl-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="card-title" style={{ display: 'block' }}>{title}</span>
          {!open && hint ? <span style={{ display: 'block', fontSize: 12.5, color: TH.text3, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</span> : null}
        </span>
        <span className="ms" style={{ fontSize: 24, color: TH.muted }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}


function SmtpSection({ config, update }: { config: any; update: (k: keyof Config, v: any) => void }) {
  const { t } = useT(TWL);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  async function testEmail() {
    setTesting(true);
    setTestResult('');
    try {
      const res = await adminFetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'test',
          to: config.email || config.smtp_from,
          smtp_override: {
            smtp_host: config.smtp_host,
            smtp_port: config.smtp_port,
            smtp_user: config.smtp_user,
            smtp_pass: config.smtp_pass,
            smtp_from: config.smtp_from,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) setTestResult(`✅ Email envoyé via ${data.method === 'smtp' ? 'SMTP' : 'Resend'} !`);
      else setTestResult(`❌ Erreur : ${data.error}`);
    } catch (e: any) {
      setTestResult(`❌ ${e.message}`);
    } finally {
      setTesting(false);
    }
  }

  const PROVIDERS = [
    { label: 'Gmail', host: 'smtp.gmail.com', port: '587', note: 'Nécessite un mot de passe d\'application Google' },
    { label: 'OVH', host: 'ssl0.ovh.net', port: '587', note: 'Votre hébergeur OVH' },
    { label: 'Brevo (ex-Sendinblue)', host: 'smtp-relay.brevo.com', port: '587', note: 'Gratuit jusqu\'à 300 emails/jour' },
    { label: 'Resend', host: 'smtp.resend.com', port: '587', note: 'Configurer RESEND_API_KEY dans Vercel env vars' },
    { label: 'Ionos / 1&1', host: 'smtp.ionos.fr', port: '587', note: '' },
  ];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#1E40AF' }}>
        💡 Configurez votre serveur email ici. Le système utilisera SMTP si configuré, sinon Resend (via variable d'environnement <code>RESEND_API_KEY</code>).
      </div>

      {/* Presets fournisseurs */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{t('choisirFournisseur')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PROVIDERS.map(p => (
            <button
              key={p.label}
              className="wl-chip"
              aria-pressed={config.smtp_host === p.host}
              onClick={() => { update('smtp_host', p.host); update('smtp_port', p.port); }}
              style={{
                padding: '6px 14px', borderRadius: 20, border: '1px solid #d1d5db',
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: config.smtp_host === p.host ? '#1e293b' : '#fff',
                color: config.smtp_host === p.host ? '#fff' : '#374151',
              }}
              title={p.note}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="wl-section" style={{ marginBottom: 16 }}>
        <div className="wl-section-title">⚙️ Paramètres SMTP</div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">{t('serveurSmtp')}</label>
            <input className="form-control mono" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={config.smtp_host || ''} onChange={e => update('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Port</label>
            <input className="form-control mono" inputMode="numeric" value={config.smtp_port || '587'} onChange={e => update('smtp_port', e.target.value)} placeholder="587" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('utilisateur')}</label>
            <input className="form-control" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={config.smtp_user || ''} onChange={e => update('smtp_user', e.target.value)} placeholder="contact@monsite.fr" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('motDePasse')}</label>
            <input className="form-control" type="password" autoComplete="new-password" value={config.smtp_pass || ''} onChange={e => update('smtp_pass', e.target.value)} placeholder="••••••••••••" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">{t('expediteur')}</label>
            <input className="form-control" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={config.smtp_from || ''} onChange={e => update('smtp_from', e.target.value)} placeholder={`Ma Boutique <noreply@votre-domaine.fr>`} />
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Format recommandé : Nom Boutique {'<'}adresse@domaine.fr{'>'}</p>
          </div>
        </div>
      </div>

      {/* Test */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button
          className="wl-test"
          onClick={testEmail}
          disabled={testing}
          style={{
            padding: '9px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: testing ? '#94a3b8' : '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
          }}
        >
          {testing ? '⏳ Envoi…' : '📤 Envoyer un email de test'}
        </button>
        {testResult && (
          <span style={{ fontSize: 13, fontWeight: 500, color: testResult.startsWith('✅') ? '#065f46' : '#991b1b' }}>
            {testResult}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
        L'email de test sera envoyé à : <strong>{config.email || config.smtp_from || '(email non configuré)'}</strong>
        {' '}— Pensez à sauvegarder avant de tester.
      </p>
    </div>
  );
}
