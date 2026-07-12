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
        fetch(`/api/accounting/summary?year=${selectedYear}`, { cache: 'no-store', headers }),
        fetch(`/api/accounting/entries?year=${selectedYear}`, { cache: 'no-store', headers }),
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
      const res = await fetch('/api/accounting/sync', { method: 'POST', headers: authHeaders() });
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
    const res = await fetch(`/api/accounting/entries?id=${id}`, { method: 'DELETE', headers: authHeaders() });
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
          <button
            onClick={() => downloadFile(`/api/accounting/fec?year=${selectedYear}`, `FEC_${selectedYear}.txt`)}
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: '#1e293b', color: '#fff', fontSize: 14, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title="Export FEC — obligatoire en cas de contrôle fiscal (Art. L.47 A LPF)"
          >
            📁 Export FEC
          </button>
          <button
            onClick={() => downloadFile(`/api/accounting/export-excel?year=${selectedYear}`, `Comptabilite_${selectedYear}.csv`)}
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title="Export Excel (CSV)"
          >
            📊 Excel
          </button>
          <button
            onClick={() => setShowUrssaf(v => !v)}
            style={{
              padding: '7px 14px', borderRadius: 6, border: '1px solid #ddd6fe',
              cursor: 'pointer', background: showUrssaf ? '#f5f3ff' : '#fff',
              fontSize: 13, color: '#7c3aed', fontWeight: 600,
            }}
            title="Calculer votre déclaration URSSAF"
          >
            📋 URSSAF
          </button>
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
              { ok: true,  label: 'Conservation 10 ans', ref: 'Art. L.123-22 Ccom', note: 'Écritures automatiques non supprimables (contre-passation obligatoire)' },
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

      {/* URSSAF Declaration Panel */}
      {showUrssaf && summary && (
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#5b21b6' }}>
              📋 Déclaration URSSAF — {selectedYear}
            </h3>
            <button onClick={() => setShowUrssaf(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {([
              ['T1 — Jan·Fév·Mar', ['01','02','03']],
              ['T2 — Avr·Mai·Jun', ['04','05','06']],
              ['T3 — Jul·Aoû·Sep', ['07','08','09']],
              ['T4 — Oct·Nov·Déc', ['10','11','12']],
            ] as [string, string[]][]).map(([label, mths]) => {
              const ca = mths.reduce((s, k) => s + (summary.months[k]?.income || 0), 0);
              const cotis = Math.round(ca * 0.123 * 100) / 100;
              const vfl = Math.round(ca * 0.01 * 100) / 100;
              return (
                <div key={label} style={{ background: '#fff', border: '1px solid #ede9fe', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>CA : <strong>{fmt(ca)}</strong></div>
                  <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 4 }}>
                    Cotisations 12,3% : <strong>{fmt(cotis)}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    + VFL optionnel 1% : {fmt(vfl)}
                  </div>
                  {ca === 0 && <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Rien à déclarer</div>}
                </div>
              );
            })}
          </div>
          <div style={{ background: '#ede9fe', borderRadius: 8, padding: '12px 16px', fontSize: 13, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <span><strong style={{ color: '#5b21b6' }}>CA annuel :</strong> {fmt(summary.totalIncome)}</span>
            <span><strong style={{ color: '#ef4444' }}>Cotisations totales :</strong> {fmt(summary.cotisationsEstimees)}</span>
            <span><strong style={{ color: '#7c3aed' }}>VFL optionnel :</strong> {fmt(Math.round(summary.totalIncome * 0.01 * 100) / 100)}</span>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#7c3aed', fontStyle: 'italic' }}>
            Déclarer sur autoentrepreneur.urssaf.fr · BIC marchandises achat-revente · Abattement 71% pour l'IR
          </p>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#64748b' }}>Chargement…</p>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
              <Card label="Chiffre d'affaires" value={fmt(summary.totalIncome)} color="#10b981" sub={`${income.length} recette(s)`} />
              <Card label="Achats & dépenses" value={fmt(summary.totalExpense)} color="#ef4444" sub={`${expense.length} entrée(s)`} />
              <Card label="Résultat brut" value={fmt(summary.resultatBrut)} color={summary.resultatBrut >= 0 ? '#3b82f6' : '#ef4444'} sub="CA − Dépenses" />
              <Card label="Résultat imposable" value={fmt(summary.resultatImposable)} color="#8b5cf6" sub="Abattement 71% appliqué" />
              <Card
                label="Trésorerie nette"
                value={fmt(tresorerieNette)}
                color={tresorerieNette >= 0 ? '#0ea5e9' : '#ef4444'}
                sub="CA − dépenses − cotis. est."
              />
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
                  <MiniStat label="Cotisations URSSAF" value={fmt(summary.cotisationsEstimees)} note="12,3% du CA — à déclarer" />
                  <MiniStat label="Bénéfice net estimé" value={fmt(summary.resultatImposable - summary.cotisationsEstimees)} note="Imposable − cotisations" />
                  <MiniStat label="Abattement forfaitaire" value={fmt(summary.totalIncome * summary.abattement)} note="71% du CA" />
                  <MiniStat label="Frais Stripe" value={fmt(summary.expensesByCategory?.frais_stripe || 0)} note="Commission ~1,5% + 0,25€/cmd" />
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
                  <span style={{ fontSize: 11, color: '#ef4444' }}>■ Dépenses</span>
                </div>
              </div>

              {/* Month-over-month comparison */}
              {prevMonthData && (
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {([
                    { label: 'Recettes', cur: currentMonthData.income, prev: prevMonthData.income, color: '#10b981' },
                    { label: 'Dépenses', cur: currentMonthData.expense, prev: prevMonthData.expense, color: '#ef4444' },
                  ]).map(({ label, cur, prev, color }) => {
                    const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
                    const isUp = cur >= prev;
                    return (
                      <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                            {label} — {MONTHS[parseInt(currentMonthKey, 10) - 1]}
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700, color }}>{fmt(cur)}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                            {MONTHS[parseInt(prevMonthKey!, 10) - 1]} : {fmt(prev)}
                          </p>
                        </div>
                        <div style={{
                          padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: isUp ? '#dcfce7' : '#fee2e2',
                          color: isUp ? '#166534' : '#991b1b',
                        }}>
                          {isUp ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
              {tab === 'achats' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Frais récurrents :
                  </span>
                  {([
                    { label: 'Vercel Pro', amount: '20', cat: 'autre' },
                    { label: 'OVH domaine', amount: '15', cat: 'autre' },
                    { label: 'Emballages', amount: '', cat: 'emballages' },
                    { label: 'Frais postaux', amount: '', cat: 'frais_port' },
                    { label: 'Cotisations URSSAF', amount: '', cat: 'cotisations' },
                  ]).map(({ label, amount, cat }) => (
                    <button
                      key={label}
                      onClick={() => {
                        setFormType('expense');
                        setFCat(cat);
                        setFDesc(label);
                        if (amount) setFAmount(amount);
                        setShowForm(true);
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: 20, border: '1px solid #e2e8f0',
                        cursor: 'pointer', background: '#fff', fontSize: 12, color: '#475569',
                      }}
                    >
                      + {label}
                    </button>
                  ))}
                </div>
              )}

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
