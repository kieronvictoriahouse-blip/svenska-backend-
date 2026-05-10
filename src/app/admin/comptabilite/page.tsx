'use client';
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
  cotisations:       'Cotisations sociales',
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, entRes] = await Promise.all([
        fetch(`/api/accounting/summary?year=${selectedYear}`, { cache: 'no-store' }),
        fetch(`/api/accounting/entries?year=${selectedYear}`, { cache: 'no-store' }),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (entRes.ok) setEntries((await entRes.json()).entries || []);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { load(); }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/accounting/sync', { method: 'POST' });
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
      const res = await fetch('/api/accounting/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`/api/accounting/entries?id=${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('🗑️ Supprimé'); load(); }
    else showToast('❌ Erreur suppression');
  }

  const income  = entries.filter(e => e.type === 'income');
  const expense = entries.filter(e => e.type === 'expense');

  const maxMonthVal = summary
    ? Math.max(...Object.values(summary.months).map(m => Math.max(m.income, m.expense)), 1)
    : 1;

  const years = Array.from({ length: 4 }, (_, i) => year - 1 + i - 1);

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: '#1e293b', color: '#fff', padding: '12px 20px',
          borderRadius: 8, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Comptabilité</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Micro-entreprise · BIC marchandises</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={sync}
            disabled={syncing}
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: syncing ? '#94a3b8' : '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 600,
            }}
          >
            {syncing ? '⏳ Sync…' : '🔄 Synchroniser'}
          </button>
          <a
            href={`/api/accounting/fec?year=${selectedYear}`}
            download
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: '#1e293b', color: '#fff', fontSize: 14, fontWeight: 600,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title="Export FEC — obligatoire en cas de contrôle fiscal (Art. L.47 A LPF)"
          >
            📁 Export FEC
          </a>
          <button
            onClick={() => setShowComplianceInfo(v => !v)}
            style={{
              padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db',
              cursor: 'pointer', background: '#fff', fontSize: 13, color: '#475569',
            }}
            title="Statut de conformité réglementaire"
          >
            ⚖️
          </button>
        </div>
      </div>

      {/* Compliance panel */}
      {showComplianceInfo && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10,
          padding: 20, marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#92400e' }}>
              ⚖️ Conformité réglementaire — Micro-entreprise BIC marchandises
            </h3>
            <button onClick={() => setShowComplianceInfo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            {[
              { ok: true,  label: 'Livre de recettes', ref: 'Art. 50-0 CGI', note: 'Onglet Recettes = livre légal' },
              { ok: true,  label: 'Registre des achats', ref: 'Art. 50-0 CGI', note: 'Onglet Achats = registre légal' },
              { ok: true,  label: 'Export FEC (Fichier des Écritures Comptables)', ref: 'Art. L.47 A LPF', note: 'Bouton "Export FEC" disponible' },
              { ok: true,  label: 'Numérotation séquentielle', ref: 'Art. 242 nonies A CGI', note: 'SD-/REC-/ACH- sans rupture' },
              { ok: true,  label: 'Seuil franchise TVA correct (91 900 €)', ref: 'Art. 293 B CGI', note: 'Livraisons de biens 2025' },
              { ok: false, label: 'Mention TVA sur factures', ref: 'Art. 293 B CGI', note: 'Ajouter "TVA non applicable, art. 293 B du CGI" sur tes factures' },
              { ok: false, label: 'SIRET sur factures émises', ref: 'Art. L.441-9 Ccom', note: 'Obligatoire sur toute facture' },
              { ok: false, label: 'Conservation 10 ans', ref: 'Art. L.123-22 Ccom', note: 'Désactiver la suppression des écritures validées' },
              { ok: false, label: 'RGPD — données clients', ref: 'Règlement UE 2016/679', note: 'Mentions légales + politique de confidentialité sur le site' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                background: item.ok ? '#f0fdf4' : '#fef9c3',
                border: `1px solid ${item.ok ? '#bbf7d0' : '#fde68a'}`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.ok ? '✅' : '⚠️'}</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.label}</div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>{item.ref} — {item.note}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 12, color: '#92400e', fontStyle: 'italic' }}>
            Note : La certification NF525 (logiciel de caisse) ne s'applique qu'aux logiciels de caisse physiques (point de vente). Un outil de gestion interne e-commerce est hors périmètre.
          </p>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#64748b' }}>Chargement…</p>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              <Card label="Chiffre d'affaires" value={fmt(summary.totalIncome)} color="#10b981" sub={`${income.length} recette(s)`} />
              <Card label="Achats & dépenses" value={fmt(summary.totalExpense)} color="#ef4444" sub={`${expense.length} entrée(s)`} />
              <Card label="Résultat brut" value={fmt(summary.resultatBrut)} color={summary.resultatBrut >= 0 ? '#3b82f6' : '#ef4444'} sub="CA − Dépenses" />
              <Card label="Résultat imposable" value={fmt(summary.resultatImposable)} color="#8b5cf6" sub="Abattement 71% appliqué" />
            </div>
          )}

          {/* Micro-entreprise box */}
          {summary && (
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: 20, marginBottom: 24,
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#334155' }}>
                📊 Tableau de bord micro-entreprise {selectedYear}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <ThresholdBar
                    label={`Seuil CA micro (${fmt(summary.seuilMicro)})`}
                    percent={summary.percentSeuil}
                    value={fmt(summary.totalIncome)}
                    color={summary.percentSeuil > 90 ? '#ef4444' : summary.percentSeuil > 70 ? '#f59e0b' : '#10b981'}
                  />
                  <ThresholdBar
                    label={`Seuil franchise TVA (${fmt(summary.seuilTVA)})`}
                    percent={summary.percentTVA}
                    value={fmt(summary.totalIncome)}
                    color={summary.percentTVA > 90 ? '#ef4444' : summary.percentTVA > 70 ? '#f59e0b' : '#3b82f6'}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <MiniStat label="Cotisations estimées" value={fmt(summary.cotisationsEstimees)} note="12,3% du CA" />
                  <MiniStat label="Bénéfice net estimé" value={fmt(summary.resultatImposable - summary.cotisationsEstimees)} note="Résultat − cotisations" />
                  <MiniStat label="Abattement forfaitaire" value={fmt(summary.totalIncome * summary.abattement)} note="71% du CA" />
                  <MiniStat label="Reste à déclarer" value={fmt(summary.totalIncome - summary.totalExpense - summary.cotisationsEstimees)} note="Trésorerie estimée" />
                </div>
              </div>

              {/* Monthly chart */}
              <div style={{ marginTop: 20 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Évolution mensuelle
                </p>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
                  {MONTHS.map((m, i) => {
                    const key = String(i + 1).padStart(2, '0');
                    const mon = summary.months[key];
                    const incH = Math.round((mon.income / maxMonthVal) * 68);
                    const expH = Math.round((mon.expense / maxMonthVal) * 68);
                    return (
                      <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 68 }}>
                          <div title={`Recettes: ${fmt(mon.income)}`} style={{ width: 8, height: incH || 2, background: '#10b981', borderRadius: '2px 2px 0 0' }} />
                          <div title={`Achats: ${fmt(mon.expense)}`} style={{ width: 8, height: expH || 2, background: '#ef4444', borderRadius: '2px 2px 0 0' }} />
                        </div>
                        <span style={{ fontSize: 9, color: '#94a3b8' }}>{m}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#10b981' }}>■ Recettes</span>
                  <span style={{ fontSize: 11, color: '#ef4444' }}>■ Achats</span>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
            {(['recettes', 'achats'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setShowForm(false); }}
                style={{
                  padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
                  marginBottom: -2,
                  color: tab === t ? '#3b82f6' : '#64748b',
                  background: 'transparent',
                  borderRadius: '6px 6px 0 0',
                  textTransform: 'capitalize',
                }}
              >
                {t === 'recettes' ? `💰 Recettes (${income.length})` : `🧾 Achats (${expense.length})`}
              </button>
            ))}
          </div>

          {/* Table */}
          {(tab === 'recettes' || tab === 'achats') && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button
                  onClick={() => {
                    setFormType(tab === 'recettes' ? 'income' : 'expense');
                    setFCat(tab === 'recettes' ? 'autre' : 'achat_marchandise');
                    setShowForm(v => !v);
                  }}
                  style={{
                    padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: tab === 'recettes' ? '#10b981' : '#ef4444',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                  }}
                >
                  ＋ Saisie manuelle
                </button>
              </div>

              {/* Add form */}
              {showForm && (
                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                  padding: 20, marginBottom: 16,
                }}>
                  <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#334155' }}>
                    {formType === 'income' ? '💰 Nouvelle recette' : '🧾 Nouvelle dépense'}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 200px 130px auto', gap: 10, alignItems: 'end' }}>
                    <div>
                      <label style={labelStyle}>Date</label>
                      <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Description</label>
                      <input
                        type="text" value={fDesc} onChange={e => setFDesc(e.target.value)}
                        placeholder="Ex: Vente marché, achat emballages…"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Catégorie</label>
                      <select value={fCat} onChange={e => setFCat(e.target.value)} style={inputStyle}>
                        {Object.entries(formType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Montant (€)</label>
                      <input
                        type="number" step="0.01" min="0" value={fAmount}
                        onChange={e => setFAmount(e.target.value)}
                        placeholder="0.00"
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={addEntry} disabled={saving}
                        style={{
                          padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 600,
                        }}
                      >
                        {saving ? '…' : 'Ajouter'}
                      </button>
                      <button
                        onClick={() => setShowForm(false)}
                        style={{
                          padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db',
                          cursor: 'pointer', background: '#fff', fontSize: 14,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      {['Date', 'Description', 'Catégorie', 'Source', 'Montant', ''].map((h, i) => (
                        <th key={i} style={{
                          padding: '10px 12px', textAlign: i >= 4 ? 'right' : 'left',
                          fontWeight: 600, color: '#475569', fontSize: 12,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          borderBottom: '1px solid #e2e8f0',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === 'recettes' ? income : expense).length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                          Aucune entrée pour {selectedYear}. Cliquez sur "Synchroniser" pour importer automatiquement.
                        </td>
                      </tr>
                    ) : (
                      (tab === 'recettes' ? income : expense).map((e, i) => (
                        <tr
                          key={e.id}
                          style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}
                        >
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                            {fmtDate(e.date)}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 500 }}>
                            {e.description}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500,
                              background: tab === 'recettes' ? '#d1fae5' : '#fee2e2',
                              color: tab === 'recettes' ? '#065f46' : '#991b1b',
                            }}>
                              {categoryLabel(e.category, e.type)}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 13 }}>
                            {e.reference_type ? (REF_LABELS[e.reference_type] || e.reference_type) : '—'}
                            {e.reference_number ? ` ${e.reference_number}` : ''}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: tab === 'recettes' ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>
                            {fmt(e.amount)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            {e.reference_type === 'manual' && (
                              <button
                                onClick={() => deleteEntry(e.id)}
                                style={{
                                  padding: '3px 8px', borderRadius: 4, border: '1px solid #fecaca',
                                  cursor: 'pointer', background: '#fff', color: '#ef4444', fontSize: 12,
                                }}
                              >
                                🗑️
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {(tab === 'recettes' ? income : expense).length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                        <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13, color: '#475569' }}>
                          Total {selectedYear}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: tab === 'recettes' ? '#10b981' : '#ef4444' }}>
                          {fmt((tab === 'recettes' ? income : expense).reduce((s, e) => s + e.amount, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box',
};

function Card({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: 16, borderLeft: `4px solid ${color}`,
    }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ margin: '6px 0 4px', fontSize: 22, fontWeight: 800, color }}>{value}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>{sub}</p>
    </div>
  );
}

function ThresholdBar({ label, percent, value, color }: { label: string; percent: number; value: string; color: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{percent.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percent}%`, background: color, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{value} / {label.match(/\(([^)]+)\)/)?.[1]}</p>
    </div>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '4px 0 2px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{value}</p>
      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{note}</p>
    </div>
  );
}
