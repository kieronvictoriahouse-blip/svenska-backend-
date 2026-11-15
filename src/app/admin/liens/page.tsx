'use client';
import { useEffect, useMemo, useState } from 'react';
import { T } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   LIENS SUIVIS  ·  /admin/liens

   Fabrique les liens à coller dans les publications (Facebook,
   Instagram, groupes), les flyers et le QR code du marché. Chaque lien
   porte des paramètres UTM : Google Analytics range alors la visite dans
   le bon canal au lieu de « Direct » — c'est ce qui permet de savoir si
   les réseaux sociaux vendent vraiment (plan du 15/11/2026).

   Plus bas : marquer un appareil « interne » (?interne=1) pour que vos
   propres visites ne comptent pas comme des clients.
   ═══════════════════════════════════════════════════════════════ */

const FRONT = (process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr').replace(/\/$/, '');

type Produit = { id: string; name_fr: string; slug?: string | null; tags?: string[] | null };

const PAGES: { label: string; path: string }[] = [
  { label: 'Accueil', path: '/' },
  { label: 'Noël suédois', path: '/noel' },
  { label: 'Toute la boutique', path: '/boutique' },
  { label: 'Box cadeaux', path: '/boutique?rayon=box' },
  { label: 'Bonbons suédois', path: '/bonbons-suedois' },
  { label: 'Dips OLW', path: '/olw' },
  { label: 'Ahlgrens Bilar', path: '/ahlgrens-bilar' },
  { label: 'Recettes', path: '/recettes' },
];

/* source → medium GA4 : « social » range la visite dans Organic Social,
   « offline » / « email » dans leurs canaux. */
const SOURCES: { v: string; label: string; medium: string }[] = [
  { v: 'facebook', label: 'Facebook (page)', medium: 'social' },
  { v: 'facebook-groupe', label: 'Groupe Facebook', medium: 'social' },
  { v: 'instagram', label: 'Instagram', medium: 'social' },
  { v: 'whatsapp', label: 'WhatsApp', medium: 'social' },
  { v: 'marche', label: 'Marché (QR code)', medium: 'offline' },
  { v: 'flyer', label: 'Flyer / carte dans le colis', medium: 'offline' },
  { v: 'email', label: 'E-mail', medium: 'email' },
];

const slugify = (nom: string, id: string) => (nom || 'produit').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) + '-' + String(id).slice(0, 8);

async function qrSvg(texte: string): Promise<string> {
  const { prepareZXingModule, writeBarcode } = await import('zxing-wasm/writer');
  prepareZXingModule({ overrides: { locateFile: (f: string) => (f.endsWith('.wasm') ? '/zxing_writer.wasm' : f) } });
  const r = await writeBarcode(texte, { format: 'QRCode', ecLevel: 'M', scale: 10 } as any);
  if (r.error) throw new Error(r.error);
  return r.svg.slice(r.svg.indexOf('<svg'));
}

const champ: React.CSSProperties = {
  width: '100%', height: 42, padding: '0 12px', border: `1px solid ${T.borderField}`, borderRadius: 8,
  fontSize: 14, background: '#fff', color: T.ink, fontFamily: 'inherit',
};
const etiquette: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: T.text2, margin: '0 0 6px', letterSpacing: 0.3 };
const carte: React.CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 22 };
const bouton = (plein: boolean): React.CSSProperties => ({
  height: 40, padding: '0 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  border: plein ? 'none' : `1px solid ${T.borderField}`, background: plein ? T.green : '#fff', color: plein ? '#fff' : T.ink,
});

