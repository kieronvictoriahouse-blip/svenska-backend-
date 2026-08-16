'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE, BadgeTone, initials, eur, thumbStyle } from '@/lib/admin-theme';
import { SqueletteTable } from '@/components/Squelette';

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
    if (!form.email && !form.company && !form.last_name) { say('Renseigne au moins un nom ou un email'); return; }
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
    } catch { say('Enregistrement impossible'); }
    finally { setSaving(false); }
  }

  async function remove(c: Contact) {
    if (!window.confirm(`Supprimer « ${fullName(c)} » ?`)) return;
    await adminFetch(`/api/contacts/${c.id}`, { method: 'DELETE' });
    setContacts(cs => cs.filter(x => x.id !== c.id));
    setDetail(null);
    say('Contact supprimé');
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
      <div className="sc-head">
        <div>
          <div className="sc-title">{isSupplier ? 'Fournisseurs' : filter === 'client' ? 'Clients' : 'Contacts'}</div>
          <div className="sc-sub">{contacts.length} fiche{contacts.length > 1 ? 's' : ''}</div>
        </div>
        <div className="sc-actions">
          <input className="sc-input" style={{ height: 32, width: 220, background: '#F7F4EF' }}
                 placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="sc-btn sc-btn-secondary" onClick={exportCsv}><span className="ms">download</span>Exporter</button>
          <button className="sc-btn sc-btn-primary" onClick={() => { setForm({ ...EMPTY, type: filter || 'client' }); setShowModal(true); }}>
            <span className="ms">person_add</span>Ajouter
          </button>
        </div>
      </div>

      {loading && <SqueletteTable lignes={7} colonnes={4} vignette />}
      {!loading && contacts.length === 0 && <div className="sc-empty">Aucun contact.</div>}

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
                  <div style={{ fontSize: 11, color: T.muted }}>{c.country || '—'}</div>
                </div>
                <span className="sc-badge" style={{
                  background: c.is_active === false ? BADGE.gray.bg : BADGE.green.bg,
                  color: c.is_active === false ? BADGE.gray.fg : BADGE.green.fg,
                }}>{c.is_active === false ? 'Inactif' : 'Actif'}</span>
              </div>
              <div style={{ padding: '9px 15px', borderTop: `1px solid ${T.borderFaint}`, fontSize: 11.5, color: T.text2b }}>
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
                    <div style={{ fontSize: 9.5, color: T.muted, textTransform: 'uppercase', letterSpacing: .8 }}>{x.l}</div>
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
            <table className="sc-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th style={{ width: 200 }}>Email</th>
                  <th style={{ width: 120 }}>Ville</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Cmd</th>
                  <th className="sc-right" style={{ width: 110 }}>Total dépensé</th>
                  <th style={{ width: 110 }}>Inscrit le</th>
                  <th style={{ width: 100 }}>Segment</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => {
                  const seg = segmentOf(c);
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(c)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700,
                          }}>{initials(fullName(c))}</div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{fullName(c)}</span>
                        </div>
                      </td>
                      <td style={{ color: T.text2b, wordBreak: 'break-all' }}>{c.email || '—'}</td>
                      <td>{c.city || '—'}</td>
                      <td className="sc-num" style={{ textAlign: 'center' }}>{c.total_orders || 0}</td>
                      <td className="sc-num sc-right" style={{ fontWeight: 600 }}>{eur(c.total_purchases || 0)}</td>
                      <td style={{ fontSize: 11.5, color: T.muted }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td><span className="sc-badge" style={{ background: BADGE[seg.tone].bg, color: BADGE[seg.tone].fg }}>{seg.label}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="sc-iconbtn" onClick={() => { setForm(c); setShowModal(true); }} aria-label="Modifier">
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
             onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="sc-card" style={{ width: '100%', maxWidth: 560, margin: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="sc-card-title">{fullName(detail.contact)}</span>
              <button className="sc-iconbtn" onClick={() => setDetail(null)} aria-label="Fermer"><span className="ms">close</span></button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 12.5, color: T.text2b, lineHeight: 1.7 }}>
                {detail.contact.email && <div>{detail.contact.email}</div>}
                {(detail.contact.phone || detail.contact.mobile) && <div>{detail.contact.phone || detail.contact.mobile}</div>}
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
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                      <span className="sc-num">{o.order_number}</span>
                      <span className="sc-num">{eur(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '13px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="sc-btn sc-btn-danger" onClick={() => remove(detail.contact)}>
                <span className="ms">delete</span>Supprimer
              </button>
              <button className="sc-btn sc-btn-secondary" onClick={() => { setForm(detail.contact); setDetail(null); setShowModal(true); }}>
                <span className="ms">edit</span>Modifier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Formulaire ──────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.45)', zIndex: 210, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
             onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="sc-card" style={{ width: '100%', maxWidth: 560, margin: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
              <span className="sc-card-title">{form.id ? 'Modifier le contact' : 'Nouveau contact'}</span>
            </div>
            <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <div>
                <label className="sc-label">Type</label>
                <select className="sc-input sc-select" value={form.type || 'client'} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="client">Client</option>
                  <option value="supplier">Fournisseur</option>
                  <option value="both">Les deux</option>
                </select>
              </div>
              <div><label className="sc-label">Société</label><input className="sc-input" value={form.company || ''} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
              <div><label className="sc-label">Prénom</label><input className="sc-input" value={form.first_name || ''} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} /></div>
              <div><label className="sc-label">Nom</label><input className="sc-input" value={form.last_name || ''} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
              <div><label className="sc-label">Email</label><input className="sc-input" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label className="sc-label">Téléphone</label><input className="sc-input" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label className="sc-label">Adresse</label><input className="sc-input" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div><label className="sc-label">Code postal</label><input className="sc-input" value={form.zip || ''} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} /></div>
              <div><label className="sc-label">Ville</label><input className="sc-input" value={form.city || ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
              <div>
                <label className="sc-label">Pays</label>
                <select className="sc-input sc-select" value={form.country || 'France'} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="sc-label">SIRET</label><input className="sc-input sc-num" value={form.siret || ''} onChange={e => setForm(f => ({ ...f, siret: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="sc-label">Notes</label>
                <textarea className="sc-input sc-textarea" rows={3} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ padding: '13px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="sc-btn sc-btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="sc-btn sc-btn-green" onClick={save} disabled={saving}>
                <span className="ms">save</span>{saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300 }}>
          {toast}
        </div>
      )}
    </>
  );
}

export default function ContactsPage() {
  return <Suspense fallback={<div className="sc-empty">Chargement…</div>}><ContactsInner /></Suspense>;
}
