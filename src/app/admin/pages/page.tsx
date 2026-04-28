'use client';
import { useEffect, useState } from 'react';

type Block =
  | { id: string; type: 'text'; title_fr: string; title_sv: string; title_en: string; body_fr: string; body_sv: string; body_en: string; image: string }
  | { id: string; type: 'quote'; text_fr: string; text_sv: string; text_en: string }
  | { id: string; type: 'image'; url: string; alt: string };

type CmsPage = {
  id?: string;
  slug: string;
  title_fr: string; title_sv: string; title_en: string;
  nav_label_fr: string; nav_label_sv: string; nav_label_en: string;
  hero_image: string;
  hero_title_fr: string; hero_title_sv: string; hero_title_en: string;
  hero_subtitle_fr: string; hero_subtitle_sv: string; hero_subtitle_en: string;
  blocks: Block[];
  show_in_nav: boolean;
  is_active: boolean;
  sort_order: number;
};

const EMPTY_PAGE: CmsPage = {
  slug: '', title_fr: '', title_sv: '', title_en: '',
  nav_label_fr: '', nav_label_sv: '', nav_label_en: '',
  hero_image: '', hero_title_fr: '', hero_title_sv: '', hero_title_en: '',
  hero_subtitle_fr: '', hero_subtitle_sv: '', hero_subtitle_en: '',
  blocks: [], show_in_nav: true, is_active: true, sort_order: 99,
};

function mkId() { return Math.random().toString(36).slice(2); }

