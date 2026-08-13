'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE } from '@/lib/admin-theme';

type Suggestion = {
  id: string;
  product_name: string;
  description?: string;
  source_url?: string;
  customer_email?: string;
  lang: string;
  status: 'new' | 'viewed' | 'done';
  created_at: string;
};

/* Statuts — mêmes tons que les autres écrans (cf. admin-theme). */
const STATUS: Record<Suggestion['status'], { label: string; tone: keyof typeof BADGE }> = {
  new:    { label: 'Nouvelle', tone: 'amber' },
  viewed: { label: 'Vue',      tone: 'blue' },
  done:   { label: 'Traitée',  tone: 'green' },
};

const LANG: Record<string, string> = { fr: 'Français', sv: 'Svenska', en: 'English' };

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');

  const say = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  async function load() {
    setLoading(true);
    try {
      const res = await adminFetch('/api/product-suggestions');
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch { say('Chargement impossible'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    await adminFetch('/api/product-suggestions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    setSuggestions(s => s.map(x => (x.id === id ? { ...x, status: status as Suggestion['status'] } : x)));
    say('Statut mis à jour');
  }

  async function deleteSuggestion(id: string) {
    if (!confirm('Supprimer cette suggestion ?')) return;
    await adminFetch(`/api/product-suggestions?id=${id}`, { method: 'DELETE' });
    setSuggestions(s => s.filter(x => x.id !== id));
    say('Suggestion supprimée');
  }

  const counts = useMemo(() => ({
    new: suggestions.filter(s => s.status === 'new').length,
    viewed: suggestions.filter(s => s.status === 'viewed').length,
    done: suggestions.filter(s => s.status === 'done').length,
  }), [suggestions]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return suggestions.filter(s => {
      if (filter && s.status !== filter) return false;
      if (!needle) return true;
      return [s.product_name, s.description, s.customer_email, s.source_url]
        .some(v => (v || '').toLowerCase().includes(needle));
    });
  }, [suggestions, filter, q]);

  const css = `
    .sg-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:12px; }
    .sg-stat { background:#fff; border:1px solid ${T.border}; border-radius:10px; padding:13px 15px; text-align:left; cursor:pointer; transition:border-color .12s,background .12s; }
    .sg-stat:hover { border-color:${T.borderField}; }
    .sg-stat.active { border-color:var(--accent); background:#FDFBFD; box-shadow:inset 3px 0 0 var(--accent); }
    .sg-stat-num { font-size:23px; font-weight:700; color:${T.ink}; font-variant-numeric:tabular-nums; letter-spacing:-.4px; }
    .sg-stat-label { font-size:9.5px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:${T.muted}; margin-top:3px; }
    .sg-name { font-size:13px; font-weight:500; color:${T.ink}; }
    .sg-desc { font-size:11.5px; color:${T.text3}; margin-top:2px; line-height:1.45; max-width:520px; }
    .sg-url { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--accent); text-decoration:none; margin-top:4px; word-break:break-all; }
    .sg-url:hover { text-decoration:underline; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.2px', color: T.ink }}>Suggestions produits</div>
          <div style={{ fontSize: 11.5, color: T.text3, marginTop: 2 }}>
            Ce que les clients aimeraient trouver en boutique
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span className="ms" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 17, color: T.muted }}>search</span>
            <input className="sc-input" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Rechercher…" style={{ paddingLeft: 32, width: 210 }} />
          </div>
          <button className="sc-btn sc-btn-secondary" onClick={load}>
            <span className="ms">refresh</span>Actualiser
          </button>
        </div>
      </div>

      {/* Les compteurs servent aussi de filtres : un clic bascule, un second annule. */}
      <div className="sg-stats">
        <div className={`sg-stat${filter === '' ? ' active' : ''}`} onClick={() => setFilter('')}>
          <div className="sg-stat-num">{suggestions.length}</div>
          <div className="sg-stat-label">Toutes</div>
        </div>
        {(Object.keys(STATUS) as Array<Suggestion['status']>).map(key => (
          <div key={key} className={`sg-stat${filter === key ? ' active' : ''}`}
               onClick={() => setFilter(filter === key ? '' : key)}>
            <div className="sg-stat-num">{counts[key]}</div>
            <div className="sg-stat-label">{STATUS[key].label}</div>
          </div>
        ))}
      </div>

      <div className="sc-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="sc-empty">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="sc-empty">
            <span className="ms" style={{ fontSize: 34, color: T.borderField, display: 'block', marginBottom: 8 }}>lightbulb</span>
            Aucune suggestion{filter ? ` « ${STATUS[filter as Suggestion['status']]?.label} »` : ''}
            {q ? ' pour cette recherche' : ''}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Produit suggéré</th>
                  <th style={{ width: 200 }}>Contact</th>
                  <th style={{ width: 100 }}>Langue</th>
                  <th style={{ width: 110 }}>Statut</th>
                  <th style={{ width: 90 }}>Reçue le</th>
                  <th style={{ width: 168 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const st = STATUS[s.status] || STATUS.new;
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="sg-name">{s.product_name}</div>
                        {s.description && <div className="sg-desc">{s.description}</div>}
                        {s.source_url && (
                          <a className="sg-url" href={s.source_url} target="_blank" rel="noopener noreferrer">
                            <span className="ms" style={{ fontSize: 13 }}>link</span>
                            {s.source_url.length > 56 ? s.source_url.slice(0, 56) + '…' : s.source_url}
                          </a>
                        )}
                      </td>
                      <td>
                        {s.customer_email
                          ? <a href={`mailto:${s.customer_email}`} style={{ fontSize: 12, color: T.blue, textDecoration: 'none' }}>{s.customer_email}</a>
                          : <span style={{ fontSize: 12, color: T.muted }}>Anonyme</span>}
                      </td>
                      <td style={{ fontSize: 12, color: T.text2b }}>{LANG[s.lang] || s.lang?.toUpperCase()}</td>
                      <td>
                        <span className="sc-badge" style={{ background: BADGE[st.tone].bg, color: BADGE[st.tone].fg }}>
                          {st.label}
                        </span>
                      </td>
                      <td className="sc-num" style={{ fontSize: 11.5, color: T.text3, whiteSpace: 'nowrap' }}>
                        {fmtDate(s.created_at)}
                        <div style={{ fontSize: 10.5, color: T.muted }}>{fmtTime(s.created_at)}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {s.status === 'new' && (
                            <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11.5 }}
                                    onClick={() => setStatus(s.id, 'viewed')}>Vue</button>
                          )}
                          {s.status !== 'done' ? (
                            <button className="sc-btn sc-btn-green" style={{ padding: '5px 10px', fontSize: 11.5 }}
                                    onClick={() => setStatus(s.id, 'done')}>Traitée</button>
                          ) : (
                            <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 10px', fontSize: 11.5 }}
                                    onClick={() => setStatus(s.id, 'new')}>Rouvrir</button>
                          )}
                          <button className="sc-iconbtn" onClick={() => deleteSuggestion(s.id)}
                                  title="Supprimer" aria-label="Supprimer">
                            <span className="ms" style={{ color: T.red }}>delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff',
          padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300,
        }}>{toast}</div>
      )}
    </>
  );
}
