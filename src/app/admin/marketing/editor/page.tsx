'use client';
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { claudeEmailBrief } from '@/lib/email-brief';
import { adminFetch as adminFetchMarque } from '@/lib/auth-client';
import dynamic from 'next/dynamic';
import { adminFetch } from '@/lib/auth-client';
import { useT } from '@/lib/admin-i18n';
import { useIsMobile } from '@/lib/use-mobile';
import { T } from '@/lib/admin-theme';
import EmailApercu from '@/components/EmailApercu';
import { TED, testEnvoye, confirmerEnvoi, emailsEnvoyes } from './i18n';

/* ═══ Téléphone (< 900 px) ═══════════════════════════════════════
   Page plein écran (sans .sc-screen) : la hauteur de l'éditeur retire
   la topbar ET la barre d'onglets. Les barres de commande passent sur
   plusieurs lignes, champs à 16 px et boutons de 44 px ; en mode HTML,
   code et aperçu ne tiennent pas côte à côte sur 390 px : un
   sélecteur « Code / Aperçu » les montre l'un après l'autre, l'aperçu
   réduit à la largeur de l'écran. L'ordinateur garde ses styles en ligne. */
const ED_CSS = `
  .ed-onglets { overflow-x: auto; scrollbar-width: none; }
  .ed-onglets::-webkit-scrollbar { display: none; }
  .ed-onglet { white-space: nowrap; flex-shrink: 0; }
  @media (max-width: 899px) {
    .ed-onglet { min-height: 48px; padding: 10px 14px !important; font-size: 14px !important; }
    .ed-barre { padding: 10px 12px !important; gap: 8px !important; }
    .ed-champ { flex: 1 1 100% !important; min-width: 0 !important; width: 100%; font-size: 16px !important; min-height: 44px; }
    .ed-groupe { flex: 1 1 100%; }
    .ed-groupe > button { flex: 1 1 0; }
    .ed-btn { min-height: 44px; font-size: 14px !important; justify-content: center; }
    .ed-btn-s { min-height: 40px; font-size: 13px !important; padding: 8px 12px !important; }
    .ed-petit { font-size: 12.5px !important; }
    .ed-test { flex-wrap: wrap; padding: 10px 12px !important; }
    .ed-test > .ed-btn { flex: 1 1 auto; }
    .ed-promo { padding: 12px !important; max-height: none !important; }
    .ed-promo-champ { min-width: 0 !important; flex: 1 1 100% !important; }
    .ed-promo-actions { flex: 1 1 100%; }
    .ed-produits { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)) !important; }
    .ed-toast { left: 12px !important; right: 12px !important; top: 60px !important; text-align: center; }
  }
`;

const EmailEditor = dynamic<any>(() => import('react-email-editor').then((m: any) => ({ default: m.default })), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#64748b', fontSize: 14 }}>
      ⏳ Chargement de l'éditeur…
    </div>
  ),
});

type Campaign = {
  id: string; name: string; subject?: string; content?: string;
  target_segment: string; status: string; type?: string;
};

type Product = {
  id: string; name?: string; name_fr?: string; price: number;
  image_url?: string; image?: string; main_image?: string; images?: string[];
  description?: string; description_fr?: string;
};

/* Une campagne ne part qu'aux abonnés newsletter, désinscrits exclus
   (cf. /api/email). « Tous les clients (commandes) » écrivait à toute la
   table des commandes, sans consentement ni lien de désinscription. */
const SEGMENTS: Record<string, string> = {
  all: '📰 Abonnés newsletter',
  new_customers: '🆕 Abonnés ayant commandé (30 j)',
};

/** Résultat d'un envoi, en clair : combien sont partis, combien restent. */
function bilanEnvoi(r: any): string {
  const base = `✅ Envoyé à ${r.sent} abonné(s)${r.deja ? ` (+${r.deja} déjà servis)` : ''} sur ${r.total}`;
  if (r.restants > 0) {
    return `⚠️ ${r.sent} envoyé(s), ${r.restants} restant(s)${r.echecs?.length ? ` — ${r.echecs.length} échec(s)` : ''}. Clique à nouveau sur « Envoyer » pour continuer : ceux qui l’ont reçue ne la recevront pas deux fois.`;
  }
  return base;
}

