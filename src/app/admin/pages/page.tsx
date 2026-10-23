'use client';
import { adminFetch } from '@/lib/auth-client';
import { T as TH, BADGE } from '@/lib/admin-theme';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/admin-i18n';
import { useIsMobile } from '@/lib/use-mobile';
import { minTextCss } from '@/components/SegTabs';
import { TPA } from './i18n';

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
    /* Pages — l'editeur de blocs garde ses classes, remappees ici sur
       les tokens du nouveau design. */

    .card { background:#fff; border:1px solid ${TH.border}; border-radius:10px; overflow:hidden; margin-bottom:12px; }
    .card-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 15px; border-bottom:1px solid ${TH.border}; }
    .card-title { font-size:12.5px; font-weight:600; color:${TH.ink}; }
    .card-body { padding:13px 15px; }

    .btn { display:inline-flex; align-items:center; gap:6px; border-radius:7px; padding:8px 14px; font-size:12.5px; font-weight:500; cursor:pointer; border:1px solid ${TH.borderField}; background:#fff; color:#3A3228; text-decoration:none; transition:background .12s; }
    .btn:hover { background:#F7F4EF; }
    .btn-primary { background:${TH.ink}; color:#fff; border-color:${TH.ink}; }
    .btn-primary:hover { background:${TH.inkHover}; }
    .btn-secondary { background:#fff; }
    .btn-info { background:#EFF6FF; color:#1D4ED8; border-color:#BFDBFE; }
    .btn-warning { background:#FDF6EA; color:#8A5B08; border-color:#E8CFA8; }
    .btn-danger { background:#fff; color:${TH.red}; border-color:#EBD5D1; }
    .btn-ghost { background:transparent; }
    .btn-sm { padding:5px 10px; font-size:11.5px; }

    .form-group { margin-bottom:12px; }
    .form-label { display:block; font-size:11px; font-weight:600; color:${TH.text2b}; margin-bottom:5px; }
    .form-control { width:100%; height:34px; border:1px solid ${TH.borderField}; border-radius:7px; padding:0 10px; font-size:12.5px; color:${TH.ink}; background:#fff; outline:none; transition:border-color .12s; }
    .form-control:focus { border-color:var(--accent); }
    textarea.form-control { height:auto; padding:8px 10px; line-height:1.5; }
    .form-hint { font-size:10.5px; color:${TH.muted}; margin-top:4px; }
    .req { color:${TH.red}; }

    .badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; letter-spacing:.3px; white-space:nowrap; }
    .mono { font-variant-numeric:tabular-nums; }
    .empty { padding:44px 20px; text-align:center; color:${TH.muted}; font-size:12.5px; }
    .toast { position:fixed; bottom:24px; right:24px; background:${TH.ink}; color:#fff; padding:10px 18px; border-radius:7px; font-size:12.5px; z-index:300; }

    .modal-overlay, .pg-modal-overlay { position:fixed; inset:0; background:rgba(21,24,30,.45); backdrop-filter:blur(2px); z-index:200; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto; }
    .modal, .pg-modal { background:#fff; border:1px solid ${TH.border}; border-radius:10px; width:100%; max-width:680px; margin:auto; box-shadow:0 20px 60px rgba(0,0,0,.2); }
    .modal-header { padding:14px 18px; border-bottom:1px solid ${TH.border}; display:flex; align-items:center; justify-content:space-between; }
    .modal-title { font-size:14px; font-weight:600; color:${TH.ink}; }
    .modal-body { padding:18px; max-height:74vh; overflow-y:auto; }
    .modal-footer { padding:13px 18px; border-top:1px solid ${TH.border}; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }

    .pg-wrap { }
    .pg-header { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
    .pg-title { font-size:17px; font-weight:600; letter-spacing:-.2px; color:${TH.ink}; }
    .pg-subtitle { font-size:11.5px; color:${TH.text3}; margin-top:2px; }
    .pg-section { background:#fff; border:1px solid ${TH.border}; border-radius:10px; padding:15px; margin-bottom:12px; }
    .pg-tabs { display:flex; gap:4px; border-bottom:1px solid ${TH.border}; margin-bottom:14px; }
    .pg-tab { border:none; background:none; cursor:pointer; padding:9px 13px; font-size:12.5px; color:${TH.text2}; }
    .pg-tab.active { color:var(--accent); font-weight:600; box-shadow:inset 0 -2px 0 var(--accent); }
    .page-list-item { display:flex; align-items:center; justify-content:space-between; gap:12px; background:#fff; border:1px solid ${TH.border}; border-radius:10px; padding:12px 15px; margin-bottom:8px; }
    .page-list-title { font-size:13px; font-weight:500; color:${TH.ink}; }
    .page-list-slug { font-size:11.5px; color:${TH.muted}; font-variant-numeric:tabular-nums; }
    .page-list-nav-badge { display:inline-flex; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; }
    .badge-shown { background:#E9F0E6; color:#3E5238; }
    .badge-hidden { background:#F1EDE7; color:#857C71; }
    .block-card { background:#fff; border:1px solid ${TH.border}; border-radius:10px; padding:13px 15px; margin-bottom:8px; }
    .pg-list { min-width:660px; }

    /* Aperçus d'image : la classe n'était définie nulle part, une photo
       de 1 800 px s'affichait en taille réelle et débordait de l'écran
       (ordinateur compris). */
    .img-preview { display:block; max-width:100%; max-height:180px; width:auto; height:auto; object-fit:cover; border-radius:8px; border:1px solid ${TH.border}; margin-top:8px; }

    /* ═══ Téléphone ═══ */
    @media (max-width: 899px) {
      .pg-list { min-width:0; }
      .pg-header { align-items:stretch; gap:8px; margin-bottom:10px; }
      .pg-title { font-size:19px; }
      .back-btn { display:inline-flex; align-items:center; gap:6px; min-height:44px; margin:-6px 0 0 -4px; padding:0 4px; border:none; background:none; color:${TH.text3}; font-size:14px; cursor:pointer; }
      .pg-tabs { gap:0; margin-bottom:12px; }
      .pg-tab { flex:1 1 0; min-height:46px; font-size:14.5px; }
      .pg-section { padding:14px 12px; }
      .pg-section-title { font-size:15px; font-weight:600; color:${TH.ink}; margin-bottom:12px; }
      .block-card { padding:12px; }
      .block-card-header { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
      .block-type-badge { font-size:14px; font-weight:600; color:${TH.ink}; }
      .block-actions { display:flex; gap:6px; }
      .block-actions .btn { min-width:44px; justify-content:center; }
      .add-block-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
      .add-block-row .btn { flex:1 1 0; }
      .btn { min-height:44px; font-size:14px; justify-content:center; }
      .form-label { font-size:12.5px; }
      .form-control { height:44px; font-size:16px; }
      textarea.form-control { height:auto; min-height:96px; }
      .form-hint { font-size:12px; }
      .checkbox-row { display:flex; align-items:center; gap:10px; min-height:44px; font-size:15px; cursor:pointer; }
      .checkbox-row input { width:22px; height:22px; accent-color:var(--accent); }
    }
    /* globals.css (ancien thème) masque tout <span> d'un .btn sous 480 px */
    @media (max-width: 480px) { .pg-wrap .btn span { display:inline-block; } }
    ${minTextCss('.pg-wrap')}
  `;

export default function PagesAdminPage() {
  const { t, tc, lang } = useT(TPA);
  const isMobile = useIsMobile();
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
      const res = await adminFetch('/api/pages');
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
      const res = await adminFetch(`/api/pages/${slug}`);
      const data = await res.json();
      if (data.page) {
        setEditPage({ ...EMPTY_PAGE, ...data.page, blocks: data.page.blocks || [] });
        setIsNew(false);
        setTab('info');
        setView('editor');
      }
    } catch {
      showToast(t('msgChargement'));
    }
  }

  async function savePage() {
    if (!editPage.slug.trim()) { showToast(t('msgSlugRequis')); return; }
    setSaving(true);
    try {
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/pages' : `/api/pages/${editPage.slug}`;
      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPage),
      });
      const data = await res.json();
      if (data.error) { showToast(t('msgErreur') + data.error); }
      else {
        showToast(t('msgSauvee'));
        await loadPages();
        setView('list');
      }
    } catch {
      showToast(t('msgErrSauve'));
    }
    setSaving(false);
  }

  async function deletePage(slug: string) {
    try {
      const res = await adminFetch(`/api/pages/${slug}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) showToast(t('msgErreur') + data.error);
      else { showToast(t('msgSupprimee')); await loadPages(); }
    } catch {
      showToast(t('msgErrSuppr'));
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
            <button className="btn btn-secondary btn-xs" aria-label="Monter le bloc" onClick={() => moveBlock(block.id, -1)} disabled={idx === 0}>&#8593;</button>
            <button className="btn btn-secondary btn-xs" aria-label="Descendre le bloc" onClick={() => moveBlock(block.id, 1)} disabled={idx === editPage.blocks.length - 1}>&#8595;</button>
            <button className="btn btn-danger btn-xs" onClick={() => removeBlock(block.id)}>{tc('delete')}</button>
          </div>
        </div>

        {block.type === 'text' && (
          <>
            <div className="grid-3" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">{t('champTitre')} FR</label>
                <input className="form-control" value={block.title_fr} onChange={e => updBlock(block.id, 'title_fr', e.target.value)} placeholder={t('phTitre')} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('champTitre')} SV</label>
                <input className="form-control" value={block.title_sv} onChange={e => updBlock(block.id, 'title_sv', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('champTitre')} EN</label>
                <input className="form-control" value={block.title_en} onChange={e => updBlock(block.id, 'title_en', e.target.value)} />
              </div>
            </div>
            <div className="grid-3" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">{t('champCorps')} FR</label>
                <textarea className="form-control" value={block.body_fr} onChange={e => updBlock(block.id, 'body_fr', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('champCorps')} SV</label>
                <textarea className="form-control" value={block.body_sv} onChange={e => updBlock(block.id, 'body_sv', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('champCorps')} EN</label>
                <textarea className="form-control" value={block.body_en} onChange={e => updBlock(block.id, 'body_en', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('imageUrl')}</label>
              <input className="form-control" inputMode="url" autoCapitalize="none" spellCheck={false} value={block.image} onChange={e => updBlock(block.id, 'image', e.target.value)} placeholder="https://..." />
              {block.image && <img src={block.image} alt="" className="img-preview" />}
            </div>
          </>
        )}

        {block.type === 'quote' && (
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">{t('champCitation')} FR</label>
              <textarea className="form-control" value={block.text_fr} onChange={e => updBlock(block.id, 'text_fr', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('champCitation')} SV</label>
              <textarea className="form-control" value={block.text_sv} onChange={e => updBlock(block.id, 'text_sv', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('champCitation')} EN</label>
              <textarea className="form-control" value={block.text_en} onChange={e => updBlock(block.id, 'text_en', e.target.value)} />
            </div>
          </div>
        )}

        {block.type === 'image' && (
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">URL de l&apos;image</label>
              <input className="form-control" inputMode="url" autoCapitalize="none" spellCheck={false} value={block.url} onChange={e => updBlock(block.id, 'url', e.target.value)} placeholder="https://..." />
              {block.url && <img src={block.url} alt="" className="img-preview" />}
            </div>
            <div className="form-group">
              <label className="form-label">{t('legendeAlt')}</label>
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
            <div className="sc-head">
              <div>
                <div className="sc-title">{t('titre')}</div>
                <div className="sc-sub">{pages.length} page(s) statique(s) — CGV, mentions légales, pages libres</div>
              </div>
              <div className="sc-actions">
                <button className="sc-btn sc-btn-primary" onClick={openNew}>
                  <span className="ms">add</span>{t('nouvellePage')}
                </button>
              </div>
            </div>

            {loading && <div className="sc-empty">{tc('loading')}</div>}
            {!loading && pages.length === 0 && <div className="sc-empty">{t('aucunePage')}</div>}

            {!loading && pages.length > 0 && (
              <div className="sc-card" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  {/* Téléphone : une carte par page (.sc-stack) ; les boutons
                      Modifier / Supprimer étaient hors de l'écran. */}
                  <table className="sc-table sc-stack pg-list">
                    <thead>
                      <tr>
                        <th>{t('colTitre')}</th>
                        <th style={{ width: 170 }}>URL</th>
                        <th style={{ width: 130 }}>{t('traductions')}</th>
                        <th style={{ width: 120 }}>{t('navigation')}</th>
                        <th style={{ width: 96 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {pages.map(p => {
                        const langs = [
                          p.title_fr ? 'FR' : null,
                          (p as any).title_sv ? 'SV' : null,
                          (p as any).title_en ? 'EN' : null,
                        ].filter(Boolean);
                        return (
                          <tr key={p.slug}>
                            <td className="sc-stack-main">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <span className="ms" style={{ fontSize: 17, color: TH.muted }}>article</span>
                                <button onClick={() => openEdit(p.slug)}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: isMobile ? 15.5 : 13, fontWeight: isMobile ? 600 : 500, color: TH.ink, padding: 0, textAlign: 'left', minHeight: isMobile ? 36 : undefined }}>
                                  {p.title_fr || p.slug}
                                </button>
                              </div>
                            </td>
                            <td data-label="URL" className="sc-num" style={{ fontSize: 11.5, color: TH.muted, overflowWrap: 'anywhere' }}>/{p.slug}</td>
                            <td data-label={t('traductions')} style={{ fontSize: 11.5, color: TH.text2b }}>{langs.join(' · ') || '—'}</td>
                            <td data-label={t('navigation')}>
                              <span className="sc-badge" style={{
                                background: p.show_in_nav ? BADGE.green.bg : BADGE.gray.bg,
                                color: p.show_in_nav ? BADGE.green.fg : BADGE.gray.fg,
                              }}>{p.show_in_nav ? 'Visible' : 'Masquée'}</span>
                            </td>
                            <td className="sc-stack-actions">
                              <div style={{ display: 'flex', gap: isMobile ? 8 : 2, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                                <button className={isMobile ? 'sc-btn sc-btn-secondary' : 'sc-iconbtn'} onClick={() => openEdit(p.slug)} aria-label={tc('edit')}>
                                  <span className="ms">edit</span>{isMobile && tc('edit')}
                                </button>
                                <button className={isMobile ? 'sc-btn sc-btn-danger' : 'sc-iconbtn'} onClick={() => setConfirmSlug(p.slug)} aria-label={tc('delete')}>
                                  <span className="ms">delete</span>{isMobile && tc('delete')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* EDITOR VIEW */}
        {view === 'editor' && (
          <>
            <div className="pg-header">
              <div style={{ minWidth: 0 }}>
                <button className="back-btn" onClick={() => setView('list')}>&#8592; Retour à la liste</button>
                <div className="pg-title">{isNew ? 'Nouvelle page' : editPage.title_fr || editPage.slug || 'Éditer la page'}</div>
              </div>
              {/* Téléphone : Sauvegarder passe dans la barre collée en bas */}
              {!isMobile && (
                <button className="btn btn-primary" onClick={savePage} disabled={saving}>
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              )}
            </div>

            <div className="pg-tabs" role="tablist">
              {([['info', 'Informations'], ['hero', 'Hero'], ['blocks', 'Blocs']] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`pg-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>

            {/* INFO TAB */}
            {tab === 'info' && (
              <>
                <div className="pg-section">
                  <div className="pg-section-title">{t('identNav')}</div>
                  <div className="grid-2" style={{ marginBottom: 14 }}>
                    <div className="form-group">
                      <label className="form-label">{t('slugReq')}</label>
                      <input
                        className="form-control"
                        value={editPage.slug}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={e => upd('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        placeholder="ma-page"
                        disabled={!isNew}
                        style={!isNew ? { background: '#F6F1E9', color: '#6A7280' } : {}}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('ordreTri')}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="form-control"
                        value={editPage.sort_order}
                        onChange={e => upd('sort_order', parseInt(e.target.value) || 99)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: isMobile ? 4 : 24, marginBottom: 6, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
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
                  <div className="pg-section-title">{t('titrePage')}</div>
                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label">{t('champTitre')} FR</label>
                      <input className="form-control" value={editPage.title_fr} onChange={e => upd('title_fr', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('champTitre')} SV</label>
                      <input className="form-control" value={editPage.title_sv} onChange={e => upd('title_sv', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('champTitre')} EN</label>
                      <input className="form-control" value={editPage.title_en} onChange={e => upd('title_en', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="pg-section">
                  <div className="pg-section-title">{t('libelleNav')}</div>
                  <div style={{ fontSize: 12, color: '#6A7280', marginBottom: 12 }}>{t('texteMenu')}</div>
                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label">{t('champNav')} FR</label>
                      <input className="form-control" value={editPage.nav_label_fr} onChange={e => upd('nav_label_fr', e.target.value)} placeholder={editPage.title_fr} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('champNav')} SV</label>
                      <input className="form-control" value={editPage.nav_label_sv} onChange={e => upd('nav_label_sv', e.target.value)} placeholder={editPage.title_sv} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('champNav')} EN</label>
                      <input className="form-control" value={editPage.nav_label_en} onChange={e => upd('nav_label_en', e.target.value)} placeholder={editPage.title_en} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* HERO TAB */}
            {tab === 'hero' && (
              <div className="pg-section">
                <div className="pg-section-title">{t('sectionHero')}</div>
                <div className="form-group">
                  <label className="form-label">{t('imageFond')}</label>
                  <input className="form-control" inputMode="url" autoCapitalize="none" spellCheck={false} value={editPage.hero_image} onChange={e => upd('hero_image', e.target.value)} placeholder="https://images.unsplash.com/..." />
                  {editPage.hero_image && (
                    <img src={editPage.hero_image} alt="Hero preview" className="img-preview" style={{ maxWidth: '100%', maxHeight: 200, marginTop: 10 }} />
                  )}
                </div>
                <div className="grid-3" style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <label className="form-label">{t('champTitreHero')} FR</label>
                    <input className="form-control" value={editPage.hero_title_fr} onChange={e => upd('hero_title_fr', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('champTitreHero')} SV</label>
                    <input className="form-control" value={editPage.hero_title_sv} onChange={e => upd('hero_title_sv', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('champTitreHero')} EN</label>
                    <input className="form-control" value={editPage.hero_title_en} onChange={e => upd('hero_title_en', e.target.value)} />
                  </div>
                </div>
                <div className="grid-3">
                  <div className="form-group">
                    <label className="form-label">{t('champSousTitreHero')} FR</label>
                    <input className="form-control" value={editPage.hero_subtitle_fr} onChange={e => upd('hero_subtitle_fr', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('champSousTitreHero')} SV</label>
                    <input className="form-control" value={editPage.hero_subtitle_sv} onChange={e => upd('hero_subtitle_sv', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('champSousTitreHero')} EN</label>
                    <input className="form-control" value={editPage.hero_subtitle_en} onChange={e => upd('hero_subtitle_en', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* BLOCKS TAB */}
            {tab === 'blocks' && (
              <div className="pg-section">
                <div className="pg-section-title">{t('blocsContenu')}</div>
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

            {/* Téléphone : Sauvegarder toujours à portée, collé en bas */}
            {isMobile && (
              <div className="sc-sticky-actions">
                <button className="sc-btn sc-btn-primary" onClick={savePage} disabled={saving}>
                  <span className="ms">save</span>{saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </div>
            )}
          </>
        )}

        {/* CONFIRM DELETE DIALOG — fenêtre du shell (les classes confirm-*
            n'étaient définies nulle part : la question s'affichait en bas
            de la liste, sans fond ni cadre). */}
        {confirmSlug && (
          <div className="sc-modal-back" onClick={() => setConfirmSlug(null)}>
            <div className="sc-modal" role="alertdialog" aria-modal="true" aria-label={t('supprimerPage')} onClick={e => e.stopPropagation()}
                 style={isMobile ? { height: 'auto', alignSelf: 'flex-end', borderRadius: '14px 14px 0 0' } : { maxWidth: 420 }}>
              <div className="sc-modal-body">
                <div style={{ fontSize: 15, fontWeight: 600, color: TH.ink, marginBottom: 6 }}>{t('supprimerPage')}</div>
                <div style={{ fontSize: isMobile ? 14 : 12.5, color: TH.text2b, lineHeight: 1.5 }}>
                  La page <strong>{confirmSlug}</strong> sera supprimée définitivement.
                </div>
              </div>
              <div className="sc-modal-foot" style={isMobile ? { paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' } : undefined}>
                <button className="sc-btn sc-btn-secondary" style={isMobile ? { flex: 1, justifyContent: 'center' } : undefined} onClick={() => setConfirmSlug(null)}>{tc('cancel')}</button>
                <button className="sc-btn sc-btn-danger" style={isMobile ? { flex: 1, justifyContent: 'center' } : undefined} onClick={() => deletePage(confirmSlug)}>{tc('delete')}</button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="sc-toast" role="status" aria-live="polite">{toast}</div>}
      </div>
    </>
  );
}
