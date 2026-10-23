'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, BadgeTone, initials, eur, thumbStyle } from '@/lib/admin-theme';
import { SqueletteTable } from '@/components/Squelette';
import { useT } from '@/lib/admin-i18n';
import { TCO, confirmerSuppressionContact } from './i18n';

/* ═══════════════════════════════════════════════════════════════
   ÉCRANS 17 & 18 — CLIENTS / FOURNISSEURS
   Un seul écran, deux rendus selon ?type= :
   · Clients (§17)      → table, avatar rond, segment en badge
   · Fournisseurs (§18) → grille de cartes auto-fill minmax(280px,1fr)
   ═══════════════════════════════════════════════════════════════ */

type Contact = {
  id: string; type: string; company?: string; first_name?: string; last_name?: string;
  email?: string; phone?: string; mobile?: string; address?: string; city?: string; zip?: string;
  country?: string; siret?: string; notes?: string; tags?: string[];
  total_orders?: number; total_purchases?: number; is_active?: boolean; created_at: string;
  delivery_days?: number;
};

/* Téléphone (< 900 px) : recherche pleine largeur, clients en cartes
   (sc-stack), fiches et formulaire en plein écran avec le pied collé en
   bas, email et téléphone cliquables. L'ordinateur garde son rendu. */
const CT_CSS = `
  .ct-search { height: 32px; width: 220px; background: #F7F4EF; }
  .ct-toast { position: fixed; bottom: 24px; right: 24px; background: ${T.ink}; color: #fff; padding: 10px 18px; border-radius: 7px; font-size: 12.5px; z-index: 300; }
  @media (max-width: 899px) {
    .ct-search { height: 44px; width: 100%; flex: 1 1 100%; -webkit-appearance: none; appearance: none; }
    .ct-tbl { min-width: 0 !important; }
    .ct-tbl td { overflow-wrap: anywhere; }
    .ct-tbl td.sc-stack-main span { font-size: 15px !important; font-weight: 600 !important; }
    /* « Modifier » en haut à droite de la carte plutôt que sur une ligne à lui */
    .ct-tbl tr { position: relative; }
    .ct-tbl td.sc-stack-main { padding-right: 48px !important; }
    .ct-tbl td.sc-stack-actions { position: absolute; top: 4px; right: 4px; width: auto !important; padding: 0 !important; }
    .ct-petit { font-size: 12.5px !important; }
    .ct-mini { font-size: 11px !important; }
    .ct-ov { padding: 0 !important; align-items: stretch !important; }
    .ct-dlg { max-width: none !important; margin: 0 !important; border-radius: 0 !important; border: none !important; min-height: 100%; display: flex; flex-direction: column; }
    .ct-dlg-corps { flex: 1; }
    .ct-dlg-pied { position: sticky; bottom: 0; background: #fff; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)) !important; }
    .ct-dlg-pied > .sc-btn { flex: 1 1 0; justify-content: center; }
    .ct-dlg-tete { position: sticky; top: 0; background: #fff; z-index: 1; padding: 6px 8px 6px 16px !important; }
    .ct-dlg-tete .sc-card-title { font-size: 17px; }
    .ct-fiche { font-size: 15px !important; }
    .ct-lien { text-decoration: underline !important; text-underline-offset: 3px; display: inline-flex; align-items: center; min-height: 40px; }
    .ct-cmd { font-size: 14px !important; padding: 10px 0 !important; }
    .ct-toast { left: 12px; right: 12px; bottom: calc(58px + 16px + env(safe-area-inset-bottom)); font-size: 14px; padding: 12px 16px; text-align: center; z-index: 400; }
  }
`;

const COUNTRIES = ['France','Belgique','Suisse','Luxembourg','Allemagne','Espagne','Italie','Pays-Bas','Portugal','Royaume-Uni','Suède','Norvège','Danemark','Finlande','Autriche','Pologne','République tchèque','États-Unis','Canada','Australie','Autre'];
const EMPTY: Partial<Contact> = { type: 'client', country: 'France', tags: [] };

const fullName = (c: Contact) =>
  c.company || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—';