function newBlock(type: 'text' | 'quote' | 'image'): Block {
  if (type === 'text') return { id: mkId(), type: 'text', title_fr: '', title_sv: '', title_en: '', body_fr: '', body_sv: '', body_en: '', image: '' };
  if (type === 'quote') return { id: mkId(), type: 'quote', text_fr: '', text_sv: '', text_en: '' };
  return { id: mkId(), type: 'image', url: '', alt: '' };
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  .pg-wrap { font-family: 'Jost', sans-serif; max-width: 960px; }
  .pg-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .pg-title { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 600; color: #1C2028; }
  .pg-subtitle { font-size: 13px; color: #6A7280; margin-top: 4px; }
  .pg-tabs { display: flex; gap: 0; border: 1px solid #D8CEBC; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .pg-tab { padding: 10px 18px; font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: #fff; color: #6A7280; transition: all 0.15s; }
  .pg-tab.active { background: #1C2028; color: #fff; }
  .pg-section { background: #fff; border: 1px solid #D8CEBC; border-radius: 8px; padding: 24px; margin-bottom: 16px; }
  .pg-section-title { font-size: 14px; font-weight: 600; color: #1C2028; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #D8CEBC; }
  .form-group { margin-bottom: 14px; }
  .form-label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #6A7280; margin-bottom: 5px; }
  .form-control { width: 100%; padding: 8px 10px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; outline: none; }
  .form-control:focus { border-color: #3E5238; }
  textarea.form-control { resize: vertical; min-height: 80px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
  .btn-primary { background: #3E5238; color: #fff; }
  .btn-primary:hover { background: #587050; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-secondary { background: #F6F1E9; color: #3E4550; border: 1px solid #D8CEBC; }
  .btn-secondary:hover { background: #EDE8DF; }
  .btn-danger { background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
  .btn-danger:hover { background: #FCA5A5; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn-xs { padding: 3px 8px; font-size: 11px; }
  .page-list-item { background: #fff; border: 1px solid #D8CEBC; border-radius: 8px; padding: 14px 18px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .page-list-slug { font-family: 'DM Mono', monospace; font-size: 12px; color: #6A7280; background: #F6F1E9; padding: 2px 8px; border-radius: 4px; }
  .page-list-title { font-size: 15px; font-weight: 600; color: #1C2028; }
  .page-list-nav-badge { font-size: 10px; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .badge-shown { background: #D1FAE5; color: #065F46; }
  .badge-hidden { background: #F3F4F6; color: #9CA3AF; }
  .block-card { background: #F9F8F6; border: 1px solid #E5DDD0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .block-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .block-type-badge { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 3px 10px; border-radius: 4px; }
  .block-type-text { background: #DBEAFE; color: #1D4ED8; }
  .block-type-quote { background: #EDE9FE; color: #6D28D9; }
  .block-type-image { background: #FEF3C7; color: #92400E; }
  .block-actions { display: flex; gap: 6px; }
  .img-preview { margin-top: 8px; max-width: 200px; max-height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid #D8CEBC; display: block; }
  .add-block-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #1C2028; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; z-index: 999; }
  .back-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #6A7280; cursor: pointer; border: none; background: none; padding: 0; margin-bottom: 16px; }
  .back-btn:hover { color: #1C2028; }
  .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .confirm-box { background: #fff; border-radius: 8px; padding: 28px 32px; max-width: 380px; width: 90%; text-align: center; }
  .confirm-title { font-size: 16px; font-weight: 600; color: #1C2028; margin-bottom: 8px; }
  .confirm-sub { font-size: 13px; color: #6A7280; margin-bottom: 20px; }
  .confirm-btns { display: flex; gap: 10px; justify-content: center; }
  .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #3E4550; cursor: pointer; }
  .checkbox-row input[type=checkbox] { width: 15px; height: 15px; accent-color: #3E5238; cursor: pointer; }
`;

export default function PagesAdminPage() {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editPage, setEditPage] = useState<CmsPage>(EMPTY_PAGE);
  const [isNew, setIsNew] = useState(false);
  const [tab, setTab] = useState<'info' | 'hero' | 'blocks'>('info');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { loadPages(); }, []);

  async function loadPages() {
    setLoading(true);
    try {
      const res = await fetch('/api/pages');
      const data = await res.json();
      setPages(data.pages || []);
    } catch {
      setPages([]);
    }
    setLoading(false);
  }

  function openNew() {
    setEditPage({ ...EMPTY_PAGE });
    setIsNew(true);
    setTab('info');
    setView('editor');
  }

  async function openEdit(slug: string) {
    try {
      const res = await fetch(`/api/pages/${slug}`);
      const data = await res.json();
      if (data.page) {
        setEditPage({ ...EMPTY_PAGE, ...data.page, blocks: data.page.blocks || [] });
        setIsNew(false);
        setTab('info');
        setView('editor');
      }
    } catch {
      showToast('Erreur de chargement');
    }
  }

  async function savePage() {
    if (!editPage.slug.trim()) { showToast('Le slug est requis'); return; }
    setSaving(true);
    try {
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/pages' : `/api/pages/${editPage.slug}`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPage),
      });
      const data = await res.json();
      if (data.error) { showToast('Erreur : ' + data.error); }
      else {
        showToast('Page sauvegardée !');
        await loadPages();
        setView('list');
      }
    } catch {
      showToast('Erreur lors de la sauvegarde');
    }
    setSaving(false);
  }

  async function deletePage(slug: string) {
    try {
      const res = await fetch(`/api/pages/${slug}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) showToast('Erreur : ' + data.error);
      else { showToast('Page supprimée'); await loadPages(); }
    } catch {
      showToast('Erreur lors de la suppression');
    }
    setConfirmSlug(null);
  }

  function upd(field: keyof CmsPage, val: unknown) {
    setEditPage(p => ({ ...p, [field]: val }));
  }

  function addBlock(type: 'text' | 'quote' | 'image') {
    setEditPage(p => ({ ...p, blocks: [...p.blocks, newBlock(type)] }));
  }

  function removeBlock(id: string) {
    setEditPage(p => ({ ...p, blocks: p.blocks.filter(b => b.id !== id) }));
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setEditPage(p => {
      const blocks = [...p.blocks];
      const idx = blocks.findIndex(b => b.id === id);
      if (idx < 0) return p;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= blocks.length) return p;
      [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
      return { ...p, blocks };
    });
  }

  function updBlock(id: string, field: string, val: string) {
    setEditPage(p => ({
      ...p,
      blocks: p.blocks.map(b => b.id === id ? { ...b, [field]: val } : b),
    }));
  }

  function renderBlockEditor(block: Block, idx: number) {
    const typeBadge = block.type === 'text' ? 'block-type-text' : block.type === 'quote' ? 'block-type-quote' : 'block-type-image';
    const typeLabel = block.type === 'text' ? 'Texte' : block.type === 'quote' ? 'Citation' : 'Image';

    return (
      <div key={block.id} className="block-card">
        <div className="block-card-header">
          <span className={`block-type-badge ${typeBadge}`}>{idx + 1}. {typeLabel}</span>
          <div className="block-actions">
            <button className="btn btn-secondary btn-xs" onClick={() => moveBlock(block.id, -1)} disabled={idx === 0}>&#8593;</button>
            <button className="btn btn-secondary btn-xs" onClick={() => moveBlock(block.id, 1)} disabled={idx === editPage.blocks.length - 1}>&#8595;</button>
            <button className="btn btn-danger btn-xs" onClick={() => removeBlock(block.id)}>Supprimer</button>
          </div>
        </div>

        {block.type === 'text' && (
          <>
            <div className="grid-3" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">Titre FR</label>
                <input className="form-control" value={block.title_fr} onChange={e => updBlock(block.id, 'title_fr', e.target.value)} placeholder="Titre (optionnel)" />
              </div>
              <div className="form-group">
                <label className="form-label">Titre SV</label>
                <input className="form-control" value={block.title_sv} onChange={e => updBlock(block.id, 'title_sv', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Titre EN</label>
                <input className="form-control" value={block.title_en} onChange={e => updBlock(block.id, 'title_en', e.target.value)} />
              </div>
            </div>
            <div className="grid-3" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">Corps FR</label>
                <textarea className="form-control" value={block.body_fr} onChange={e => updBlock(block.id, 'body_fr', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Corps SV</label>
                <textarea className="form-control" value={block.body_sv} onChange={e => updBlock(block.id, 'body_sv', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Corps EN</label>
                <textarea className="form-control" value={block.body_en} onChange={e => updBlock(block.id, 'body_en', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Image (URL, optionnel)</label>
              <input className="form-control" value={block.image} onChange={e => updBlock(block.id, 'image', e.target.value)} placeholder="https://..." />
              {block.image && <img src={block.image} alt="" className="img-preview" />}
            </div>
          </>
        )}

        {block.type === 'quote' && (
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Citation FR</label>
              <textarea className="form-control" value={block.text_fr} onChange={e => updBlock(block.id, 'text_fr', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Citation SV</label>
              <textarea className="form-control" value={block.text_sv} onChange={e => updBlock(block.id, 'text_sv', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Citation EN</label>
              <textarea className="form-control" value={block.text_en} onChange={e => updBlock(block.id, 'text_en', e.target.value)} />
            </div>
          </div>
        )}

        {block.type === 'image' && (
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">URL de l&apos;image</label>
              <input className="form-control" value={block.url} onChange={e => updBlock(block.id, 'url', e.target.value)} placeholder="https://..." />
              {block.url && <img src={block.url} alt="" className="img-preview" />}
            </div>
            <div className="form-group">
              <label className="form-label">Légende (alt)</label>
              <input className="form-control" value={block.alt} onChange={e => updBlock(block.id, 'alt', e.target.value)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="pg-wrap">

        {/* LIST VIEW */}
        {view === 'list' && (
          <>
            <div className="pg-header">
              <div>
                <div className="pg-title">Pages CMS</div>
                <div className="pg-subtitle">Gérez les pages statiques de votre site</div>
              </div>
              <button className="btn btn-primary" onClick={openNew}>+ Nouvelle page</button>
            </div>

            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#6A7280', fontSize: 14 }}>Chargement…</div>
            ) : pages.length === 0 ? (
              <div className="pg-section" style={{ textAlign: 'center', padding: '48px 24px', color: '#6A7280' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2028', marginBottom: 6 }}>Aucune page</div>
                <div style={{ fontSize: 13 }}>Créez votre première page CMS</div>
              </div>
            ) : (
              pages.map(p => (
                <div key={p.slug} className="page-list-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <span className="page-list-title">{p.title_fr || p.slug}</span>
                    <span className="page-list-slug">{p.slug}</span>
                    <span className={`page-list-nav-badge ${p.show_in_nav ? 'badge-shown' : 'badge-hidden'}`}>
                      {p.show_in_nav ? 'Nav visible' : 'Nav masqué'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p.slug)}>Modifier</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmSlug(p.slug)}>Supprimer</button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* EDITOR VIEW */}
        {view === 'editor' && (
          <>
            <div className="pg-header">
              <div>
                <button className="back-btn" onClick={() => setView('list')}>&#8592; Retour à la liste</button>
                <div className="pg-title">{isNew ? 'Nouvelle page' : editPage.title_fr || editPage.slug || 'Éditer la page'}</div>
              </div>
              <button className="btn btn-primary" onClick={savePage} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>

            <div className="pg-tabs">
              {([['info', 'Informations'], ['hero', 'Hero'], ['blocks', 'Blocs']] as const).map(([k, l]) => (
                <button key={k} className={`pg-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>

            {/* INFO TAB */}
            {tab === 'info' && (
              <>
                <div className="pg-section">
                  <div className="pg-section-title">Identifiant & Navigation</div>
                  <div className="grid-2" style={{ marginBottom: 14 }}>
                    <div className="form-group">
                      <label className="form-label">Slug *</label>
                      <input
                        className="form-control"
                        value={editPage.slug}
                        onChange={e => upd('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        placeholder="ma-page"
                        disabled={!isNew}
                        style={!isNew ? { background: '#F6F1E9', color: '#6A7280' } : {}}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ordre de tri</label>
                      <input
                        type="number"
                        className="form-control"
                        value={editPage.sort_order}
                        onChange={e => upd('sort_order', parseInt(e.target.value) || 99)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 24, marginBottom: 6 }}>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={editPage.show_in_nav} onChange={e => upd('show_in_nav', e.target.checked)} />
                      Afficher dans la navigation
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={editPage.is_active} onChange={e => upd('is_active', e.target.checked)} />
                      Page active
                    </label>
                  </div>
                </div>

                <div className="pg-section">
                  <div className="pg-section-title">Titre de la page</div>
                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label">Titre FR</label>
                      <input className="form-control" value={editPage.title_fr} onChange={e => upd('title_fr', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Titre SV</label>
                      <input className="form-control" value={editPage.title_sv} onChange={e => upd('title_sv', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Titre EN</label>
                      <input className="form-control" value={editPage.title_en} onChange={e => upd('title_en', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="pg-section">
                  <div className="pg-section-title">Libellé de navigation</div>
                  <div style={{ fontSize: 12, color: '#6A7280', marginBottom: 12 }}>Texte affiché dans le menu (si vide, utilise le titre)</div>
                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label">Nav FR</label>
                      <input className="form-control" value={editPage.nav_label_fr} onChange={e => upd('nav_label_fr', e.target.value)} placeholder={editPage.title_fr} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Nav SV</label>
                      <input className="form-control" value={editPage.nav_label_sv} onChange={e => upd('nav_label_sv', e.target.value)} placeholder={editPage.title_sv} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Nav EN</label>
                      <input className="form-control" value={editPage.nav_label_en} onChange={e => upd('nav_label_en', e.target.value)} placeholder={editPage.title_en} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* HERO TAB */}
            {tab === 'hero' && (
              <div className="pg-section">
                <div className="pg-section-title">Section Hero</div>
                <div className="form-group">
                  <label className="form-label">Image de fond (URL)</label>
                  <input className="form-control" value={editPage.hero_image} onChange={e => upd('hero_image', e.target.value)} placeholder="https://images.unsplash.com/..." />
                  {editPage.hero_image && (
                    <img src={editPage.hero_image} alt="Hero preview" className="img-preview" style={{ maxWidth: '100%', maxHeight: 200, marginTop: 10 }} />
                  )}
                </div>
                <div className="grid-3" style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Titre hero FR</label>
                    <input className="form-control" value={editPage.hero_title_fr} onChange={e => upd('hero_title_fr', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Titre hero SV</label>
                    <input className="form-control" value={editPage.hero_title_sv} onChange={e => upd('hero_title_sv', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Titre hero EN</label>
                    <input className="form-control" value={editPage.hero_title_en} onChange={e => upd('hero_title_en', e.target.value)} />
                  </div>
                </div>
                <div className="grid-3">
                  <div className="form-group">
                    <label className="form-label">Sous-titre hero FR</label>
                    <input className="form-control" value={editPage.hero_subtitle_fr} onChange={e => upd('hero_subtitle_fr', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sous-titre hero SV</label>
                    <input className="form-control" value={editPage.hero_subtitle_sv} onChange={e => upd('hero_subtitle_sv', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sous-titre hero EN</label>
                    <input className="form-control" value={editPage.hero_subtitle_en} onChange={e => upd('hero_subtitle_en', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* BLOCKS TAB */}
            {tab === 'blocks' && (
              <div className="pg-section">
                <div className="pg-section-title">Blocs de contenu</div>
                {editPage.blocks.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '28px 0', color: '#6A7280', fontSize: 13 }}>
                    Aucun bloc — ajoutez-en un ci-dessous
                  </div>
                )}
                {editPage.blocks.map((block, idx) => renderBlockEditor(block, idx))}
                <div className="add-block-row">
                  <button className="btn btn-secondary btn-sm" onClick={() => addBlock('text')}>+ Bloc texte</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addBlock('quote')}>+ Citation</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addBlock('image')}>+ Image</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* CONFIRM DELETE DIALOG */}
        {confirmSlug && (
          <div className="confirm-overlay" onClick={() => setConfirmSlug(null)}>
            <div className="confirm-box" onClick={e => e.stopPropagation()}>
              <div className="confirm-title">Supprimer cette page ?</div>
              <div className="confirm-sub">
                La page <strong>{confirmSlug}</strong> sera supprimée définitivement.
              </div>
              <div className="confirm-btns">
                <button className="btn btn-secondary" onClick={() => setConfirmSlug(null)}>Annuler</button>
                <button className="btn btn-danger" onClick={() => deletePage(confirmSlug)}>Supprimer</button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}
