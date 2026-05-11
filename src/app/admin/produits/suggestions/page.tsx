'use client';
import { useEffect, useState } from 'react';

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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:    { label: 'Nouvelle', color: '#F59E0B' },
  viewed: { label: 'Vue',      color: '#3B82F6' },
  done:   { label: 'Traitée',  color: '#10B981' },
};

const LANG_FLAG: Record<string, string> = { fr: '🇫🇷', sv: '🇸🇪', en: '🇬🇧' };

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  async function load() {
    setLoading(true);
    const res = await fetch('/api/product-suggestions');
    const data = await res.json();
    setSuggestions(data.suggestions || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    const token = localStorage.getItem('sd_admin_token') || '';
    await fetch('/api/product-suggestions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status }),
    });
    setSuggestions(s => s.map(x => x.id === id ? { ...x, status: status as Suggestion['status'] } : x));
    showToast('✅ Statut mis à jour');
  }

  async function deleteSuggestion(id: string) {
    if (!confirm('Supprimer cette suggestion ?')) return;
    const token = localStorage.getItem('sd_admin_token') || '';
    await fetch(`/api/product-suggestions?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setSuggestions(s => s.filter(x => x.id !== id));
    showToast('🗑️ Suggestion supprimée');
  }

  const filtered = filter ? suggestions.filter(s => s.status === filter) : suggestions;
  const counts = { new: suggestions.filter(s => s.status === 'new').length, viewed: suggestions.filter(s => s.status === 'viewed').length, done: suggestions.filter(s => s.status === 'done').length };

  return (
    <>
      <style>{`
        .sg-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
        .sg-title { font-size:22px; font-weight:700; color:#1C2028; }
        .sg-stats { display:flex; gap:10px; flex-wrap:wrap; }
        .sg-stat { background:#fff; border:1px solid #E8E3DC; border-radius:8px; padding:10px 16px; text-align:center; min-width:80px; cursor:pointer; transition:border-color 0.15s; }
        .sg-stat:hover, .sg-stat.active { border-color:#7B4F7B; }
        .sg-stat-num { font-size:20px; font-weight:700; color:#1C2028; }
        .sg-stat-label { font-size:11px; color:#6A7280; text-transform:uppercase; letter-spacing:0.5px; }
        .sg-toolbar { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
        .sg-filter { padding:7px 14px; border-radius:6px; border:1px solid #E8E3DC; background:#fff; font-size:13px; cursor:pointer; transition:all 0.15s; }
        .sg-filter.active { background:#7B4F7B; color:#fff; border-color:#7B4F7B; }
        .sg-table { width:100%; background:#fff; border-radius:10px; border:1px solid #E8E3DC; overflow:hidden; }
        .sg-table table { width:100%; border-collapse:collapse; }
        .sg-table th { font-size:11px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#6A7280; padding:12px 16px; text-align:left; background:#FAFAF8; border-bottom:1px solid #E8E3DC; }
        .sg-table td { padding:14px 16px; font-size:14px; color:#1C2028; border-bottom:1px solid #F0EDE8; vertical-align:top; }
        .sg-table tr:last-child td { border-bottom:none; }
        .sg-table tr:hover td { background:#FAFAF8; }
        .sg-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:11px; font-weight:600; letter-spacing:0.3px; }
        .sg-name { font-weight:600; margin-bottom:3px; }
        .sg-desc { font-size:12px; color:#6A7280; margin-top:2px; }
        .sg-url { font-size:12px; color:#7B4F7B; word-break:break-all; }
        .sg-email { font-size:12px; color:#3B82F6; }
        .sg-actions { display:flex; gap:6px; flex-wrap:wrap; }
        .sg-btn { padding:5px 10px; border-radius:5px; font-size:12px; border:1px solid #E8E3DC; background:#fff; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
        .sg-btn:hover { background:#F0EDE8; }
        .sg-btn.del { border-color:#EF4444; color:#EF4444; }
        .sg-btn.del:hover { background:#FEF2F2; }
        .sg-btn.done { border-color:#10B981; color:#10B981; }
        .sg-btn.done:hover { background:#ECFDF5; }
        .sg-empty { padding:60px 20px; text-align:center; color:#6A7280; font-style:italic; }
        .toast { position:fixed; bottom:24px; right:24px; background:#1C2028; color:#fff; padding:12px 20px; border-radius:8px; font-size:13px; z-index:9999; opacity:0; transition:opacity 0.3s; pointer-events:none; }
        .toast.show { opacity:1; }
      `}</style>

      <div className="sg-header">
        <h1 className="sg-title">💡 Suggestions produits</h1>
        <div className="sg-stats">
          {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
            <div key={key} className={`sg-stat${filter === key ? ' active' : ''}`} onClick={() => setFilter(filter === key ? '' : key)}>
              <div className="sg-stat-num" style={{ color }}>{counts[key as keyof typeof counts]}</div>
              <div className="sg-stat-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6A7280' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="sg-table"><div className="sg-empty">Aucune suggestion{filter ? ` "${STATUS_LABELS[filter]?.label}"` : ''} pour le moment.</div></div>
      ) : (
        <div className="sg-table">
          <table>
            <thead>
              <tr>
                <th>Produit suggéré</th>
                <th>Contact</th>
                <th style={{ width: 90 }}>Langue</th>
                <th style={{ width: 100 }}>Statut</th>
                <th style={{ width: 80 }}>Date</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="sg-name">{s.product_name}</div>
                    {s.description && <div className="sg-desc">{s.description}</div>}
                    {s.source_url && (
                      <div className="sg-url">
                        <a href={s.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#7B4F7B' }}>
                          🔗 {s.source_url.length > 50 ? s.source_url.slice(0, 50) + '…' : s.source_url}
                        </a>
                      </div>
                    )}
                  </td>
                  <td>
                    {s.customer_email
                      ? <a href={`mailto:${s.customer_email}`} className="sg-email">{s.customer_email}</a>
                      : <span style={{ color: '#D1C7B8', fontStyle: 'italic' }}>Anonyme</span>}
                  </td>
                  <td style={{ fontSize: 20 }}>{LANG_FLAG[s.lang] || '🌐'} <span style={{ fontSize: 11, color: '#6A7280' }}>{s.lang.toUpperCase()}</span></td>
                  <td>
                    <span className="sg-badge" style={{ background: STATUS_LABELS[s.status]?.color + '22', color: STATUS_LABELS[s.status]?.color }}>
                      {STATUS_LABELS[s.status]?.label || s.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: '#6A7280', whiteSpace: 'nowrap' }}>{fmtDate(s.created_at)}</td>
                  <td>
                    <div className="sg-actions">
                      {s.status !== 'viewed' && s.status !== 'done' && (
                        <button className="sg-btn" onClick={() => setStatus(s.id, 'viewed')}>👁️ Vue</button>
                      )}
                      {s.status !== 'done' && (
                        <button className="sg-btn done" onClick={() => setStatus(s.id, 'done')}>✅ Traitée</button>
                      )}
                      {s.status === 'done' && (
                        <button className="sg-btn" onClick={() => setStatus(s.id, 'new')}>↩️ Rouvrir</button>
                      )}
                      <button className="sg-btn del" onClick={() => deleteSuggestion(s.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`toast${toast ? ' show' : ''}`}>{toast}</div>
    </>
  );
}