/** Segment commercial, dérivé du volume réel (pas de champ dédié en base). */
function segmentOf(c: Contact): { label: string; tone: BadgeTone } {
  const n = c.total_orders || 0;
  const spent = c.total_purchases || 0;
  if (c.company || c.siret) return { label: 'Pro', tone: 'amber' };
  if (spent >= 300 || n >= 8) return { label: 'VIP', tone: 'plum' };
  if (n >= 5) return { label: 'Fidèle', tone: 'green' };
  if (n >= 2) return { label: 'Récurrent', tone: 'blue' };
  return { label: 'Nouveau', tone: 'gray' };
}

function ContactsInner() {
  const { t, tc, lang } = useT(TCO);
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get('type') || '';

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(typeFilter);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>(EMPTY);
  const [toast, setToast] = useState('');
  const [detail, setDetail] = useState<{ contact: Contact; orders: any[]; purchases: any[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const isSupplier = filter === 'supplier';
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { setFilter(typeFilter); }, [typeFilter]);
  useEffect(() => { load(); }, [filter, search]);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filter) p.set('type', filter);
      if (search) p.set('search', search);
      const d = await adminFetch('/api/contacts?' + p.toString()).then(r => r.json());
      setContacts(d.contacts || []);
    } finally { setLoading(false); }
  }

  async function openDetail(c: Contact) {
    setDetail({ contact: c, orders: [], purchases: [] });
    try {
      const d = await adminFetch(`/api/contacts/${c.id}`).then(r => r.json());
      setDetail({ contact: d.contact || c, orders: d.orders || [], purchases: d.purchases || [] });
    } catch { /* détail indisponible, la fiche reste ouverte */ }
  }

  async function save() {
    if (!form.email && !form.company && !form.last_name) { say(t('msgNomOuEmail')); return; }
    setSaving(true);
    try {
      const url = form.id ? `/api/contacts/${form.id}` : '/api/contacts';
      const res = await adminFetch(url, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      say(form.id ? 'Contact mis à jour' : 'Contact créé');
      setShowModal(false); setForm(EMPTY); load();
    } catch { say(t('msgEnregKo')); }
    finally { setSaving(false); }
  }

  async function remove(c: Contact) {
    if (!window.confirm(confirmerSuppressionContact(fullName(c), lang))) return;
    await adminFetch(`/api/contacts/${c.id}`, { method: 'DELETE' });
    setContacts(cs => cs.filter(x => x.id !== c.id));
    setDetail(null);
    say(t('msgSupprime'));
  }

  function exportCsv() {
    const rows = [['Nom', 'Email', 'Téléphone', 'Ville', 'Pays', 'Commandes', 'Total']];
    for (const c of contacts) {
      rows.push([fullName(c), c.email || '', c.phone || c.mobile || '', c.city || '', c.country || '',
                 String(c.total_orders || 0), String(c.total_purchases || 0)]);
    }
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${isSupplier ? 'fournisseurs' : 'clients'}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CT_CSS }} />
      <div className="sc-head">
        <div>
          <div className="sc-title">{isSupplier ? 'Fournisseurs' : filter === 'client' ? 'Clients' : 'Contacts'}</div>
          <div className="sc-sub">{contacts.length} fiche{contacts.length > 1 ? 's' : ''}</div>
        </div>
        <div className="sc-actions">
          <input className="sc-input ct-search" type="search" enterKeyHint="search" aria-label={t('chercher')}
                 placeholder={t('chercher')} value={search} onChange={e => setSearch(e.target.value)} />
          <button className="sc-btn sc-btn-secondary" onClick={exportCsv}><span className="ms">download</span>{t('exporter')}</button>
          <button className="sc-btn sc-btn-primary" onClick={() => { setForm({ ...EMPTY, type: filter || 'client' }); setShowModal(true); }}>
            <span className="ms">person_add</span>{t('ajouter')}
          </button>
        </div>
      </div>

      {loading && <SqueletteTable lignes={7} colonnes={4} vignette />}
      {!loading && contacts.length === 0 && <div className="sc-empty">{t('aucun')}</div>}

      {/* ── Fournisseurs : grille de cartes ─────────────── */}
      {!loading && isSupplier && contacts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
          {contacts.map(c => (
            <button key={c.id} className="sc-card" onClick={() => openDetail(c)}
                    style={{ textAlign: 'left', cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={thumbStyle(fullName(c), 34)}>{initials(fullName(c))}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {fullName(c)}
                  </div>
                  <div className="ct-petit" style={{ fontSize: 11, color: T.muted }}>{c.country || '—'}</div>
                </div>
                <span className="sc-badge" style={{
                  background: c.is_active === false ? BADGE.gray.bg : BADGE.green.bg,
                  color: c.is_active === false ? BADGE.gray.fg : BADGE.green.fg,
                }}>{c.is_active === false ? 'Inactif' : 'Actif'}</span>
              </div>
              <div className="ct-petit" style={{ padding: '9px 15px', borderTop: `1px solid ${T.borderFaint}`, fontSize: 11.5, color: T.text2b, overflowWrap: 'anywhere' }}>
                {c.email || '—'}{c.phone || c.mobile ? ` · ${c.phone || c.mobile}` : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid ${T.borderFaint}`, background: T.surfaceAlt }}>
                {[
                  { l: 'Délai', v: c.delivery_days ? `${c.delivery_days} j` : '—' },
                  { l: 'Commandes', v: String(c.total_orders || 0) },
                  { l: 'Encours', v: eur(c.total_purchases || 0) },
                ].map(x => (
                  <div key={x.l} style={{ padding: '9px 10px', textAlign: 'center' }}>
                    <div className="sc-num" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{x.v}</div>
                    <div className="ct-mini" style={{ fontSize: 9.5, color: T.muted, textTransform: 'uppercase', letterSpacing: .8 }}>{x.l}</div>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Clients : table ─────────────────────────────── */}
      {!loading && !isSupplier && contacts.length > 0 && (
        <div className="sc-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table sc-stack ct-tbl" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>{tc('client')}</th>
                  <th style={{ width: 200 }}>{tc('email')}</th>
                  <th style={{ width: 120 }}>{t('ville')}</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Cmd</th>
                  <th className="sc-right" style={{ width: 110 }}>{t('totalDepense')}</th>
                  <th style={{ width: 110 }}>{t('inscritLe')}</th>
                  <th style={{ width: 100 }}>{t('segment')}</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => {
                  const seg = segmentOf(c);
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(c)}>
                      <td className="sc-stack-main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700,
                          }}>{initials(fullName(c))}</div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{fullName(c)}</span>
                        </div>
                      </td>
                      <td data-label={tc('email')} style={{ color: T.text2b, wordBreak: 'break-all' }}>{c.email || '—'}</td>
                      <td data-label={t('ville')}>{c.city || '—'}</td>
                      <td data-label="Cmd" className="sc-num" style={{ textAlign: 'center' }}>{c.total_orders || 0}</td>
                      <td data-label={t('totalDepense')} className="sc-num sc-right" style={{ fontWeight: 600 }}>{eur(c.total_purchases || 0)}</td>
                      <td data-label={t('inscritLe')} className="ct-petit" style={{ fontSize: 11.5, color: T.muted }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td data-label={t('segment')}><span className="sc-badge" style={{ background: BADGE[seg.tone].bg, color: BADGE[seg.tone].fg }}>{seg.label}</span></td>
                      <td className="sc-stack-actions" onClick={e => e.stopPropagation()}>
                        <button className="sc-iconbtn" onClick={() => { setForm(c); setShowModal(true); }} aria-label={tc('edit')}>
                          <span className="ms">edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Fiche détail ────────────────────────────────── */}
      {detail && (
        <div className="ct-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
             onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="sc-card ct-dlg" role="dialog" aria-label={fullName(detail.contact)} style={{ width: '100%', maxWidth: 560, margin: 'auto' }}>
            <div className="ct-dlg-tete" style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="sc-card-title">{fullName(detail.contact)}</span>
              <button className="sc-iconbtn" onClick={() => setDetail(null)} aria-label={tc('close')}><span className="ms">close</span></button>
            </div>
            <div className="ct-dlg-corps" style={{ padding: 18 }}>
              {/* Email et téléphone cliquables : sur téléphone, on appelle ou
                  on écrit au client directement depuis sa fiche. */}
              <div className="ct-fiche" style={{ fontSize: 12.5, color: T.text2b, lineHeight: 1.7, overflowWrap: 'anywhere' }}>
                {detail.contact.email && <div><a className="ct-lien" href={`mailto:${detail.contact.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{detail.contact.email}</a></div>}
                {(detail.contact.phone || detail.contact.mobile) && (
                  <div><a className="ct-lien" href={`tel:${String(detail.contact.phone || detail.contact.mobile).replace(/[^\d+]/g, '')}`} style={{ color: 'inherit', textDecoration: 'none' }}>{detail.contact.phone || detail.contact.mobile}</a></div>
                )}
                {detail.contact.address && <div>{detail.contact.address}</div>}
                {(detail.contact.zip || detail.contact.city) && <div>{[detail.contact.zip, detail.contact.city].filter(Boolean).join(' ')}</div>}
                {detail.contact.country && <div>{detail.contact.country}</div>}
                {detail.contact.siret && <div className="sc-num">SIRET {detail.contact.siret}</div>}
              </div>
              {detail.contact.notes && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: T.surfaceAlt, borderRadius: 7, fontSize: 12, fontStyle: 'italic', color: T.text2b }}>
                  {detail.contact.notes}
                </div>
              )}
              {detail.orders.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="sc-label">Commandes ({detail.orders.length})</div>
                  {detail.orders.slice(0, 8).map((o: any) => (
                    <div key={o.id} className="ct-cmd" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                      <span className="sc-num">{o.order_number}</span>
                      <span className="sc-num">{eur(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="ct-dlg-pied" style={{ padding: '13px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="sc-btn sc-btn-danger" onClick={() => remove(detail.contact)}>
                <span className="ms">delete</span>{tc('delete')}
              </button>
              <button className="sc-btn sc-btn-secondary" onClick={() => { setForm(detail.contact); setDetail(null); setShowModal(true); }}>
                <span className="ms">edit</span>{tc('edit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Formulaire ──────────────────────────────────── */}
      {showModal && (
        <div className="ct-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.45)', zIndex: 210, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
             onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="sc-card ct-dlg" role="dialog" aria-label={form.id ? 'Modifier le contact' : 'Nouveau contact'} style={{ width: '100%', maxWidth: 560, margin: 'auto' }}>
            <div className="ct-dlg-tete" style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="sc-card-title">{form.id ? 'Modifier le contact' : 'Nouveau contact'}</span>
              <button className="sc-iconbtn sc-only-mobile" onClick={() => setShowModal(false)} aria-label={tc('close')}><span className="ms">close</span></button>
            </div>
            <div className="ct-dlg-corps" style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, alignContent: 'start' }}>
              <div>
                <label className="sc-label">Type</label>
                <select className="sc-input sc-select" value={form.type || 'client'} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="client">{tc('client')}</option>
                  <option value="supplier">{tc('supplier')}</option>
                  <option value="both">{t('lesDeux')}</option>
                </select>
              </div>
              <div><label className="sc-label">{t('societe')}</label><input className="sc-input" value={form.company || ''} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
              <div><label className="sc-label">{t('prenom')}</label><input className="sc-input" value={form.first_name || ''} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} /></div>
              <div><label className="sc-label">Nom</label><input className="sc-input" value={form.last_name || ''} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
              <div><label className="sc-label">{tc('email')}</label><input className="sc-input" type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label className="sc-label">{tc('phone')}</label><input className="sc-input" type="tel" inputMode="tel" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label className="sc-label">{tc('address')}</label><input className="sc-input" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div><label className="sc-label">{t('codePostal')}</label><input className="sc-input" value={form.zip || ''} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} /></div>
              <div><label className="sc-label">{t('ville')}</label><input className="sc-input" value={form.city || ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
              <div>
                <label className="sc-label">Pays</label>
                <select className="sc-input sc-select" value={form.country || 'France'} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="sc-label">SIRET</label><input className="sc-input sc-num" inputMode="numeric" value={form.siret || ''} onChange={e => setForm(f => ({ ...f, siret: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="sc-label">{tc('notes')}</label>
                <textarea className="sc-input sc-textarea" rows={3} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="ct-dlg-pied" style={{ padding: '13px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="sc-btn sc-btn-secondary" onClick={() => setShowModal(false)}>{tc('cancel')}</button>
              <button className="sc-btn sc-btn-green" onClick={save} disabled={saving}>
                <span className="ms">save</span>{saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="ct-toast" role="status">{toast}</div>}
    </>
  );
}

export default function ContactsPage() {
  return <Suspense fallback={<div className="sc-empty" />}><ContactsInner /></Suspense>;
}