export default function LiensPage() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [cible, setCible] = useState('page:/noel');
  const [source, setSource] = useState('facebook');
  const [campagne, setCampagne] = useState('noel-2026');
  const [contenu, setContenu] = useState('');
  const [svg, setSvg] = useState('');
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then((d: any) => {
      const liste: Produit[] = (Array.isArray(d) ? d : d?.products || []).map((p: any) => ({ id: p.id, name_fr: p.name_fr, slug: p.slug, tags: p.tags }));
      liste.sort((a, b) => {
        const lot = (p: Produit) => ((p.tags || []).some(t => t === 'lot' || t === 'box') ? 0 : 1);
        return lot(a) - lot(b) || a.name_fr.localeCompare(b.name_fr, 'fr');
      });
      setProduits(liste);
    }).catch(() => setProduits([]));
  }, []);

  const lien = useMemo(() => {
    let chemin = '/';
    if (cible.startsWith('page:')) chemin = cible.slice(5);
    else if (cible.startsWith('prod:')) {
      const p = produits.find(x => x.id === cible.slice(5));
      if (p) chemin = '/produit/' + (p.slug || slugify(p.name_fr, p.id));
    }
    const u = new URL(FRONT + chemin);
    const s = SOURCES.find(x => x.v === source) || SOURCES[0];
    u.searchParams.set('utm_source', s.v);
    u.searchParams.set('utm_medium', s.medium);
    if (campagne.trim()) u.searchParams.set('utm_campaign', campagne.trim().toLowerCase().replace(/\s+/g, '-'));
    if (contenu.trim()) u.searchParams.set('utm_content', contenu.trim().toLowerCase().replace(/\s+/g, '-'));
    return u.toString();
  }, [cible, source, campagne, contenu, produits]);

  useEffect(() => {
    let vivant = true;
    setCopie(false);
    qrSvg(lien).then(s => { if (vivant) setSvg(s); }).catch(() => { if (vivant) setSvg(''); });
    return () => { vivant = false; };
  }, [lien]);

  const copier = async () => {
    try { await navigator.clipboard.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 2000); } catch { /* sélection manuelle */ }
  };
  const telechargerQr = () => {
    if (!svg) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `qr-${source}-${campagne || 'lien'}.svg`;
    a.click();
  };
  const imprimerQr = () => {
    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>QR code</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:Georgia,serif;text-align:center">
      <div><div style="width:12cm;margin:0 auto">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div>
      <p style="font-size:26px;margin:18px 0 4px">Swedish Cravings</p><p style="font-size:16px;color:#555;margin:0">Scannez pour commander en ligne</p></div>
      <script>setTimeout(function(){print()},300)<\/script>`);
    w.document.close();
  };

  const interne = `${FRONT}/?interne=1`;
  const [svgInterne, setSvgInterne] = useState('');
  useEffect(() => { qrSvg(interne).then(setSvgInterne).catch(() => setSvgInterne('')); }, [interne]);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px 60px', color: T.ink }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 6px' }}>Liens suivis</h1>
      <p style={{ color: T.text2b, fontSize: 15, margin: '0 0 22px', maxWidth: 720, lineHeight: 1.55 }}>
        Un lien par publication : collez-le dans Facebook, Instagram ou WhatsApp, ou imprimez le QR code.
        Google Analytics saura alors d’où vient chaque visite et chaque vente, au lieu de tout ranger en « Direct ».
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }} className="liens-grille">
        <div style={carte}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={etiquette} htmlFor="l-cible">Vers quelle page ?</label>
              <select id="l-cible" style={champ} value={cible} onChange={e => setCible(e.target.value)}>
                <optgroup label="Pages">
                  {PAGES.map(p => <option key={p.path} value={'page:' + p.path}>{p.label}</option>)}
                </optgroup>
                <optgroup label="Produits (packs et box en premier)">
                  {produits.map(p => <option key={p.id} value={'prod:' + p.id}>{p.name_fr}</option>)}
                </optgroup>
              </select>
            </div>
            <div>
              <label style={etiquette} htmlFor="l-source">Où sera publié le lien ?</label>
              <select id="l-source" style={champ} value={source} onChange={e => setSource(e.target.value)}>
                {SOURCES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={etiquette} htmlFor="l-camp">Campagne</label>
                <input id="l-camp" style={champ} value={campagne} onChange={e => setCampagne(e.target.value)} placeholder="noel-2026" />
              </div>
              <div>
                <label style={etiquette} htmlFor="l-cont">Publication (facultatif)</label>
                <input id="l-cont" style={champ} value={contenu} onChange={e => setContenu(e.target.value)} placeholder="ex. lucia-safran" />
              </div>
            </div>
            <div>
              <label style={etiquette} htmlFor="l-url">Lien à copier</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="l-url" readOnly style={{ ...champ, fontSize: 13, color: T.text2 }} value={lien} onFocus={e => e.currentTarget.select()} />
                <button type="button" style={bouton(true)} onClick={copier}>{copie ? 'Copié ✓' : 'Copier'}</button>
              </div>
              <p style={{ fontSize: 13, color: T.text3, margin: '8px 0 0', lineHeight: 1.5 }}>
                Un lien différent par réseau et par publication : c’est ce qui permet de comparer ce qui vend.
              </p>
            </div>
          </div>
        </div>

        <div style={{ ...carte, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text2, marginBottom: 10 }}>QR code de ce lien</div>
          <div style={{ width: 240, height: 240, margin: '0 auto', background: '#fff' }}
               dangerouslySetInnerHTML={{ __html: svg ? svg.replace('<svg', '<svg width="100%" height="100%"') : '' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button type="button" style={bouton(false)} onClick={telechargerQr} disabled={!svg}>Télécharger</button>
            <button type="button" style={bouton(false)} onClick={imprimerQr} disabled={!svg}>Imprimer</button>
          </div>
          <p style={{ fontSize: 12, color: T.text3, margin: '10px 0 0' }}>Pour le marché : source « Marché (QR code) ».</p>
        </div>
      </div>

      <div style={{ ...carte, marginTop: 20, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px', gap: 20, alignItems: 'center' }} className="liens-grille">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px' }}>Vos appareils ne doivent pas compter comme des clients</h2>
          <p style={{ fontSize: 14, color: T.text2b, lineHeight: 1.6, margin: '0 0 12px' }}>
            Ouvrez une fois ce lien sur <strong>chaque</strong> téléphone et ordinateur de l’équipe (Kieron, Victoria) :
            vos visites seront ensuite écartées des statistiques. Pour annuler sur un appareil : le même lien avec <code>?interne=0</code>.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={interne} target="_blank" rel="noopener" style={{ ...bouton(true), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Marquer cet appareil</a>
            <code style={{ alignSelf: 'center', fontSize: 13, color: T.text2 }}>{interne}</code>
          </div>
        </div>
        <div style={{ width: 150, height: 150, background: '#fff' }}
             dangerouslySetInnerHTML={{ __html: svgInterne ? svgInterne.replace('<svg', '<svg width="100%" height="100%"') : '' }} />
      </div>

      <style>{`@media (max-width: 800px) { .liens-grille { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
