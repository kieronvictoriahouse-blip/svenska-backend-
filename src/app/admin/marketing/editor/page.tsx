'use client';
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';

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

const SEGMENTS: Record<string, string> = {
  all: '👥 Tous les clients (commandes)',
  new_customers: '🆕 Nouveaux clients (30j)',
  abandoned_cart: '🛒 Paniers abandonnés',
};

export default function EmailEditorPage() {
  const editorRef = useRef<any>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(600);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useLayoutEffect(() => {
    const calc = () => {
      const bars = barsRef.current?.offsetHeight || 0;
      setEditorHeight(window.innerHeight - 52 - bars);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [promoMode]);

  useEffect(() => {
    fetch('/api/marketing', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setCampaigns((d.campaigns || []).filter((c: Campaign) => c.type === 'email' || !c.type)));
  }, []);

  useEffect(() => {
    if (showProducts && products.length === 0) {
      fetch('/api/products?limit=100')
        .then(r => r.json())
        .then(d => setProducts(d.products || d || []));
    }
  }, [showProducts, products.length]);

  const loadCampaignIntoEditor = useCallback((campaign: Campaign) => {
    setSubject(campaign.subject || '');
    setSegment(campaign.target_segment || 'all');
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
    if (raw) { setHtmlContent(raw); setPromoMode('html'); }
  }, [editorReady]);

  useEffect(() => {
    if (!selectedId || !editorReady) return;
    const camp = campaigns.find(c => c.id === selectedId);
    if (camp) loadCampaignIntoEditor(camp);
  }, [selectedId, editorReady, campaigns, loadCampaignIntoEditor]);

  async function saveHtml() {
    if (!htmlContent) { showToast('⚠️ Contenu vide'); return; }
    const content = JSON.stringify({ html: htmlContent, design: null });
    setSaving(true);
    try {
      if (mode === 'new' || !selectedId) {
        const name = campName || subject || `Campagne ${new Date().toLocaleDateString('fr-FR')}`;
        const res = await fetch('/api/marketing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type: 'email', status: 'draft', subject, target_segment: segment, content }),
        });
        const d = await res.json();
        setSelectedId(d.campaign?.id); setMode('select');
        const d2 = await (await fetch('/api/marketing')).json();
        setCampaigns((d2.campaigns || []).filter((c: Campaign) => c.type === 'email' || !c.type));
      } else {
        await fetch(`/api/marketing?id=${selectedId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, target_segment: segment, content }),
        });
      }
      showToast('✅ Sauvegardé !');
    } finally { setSaving(false); }
  }

  async function sendHtml() {
    if (!htmlContent) { showToast('⚠️ Contenu vide'); return; }
    if (!selectedId) { showToast('⚠️ Sauvegardez d\'abord'); return; }
    if (!confirm(`Envoyer cette campagne à "${SEGMENTS[segment]}" ?`)) return;
    setSending(true); setSendResult('');
    try {
      const res = await fetch('/api/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'campaign', campaign_id: selectedId, custom_html: htmlContent }),
      });
      const result = await res.json();
      if (res.ok) { setSendResult(`✅ Envoyé à ${result.sent} / ${result.total} destinataires`); showToast(`✅ ${result.sent} emails envoyés !`); }
      else { setSendResult(`❌ ${result.error}`); showToast(`❌ ${result.error}`); }
    } finally { setSending(false); }
  }

  function exportAndSave() {
    if (!editorRef.current?.editor) { showToast('⚠️ Éditeur non prêt'); return; }
    editorRef.current.editor.exportHtml(async (data: any) => {
      const { design, html } = data;
      const content = JSON.stringify({ html, design });
      setSaving(true);
      try {
        if (mode === 'new') {
          if (!campName) { showToast('⚠️ Saisissez un nom de campagne'); return; }
          const res = await fetch('/api/marketing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: campName, type: 'email', status: 'draft', subject, target_segment: segment, content }),
          });
          if (res.ok) {
            const { campaign } = await res.json();
            setSelectedId(campaign.id);
            setMode('select');
            const res2 = await fetch('/api/marketing');
            const d = await res2.json();
            setCampaigns((d.campaigns || []).filter((c: Campaign) => c.type === 'email' || !c.type));
            showToast('✅ Campagne créée et sauvegardée !');
          }
        } else {
          if (!selectedId) { showToast('⚠️ Sélectionnez une campagne'); return; }
          await fetch(`/api/marketing?id=${selectedId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, target_segment: segment, content }),
          });
          showToast('✅ Campagne sauvegardée !');
        }
      } finally {
        setSaving(false);
      }
    });
  }

  function exportAndSend() {
    if (!editorRef.current?.editor) { showToast('⚠️ Éditeur non prêt'); return; }
    const campId = selectedId;
    if (!campId) { showToast('⚠️ Sauvegardez d\'abord la campagne'); return; }
    if (!confirm(`Envoyer cette campagne à "${SEGMENTS[segment]}" ?`)) return;
    editorRef.current.editor.exportHtml(async (data: any) => {
      const { html } = data;
      setSending(true); setSendResult('');
      try {
        const res = await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'campaign', campaign_id: campId, custom_html: html }),
        });
        const result = await res.json();
        if (res.ok) {
          setSendResult(`✅ Envoyé à ${result.sent} / ${result.total} destinataires`);
          showToast(`✅ ${result.sent} emails envoyés !`);
        } else {
          setSendResult(`❌ ${result.error}`);
          showToast(`❌ ${result.error}`);
        }
      } finally { setSending(false); }
    });
  }

  async function generateAndSavePromo() {
    if (selectedProducts.length === 0) { showToast('⚠️ Sélectionnez au moins un produit'); return; }
    if (!campName && mode === 'new') { showToast('⚠️ Saisissez un nom de campagne'); return; }
    setGeneratingPromo(true);
    try {
      const prods = products.filter(p => selectedProducts.includes(p.id));
      const res = await fetch('/api/marketing/promo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: prods, subject: promoSubject, intro: promoIntro }),
      });
      const { html } = await res.json();

      const campSubject = promoSubject || `Nos sélections du moment`;
      const content = JSON.stringify({ html, design: null });

      let campId = selectedId;
      if (mode === 'new' || !campId) {
        const name = campName || campSubject || `Promo ${new Date().toLocaleDateString('fr-FR')}`;
        const r2 = await fetch('/api/marketing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type: 'email', status: 'draft', subject: campSubject, target_segment: segment, content }),
        });
        const d = await r2.json();
        campId = d.campaign?.id;
        setSelectedId(campId);
        setCampName(name);
        setMode('select');
        const res2 = await fetch('/api/marketing');
        const d2 = await res2.json();
        setCampaigns((d2.campaigns || []).filter((c: Campaign) => c.type === 'email' || !c.type));
      } else {
        await fetch(`/api/marketing?id=${campId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: campSubject, target_segment: segment, content }),
        });
      }
      showToast('✅ Email promo généré et sauvegardé !');
      setSelectedProducts([]);
    } finally {
      setGeneratingPromo(false);
    }
  }

  const toggleProduct = (id: string) => {
    setSelectedProducts(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: '#1e293b', color: '#fff', padding: '12px 20px', borderRadius: 8, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {/* BARRES FIXES — mesurées pour calculer la hauteur de l'éditeur */}
      <div ref={barsRef}>

      {/* MODE TABS */}
      <div style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', display: 'flex' }}>
        <button
          onClick={() => setPromoMode('editor')}
          style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', background: promoMode === 'editor' ? '#fff' : 'transparent', borderBottom: promoMode === 'editor' ? '2px solid #3b82f6' : '2px solid transparent', marginBottom: -2, fontSize: 13, fontWeight: 600, color: promoMode === 'editor' ? '#1d4ed8' : '#64748b' }}
        >
          ✏️ Éditeur Drag & Drop
        </button>
        <button
          onClick={() => { setPromoMode('promo'); setShowProducts(true); }}
          style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', background: promoMode === 'promo' ? '#fff' : 'transparent', borderBottom: promoMode === 'promo' ? '2px solid #10b981' : '2px solid transparent', marginBottom: -2, fontSize: 13, fontWeight: 600, color: promoMode === 'promo' ? '#065f46' : '#64748b' }}
        >
          🛍️ Générateur Promo Produits
        </button>
        <button
          onClick={() => setPromoMode('html')}
          style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', background: promoMode === 'html' ? '#fff' : 'transparent', borderBottom: promoMode === 'html' ? '2px solid #f59e0b' : '2px solid transparent', marginBottom: -2, fontSize: 13, fontWeight: 600, color: promoMode === 'html' ? '#92400e' : '#64748b' }}
        >
          &lt;&gt; Code HTML
        </button>
      </div>

      {/* CONTROL BAR */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setMode('select')} style={{ padding: '5px 11px', borderRadius: 6, border: `1px solid ${mode === 'select' ? '#3b82f6' : '#d1d5db'}`, cursor: 'pointer', background: mode === 'select' ? '#eff6ff' : '#fff', fontSize: 12, fontWeight: 600, color: mode === 'select' ? '#1d4ed8' : '#64748b' }}>
            Existante
          </button>
          <button onClick={() => setMode('new')} style={{ padding: '5px 11px', borderRadius: 6, border: `1px solid ${mode === 'new' ? '#10b981' : '#d1d5db'}`, cursor: 'pointer', background: mode === 'new' ? '#f0fdf4' : '#fff', fontSize: 12, fontWeight: 600, color: mode === 'new' ? '#065f46' : '#64748b' }}>
            ＋ Nouvelle
          </button>
        </div>

        {mode === 'select' ? (
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 180 }}>
            <option value="">— Sélectionner —</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
          </select>
        ) : (
          <input value={campName} onChange={e => setCampName(e.target.value)} placeholder="Nom de la campagne…" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 200 }} />
        )}

        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Objet de l'email…" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1, minWidth: 180 }} />

        <select value={segment} onChange={e => setSegment(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
          {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {promoMode === 'editor' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportAndSave} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: saving ? '#94a3b8' : '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {saving ? '⏳…' : '💾 Sauvegarder'}
            </button>
            <button onClick={exportAndSend} disabled={sending || !selectedId} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: sending ? '#94a3b8' : (!selectedId ? '#e2e8f0' : '#10b981'), color: !selectedId ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 600 }}>
              {sending ? '⏳…' : '🚀 Envoyer'}
            </button>
          </div>
        )}

        {promoMode === 'html' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveHtml} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: saving ? '#94a3b8' : '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {saving ? '⏳…' : '💾 Sauvegarder'}
            </button>
            <button onClick={sendHtml} disabled={sending || !selectedId} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: sending ? '#94a3b8' : (!selectedId ? '#e2e8f0' : '#10b981'), color: !selectedId ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 600 }}>
              {sending ? '⏳…' : '🚀 Envoyer'}
            </button>
          </div>
        )}

        {sendResult && <span style={{ fontSize: 12, fontWeight: 600, color: sendResult.startsWith('✅') ? '#065f46' : '#991b1b' }}>{sendResult}</span>}
      </div>
      </div>{/* fin barsRef */}

      {/* PROMO PRODUCT GENERATOR */}
      {promoMode === 'promo' && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: 16, overflow: 'auto', maxHeight: '60vh' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Objet de l'email promo</label>
              <input value={promoSubject} onChange={e => setPromoSubject(e.target.value)} placeholder="Nos sélections du moment 🛍️" style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Introduction</label>
              <input value={promoIntro} onChange={e => setPromoIntro(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
            </div>
            <button
              onClick={generateAndSavePromo}
              disabled={generatingPromo || selectedProducts.length === 0}
              style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', background: generatingPromo || selectedProducts.length === 0 ? '#94a3b8' : '#10b981', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              {generatingPromo ? '⏳ Génération…' : `🚀 Générer l'email (${selectedProducts.length} produit${selectedProducts.length > 1 ? 's' : ''})`}
            </button>
          </div>

          {products.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>⏳ Chargement des produits…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
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
        </div>
      )}

      {/* HTML CODE EDITOR */}
      {promoMode === 'html' && (
        <div style={{ display: 'flex', height: editorHeight }}>
          {/* Code pane */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '50%', background: '#1e293b', borderRight: '2px solid #0f172a' }}>
            <div style={{ padding: '6px 14px', background: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700 }}>HTML</span>
              <span style={{ fontSize: 11, color: '#475569' }}>Éditez le code — la prévisualisation se met à jour en direct →</span>
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
                fontSize: 12,
                lineHeight: 1.6,
                background: '#1e293b',
                color: '#e2e8f0',
                tabSize: 2,
              }}
              placeholder="<!-- Collez ou écrivez votre HTML email ici -->"
            />
          </div>
          {/* Preview pane */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '50%', background: '#f1f5f9' }}>
            <div style={{ padding: '6px 14px', background: '#e2e8f0', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>👁 Prévisualisation</span>
            </div>
            <iframe
              srcDoc={htmlContent || '<div style="font-family:sans-serif;color:#94a3b8;padding:40px;text-align:center">Aucun contenu HTML</div>'}
              sandbox="allow-same-origin"
              style={{ flex: 1, border: 'none', background: '#fff' }}
              title="Email preview"
            />
          </div>
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
          <p style={{ fontSize: 14 }}>Sélectionnez vos produits ci-dessus et cliquez sur <strong>Générer l'email</strong>.</p>
          <p style={{ fontSize: 12 }}>L'email sera sauvegardé comme campagne prête à envoyer.</p>
        </div>
      )}
    </div>
  );
}
