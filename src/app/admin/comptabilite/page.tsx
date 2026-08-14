'use client';
import { adminFetch } from '@/lib/auth-client';
import { T as TH } from '@/lib/admin-theme';
import { useEffect, useState, useCallback } from 'react';

type Entry = {
  id: string;
  date: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  reference_type?: string;
  reference_number?: string;
  created_at: string;
};

type Summary = {
  year: string;
  totalIncome: number;
  totalExpense: number;
  resultatBrut: number;
  resultatImposable: number;
  cotisationsEstimees: number;
  percentSeuil: number;
  percentTVA: number;
  seuilMicro: number;
  seuilTVA: number;
  abattement: number;
  months: Record<string, { income: number; expense: number }>;
  expensesByCategory: Record<string, number>;
};

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const INCOME_CATEGORIES: Record<string, string> = {
  vente_en_ligne: 'Vente en ligne',
  vente_directe:  'Vente directe',
  facture:        'Facture',
  autre:          'Autre',
};

const EXPENSE_CATEGORIES: Record<string, string> = {
  achat_marchandise: 'Achat marchandise',
  frais_port:        'Frais de port',
  frais_logistique:  'Frais logistiques (Landed costs)',
  frais_stripe:      'Frais Stripe',
  cotisations:       'Cotisations sociales',
  emballages:        'Emballages',
  autre:             'Autre',
};