export default function EmailEditorPage() {
  const { t, tc, lang } = useT(TED);
  const mobile = useIsMobile();
  // Téléphone, mode HTML : on montre le code OU l'aperçu.
  const [vueHtml, setVueHtml] = useState<'code' | 'apercu'>('code');
  const editorRef = useRef<any>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(600);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  /* La marque du brief IA vient de la config de l'instance : le studio
     d'une boutique ne doit jamais rediger au nom d'une autre. */
  const [marqueBrief, setMarqueBrief] = useState({ nom: '', url: '', email: '' });
  useEffect(() => {
    adminFetchMarque('/api/white-label').then(r => r.json()).then(j => {
      const c = j?.config || j || {};
      setMarqueBrief({ nom: c.site_name || '', url: c.front_url || '', email: c.email || c.smtp_user || '' });
    }).catch(() => { /* brief neutre */ });
  }, []);
  const [selectedId, setSelectedId] = useState('');
  const [subject, setSubject] = useState('');
  const [segment, setSegment] = useState('all');
  const [campName, setCampName] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [toast, setToast] = useState('');
  const [editorReady, setEditorReady] = useState(false);
  const [mode, setMode] = useState<'select' | 'new'>('select');

  // Product picker state
  const [showProducts, setShowProducts] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [promoSubject, setPromoSubject] = useState('');
  const [promoIntro, setPromoIntro] = useState('Découvrez notre sélection du moment :');
  const [generatingPromo, setGeneratingPromo] = useState(false);
  const [promoMode, setPromoMode] = useState<'editor' | 'html' | 'promo'>('editor');
  const [htmlContent, setHtmlContent] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [claudeBlock, setClaudeBlock] = useState<{ html: string; prompt: string } | null>(null);
  const [copiedWhat, setCopiedWhat] = useState<'html' | 'prompt' | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  // Le test ne part qu'à l'admin (contrôlé côté serveur) : son adresse est proposée d'office.
  useEffect(() => {
    try { const m = localStorage.getItem('sd_admin_email'); if (m) setTestEmail(e => e || m); } catch { /* stockage indisponible */ }
  }, []);

  useLayoutEffect(() => {
    const calc = () => {
      const bars = barsRef.current?.offsetHeight || 0;
      /* Sur téléphone, la topbar (48) ET la barre d'onglets (58) : avec
         52 seulement, le bas de l'éditeur passait sous les onglets. */
      const chrome = window.innerWidth < 900 ? 48 + 58 : 52;
      setEditorHeight(Math.max(320, window.innerHeight - chrome - bars));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [promoMode, mobile]);

  useEffect(() => {
    adminFetch('/api/marketing', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setCampaigns((d.campaigns || []).filter((c: Campaign) => c.type === 'email' || !c.type)));
  }, []);

  useEffect(() => {
    if (showProducts && products.length === 0) {
      adminFetch('/api/products?limit=100')
        .then(r => r.json())
        .then(d => setProducts(d.products || d || []));
    }
  }, [showProducts, products.length]);

  const loadCampaignIntoEditor = useCallback((campaign: Campaign) => {
    setSubject(campaign.subject || '');
    setSegment(campaign.target_segment || 'all');
    setSendResult('');
    const raw = campaign.content || '';
    try {
      const parsed = JSON.parse(raw);
      if (parsed.design) {
        setPromoMode('editor');
        if (editorReady) editorRef.current?.editor?.loadDesign(parsed.design);
        return;
      }
      if (parsed.html) {
        setHtmlContent(parsed.html);
        setPromoMode('html');
        return;
      }
    } catch { /* not JSON */ }
    if (raw) { setHtmlContent(raw); setPromoMode('html'); return; }
    /* Campagne sans contenu : on vide. Sans ça, le contenu de la campagne
       précédente restait affiché — et « Sauvegarder » l'écrivait dans
       celle-ci. */
    setHtmlContent('');
    const ed = editorRef.current?.editor;
    try { if (ed?.loadBlank) ed.loadBlank(); } catch { /* éditeur pas prêt */ }
  }, [editorReady]);

  /* Après une sauvegarde, la liste locale reprend ce qui a été écrit :
     sinon revenir sur la campagne rechargeait l'ancien contenu, et une
     2e sauvegarde l'écrasait en base. */
  const majLocale = (id: string, patch: Partial<Campaign>) =>
    setCampaigns(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)));

  useEffect(() => {
    if (!selectedId || !editorReady) return;
    const camp = campaigns.find(c => c.id === selectedId);
    if (camp) loadCampaignIntoEditor(camp);
  }, [selectedId, editorReady, campaigns, loadCampaignIntoEditor]);

  async function saveHtml() {
    if (!htmlContent) { showToast(t('msgVide')); return; }
    const content = JSON.stringify({ html: htmlContent, design: null });
    setSaving(true);
    try {
      if (mode === 'new' || !selectedId) {
        const name = campName || subject || `Campagne ${new Date().toLocaleDateString('fr-FR')}`;
        const res = await adminFetch('/api/marketing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type: 'email', status: 'draft', subject, target_segment: segment, content }),
        });
        const d = await res.json().catch(() => ({}));
        // « Sauvegardé » s'affichait même quand la création échouait.
        if (!res.ok || !d.campaign?.id) { showToast(`❌ ${d.error || 'Sauvegarde impossible'}`); return; }
        setSelectedId(d.campaign.id); setMode('select');
        const d2 = await (await adminFetch('/api/marketing')).json();
        setCampaigns((d2.campaigns || []).filter((c: Campaign) => c.type === 'email' || !c.type));
      } else {
        const res = await adminFetch(`/api/marketing?id=${selectedId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, target_segment: segment, content }),
        });
        if (!res.ok) { showToast(`❌ ${(await res.json().catch(() => ({}))).error || 'Sauvegarde impossible'}`); return; }
        majLocale(selectedId, { subject, target_segment: segment, content });
      }
      showToast(t('msgSauve'));
    } finally { setSaving(false); }
  }

  async function sendTestEmail(html: string) {
    if (!testEmail) { showToast(t('msgEmailTest')); return; }
    setSendingTest(true);
    try {
      const res = await adminFetch('/api/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test_campaign', to: testEmail, html, subject }),
      });
      const d = await res.json();
      if (res.ok) showToast(testEnvoye(testEmail, lang));
      else showToast(`❌ ${d.error}`);
    } finally { setSendingTest(false); }
  }

  async function sendHtml() {
    if (!htmlContent) { showToast(t('msgVide')); return; }
    if (!selectedId) { showToast(t('msgSauveDabord')); return; }
    if (!confirm(confirmerEnvoi(SEGMENTS[segment], lang))) return;
    setSending(true); setSendResult('');
    try {
      const res = await adminFetch('/api/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'campaign', campaign_id: selectedId, custom_html: htmlContent }),
      });
      const result = await res.json().catch(() => ({ error: `Envoi interrompu (${res.status})` }));
      if (res.ok) { setSendResult(bilanEnvoi(result)); showToast(emailsEnvoyes(result.sent, lang)); }
      else { setSendResult(`❌ ${result.error}`); showToast(`❌ ${result.error}`); }
    } finally { setSending(false); }
  }

  function exportAndSave() {
    if (!editorRef.current?.editor) { showToast(t('msgEditeur')); return; }
    editorRef.current.editor.exportHtml(async (data: any) => {
      const { design, html } = data;
      const content = JSON.stringify({ html, design });
      setSaving(true);
      try {
        if (mode === 'new') {
          if (!campName) { showToast(t('msgNomCampagne')); return; }
          const res = await adminFetch('/api/marketing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: campName, type: 'email', status: 'draft', subject, target_segment: segment, content }),
          });
          if (res.ok) {
            const { campaign } = await res.json();
            setSelectedId(campaign.id);
            setMode('select');
            const res2 = await adminFetch('/api/marketing');
            const d = await res2.json();
            setCampaigns((d.campaigns || []).filter((c: Campaign) => c.type === 'email' || !c.type));
            showToast(t('msgCampagneCreee'));
          } else {
            showToast(`❌ ${(await res.json().catch(() => ({}))).error || 'Sauvegarde impossible'}`);
          }
        } else {
          if (!selectedId) { showToast(t('msgSelectCampagne')); return; }
          const res = await adminFetch(`/api/marketing?id=${selectedId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, target_segment: segment, content }),
          });
          if (!res.ok) { showToast(`❌ ${(await res.json().catch(() => ({}))).error || 'Sauvegarde impossible'}`); return; }
          majLocale(selectedId, { subject, target_segment: segment, content });
          showToast(t('msgCampagneSauve'));
        }
      } finally {
        setSaving(false);
      }
    });
  }

  function exportAndSend() {
    if (!editorRef.current?.editor) { showToast(t('msgEditeur')); return; }
    const campId = selectedId;
    if (!campId) { showToast(t('msgSauveDabord')); return; }
    if (!confirm(confirmerEnvoi(SEGMENTS[segment], lang))) return;
    editorRef.current.editor.exportHtml(async (data: any) => {
      const { html } = data;
      setSending(true); setSendResult('');
      try {
        const res = await adminFetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'campaign', campaign_id: campId, custom_html: html }),
        });
        const result = await res.json().catch(() => ({ error: `Envoi interrompu (${res.status})` }));
        if (res.ok) {
          setSendResult(bilanEnvoi(result));
          showToast(emailsEnvoyes(result.sent, lang));
        } else {
          setSendResult(`❌ ${result.error}`);
          showToast(`❌ ${result.error}`);
        }
      } finally { setSending(false); }
    });
  }

  async function generateAndSavePromo() {
    if (selectedProducts.length === 0) { showToast(t('msgSelectProduit')); return; }
    if (!campName && mode === 'new') { showToast(t('msgNomCampagne')); return; }
    setGeneratingPromo(true);
    try {
      const prods = products.filter(p => selectedProducts.includes(p.id));
      const res = await adminFetch('/api/marketing/promo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: prods, subject: promoSubject, intro: promoIntro }),
      });
      const { html, error } = await res.json().catch(() => ({ error: 'Génération impossible' }));
      if (!res.ok || !html) { showToast(`❌ ${error || 'Génération impossible'}`); return; }

      const campSubject = promoSubject || `Nos sélections du moment`;
      const content = JSON.stringify({ html, design: null });

      let campId = selectedId;
      if (mode === 'new' || !campId) {
        const name = campName || campSubject || `Promo ${new Date().toLocaleDateString('fr-FR')}`;
        const r2 = await adminFetch('/api/marketing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type: 'email', status: 'draft', subject: campSubject, target_segment: segment, content }),
        });
        const d = await r2.json().catch(() => ({}));
        if (!r2.ok || !d.campaign?.id) { showToast(`❌ ${d.error || 'Sauvegarde impossible'}`); return; }
        campId = d.campaign.id;
        setSelectedId(campId);
        setCampName(name);
        setMode('select');
        const res2 = await adminFetch('/api/marketing');
        const d2 = await res2.json();
        setCampaigns((d2.campaigns || []).filter((c: Campaign) => c.type === 'email' || !c.type));
      } else {
        const r3 = await adminFetch(`/api/marketing?id=${campId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: campSubject, target_segment: segment, content }),
        });
        if (!r3.ok) { showToast(`❌ ${(await r3.json().catch(() => ({}))).error || 'Sauvegarde impossible'}`); return; }
        majLocale(campId, { subject: campSubject, target_segment: segment, content });
      }
      showToast(t('msgPromoGenere'));
      setSelectedProducts([]);
    } finally {
      setGeneratingPromo(false);
    }
  }

  const toggleProduct = (id: string) => {
    setSelectedProducts(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  function copyToClipboard(text: string, what: 'html' | 'prompt') {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedWhat(what);
      setTimeout(() => setCopiedWhat(null), 2000);
    });
  }

  function generateForClaude() {
    if (selectedProducts.length === 0) { showToast(t('msgSelectProduit')); return; }
    const prods = products.filter(p => selectedProducts.includes(p.id));

    const prodsYaml = prods.map(p => {
      const name = p.name_fr || p.name || '';
      const img  = p.image_url || p.image || p.main_image || (Array.isArray(p.images) ? p.images[0] : '') || '';
      const price = (p.price || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
      return `  - nom: "${name}"
    marque: "— ${name} —"
    prix: "${price}"
    image_url: "${img}"
    lien: "https://www.votre-boutique.fr/boutique"`;
    }).join('\n');

    const variables = `VARIABLES POUR CET EMAIL :
preheader: "(à compléter — 60-90 caractères pour l'aperçu inbox)"
intro_label: "— Lettre de la boutique —"
section_label: "${promoSubject || 'Nos sélections de la semaine'}"
produits:
${prodsYaml}
cta_bouton: "Visiter la boutique"
signature_phrase: "Merci d'être là, et à très vite."`;

    const prompt = claudeEmailBrief(marqueBrief) + '\n\n---\n\n' + variables + '\n\nGénère le HTML complet. Choisis toi-même un titre accrocheur, une intro chaleureuse (2-3 paragraphes) et un CTA émotionnel adaptés aux produits ci-dessus. Respecte scrupuleusement le template et la charte.';

    setClaudeBlock({ html: variables, prompt });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: ED_CSS }} />
      {toast && (
        <div className="ed-toast" role="status" style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: '#1e293b', color: '#fff', padding: '12px 20px', borderRadius: 8, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {/* BARRES FIXES — mesurées pour calculer la hauteur de l'éditeur */}
      <div ref={barsRef}>

      {/* MODE TABS */}
      <div className="ed-onglets" role="tablist" style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', display: 'flex' }}>
        <button
          onClick={() => setPromoMode('editor')} className="ed-onglet" role="tab" aria-selected={promoMode === 'editor'}
          style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', background: promoMode === 'editor' ? '#fff' : 'transparent', borderBottom: promoMode === 'editor' ? '2px solid #3b82f6' : '2px solid transparent', marginBottom: -2, fontSize: 13, fontWeight: 600, color: promoMode === 'editor' ? '#1d4ed8' : '#64748b' }}
        >
          ✏️ Éditeur Drag & Drop
        </button>
        <button
          onClick={() => { setPromoMode('promo'); setShowProducts(true); }} className="ed-onglet" role="tab" aria-selected={promoMode === 'promo'}
          style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', background: promoMode === 'promo' ? '#fff' : 'transparent', borderBottom: promoMode === 'promo' ? '2px solid #10b981' : '2px solid transparent', marginBottom: -2, fontSize: 13, fontWeight: 600, color: promoMode === 'promo' ? '#065f46' : '#64748b' }}
        >
          🛍️ Générateur Promo Produits
        </button>
        <button
          onClick={() => setPromoMode('html')} className="ed-onglet" role="tab" aria-selected={promoMode === 'html'}
          style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', background: promoMode === 'html' ? '#fff' : 'transparent', borderBottom: promoMode === 'html' ? '2px solid #f59e0b' : '2px solid transparent', marginBottom: -2, fontSize: 13, fontWeight: 600, color: promoMode === 'html' ? '#92400e' : '#64748b' }}
        >
          &lt;&gt; Code HTML
        </button>
      </div>

      {/* CONTROL BAR */}
      <div className="ed-barre" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="ed-groupe" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setMode('select')} className="ed-btn" aria-pressed={mode === 'select'} style={{ padding: '5px 11px', borderRadius: 6, border: `1px solid ${mode === 'select' ? '#3b82f6' : '#d1d5db'}`, cursor: 'pointer', background: mode === 'select' ? '#eff6ff' : '#fff', fontSize: 12, fontWeight: 600, color: mode === 'select' ? '#1d4ed8' : '#64748b' }}>
            Existante
          </button>
          <button onClick={() => setMode('new')} className="ed-btn" aria-pressed={mode === 'new'} style={{ padding: '5px 11px', borderRadius: 6, border: `1px solid ${mode === 'new' ? '#10b981' : '#d1d5db'}`, cursor: 'pointer', background: mode === 'new' ? '#f0fdf4' : '#fff', fontSize: 12, fontWeight: 600, color: mode === 'new' ? '#065f46' : '#64748b' }}>
            ＋ Nouvelle
          </button>
        </div>

        {mode === 'select' ? (
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="ed-champ" aria-label="Campagne" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 180 }}>
            <option value="">— Sélectionner —</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
          </select>
        ) : (
          <input value={campName} onChange={e => setCampName(e.target.value)} placeholder={t('phNomCampagne')} className="ed-champ" aria-label={t('phNomCampagne')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 200 }} />
        )}

        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('phObjet')} className="ed-champ" aria-label={t('phObjet')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1, minWidth: 180 }} />

        <select value={segment} onChange={e => setSegment(e.target.value)} className="ed-champ" aria-label="Segment" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
          {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {promoMode === 'editor' && (
          <div className="ed-groupe" style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportAndSave} disabled={saving} className="ed-btn" style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: saving ? '#94a3b8' : '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {saving ? '⏳…' : '💾 Sauvegarder'}
            </button>
            <button onClick={exportAndSend} disabled={sending || !selectedId} className="ed-btn" style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: sending ? '#94a3b8' : (!selectedId ? '#e2e8f0' : '#10b981'), color: !selectedId ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 600 }}>
              {sending ? '⏳…' : '🚀 Envoyer'}
            </button>
          </div>
        )}

        {promoMode === 'html' && (
          <div className="ed-groupe" style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveHtml} disabled={saving} className="ed-btn" style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: saving ? '#94a3b8' : '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {saving ? '⏳…' : '💾 Sauvegarder'}
            </button>
            <button onClick={sendHtml} disabled={sending || !selectedId} className="ed-btn" style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: sending ? '#94a3b8' : (!selectedId ? '#e2e8f0' : '#10b981'), color: !selectedId ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 600 }}>
              {sending ? '⏳…' : '🚀 Envoyer'}
            </button>
          </div>
        )}

        {sendResult && <span style={{ fontSize: 12, fontWeight: 600, color: sendResult.startsWith('✅') ? '#065f46' : '#991b1b' }}>{sendResult}</span>}
      </div>

      {/* BARRE TEST EMAIL */}
      {(promoMode === 'html' || promoMode === 'editor') && (
        <div className="ed-test" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '7px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="ed-petit" style={{ fontSize: 11, fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap' }}>🧪 Envoyer un test :</span>
          <input
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="ton@email.com"
            type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            aria-label="Adresse du test" className="ed-champ"
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #fcd34d', fontSize: 13, minWidth: 200, background: '#fff' }}
          />
          <button className="ed-btn"
            onClick={() => {
              if (promoMode === 'html') {
                sendTestEmail(htmlContent);
              } else if (editorRef.current?.editor) {
                editorRef.current.editor.exportHtml((data: any) => sendTestEmail(data.html));
              }
            }}
            disabled={sendingTest}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: sendingTest ? '#94a3b8' : '#f59e0b', color: '#fff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {sendingTest ? '⏳…' : '📨 Envoyer à moi'}
          </button>
          <span className="ed-petit" style={{ fontSize: 11, color: '#92400e' }}>{t('testSeul')}</span>
        </div>
      )}

      {/* Téléphone, mode HTML : code OU aperçu (côte à côte, chacun ferait 195 px) */}
      {mobile && promoMode === 'html' && (
        <div role="tablist" style={{ display: 'flex', gap: 6, padding: '8px 12px', background: T.topbar }}>
          {([['code', 'Code HTML'], ['apercu', `👁 ${t('previsualisation')}`]] as Array<['code' | 'apercu', string]>).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={vueHtml === k} onClick={() => setVueHtml(k)}
                    style={{
                      flex: 1, minHeight: 44, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      background: vueHtml === k ? '#fff' : 'transparent', color: vueHtml === k ? T.ink : 'rgba(255,255,255,.7)',
                    }}>{l}</button>
          ))}
        </div>
      )}

      </div>{/* fin barsRef */}

      {/* PROMO PRODUCT GENERATOR */}
      {promoMode === 'promo' && (
        <div className="ed-promo" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: 16, overflow: 'auto', maxHeight: '60vh' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="ed-promo-champ" style={{ flex: 1, minWidth: 200 }}>
              <label className="ed-petit" style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{t('objetPromo')}</label>
              <input value={promoSubject} onChange={e => setPromoSubject(e.target.value)} placeholder={t('phIntro')} className="ed-champ" aria-label={t('objetPromo')} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
            </div>
            <div className="ed-promo-champ" style={{ flex: 1, minWidth: 200 }}>
              <label className="ed-petit" style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{t('introduction')}</label>
              <input value={promoIntro} onChange={e => setPromoIntro(e.target.value)} className="ed-champ" aria-label={t('introduction')} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
            </div>
            <div className="ed-promo-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="ed-btn"
                onClick={generateForClaude}
                disabled={selectedProducts.length === 0}
                style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', background: selectedProducts.length === 0 ? '#94a3b8' : '#6366f1', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                {`🤖 Générer pour Claude (${selectedProducts.length} produit${selectedProducts.length > 1 ? 's' : ''})`}
              </button>
              <button className="ed-btn"
                onClick={generateAndSavePromo}
                disabled={generatingPromo || selectedProducts.length === 0}
                style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #d1d5db', cursor: 'pointer', background: '#fff', color: '#64748b', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {generatingPromo ? '⏳…' : '⚡ Générer automatiquement'}
              </button>
            </div>
          </div>

          {products.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>⏳ Chargement des produits…</div>
          ) : (
            <div className="ed-produits" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {products.map(p => {
                const sel = selectedProducts.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    style={{
                      border: `2px solid ${sel ? '#10b981' : '#e2e8f0'}`,
                      borderRadius: 8, padding: 8, cursor: 'pointer', textAlign: 'center',
                      background: sel ? '#f0fdf4' : '#fff', transition: 'all 0.15s',
                    }}
                  >
                    {(() => { const img = p.image_url || p.image || p.main_image || (Array.isArray(p.images) ? p.images[0] : ''); return img
                      ? <img src={img} alt={p.name_fr || p.name || ''} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 5, marginBottom: 6 }} />
                      : <div style={{ height: 90, background: '#f1f5f9', borderRadius: 5, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📦</div>; })()}
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{p.name_fr || p.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sel ? '#10b981' : '#6366f1', marginTop: 3 }}>{(p.price || 0).toFixed(2)} €</div>
                    {sel && <div style={{ fontSize: 10, color: '#10b981', fontWeight: 700, marginTop: 2 }}>✓ Sélectionné</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Panneau résultat pour Claude */}
          {claudeBlock && (
            <div style={{ marginTop: 20, borderRadius: 10, overflow: 'hidden', border: '2px solid #6366f1' }}>
              <div style={{ background: '#6366f1', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>🤖 Prêt pour Claude</span>
                <button onClick={() => setClaudeBlock(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 16, minWidth: 32, minHeight: 32 }}>✕</button>
              </div>

              {/* Prompt suggéré */}
              <div style={{ background: '#eef2ff', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4338ca' }}>💬 Prompt à copier dans Claude</span>
                  <button className="ed-btn-s"
                    onClick={() => copyToClipboard(claudeBlock.prompt, 'prompt')}
                    style={{ padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', background: copiedWhat === 'prompt' ? '#10b981' : '#6366f1', color: '#fff', fontSize: 11, fontWeight: 700 }}
                  >
                    {copiedWhat === 'prompt' ? '✓ Copié !' : '📋 Copier le prompt'}
                  </button>
                </div>
                <pre style={{ fontSize: 12, color: '#3730a3', background: '#e0e7ff', padding: 12, borderRadius: 6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflowY: 'auto', fontFamily: 'inherit', lineHeight: 1.5 }}>{claudeBlock.prompt}</pre>
              </div>

              {/* HTML généré */}
              <div style={{ background: '#f8fafc', padding: 14, borderTop: '1px solid #e0e7ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>📄 Données produits HTML</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="ed-btn-s"
                      onClick={() => copyToClipboard(claudeBlock.html, 'html')}
                      style={{ padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', background: copiedWhat === 'html' ? '#10b981' : '#64748b', color: '#fff', fontSize: 11, fontWeight: 700 }}
                    >
                      {copiedWhat === 'html' ? '✓ Copié !' : '📋 Copier le HTML'}
                    </button>
                    <button className="ed-btn-s"
                      onClick={() => { setHtmlContent(claudeBlock.html); setPromoMode('html'); setClaudeBlock(null); showToast(t('msgHtmlOuvert')); }}
                      style={{ padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', background: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 700 }}
                    >
                      → Ouvrir dans l'éditeur HTML
                    </button>
                  </div>
                </div>
                <pre style={{ fontSize: 11, background: '#1e293b', padding: 12, borderRadius: 6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 150, overflowY: 'auto', fontFamily: 'monospace', lineHeight: 1.5, color: '#94a3b8' }}>{claudeBlock.html}</pre>
              </div>

              <div style={{ background: '#f0fdf4', padding: '10px 16px', borderTop: '1px solid #bbf7d0' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#166534' }}>
                  <strong>{t('workflow')}</strong> Copie le prompt → colle dans Claude → Claude génère l'email stylisé → copie le HTML → reviens ici → onglet <strong>&lt;&gt; Code HTML</strong> → colle → Prévisualise → Envoie 🚀
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HTML CODE EDITOR */}
      {promoMode === 'html' && (
        <div style={{ display: 'flex', height: editorHeight }}>
          {/* Code pane */}
          {(!mobile || vueHtml === 'code') && (
          <div style={{ display: 'flex', flexDirection: 'column', width: mobile ? '100%' : '50%', background: '#1e293b', borderRight: '2px solid #0f172a' }}>
            <div style={{ padding: '6px 14px', background: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700 }}>HTML</span>
              <span style={{ fontSize: 11, color: '#475569' }}>{t('editezCode')}</span>
            </div>
            <textarea
              value={htmlContent}
              onChange={e => setHtmlContent(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                resize: 'none',
                border: 'none',
                outline: 'none',
                padding: '14px',
                fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
                fontSize: mobile ? 16 : 12,
                lineHeight: 1.6,
                background: '#1e293b',
                color: '#e2e8f0',
                tabSize: 2,
              }}
              autoCapitalize="off" autoCorrect="off" aria-label="HTML"
              placeholder="<!-- Collez ou écrivez votre HTML email ici -->"
            />
          </div>
          )}
          {/* Preview pane */}
          {(!mobile || vueHtml === 'apercu') && (
          <div style={{ display: 'flex', flexDirection: 'column', width: mobile ? '100%' : '50%', background: '#f1f5f9' }}>
            <div style={{ padding: '6px 14px', background: '#e2e8f0', flexShrink: 0 }}>
              <span className="ed-petit" style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>👁 {t('previsualisation')}</span>
            </div>
            {/* Sur téléphone, l'email est réduit à la largeur de l'écran et
                c'est ce panneau qui défile. */}
            <div style={mobile ? { flex: 1, overflowY: 'auto' } : { flex: 1, display: 'flex', flexDirection: 'column' }}>
              <EmailApercu
                html={htmlContent || `<div style="font-family:sans-serif;color:#94a3b8;padding:40px;text-align:center">${t('aucunHtml')}</div>`}
                sandbox="allow-same-origin" ajuster={mobile}
                style={{ flex: 1, border: 'none', background: '#fff' }}
                title={t('titreApercu')}
              />
            </div>
          </div>
          )}
        </div>
      )}

      {/* UNLAYER EDITOR */}
      {promoMode === 'editor' && (
        <div>
          <EmailEditor
            ref={editorRef}
            onReady={() => {
              setEditorReady(true);
              if (selectedId) {
                const camp = campaigns.find(c => c.id === selectedId);
                if (camp) loadCampaignIntoEditor(camp);
              }
            }}
            style={{ height: editorHeight }}
            options={{
              displayMode: 'email',
              fonts: { showDefaultFonts: true },
              features: { preview: true, imageEditor: true },
            }}
          />
        </div>
      )}

      {promoMode === 'promo' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#94a3b8', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 48 }}>🛍️</div>
          <p style={{ fontSize: 14 }}>{t('selectionnez')} <strong>{t('genererEmail')}</strong>.</p>
          <p style={{ fontSize: 12 }}>L'email sera sauvegardé comme campagne prête à envoyer.</p>
        </div>
      )}
    </div>
  );
}
