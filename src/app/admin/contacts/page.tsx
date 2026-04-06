'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Contact = {
  id: string; type: string; company?: string; first_name?: string; last_name?: string;
  email?: string; phone?: string; mobile?: string; address?: string; city?: string; zip?: string;
  country?: string; siret?: string; notes?: string; tags?: string[];
  total_orders?: number; total_purchases?: number; is_active?: boolean; created_at: string;
};

const TYPE_LABELS: Record<string, string> = { client: 'Client', supplier: 'Fournisseur', both: 'Les deux' };
const TYPE_COLORS: Record<string, string> = { client: '#2563EB', supplier: '#7C3AED', both: '#059669' };
const fmt = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR');

const EMPTY: Partial<Contact> = { type: 'client', country: 'France', tags: [] };

function ContactsInner() {
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get('type') || '';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(typeFilter);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>(EMPTY);
  const [isEditing, setIsEditing] = useState(false);
  const [toast, setToast] = useState('');
  const [detail, setDetail] = useState<{ orders: any[]; purchases: any[] } | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { load(); }, [filter, search]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set('type', filter);
    if (search) params.set('search', search);
    const res = await fetch('/api/contacts?' + params);
    const data = await res.json();
    setContacts(data.contacts || []);
    setLoading(false);
  }

  async function openDetail(c: Contact) {
    setSelected(c);
    const res = await fetch(`/api/contacts/${c.id}`);
    const data = await res.json();
    setDetail({ orders: data.orders || [], purchases: data.purchases || [] });
    setShowModal(false);
    setIsEditing(false);
  }

  async function save() {
    const method = form.id ? 'PUT' : 'POST';
    const url = form.id ? `/api/contacts/${form.id}` : '/api/contacts';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (!res.ok) { showToast('❌ Erreur'); return; }
    showToast('✅ Contact sauvegardé !');
    setShowModal(false);
    setIsEditing(false);
    load();
  }

  async function deleteContact(id: string) {
    if (!confirm('Archiver ce contact ?')) return;
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    showToast('🗑 Contact archivé');
    setSelected(null);
    load();
  }

  function openNew() { setForm({ ...EMPTY }); setIsEditing(true); setShowModal(true); setSelected(null); }
  function openEdit(c: Contact) { setForm({ ...c }); setIsEditing(true); setShowModal(true); }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; }
    .c-wrap { font-family: 'Jost', sans-serif; display: flex; gap: 20px; height: calc(100vh - 0px); }
    .c-list { flex: 1; min-width: 0; }
    .c-detail { width: 380px; flex-shrink: 0; background: #fff; border: 1px solid #D8CEBC; border-radius: 8px; overflow-y: auto; }
    .c-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
    .c-title { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 600; color: #1C2028; }
    .c-toolbar { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    .c-search { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; outline: none; }
    .c-select { padding: 8px 12px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; background: #fff; outline: none; }
    .c-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; border: 1px solid #D8CEBC; border-radius: 8px; overflow: hidden; }
    .c-table th { padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #6A7280; background: #FDFAF5; border-bottom: 1px solid #D8CEBC; }
    .c-table td { padding: 11px 14px; border-bottom: 1px solid #F0EBE1; vertical-align: middle; }
    .c-table tr:last-child td { border-bottom: none; }
    .c-table tr:hover td { background: #FDFAF5; cursor: pointer; }
    .c-table tr.selected td { background: #E8EEE5; }
    .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
    .btn-primary { background: #3E5238; color: #fff; } .btn-primary:hover { background: #587050; }
    .btn-secondary { background: #F6F1E9; color: #3E4550; border: 1px solid #D8CEBC; } .btn-secondary:hover { background: #D8CEBC; }
    .btn-sm { padding: 4px 10px; font-size: 11px; }
    .btn-danger { background: #FEE2E2; color: #991B1B; } .btn-danger:hover { background: #FCA5A5; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(28,32,40,0.5); z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; overflow-y: auto; }
    .modal { background: #fff; border-radius: 8px; width: 100%; max-width: 600px; margin: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .modal-header { padding: 16px 20px; border-bottom: 1px solid #D8CEBC; display: flex; align-items: center; justify-content: space-between; }
    .modal-title { font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px; max-height: 70vh; overflow-y: auto; }
    .modal-footer { padding: 14px 20px; border-top: 1px solid #D8CEBC; display: flex; justify-content: flex-end; gap: 10px; }
    .form-group { margin-bottom: 12px; }
    .form-label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #6A7280; margin-bottom: 4px; }
    .form-control { width: 100%; padding: 8px 10px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; outline: none; }
    .form-control:focus { border-color: #7A9468; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .detail-header { padding: 20px; border-bottom: 1px solid #D8CEBC; }
    .detail-avatar { width: 48px; height: 48px; border-radius: 50%; background: #3E5238; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 600; margin-bottom: 10px; }
    .detail-name { font-size: 16px; font-weight: 600; }
    .detail-email { font-size: 12px; color: #6A7280; }
    .detail-section { padding: 14px 20px; border-bottom: 1px solid #F0EBE1; }
    .detail-section-title { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #6A7280; margin-bottom: 10px; }
    .detail-row { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
    .mono { font-family: 'DM Mono', monospace; }
    .empty { padding: 40px; text-align: center; color: #6A7280; font-style: italic; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #1C2028; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; z-index: 999; }
    textarea.form-control { min-height: 70px; resize: vertical; }
    select.form-control { appearance: none; }
  `;

  const initials = (c: Contact) => {
    if (c.company) return c.company.slice(0, 2).toUpperCase();
    return ((c.first_name || '')[0] + (c.last_name || '')[0]).toUpperCase() || '??';
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="c-wrap">
        <div className="c-list">
          <div className="c-header">
            <div>
              <div className="c-title">
                {filter === 'client' ? '👤 Clients' : filter === 'supplier' ? '🏭 Fournisseurs' : '📇 Contacts'}
              </div>
              <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>{contacts.length} contacts</div>
            </div>
            <button className="btn btn-primary" onClick={openNew}>+ Nouveau contact</button>
          </div>

          <div className="c-toolbar">
            <input className="c-search" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="c-select" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="">Tous types</option>
              <option value="client">Clients</option>
              <option value="supplier">Fournisseurs</option>
              <option value="both">Les deux</option>
            </select>
          </div>

          <table className="c-table">
            <thead><tr><th>Nom</th><th>Type</th><th>Email</th><th>Ville</th><th>CA</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="empty">Chargement…</div></td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={6}><div className="empty">Aucun contact</div></td></tr>
              ) : contacts.map(c => (
                <tr key={c.id} className={selected?.id === c.id ? 'selected' : ''} onClick={() => openDetail(c)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.company || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—'}</div>
                    {c.company && <div style={{ fontSize: 11, color: '#6A7280' }}>{`${c.first_name || ''} ${c.last_name || ''}`.trim()}</div>}
                  </td>
                  <td><span className="badge" style={{ background: TYPE_COLORS[c.type] + '20', color: TYPE_COLORS[c.type] }}>{TYPE_LABELS[c.type]}</span></td>
                  <td style={{ color: '#6A7280', fontSize: 12 }}>{c.email || '—'}</td>
                  <td style={{ color: '#6A7280', fontSize: 12 }}>{c.city || '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmt(c.total_orders || 0)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>✏️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Panneau détail */}
        {selected && (
          <div className="c-detail">
            <div className="detail-header">
              <div className="detail-avatar">{initials(selected)}</div>
              <div className="detail-name">{selected.company || `${selected.first_name || ''} ${selected.last_name || ''}`.trim()}</div>
              <div className="detail-email">{selected.email}</div>
              {selected.phone && <div style={{ fontSize: 12, color: '#6A7280', marginTop: 2 }}>{selected.phone}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(selected)}>✏️ Éditer</button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteContact(selected.id)}>🗑</button>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-title">Informations</div>
              {selected.company && <div className="detail-row"><span style={{ color: '#6A7280' }}>Société</span><span>{selected.company}</span></div>}
              {selected.siret && <div className="detail-row"><span style={{ color: '#6A7280' }}>SIRET</span><span className="mono" style={{ fontSize: 11 }}>{selected.siret}</span></div>}
              {selected.address && <div className="detail-row"><span style={{ color: '#6A7280' }}>Adresse</span><span style={{ textAlign: 'right', maxWidth: 200, fontSize: 12 }}>{selected.address}, {selected.city}</span></div>}
              {selected.mobile && <div className="detail-row"><span style={{ color: '#6A7280' }}>Mobile</span><span>{selected.mobile}</span></div>}
            </div>

            {detail && (
              <>
                <div className="detail-section">
                  <div className="detail-section-title">Statistiques</div>
                  <div className="detail-row"><span style={{ color: '#6A7280' }}>Commandes</span><span className="mono">{detail.orders.length}</span></div>
                  <div className="detail-row"><span style={{ color: '#6A7280' }}>CA total</span><span className="mono">{fmt(detail.orders.reduce((s: number, o: any) => s + o.total, 0))}</span></div>
                  {detail.purchases.length > 0 && <>
                    <div className="detail-row"><span style={{ color: '#6A7280' }}>Achats</span><span className="mono">{detail.purchases.length}</span></div>
                    <div className="detail-row"><span style={{ color: '#6A7280' }}>Total achats</span><span className="mono">{fmt(detail.purchases.reduce((s: number, p: any) => s + p.total, 0))}</span></div>
                  </>}
                </div>

                {detail.orders.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-section-title">Dernières commandes</div>
                    {detail.orders.slice(0, 5).map((o: any) => (
                      <div key={o.id} className="detail-row">
                        <span style={{ fontSize: 12 }}>{o.order_number}</span>
                        <span className="mono" style={{ fontSize: 12 }}>{fmt(o.total)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {detail.purchases.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-section-title">Derniers achats</div>
                    {detail.purchases.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="detail-row">
                        <span style={{ fontSize: 12 }}>{p.number}</span>
                        <span className="mono" style={{ fontSize: 12 }}>{fmt(p.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {selected.notes && (
              <div className="detail-section">
                <div className="detail-section-title">Notes</div>
                <div style={{ fontSize: 13, color: '#3E4550', fontStyle: 'italic' }}>{selected.notes}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal création/édition */}
      {showModal && isEditing && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{form.id ? 'Éditer le contact' : 'Nouveau contact'}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Type *</label>
                <select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="client">Client</option>
                  <option value="supplier">Fournisseur</option>
                  <option value="both">Client & Fournisseur</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Société</label><input className="form-control" value={form.company || ''} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Prénom</label><input className="form-control" value={form.first_name || ''} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Nom</label><input className="form-control" value={form.last_name || ''} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-control" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Téléphone</label><input className="form-control" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Mobile</label><input className="form-control" value={form.mobile || ''} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">SIRET</label><input className="form-control" value={form.siret || ''} onChange={e => setForm(f => ({ ...f, siret: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label className="form-label">Adresse</label><input className="form-control" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div className="grid-3">
                <div className="form-group"><label className="form-label">Ville</label><input className="form-control" value={form.city || ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Code postal</label><input className="form-control" value={form.zip || ''} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Pays</label><input className="form-control" value={form.country || 'France'} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={save}>💾 Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
export default function ContactsPage() { return <Suspense><ContactsInner /></Suspense>; }