const fmt = (n: number) =>
  (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const categoryLabel = (cat: string, type: 'income' | 'expense') =>
  type === 'income'
    ? (INCOME_CATEGORIES[cat] || cat)
    : (EXPENSE_CATEGORIES[cat] || cat);

const REF_LABELS: Record<string, string> = {
  order:       '🛒 Commande',
  reception:   '📦 Réception',
  landed_cost: '🚚 Coût logistique',
  refund:      '↩️ Remboursement',
  manual:      '✏️ Manuel',
};

export default function ComptabilitePage() {
  const year = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(year);
  const [tab, setTab] = useState<'dashboard' | 'recettes' | 'achats'>('dashboard');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [showComplianceInfo, setShowComplianceInfo] = useState(false);
  const [showUrssaf, setShowUrssaf] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<'income' | 'expense'>('income');
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0]);
  const [fDesc, setFDesc] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fCat, setFCat] = useState('autre');
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const authHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('sd_admin_token') || '' : '';
    return { Authorization: `Bearer ${token}` };
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('sd_admin_token') || '' : '';
      const headers = { Authorization: `Bearer ${token}` };
      const [sumRes, entRes] = await Promise.all([
        adminFetch(`/api/accounting/summary?year=${selectedYear}`, { cache: 'no-store', headers }),
        adminFetch(`/api/accounting/entries?year=${selectedYear}`, { cache: 'no-store', headers }),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (entRes.ok) setEntries((await entRes.json()).entries || []);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  async function downloadFile(url: string, filename: string) {
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) { showToast('❌ Export échoué (session expirée ?)'); return; }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
    } catch { showToast('❌ Export échoué'); }
  }

  useEffect(() => { load(); }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      const res = await adminFetch('/api/accounting/sync', { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ ${data.count} nouvelles entrées importées`);
        load();
      } else {
        showToast('❌ Erreur lors de la synchronisation');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function addEntry() {
    if (!fDate || !fDesc || !fAmount) { showToast('⚠️ Tous les champs sont requis'); return; }
    setSaving(true);
    try {
      const res = await adminFetch('/api/accounting/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ date: fDate, type: formType, category: fCat, description: fDesc, amount: parseFloat(fAmount) }),
      });
      if (res.ok) {
        showToast('✅ Entrée ajoutée');
        setShowForm(false);
        setFDesc(''); setFAmount(''); setFCat('autre');
        load();
      } else {
        const e = await res.json();
        showToast('❌ ' + (e?.error || 'Erreur'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Supprimer cette entrée ?')) return;
    const res = await adminFetch(`/api/accounting/entries?id=${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) { showToast('🗑️ Supprimé'); load(); }
    else { const e = await res.json().catch(() => ({})); showToast('❌ ' + (e?.error || 'Erreur suppression')); }
  }

  const income  = entries.filter(e => e.type === 'income');
  const expense = entries.filter(e => e.type === 'expense');

  const maxMonthVal = summary
    ? Math.max(...Object.values(summary.months).map(m => Math.max(m.income, m.expense)), 1)
    : 1;

  const years = Array.from({ length: 4 }, (_, i) => year - 1 + i - 1);

  // Client-side derived metrics
  const tresorerieNette = summary
    ? summary.totalIncome - summary.totalExpense - summary.cotisationsEstimees
    : 0;

  const now = new Date();
  const currentMonthKey = String(now.getMonth() + 1).padStart(2, '0');
  const prevMonthKey = now.getMonth() > 0 ? String(now.getMonth()).padStart(2, '0') : null;
  const currentMonthData = summary?.months[currentMonthKey] || { income: 0, expense: 0 };
  const prevMonthData = prevMonthKey ? (summary?.months[prevMonthKey] || { income: 0, expense: 0 }) : null;

  /* ═══════════════════════════════════════════════════════════════
     ÉCRAN 10 — COMPTABILITÉ
     Handoff §10 : 4 KPI avec note, histogramme mensuel, factures
     récentes, jauges de cotisations et de seuils.
     ═══════════════════════════════════════════════════════════════ */

  const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const monthEntries = Array.from({ length: 12 }, (_, i) => {
    const key = String(i + 1).padStart(2, '0');
    const m = summary?.months[key] || { income: 0, expense: 0 };
    return { key, label: MONTHS_FR[i], income: m.income, expense: m.expense, isCurrent: key === currentMonthKey };
  });
  const histoMax = Math.max(...monthEntries.map(m => m.income), 1);

  const eurC = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const kEur = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} k€` : `${Math.round(n)} €`);

  const KPIS = [
    { label: `CA encaissé ${selectedYear}`, value: eurC(summary?.totalIncome || 0), note: 'Base des déclarations URSSAF' },
    { label: 'Dépenses',                    value: eurC(summary?.totalExpense || 0), note: 'Achats, transport, frais' },
    { label: 'Cotisations estimées',        value: eurC(summary?.cotisationsEstimees || 0), note: '12,3 % du CA encaissé' },
    { label: 'Trésorerie nette',            value: eurC(tresorerieNette), note: 'CA − dépenses − cotisations' },
  ];

  const GAUGES = [
    {
      label: 'Seuil micro-BIC',
      value: summary?.totalIncome || 0,
      max: summary?.seuilMicro || 188700,
      note: 'Au-delà, sortie du régime micro-entreprise.',
    },
    {
      label: 'Seuil de franchise de TVA',
      value: summary?.totalIncome || 0,
      max: summary?.seuilTVA || 85000,
      note: 'Au-delà, la TVA devient applicable.',
    },
    {
      label: 'Objectif annuel',
      value: summary?.totalIncome || 0,
      max: 30000,
      note: 'Repère interne, sans valeur fiscale.',
    },
  ];

  const TABS: Array<['dashboard' | 'recettes' | 'achats', string]> = [
    ['dashboard', "Vue d'ensemble"], ['recettes', 'Recettes'], ['achats', 'Dépenses'],
  ];

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">Comptabilité</div>
          <div className="sc-sub">Micro-entreprise · BIC marchandises · TVA non applicable (art. 293 B)</div>
        </div>
        <div className="sc-actions">
          <select className="sc-input sc-select" style={{ width: 100, height: 32 }}
                  value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="sc-btn sc-btn-secondary" onClick={sync} disabled={syncing}>
            <span className="ms">sync</span>{syncing ? 'Synchro…' : 'Synchroniser'}
          </button>
          <button className="sc-btn sc-btn-secondary"
                  onClick={() => downloadFile(`/api/accounting/export-excel?year=${selectedYear}`, `Comptabilite_${selectedYear}.xlsx`)}>
            <span className="ms">download</span>Export comptable
          </button>
          <button className="sc-btn sc-btn-secondary"
                  onClick={() => downloadFile(`/api/accounting/fec?year=${selectedYear}`, `FEC_${selectedYear}.txt`)}>
            <span className="ms">description</span>FEC
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${TH.border}` }}>
        {TABS.map(([k, l]) => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer', padding: '9px 13px', fontSize: 12.5,
                fontWeight: on ? 600 : 400, color: on ? 'var(--accent)' : TH.text2,
                boxShadow: on ? 'inset 0 -2px 0 var(--accent)' : undefined,
              }}>{l}</button>
          );
        })}
      </div>

      {loading && <div className="sc-empty">Chargement…</div>}

      {!loading && tab === 'dashboard' && (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 10, marginBottom: 12 }}>
            {KPIS.map(k => (
              <div key={k.label} className="sc-card" style={{ padding: '13px 15px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: TH.muted }}>{k.label}</div>
                <div className="sc-num" style={{ fontSize: 23, fontWeight: 700, margin: '6px 0 4px', color: TH.ink }}>{k.value}</div>
                <div style={{ fontSize: 10.5, color: TH.muted }}>{k.note}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Histogramme mensuel */}
            <div className="sc-card" style={{ flex: '2 1 460px', minWidth: 0 }}>
              <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                <span className="sc-card-title">CA encaissé par mois · {selectedYear}</span>
              </div>
              <div style={{ padding: '18px 15px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150 }}>
                  {monthEntries.map(m => {
                    const h = histoMax > 0 ? (m.income / histoMax) * 100 : 0;
                    return (
                      <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%' }}>
                        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {m.income > 0 && (
                            <div className="sc-num" style={{ fontSize: 9.5, color: TH.muted, marginBottom: 3, whiteSpace: 'nowrap' }}>
                              {kEur(m.income)}
                            </div>
                          )}
                          <div style={{
                            width: '100%', maxWidth: 34, height: `${Math.max(2, h)}%`,
                            borderRadius: '5px 5px 2px 2px',
                            background: m.isCurrent ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)',
                          }} />
                        </div>
                        <div style={{ fontSize: 9.5, color: m.isCurrent ? TH.ink : TH.muted, fontWeight: m.isCurrent ? 600 : 400 }}>
                          {m.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Dernières écritures */}
            <div className="sc-card" style={{ flex: '1 1 280px', minWidth: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
                <span className="sc-card-title">Dernières écritures</span>
              </div>
              {entries.slice(0, 6).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px', borderBottom: `1px solid ${TH.borderFaint}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: TH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.description || e.category}
                    </div>
                    <div style={{ fontSize: 10.5, color: TH.muted }}>{new Date(e.date).toLocaleDateString('fr-FR')}</div>
                  </div>
                  <span className="sc-num" style={{
                    fontSize: 12.5, fontWeight: 600,
                    color: e.type === 'income' ? TH.green : TH.red,
                  }}>{e.type === 'income' ? '+' : '−'}{eurC(Math.abs(e.amount))}</span>
                </div>
              ))}
              {entries.length === 0 && <div className="sc-empty" style={{ padding: 28 }}>Aucune écriture</div>}
            </div>
          </div>

          {/* Cotisations & seuils */}
          <div className="sc-card" style={{ marginTop: 12 }}>
            <div style={{ padding: '12px 15px', borderBottom: `1px solid ${TH.border}` }}>
              <span className="sc-card-title">Cotisations & seuils</span>
            </div>
            <div style={{ padding: '15px' }}>
              {GAUGES.map(g => {
                const pct = g.max > 0 ? Math.min(100, (g.value / g.max) * 100) : 0;
                const color = pct >= 90 ? TH.red : pct >= 70 ? '#C97A2B' : 'var(--accent)';
                return (
                  <div key={g.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, color: TH.text2b }}>{g.label}</span>
                      <span className="sc-num" style={{ fontSize: 12, color: TH.muted }}>
                        {eurC(g.value)} / {eurC(g.max)}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: TH.borderFaint2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color }} />
                    </div>
                    <div style={{ fontSize: 10.5, color: TH.muted, marginTop: 4 }}>{g.note}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Recettes / Dépenses ─────────────────────────── */}
      {!loading && tab !== 'dashboard' && (() => {
        const list = tab === 'recettes' ? income : expense;
        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button className="sc-btn sc-btn-primary"
                      onClick={() => { setFormType(tab === 'recettes' ? 'income' : 'expense'); setShowForm(true); }}>
                <span className="ms">add</span>{tab === 'recettes' ? 'Ajouter une recette' : 'Ajouter une dépense'}
              </button>
            </div>

            {showForm && (
              <div className="sc-card" style={{ padding: 15, marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
                  <div>
                    <label className="sc-label">Date</label>
                    <input className="sc-input" type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="sc-label">Description</label>
                    <input className="sc-input" value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Achat marchandises…" />
                  </div>
                  <div>
                    <label className="sc-label">Montant</label>
                    <input className="sc-input sc-num" type="number" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} />
                  </div>
                  <div>
                    <label className="sc-label">Catégorie</label>
                    <input className="sc-input" value={fCat} onChange={e => setFCat(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button className="sc-btn sc-btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
                  <button className="sc-btn sc-btn-green" onClick={addEntry} disabled={saving}>
                    <span className="ms">save</span>{saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            )}

            <div className="sc-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sc-table" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Date</th>
                      <th>Description</th>
                      <th style={{ width: 150 }}>Catégorie</th>
                      <th className="sc-right" style={{ width: 110 }}>Montant</th>
                      <th style={{ width: 44 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && (
                      <tr><td colSpan={5}><div className="sc-empty">Aucune écriture</div></td></tr>
                    )}
                    {list.map(e => (
                      <tr key={e.id}>
                        <td className="sc-num" style={{ fontSize: 11.5, color: TH.muted }}>
                          {new Date(e.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td>{e.description || '—'}</td>
                        <td style={{ color: TH.text2b }}>{e.category}</td>
                        <td className="sc-num sc-right" style={{
                          fontWeight: 600, color: e.type === 'income' ? TH.green : TH.red,
                        }}>{e.type === 'income' ? '+' : '−'}{eurC(Math.abs(e.amount))}</td>
                        <td>
                          <button className="sc-iconbtn" onClick={() => deleteEntry(e.id)} aria-label="Supprimer">
                            <span className="ms">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: TH.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300 }}>
          {toast}
        </div>
      )}
    </>
  );
}
