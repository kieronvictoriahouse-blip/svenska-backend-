'use client';
/* ═══════════════════════════════════════════════════════════════════════
   COMPTABILITÉ — brique Finance (handoff « brique Finance / Comptabilité »)
   Cinq onglets : Ce mois · Banque · Déclarations · Résultat & bilan ·
   Livres & export. Interrupteur « Vue comptable » (état global du module).
   Le système propose, l'humaine confirme. Langage courant par défaut ;
   « Vue comptable » révèle les numéros de compte PCG.
   ═══════════════════════════════════════════════════════════════════════ */
import { useEffect, useState, useCallback, useRef, type ChangeEvent } from 'react';
import { adminFetch, downloadAuth } from '@/lib/auth-client';
import { categoriesForSens, pcgShort } from '@/lib/finance/pcg';

// ── Formatage monétaire du handoff (espace fine insécable) ──
const NBSP = ' ';
const eur = (n: number) => {
  const neg = n < 0, a = Math.abs(n).toFixed(2).split('.');
  return (neg ? '− ' : '') + a[0].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + ',' + a[1] + ' €';
};
const eur0 = (n: number) => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + ' €';
const signed = (n: number) => (n > 0 ? '+ ' : '− ') + eur(Math.abs(n)).replace('− ', '');

const ACC = 'var(--accent)';
type Tab = 'mois' | 'banque' | 'decl' | 'bilan' | 'livres';

export default function ComptabilitePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState(now.toISOString().slice(0, 7));
  const [tab, setTab] = useState<Tab>('mois');
  const [expert, setExpert] = useState(false);
  const [cOther, setCOther] = useState(false);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const toastRef = useRef<any>(null);

  // Données par onglet
  const [sortData, setSortData] = useState<any>(null);
  const [bankData, setBankData] = useState<any>(null);
  const [bankStatus, setBankStatus] = useState<any>(null);
  const [declData, setDeclData] = useState<any>(null);
  const [bilanData, setBilanData] = useState<any>(null);
  const [journal, setJournal] = useState<any[]>([]);
  const [closeData, setCloseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modales
  const [connectOpen, setConnectOpen] = useState(false);
  const [institutions, setInstitutions] = useState<any[] | null>(null);
  const [pickerExternal, setPickerExternal] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const showToast = (m: string) => {
    setToast(m); clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2600);
  };

  useEffect(() => {
    try { setExpert(localStorage.getItem('sd_compta_expert') === '1'); } catch {}
    // Retour de connexion bancaire
    const p = new URLSearchParams(window.location.search);
    if (p.get('connected')) { setTab('banque'); showToast('Banque connectée — je récupère tes opérations…'); syncBank(true); }
    if (p.get('bank_error')) { setTab('banque'); showToast('Connexion interrompue : ' + p.get('bank_error')); }
    if (p.get('tab')) setTab(p.get('tab') as Tab);
  }, []); // eslint-disable-line

  const toggleExpert = () => setExpert(v => { const nv = !v; try { localStorage.setItem('sd_compta_expert', nv ? '1' : '0'); } catch {} return nv; });

  // ── Chargement selon l'onglet ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'mois') {
        const r = await adminFetch(`/api/accounting/sort?period=${period}`);
        if (r.ok) setSortData(await r.json());
      } else if (tab === 'banque') {
        const [t, s] = await Promise.all([
          adminFetch(`/api/accounting/bank/transactions?period=${period}`),
          adminFetch('/api/accounting/bank'),
        ]);
        if (t.ok) setBankData(await t.json());
        if (s.ok) setBankStatus(await s.json());
      } else if (tab === 'decl') {
        const r = await adminFetch(`/api/accounting/declarations?year=${year}`);
        if (r.ok) setDeclData(await r.json());
      } else if (tab === 'bilan') {
        const r = await adminFetch(`/api/accounting/bilan?year=${year}`);
        if (r.ok) setBilanData(await r.json());
      } else if (tab === 'livres') {
        const [j, c] = await Promise.all([
          adminFetch(`/api/accounting/journal?year=${year}&limit=60`),
          adminFetch(`/api/accounting/close?period=${period}`),
        ]);
        if (j.ok) setJournal((await j.json()).rows || []);
        if (c.ok) setCloseData(await c.json());
      }
    } finally { setLoading(false); }
  }, [tab, period, year]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ──
  async function reconcile(txId: string, action: string, category?: string) {
    setBusy(true);
    try {
      const r = await adminFetch('/api/accounting/bank/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_id: txId, action, category }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error || 'Action impossible'); return; }
      if (action === 'split') showToast(`Versement décomposé · ${d.charges} facture(s) rapprochée(s)`);
      else if (action === 'ignore') showToast('Ligne mise de côté pour le comptable');
      else showToast('Rangé ✓');
      setCOther(false);
      load();
    } finally { setBusy(false); }
  }

  async function undo(txId: string) {
    const r = await adminFetch(`/api/accounting/bank/reconcile?tx_id=${txId}`, { method: 'DELETE' });
    if (r.ok) { showToast('Remis dans la pile'); load(); }
    else showToast('Annulation impossible');
  }

  async function syncBank(silent = false) {
    if (!silent) setBusy(true);
    try {
      const r = await adminFetch('/api/accounting/bank/sync', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { if (!silent) showToast(`${d.inserted || 0} opération(s) importée(s)`); load(); }
      else showToast(d.error || 'Synchro impossible');
    } finally { setBusy(false); }
  }

  async function openConnect() {
    setConnectOpen(true); setInstitutions(null); setPickerExternal(false);
    const r = await adminFetch('/api/accounting/bank/institutions?country=fr');
    const d = await r.json();
    if (d.pickerExternal) { setPickerExternal(true); setInstitutions([]); return; }
    if (!d.configured) { setInstitutions([]); return; }
    setInstitutions(d.institutions || []);
  }

  async function connectBank(inst?: any) {
    setBusy(true);
    try {
      const r = await adminFetch('/api/accounting/bank/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inst ? { institution_id: inst.id, institution_name: inst.name, institution_logo: inst.logo } : {}),
      });
      const d = await r.json();
      if (r.ok && d.link) window.location.href = d.link;
      else showToast(d.error || 'Connexion impossible');
    } finally { setBusy(false); }
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const content = await file.text();
    setBusy(true);
    try {
      const r = await adminFetch('/api/accounting/bank/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content }),
      });
      const d = await r.json();
      if (r.ok) showToast(`${d.inserted} opération(s) importée(s) sur ${d.total}`);
      else showToast(d.error || 'Import impossible');
      load();
    } finally { setBusy(false); if (importInput.current) importInput.current.value = ''; }
  }

  async function signRecon() {
    setBusy(true);
    try {
      const r = await adminFetch('/api/accounting/bank/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period }),
      });
      const d = await r.json();
      showToast(r.ok ? "Rapprochement signé et horodaté ✓" : (d.error || 'Signature impossible'));
      load();
    } finally { setBusy(false); }
  }

  async function closeMonth() {
    setBusy(true);
    try {
      const r = await adminFetch('/api/accounting/close', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period }),
      });
      const d = await r.json();
      showToast(r.ok ? `Mois clôturé · stock figé à ${eur(d.stockValue || 0)}` : (d.error || 'Clôture impossible'));
      load();
    } finally { setBusy(false); }
  }

  function copyUrssaf(amount: number) {
    const txt = eur(amount).replace(/[^\d,]/g, '');
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true); showToast('Montant copié : ' + eur(amount));
      setTimeout(() => setCopied(false), 2400);
    });
  }

  const dl = (url: string, fn: string) => downloadAuth(url, fn).catch(() => showToast('Téléchargement impossible'));

  // ═══ Rendu ═══
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* En-tête sticky */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E7E1D8', padding: '12px 18px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -.2 }}>Comptabilité</div>
            <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 1 }}>Micro-entreprise · vente de marchandises · exercice {year}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div onClick={toggleExpert} role="switch" aria-checked={expert} tabIndex={0}
                 onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpert(); } }}
                 style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 7, background: '#F7F4EF', border: '1px solid #E7E1D8' }}>
              <div style={{ width: 34, height: 19, borderRadius: 12, flexShrink: 0, position: 'relative', transition: 'background .15s', background: expert ? ACC : '#DCD6CC' }}>
                <div style={{ position: 'absolute', top: 2, left: expert ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
              </div>
              <span style={{ fontSize: 12, color: '#5A5248', whiteSpace: 'nowrap' }}>Vue comptable</span>
            </div>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
                    style={{ height: 32, padding: '0 11px', border: '1px solid #E1DBD2', borderRadius: 7, fontSize: 12.5, background: '#fff', outline: 'none' }}>
              {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>Exercice {y}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto', marginTop: 2 }}>
          {([['mois', 'Ce mois', 'inbox'], ['banque', 'Banque', 'account_balance'], ['decl', 'Déclarations', 'gavel'], ['bilan', 'Résultat & bilan', 'query_stats'], ['livres', 'Livres & export', 'menu_book']] as [Tab, string, string][]).map(([k, l, ic]) => {
            const on = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: '11px 14px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                  color: on ? ACC : '#8B7E72', fontWeight: on ? 600 : 400, boxShadow: on ? `inset 0 -2px 0 ${ACC}` : undefined }}>
                <span className="ms" style={{ fontSize: 18, fontVariationSettings: `'wght' ${on ? 400 : 300}` }}>{ic}</span>{l}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#9C9184', fontSize: 12.5 }}>Chargement…</div>}

      {!loading && tab === 'mois' && renderMois()}
      {!loading && tab === 'banque' && renderBanque()}
      {!loading && tab === 'decl' && renderDecl()}
      {!loading && tab === 'bilan' && renderBilan()}
      {!loading && tab === 'livres' && renderLivres()}

      {connectOpen && renderConnectModal()}
      <input ref={importInput} type="file" accept=".ofx,.qfx,.csv,.txt" style={{ display: 'none' }} onChange={onImportFile} />

      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: 24, right: 24, background: '#1C2028', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 12.5, zIndex: 300, boxShadow: '0 6px 20px rgba(0,0,0,.18)' }}>{toast}</div>
      )}
    </div>
  );

  // ══════════════ ONGLET 1 — CE MOIS ══════════════
  function renderMois() {
    const d = sortData; if (!d) return null;
    const total = d.total, done = d.done, pct = total ? Math.round(done / total * 100) : 100;
    const cur = d.current;
    const cockpit = [
      ['Encaissé ce mois', eur(d.cockpit.encaisse), 'ce que les clients ont payé', '#1C2028'],
      ['Dépensé ce mois', eur(d.cockpit.depense), 'achats, transport, emballages', '#1C2028'],
      ['Ce qui reste', signed(d.cockpit.reste), d.cockpit.reste < 0 ? 'plus de sorties que d\'entrées ce mois' : 'entrées moins sorties', d.cockpit.reste < 0 ? '#A6501F' : '#1C2028'],
      ['À garder de côté', eur(d.cockpit.aGarder), 'cotisations sur les ventes du mois', '#3E5238'],
    ];
    const prov = d.provision;
    const provPct = prov.yearTarget ? Math.round(prov.provisioned / prov.yearTarget * 100) : 0;
    return (
      <div style={{ padding: '16px 18px 90px', maxWidth: 1320 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 10, marginBottom: 14 }}>
          {cockpit.map((k, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '13px 15px' }}>
              <div style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: '#8B7E72', fontWeight: 600 }}>{k[0]}</div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -.6, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums', color: k[3] as string }}>{k[1]}</div>
              <div style={{ fontSize: 11, color: '#9C9184', marginTop: 5 }}>{k[2]}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          {/* Pile de tri */}
          <div style={{ flex: '2 1 480px', minWidth: 0, background: '#fff', border: '1px solid #E7E1D8', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid #F1EDE7', background: '#FBF9F6' }}>
              <Ring pct={pct} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>Ranger les opérations du mois</div>
                <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 2 }}>{done} sur {total} rangées · une seule question à la fois, aucun terme comptable</div>
              </div>
            </div>

            {cur && (
              <div style={{ padding: '18px 16px 16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: cur.direction === 'in' ? '#E9F0E6' : '#FCF1E4', color: cur.direction === 'in' ? '#3E5238' : '#A6501F' }}>
                    <span className="ms" style={{ fontSize: 15, fontVariationSettings: "'wght' 400" }}>{cur.direction === 'in' ? 'south_west' : 'north_east'}</span>
                    {cur.direction === 'in' ? 'Argent qui est rentré' : 'Argent qui est sorti'}
                  </span>
                  <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginTop: 9, color: cur.direction === 'in' ? '#3E5238' : '#1C2028' }}>
                    {cur.direction === 'in' ? '+ ' : '− '}{eur(cur.amount).replace('− ', '')}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 9 }}>{cur.label}</div>
                  {cur.sub && <div style={{ fontSize: 12, color: '#8B7E72', marginTop: 3 }}>{cur.sub}</div>}
                  <div style={{ fontSize: 11.5, color: '#9C9184', marginTop: 5 }}>{cur.date} · {cur.method}</div>
                </div>

                {!cur.receipt && cur.direction === 'out' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FDF9F1', border: '1px solid #E8CFA8', borderRadius: 9, padding: '10px 13px', marginTop: 14, flexWrap: 'wrap' }}>
                    <span className="ms" style={{ fontSize: 19, color: '#A6501F', fontVariationSettings: "'wght' 400" }}>receipt_long</span>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#8A5B08' }}>Il manque le justificatif</div>
                      <div style={{ fontSize: 11.5, color: '#8A6B3A', marginTop: 1 }}>Sans ticket, la dépense n'est pas déductible. Tu peux ranger maintenant et l'ajouter plus tard.</div>
                    </div>
                  </div>
                )}

                {/* Proposition */}
                <div style={{ border: '1px solid #E7E1D8', borderRadius: 10, padding: '14px 15px', marginTop: 14, background: '#FBFAF7' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: '#5A5248' }}>
                      {cur.confidence >= 85
                        ? (cur.direction === 'in' ? "C'est bien une recette de type" : "C'est bien une dépense de type")
                        : (cur.direction === 'in' ? "Je ne suis pas sûre — je dirais une recette de type" : "Je ne suis pas sûre — je dirais une dépense de type")}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: cur.confidence >= 85 ? '#E9F0E6' : '#FBF0DA', color: cur.confidence >= 85 ? '#3E5238' : '#8A5B08' }}>{cur.confidence} % sûr</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EDE7EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="ms" style={{ fontSize: 19, color: '#7B4F7B', fontVariationSettings: "'wght' 300" }}>{cur.guessIcon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{cur.guessLabel}</div>
                      {expert && <div style={{ fontSize: 11, color: '#9C9184', fontFamily: 'ui-monospace,Menlo,monospace', marginTop: 1 }}>compte {pcgShort(cur.guessCode)}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
                    <button disabled={busy} onClick={() => reconcile(cur.id, cur.isSplit ? 'split' : 'categorize', cur.guess)}
                      style={{ flex: '1 1 190px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#3E5238', color: '#fff', border: 'none', borderRadius: 9, padding: '12px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                      <span className="ms" style={{ fontSize: 19, fontVariationSettings: "'wght' 400" }}>check</span>{cur.isSplit ? 'Décomposer le versement' : "Oui, c'est ça"}
                    </button>
                    <button onClick={() => setCOther(v => !v)}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#fff', color: '#3A3228', border: '1px solid #E1DBD2', borderRadius: 9, padding: '12px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', minHeight: 44 }}>
                      <span className="ms" style={{ fontSize: 18, fontVariationSettings: "'wght' 300" }}>tune</span>Non, c'est autre chose
                    </button>
                  </div>
                </div>

                {cOther && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: '#9C9184', fontWeight: 600, marginBottom: 9 }}>Alors c'était pour quoi ?</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 8 }}>
                      {categoriesForSens(cur.direction).map(c => (
                        <button key={c.key} onClick={() => reconcile(cur.id, 'categorize', c.key)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', background: '#fff', border: '1px solid #E7E1D8', borderRadius: 9, cursor: 'pointer', textAlign: 'left', width: '100%', minHeight: 44 }}>
                          <span className="ms" style={{ fontSize: 19, color: ACC, fontVariationSettings: "'wght' 300" }}>{c.icon}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: '#1C2028' }}>{c.label}</span>
                          {expert && <span style={{ fontSize: 10.5, color: '#A79C8E', fontFamily: 'ui-monospace,Menlo,monospace' }}>{pcgShort(c.account)}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!cur && (
              <div style={{ padding: '34px 20px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 9 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E9F0E6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="ms" style={{ fontSize: 30, color: '#3E5238', fontVariationSettings: "'wght' 400,'FILL' 1" }}>check_circle</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Tout est rangé.</div>
                <div style={{ fontSize: 12.5, color: '#8B7E72', maxWidth: 340, lineHeight: 1.6 }}>Ta comptabilité du mois est à jour. Prochaine étape : la déclaration URSSAF du trimestre.</div>
                <button onClick={() => setTab('decl')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#1C2028', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 15px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', marginTop: 5 }}>
                  Voir la déclaration<span className="ms" style={{ fontSize: 17, fontVariationSettings: "'wght' 300" }}>arrow_forward</span>
                </button>
              </div>
            )}

            {d.recent?.length > 0 && (
              <div style={{ borderTop: '1px solid #F1EDE7', background: '#FBFAF7' }}>
                <div style={{ padding: '9px 16px 5px', fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: '#A79C8E', fontWeight: 600 }}>Déjà rangé</div>
                {d.recent.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderTop: '1px solid #F1EDE7', flexWrap: 'wrap' }}>
                    <span className="ms" style={{ fontSize: 17, color: '#3E5238', fontVariationSettings: "'wght' 300" }}>{r.icon}</span>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                      <div style={{ fontSize: 10.5, color: '#9C9184' }}>{r.cat}{expert ? ` · ${pcgShort(r.code)}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.direction === 'in' ? '+ ' : '− '}{eur(r.amount).replace('− ', '')}</span>
                    <button onClick={() => undo(r.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 11.5, color: '#7B4F7B', cursor: 'pointer', fontWeight: 500 }}>
                      <span className="ms" style={{ fontSize: 15, fontVariationSettings: "'wght' 300" }}>undo</span>Annuler
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panneau latéral */}
          <div style={{ flex: '1 1 290px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '14px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <span className="ms" style={{ fontSize: 18, color: '#3E5238', fontVariationSettings: "'wght' 300" }}>savings</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>L'argent à ne pas dépenser</span>
              </div>
              <div style={{ fontSize: 12, color: '#6E6459', lineHeight: 1.6 }}>Sur chaque vente, 12,3 % partent en cotisations. Garde-les de côté pour ne pas être surprise à l'échéance.</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 12 }}>
                <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -.7, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#3E5238' }}>{eur0(prov.provisioned)}</span>
                <span style={{ fontSize: 12, color: '#8B7E72' }}>mis de côté sur {eur0(prov.yearTarget)}</span>
              </div>
              <div style={{ height: 7, background: '#F1EDE7', borderRadius: 5, overflow: 'hidden', marginTop: 9 }}><div style={{ height: '100%', width: `${provPct}%`, background: '#3E5238', borderRadius: 5 }} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9 }}>
                <span className="ms" style={{ fontSize: 16, color: '#A6501F', fontVariationSettings: "'wght' 400" }}>error</span>
                <span style={{ fontSize: 11.5, color: '#8A5B08', flex: 1 }}>Il reste {eur0(Math.max(0, prov.yearTarget - prov.provisioned))} à provisionner pour être tranquille.</span>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '14px 15px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 11 }}>Alimenter la compta</div>
              <div style={{ fontSize: 12, color: '#6E6459', lineHeight: 1.6, marginBottom: 11 }}>Connecte ta banque pour que les opérations arrivent toutes seules, ou importe un relevé.</div>
              <button onClick={openConnect} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#1C2028', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 42 }}>
                <span className="ms" style={{ fontSize: 17, fontVariationSettings: "'wght' 300" }}>account_balance</span>Connecter ma banque
              </button>
              <button onClick={() => importInput.current?.click()} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#fff', color: '#3A3228', border: '1px solid #E1DBD2', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', marginTop: 8, minHeight: 42 }}>
                <span className="ms" style={{ fontSize: 17, fontVariationSettings: "'wght' 300" }}>upload_file</span>Importer un relevé (OFX/CSV)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ ONGLET 2 — BANQUE ══════════════
  function renderBanque() {
    const d = bankData; if (!d) return null;
    const pct = d.total ? Math.round(d.done / d.total * 100) : 100;
    return (
      <div style={{ padding: '16px 18px 90px', maxWidth: 1320 }}>
        {/* 3 KPI soldes */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: '1 1 190px', minWidth: 0, background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="ms" style={{ fontSize: 17, color: '#1C4E80', fontVariationSettings: "'wght' 300" }}>account_balance</span>
              <span style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: '#8B7E72', fontWeight: 600 }}>Ce que dit la banque</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -.6, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{eur(d.statementBalance)}</div>
            <div style={{ fontSize: 11, color: '#9C9184', marginTop: 4 }}>solde le plus récent des comptes connectés</div>
          </div>
          <div style={{ flex: '1 1 190px', minWidth: 0, background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="ms" style={{ fontSize: 17, color: '#7B4F7B', fontVariationSettings: "'wght' 300" }}>menu_book</span>
              <span style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: '#8B7E72', fontWeight: 600 }}>Ce que dit ta compta</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -.6, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{eur(d.bookBalance)}</div>
            <div style={{ fontSize: 11, color: '#9C9184', marginTop: 4 }}>solde du compte 512 · Banque</div>
          </div>
          <div style={{ flex: '1 1 260px', minWidth: 0, background: '#F2F5F0', border: '1px solid #DFE7DA', borderRadius: 10, padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="ms" style={{ fontSize: 17, color: '#3E5238', fontVariationSettings: "'wght' 400" }}>verified</span>
              <span style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: '#5B6B54', fontWeight: 600 }}>Écart · {d.gap === 0 ? 'entièrement expliqué' : 'à traiter'}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -.6, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums', color: '#3E5238' }}>{eur(d.gap)}</div>
            <div style={{ fontSize: 11, color: '#5B6B54', marginTop: 4 }}>{d.left} opération(s) pas encore rapprochée(s)</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          {/* Colonne relevé */}
          <div style={{ flex: '2 1 500px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid #F1EDE7', background: '#FBF9F6' }}>
                <Ring pct={pct} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>Vérifier que la banque et la compta disent la même chose</div>
                  <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 2 }}>{d.done} sur {d.total} lignes traitées · je propose, tu confirmes</div>
                </div>
              </div>

              {d.rows.map((b: any) => {
                const inn = b.direction === 'in';
                const c = b.kind === 'create' ? '#A6501F' : (b.confidence >= 90 ? '#3E5238' : '#8A5B08');
                return (
                  <div key={b.id} style={{ display: 'flex', gap: 12, padding: '12px 15px', borderBottom: '1px solid #F6F3EE', flexWrap: 'wrap', alignItems: 'flex-start', borderLeft: `3px solid ${c}` }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11.5, color: '#9C9184', fontVariantNumeric: 'tabular-nums' }}>{new Date(b.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11.5, fontWeight: 600, color: '#3A3228' }}>{b.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
                        <span className="ms" style={{ fontSize: 16, color: '#C4BBAE', fontVariationSettings: "'wght' 300" }}>subdirectory_arrow_right</span>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: '#1C2028' }}>{b.match}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', background: c + '18', color: c }}>
                          <span className="ms" style={{ fontSize: 14, fontVariationSettings: "'wght' 400" }}>{b.kind === 'create' ? 'add_circle' : (b.confidence >= 90 ? 'link' : 'help')}</span>
                          {b.kind === 'create' ? 'À enregistrer' : (b.confidence >= 90 ? `Correspondance sûre · ${b.confidence} %` : `À vérifier · ${b.confidence} %`)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 6, lineHeight: 1.55 }}>{b.why}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flex: '0 0 auto' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: inn ? '#3E5238' : '#1C2028' }}>{inn ? '+ ' : '− '}{eur(b.amount).replace('− ', '')}</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button disabled={busy} onClick={() => reconcile(b.id, 'ignore')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: '#8B7E72', border: '1px solid #E1DBD2', borderRadius: 7, padding: '8px 11px', fontSize: 12, cursor: 'pointer', minHeight: 36 }}>Plus tard</button>
                        <button disabled={busy} onClick={() => reconcile(b.id, b.kind === 'split' ? 'split' : (b.kind === 'create' ? 'create' : 'match'), b.category)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#1C2028', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', minHeight: 36 }}>
                          <span className="ms" style={{ fontSize: 16, fontVariationSettings: "'wght' 300" }}>{b.kind === 'create' ? 'add' : (b.kind === 'split' ? 'call_split' : 'link')}</span>
                          {b.kind === 'create' ? "Créer l'écriture" : (b.kind === 'split' ? 'Décomposer' : 'Rapprocher')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {d.left === 0 && (
                <div style={{ padding: '32px 20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 9 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E9F0E6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="ms" style={{ fontSize: 30, color: '#3E5238', fontVariationSettings: "'wght' 400,'FILL' 1" }}>verified</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>Compte justifié.</div>
                  <div style={{ fontSize: 12.5, color: '#8B7E72', maxWidth: 360, lineHeight: 1.6 }}>Chaque euro du relevé correspond à une écriture.{d.signed ? ' Le rapprochement du mois est signé et horodaté.' : ''}</div>
                  {!d.signed && <button disabled={busy} onClick={signRecon} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#3E5238', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 15px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}><span className="ms" style={{ fontSize: 17 }}>lock</span>Signer le rapprochement</button>}
                </div>
              )}

              {d.autoRows.length > 0 && <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', borderTop: '1px solid #F1EDE7', background: '#FBFAF7' }}>
                  <span className="ms" style={{ fontSize: 18, color: '#3E5238', fontVariationSettings: "'wght' 400" }}>bolt</span>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#3A3228' }}>{d.autoRows.length} ligne(s) déjà rapprochée(s) · annulable</span>
                </div>
                <div style={{ background: '#FBFAF7' }}>
                  {d.autoRows.map((a: any) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 16px', borderTop: '1px solid #F1EDE7', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#9C9184', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                      <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, color: '#6E6459', flex: '1 1 160px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
                      <span className="ms" style={{ fontSize: 15, color: '#3E5238', fontVariationSettings: "'wght' 300" }}>link</span>
                      <span style={{ fontSize: 11.5, color: '#3A3228', flex: '1 1 150px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.match}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{a.direction === 'in' ? '+ ' : '− '}{eur(a.amount).replace('− ', '')}</span>
                      <button onClick={() => undo(a.id)} style={{ background: 'none', border: 'none', fontSize: 11, color: '#7B4F7B', cursor: 'pointer', fontWeight: 500 }}>Annuler</button>
                    </div>
                  ))}
                </div>
              </>}
            </div>
          </div>

          {/* Panneau latéral banque */}
          <div style={{ flex: '1 1 290px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '11px 15px', borderBottom: '1px solid #F1EDE7' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Pourquoi les deux soldes diffèrent</div>
                <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 2 }}>Ces lignes ne sont pas encore rangées dans ta compta.</div>
              </div>
              {(d.pending || []).map((p: any, i: number) => (
                <div key={i} style={{ padding: '11px 15px', borderBottom: '1px solid #F6F3EE' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{p.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: p.amount > 0 ? '#3E5238' : '#A6501F' }}>{p.amount > 0 ? '+ ' : '− '}{eur(p.amount).replace('− ', '')}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9C9184', marginTop: 2 }}>{p.sub} · {p.note}</div>
                </div>
              ))}
              <div style={{ padding: '11px 15px', background: '#F2F5F0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ms" style={{ fontSize: 17, color: '#3E5238', fontVariationSettings: "'wght' 400" }}>check_circle</span>
                <span style={{ fontSize: 11.5, color: '#3E5238', flex: 1, lineHeight: 1.5 }}>L'écart est expliqué à l'euro près : {eur(d.gap)}.</span>
              </div>
            </div>

            {/* Comptes connectés */}
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '14px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Comptes connectés</div>
                <button disabled={busy} onClick={() => syncBank()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 11.5, color: '#7B4F7B', cursor: 'pointer', fontWeight: 500 }}>
                  <span className="ms" style={{ fontSize: 15 }}>sync</span>Actualiser
                </button>
              </div>
              {(bankStatus?.accounts || []).map((a: any) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 11, borderBottom: '1px solid #F6F3EE', marginBottom: 11 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#E6EDF6', color: '#1C4E80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{a.shortCode || 'CP'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 10.5, color: '#9C9184', fontFamily: 'ui-monospace,Menlo,monospace' }}>{a.iban || a.provider}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: a.status === 'active' ? '#3E5238' : '#A6501F' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.status === 'active' ? '#3E5238' : '#A6501F' }} />{a.status === 'active' ? 'Live' : a.status}
                  </span>
                </div>
              ))}
              {(!bankStatus?.accounts || bankStatus.accounts.length === 0) && (
                <div style={{ fontSize: 11.5, color: '#9C9184', lineHeight: 1.55, marginBottom: 10 }}>Aucun compte connecté pour l'instant.</div>
              )}
              <button onClick={openConnect} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#1C2028', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>
                <span className="ms" style={{ fontSize: 16 }}>add</span>Connecter une banque
              </button>
              <button onClick={() => importInput.current?.click()} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#fff', color: '#3A3228', border: '1px solid #E1DBD2', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', marginTop: 7, minHeight: 40 }}>
                <span className="ms" style={{ fontSize: 16 }}>upload_file</span>Importer un relevé
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ ONGLET 3 — DÉCLARATIONS ══════════════
  function renderDecl() {
    const d = declData; if (!d) return null;
    const stepDefs = [
      ['Ranger toutes les opérations du trimestre', d.allSorted, d.allSorted ? 'terminé' : 'il reste des opérations dans la pile'],
      [`Retrouver les ${d.missingReceipts} justificatif(s) manquant(s)`, steps.s2 || d.missingReceipts === 0, 'photographie les tickets avec le téléphone'],
      ['Recopier le montant sur urssaf.fr', steps.s3 || false, 'case « Ventes de marchandises »'],
      ['Payer les cotisations', steps.s4 || false, 'prélèvement automatique à l\'échéance'],
    ];
    return (
      <div style={{ padding: '16px 18px 90px', maxWidth: 1320 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Carte sombre URSSAF */}
            <div style={{ background: '#15181E', borderRadius: 12, padding: '20px 20px 18px', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="ms" style={{ fontSize: 19, color: '#B49256', fontVariationSettings: "'wght' 400" }}>gavel</span>
                <span style={{ fontSize: 9.5, letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', fontWeight: 600 }}>Déclaration URSSAF · {d.quarterLabel}</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', marginTop: 12, lineHeight: 1.6 }}>Une seule chose à faire : recopier ce montant sur <span style={{ color: '#fff', fontWeight: 600 }}>urssaf.fr</span>, dans la case <span style={{ color: '#fff', fontWeight: 600 }}>« Ventes de marchandises »</span>.</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
                <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: -2, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{eur(d.amount)}</div>
                <button onClick={() => copyUrssaf(d.amount)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', minHeight: 42 }}>
                  <span className="ms" style={{ fontSize: 17, fontVariationSettings: "'wght' 300" }}>{copied ? 'check' : 'content_copy'}</span>{copied ? 'Copié' : 'Copier le montant'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,.1)', borderRadius: 9, overflow: 'hidden', marginTop: 16, flexWrap: 'wrap' }}>
                {[['Cotisations à payer', eur(d.cotis), `${(d.tauxCotis * 100).toFixed(1).replace('.', ',')} % du montant déclaré`, '#fff'],
                  ['À déclarer avant le', d.deadlineLabel, d.daysUntil > 0 ? `dans ${d.daysUntil} jours` : 'échéance passée', '#D8B678'],
                  ['Période couverte', d.coverageLabel, 'encaissements du trimestre', 'rgba(255,255,255,.45)']].map((c, i) => (
                  <div key={i} style={{ flex: '1 1 130px', background: 'rgba(255,255,255,.05)', padding: '11px 13px' }}>
                    <div style={{ fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', fontWeight: 600 }}>{c[0]}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{c[1]}</div>
                    <div style={{ fontSize: 10.5, color: c[3], marginTop: 2 }}>{c[2]}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 13, lineHeight: 1.55 }}>Ce montant, c'est la somme de tes ventes encaissées sur le trimestre — pas ton bénéfice. En micro-entreprise, on déclare toujours l'encaissé.</div>
            </div>

            {/* Liste de contrôle */}
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 15px', borderBottom: '1px solid #F1EDE7' }}><span style={{ fontSize: 13, fontWeight: 600 }}>Ce qu'il reste à faire pour ce trimestre</span></div>
              {stepDefs.map((s, i) => (
                <div key={i} onClick={() => i >= 1 && setSteps(p => ({ ...p, ['s' + (i + 1)]: !p['s' + (i + 1)] }))}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 15px', borderBottom: '1px solid #F6F3EE', cursor: i >= 1 ? 'pointer' : 'default' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700, background: s[1] ? '#3E5238' : '#F1EDE7', color: s[1] ? '#fff' : '#857C71' }}>{s[1] ? '✓' : i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: s[1] ? 400 : 600, color: s[1] ? '#9C9184' : '#1C2028', textDecoration: s[1] ? 'line-through' : 'none' }}>{s[0]}</div>
                    <div style={{ fontSize: 11.5, color: '#9C9184', marginTop: 2 }}>{s[2]}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Seuils */}
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '14px 15px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 13 }}>Est-ce que je m'approche d'une limite ?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {d.gauges.map((g: any, i: number) => {
                  const col = g.pct >= 90 ? '#B03A2E' : g.pct >= 70 ? '#8A5B08' : (i === 1 ? '#1C4E80' : '#3E5238');
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{g.label}</span>
                        <span style={{ fontSize: 11.5, color: '#8B7E72', fontVariantNumeric: 'tabular-nums' }}>{eur0(g.value)} sur {eur0(g.max)}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: col }}>{g.pct} %</span>
                      </div>
                      <div style={{ height: 8, background: '#F1EDE7', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(2, g.pct)}%`, background: col, borderRadius: 5 }} /></div>
                      <div style={{ fontSize: 11.5, color: '#9C9184', marginTop: 5 }}>{g.note}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '11px 15px', borderBottom: '1px solid #F1EDE7', fontSize: 13, fontWeight: 600 }}>Les dates à ne pas manquer</div>
              {d.deadlines.map((dl: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 15px', borderBottom: '1px solid #F6F3EE', background: dl.highlight ? '#FDF9F1' : 'transparent' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dl.highlight ? '#C97A2B' : '#DCD6CC' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{dl.when}</div>
                    <div style={{ fontSize: 11.5, color: '#6E6459', marginTop: 1 }}>{dl.label}</div>
                    <div style={{ fontSize: 10.5, color: '#9C9184' }}>{dl.note}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '10px 15px', fontSize: 11.5, color: '#8B7E72', lineHeight: 1.55 }}>Un rappel arrive par email 10 jours avant chaque échéance.</div>
            </div>
            <div style={{ background: '#F3EDF3', border: '1px solid #E3D6E3', borderRadius: 10, padding: '14px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <span className="ms" style={{ fontSize: 18, color: '#6E4470', fontVariationSettings: "'wght' 300" }}>help</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#5E3B5E' }}>Un doute sur une opération ?</span>
              </div>
              <div style={{ fontSize: 12, color: '#6E4470', lineHeight: 1.6 }}>Laisse-la dans la pile et mets-la de côté (« Plus tard »). Elle apparaîtra dans l'espace du comptable avec sa pièce jointe.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ ONGLET 4 — RÉSULTAT & BILAN ══════════════
  function renderBilan() {
    const d = bilanData; if (!d) return null;
    return (
      <div style={{ padding: '16px 18px 90px', maxWidth: 1320 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          {/* Compte de résultat */}
          <div style={{ flex: '1 1 400px', minWidth: 0, background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '15px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Ce que la boutique a gagné en {d.year}</div>
            <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 2, marginBottom: 13 }}>En langage simple : ce qui rentre, puis ce qui sort.</div>
            {d.pl.map((r: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: r.strong ? '10px 0' : '6px 0', borderTop: r.strong ? '1px solid #E7E1D8' : 'none', marginTop: r.strong ? 4 : 0 }}>
                <span style={{ fontSize: r.strong ? 13 : 12.5, fontWeight: r.strong ? 600 : 400, color: r.strong ? '#1C2028' : '#5A5248' }}>{r.label}</span>
                <span style={{ fontSize: r.strong ? 14.5 : 12.5, fontWeight: r.strong ? 700 : 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: r.strong ? (r.value > 0 ? '#3E5238' : '#B03A2E') : '#3A3228' }}>
                  {r.value > 0 && r.strong ? '+ ' : (r.value < 0 ? '− ' : '')}{eur0(r.value)}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#F2F5F0', border: '1px solid #DFE7DA', borderRadius: 8, padding: '10px 12px', marginTop: 14 }}>
              <span className="ms" style={{ fontSize: 17, color: '#3E5238', fontVariationSettings: "'wght' 400" }}>lightbulb</span>
              <span style={{ fontSize: 11.5, color: '#3E5238', flex: 1, lineHeight: 1.6 }}>Ce bénéfice n'est pas ce que tu peux sortir du compte : garde de quoi racheter du stock.</span>
            </div>
          </div>

          {/* Bilan */}
          <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '15px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Ce que la boutique possède et ce qu'elle doit</div>
              <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 2, marginBottom: 13 }}>Les deux colonnes s'équilibrent — c'est le principe.</div>
              <div style={{ fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: '#9C9184', fontWeight: 600, marginBottom: 6 }}>Ce qu'elle possède</div>
              {d.actif.rows.map((a: any, i: number) => <SideRow key={i} {...a} />)}
              <TotalRow value={d.actif.total} />
              <div style={{ fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: '#9C9184', fontWeight: 600, margin: '14px 0 6px' }}>Ce qu'elle doit</div>
              {d.passif.rows.map((p: any, i: number) => <SideRow key={i} {...p} />)}
              <TotalRow value={d.passif.total} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', marginTop: 12 }}>
          <div style={{ flex: '1 1 320px', minWidth: 0, background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '15px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Qui te doit de l'argent</div>
            <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 2, marginBottom: 13 }}>{eur(d.creancesTotal)} en attente de règlement.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {d.aged.map((a: any, i: number) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: '#5A5248' }}>{a.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: a.value > 0 ? a.color : '#C4BBAE' }}>{eur0(a.value)}</span>
                  </div>
                  <div style={{ height: 6, background: '#F1EDE7', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(1, a.pct)}%`, background: a.color, borderRadius: 4 }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 380px', minWidth: 0, background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '15px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Ton matériel et son usure</div>
            <div style={{ fontSize: 11.5, color: '#8B7E72', marginTop: 2, lineHeight: 1.55 }}>Au-delà de 500 €, un achat de matériel se déduit sur plusieurs années (amortissement). En dessous, il part directement en dépense.</div>
            {d.immo.length === 0 && <div style={{ fontSize: 11.5, color: '#9C9184', marginTop: 12, lineHeight: 1.55 }}>Aucune immobilisation enregistrée pour l'instant. L'écriture d'amortissement est passée automatiquement au 31 décembre dès qu'un matériel {'>'} 500 € est saisi.</div>}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ ONGLET 5 — LIVRES & EXPORT ══════════════
  function renderLivres() {
    return (
      <div style={{ padding: '16px 18px 90px', maxWidth: 1320 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 500px', minWidth: 0, background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '11px 15px', borderBottom: '1px solid #F1EDE7', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Journal des écritures</span>
              <span style={{ fontSize: 11, color: '#9C9184' }}>généré à partir de tes opérations rangées</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
                <thead><tr>{['Date', 'Journal', 'Pièce', 'Libellé', 'Débit', 'Crédit', 'Montant'].map((h, i) => (
                  <th key={i} style={{ padding: '8px 15px', textAlign: i >= 4 && i <= 5 ? 'center' : (i === 6 ? 'right' : 'left'), fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase', color: '#9C9184', fontWeight: 600, background: '#FBF9F6', borderBottom: '1px solid #E7E1D8' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {journal.map((j, i) => (
                    <tr key={i}>
                      <td style={{ padding: '8px 15px', borderBottom: '1px solid #F6F3EE', fontSize: 12, color: '#6E6459', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{j.date}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F6F3EE' }}>
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: j.jrn === 'VE' ? '#E9F0E6' : j.jrn === 'AC' ? '#FCF1E4' : '#E6EDF6', color: j.jrn === 'VE' ? '#3E5238' : j.jrn === 'AC' ? '#A6501F' : '#1C4E80' }}>{j.jrn}</span>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F6F3EE', fontSize: 11.5, color: '#9C9184', fontFamily: 'ui-monospace,Menlo,monospace', whiteSpace: 'nowrap' }}>{j.piece}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F6F3EE', fontSize: 12.5 }}>{j.label}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F6F3EE', fontSize: 11.5, textAlign: 'center', fontFamily: 'ui-monospace,Menlo,monospace', color: '#5A5248' }}>{j.deb}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F6F3EE', fontSize: 11.5, textAlign: 'center', fontFamily: 'ui-monospace,Menlo,monospace', color: '#5A5248' }}>{j.cred}</td>
                      <td style={{ padding: '8px 15px', borderBottom: '1px solid #F6F3EE', fontSize: 12.5, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{eur(j.amount)}</td>
                    </tr>
                  ))}
                  {journal.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9C9184', fontSize: 12.5 }}>Aucune écriture pour l'instant.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '11px 15px', background: '#FBF9F6', fontSize: 11.5, color: '#8B7E72', lineHeight: 1.55 }}>Tu n'as jamais à écrire dans ce tableau — il se remplit quand tu ranges une opération.</div>
          </div>

          <div style={{ flex: '1 1 290px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '11px 15px', borderBottom: '1px solid #F1EDE7', fontSize: 13, fontWeight: 600 }}>Donner ses documents au comptable</div>
              {[
                ['Fichier des écritures comptables (FEC)', 'description', `Format légal exigé en cas de contrôle · exercice ${year}`, () => dl(`/api/accounting/fec?year=${year}`, `FEC_${year}.txt`)],
                ['Comptabilité complète (Excel)', 'table_view', 'toutes les écritures de l\'exercice', () => dl(`/api/accounting/export-excel?year=${year}`, `Comptabilite_${year}.csv`)],
                ['Livre des recettes', 'menu_book', 'le registre légal de la micro-entreprise', () => dl(`/api/accounting/livre-recettes?year=${year}`, `livre-recettes-${year}.csv`)],
              ].map((e, i) => (
                <div key={i} onClick={e[3] as any} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 15px', borderBottom: '1px solid #F6F3EE', cursor: 'pointer' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                    <span className="ms" style={{ fontSize: 19, color: ACC, fontVariationSettings: "'wght' 300" }}>{e[1] as string}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{e[0] as string}</div>
                    <div style={{ fontSize: 11, color: '#9C9184', marginTop: 1, lineHeight: 1.45 }}>{e[2] as string}</div>
                  </div>
                  <span className="ms" style={{ fontSize: 18, color: '#C4BBAE', fontVariationSettings: "'wght' 300" }}>download</span>
                </div>
              ))}
            </div>

            {/* Clôture du mois */}
            <div style={{ background: '#fff', border: '1px solid #E7E1D8', borderRadius: 10, padding: '14px 15px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 11 }}>Clôturer le mois</div>
              <div style={{ fontSize: 12, color: '#6E6459', lineHeight: 1.6 }}>La clôture verrouille les écritures et fige le stock. Tu pourras toujours consulter, plus modifier.</div>
              {closeData?.status === 'closed' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F2F5F0', border: '1px solid #DFE7DA', borderRadius: 8, padding: '9px 12px', marginTop: 11 }}>
                  <span className="ms" style={{ fontSize: 17, color: '#3E5238' }}>lock</span>
                  <span style={{ fontSize: 11.5, color: '#3E5238', flex: 1 }}>Mois clôturé le {closeData.closedAt ? new Date(closeData.closedAt).toLocaleDateString('fr-FR') : ''}.</span>
                </div>
              ) : closeData?.canClose ? (
                <button disabled={busy} onClick={closeMonth} style={{ width: '100%', background: '#1C2028', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 11, minHeight: 42 }}>Clôturer {period}</button>
              ) : <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FDF9F1', border: '1px solid #E8CFA8', borderRadius: 8, padding: '9px 12px', marginTop: 11 }}>
                  <span className="ms" style={{ fontSize: 17, color: '#A6501F', fontVariationSettings: "'wght' 400" }}>warning</span>
                  <span style={{ fontSize: 11.5, color: '#8A5B08', flex: 1 }}>Il reste {closeData?.left ?? '…'} opération(s) à ranger : la clôture attendra.</span>
                </div>
                <button disabled style={{ width: '100%', background: '#F1EDE7', color: '#A79C8E', border: 'none', borderRadius: 8, padding: '11px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'not-allowed', marginTop: 11, minHeight: 42 }}>Clôturer {period}</button>
              </>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Modale de connexion bancaire ──
  function renderConnectModal() {
    return (
      <div onClick={() => setConnectOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,30,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 'min(460px,100%)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px 18px', borderBottom: '1px solid #F1EDE7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Connecter ma banque</div>
            <button onClick={() => setConnectOpen(false)} className="ms" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9C9184' }}>close</button>
          </div>
          <div style={{ padding: 18, overflowY: 'auto' }}>
            {institutions === null && <div style={{ textAlign: 'center', color: '#9C9184', fontSize: 12.5, padding: 20 }}>Chargement…</div>}
            {pickerExternal && (
              <div style={{ fontSize: 12.5, color: '#6E6459', lineHeight: 1.7 }}>
                Tu vas être redirigée vers la page sécurisée de connexion bancaire, où tu choisis ta banque et confirmes l'accès en lecture. Les opérations remonteront ensuite toutes seules.
                <button disabled={busy} onClick={() => connectBank()} style={{ display: 'block', width: '100%', marginTop: 14, background: '#1C2028', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Continuer vers ma banque</button>
                <button onClick={() => { setConnectOpen(false); importInput.current?.click(); }} style={{ display: 'block', width: '100%', marginTop: 8, background: '#fff', color: '#3A3228', border: '1px solid #E1DBD2', borderRadius: 8, padding: '11px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Ou importer un relevé OFX/CSV</button>
              </div>
            )}
            {!pickerExternal && institutions?.length === 0 && (
              <div style={{ fontSize: 12.5, color: '#6E6459', lineHeight: 1.7 }}>
                L'agrégateur bancaire n'est pas encore configuré. Deux options :
                <div style={{ marginTop: 12 }}>
                  <b>1. Import de relevé</b> — fonctionne tout de suite : télécharge un fichier OFX/CSV depuis ta banque et importe-le.
                  <button onClick={() => { setConnectOpen(false); importInput.current?.click(); }} style={{ display: 'block', width: '100%', marginTop: 8, background: '#1C2028', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Importer un relevé</button>
                </div>
                <div style={{ marginTop: 14 }}>
                  <b>2. Connexion automatique</b> — ajoute les clés Bridge (<code style={{ fontSize: 11 }}>BRIDGE_CLIENT_ID</code> / <code style={{ fontSize: 11 }}>BRIDGE_CLIENT_SECRET</code>) dans les variables d'environnement, puis reviens ici.
                </div>
              </div>
            )}
            {institutions && institutions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {institutions.map(inst => (
                  <button key={inst.id} disabled={busy} onClick={() => connectBank(inst)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#fff', border: '1px solid #E7E1D8', borderRadius: 9, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    {inst.logo ? <img src={inst.logo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} /> : <div style={{ width: 28, height: 28, borderRadius: 6, background: '#EDE7EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#7B4F7B' }}>{inst.name.slice(0, 2).toUpperCase()}</div>}
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{inst.name}</span>
                    <span className="ms" style={{ fontSize: 18, color: '#C4BBAE' }}>chevron_right</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

// ── Composants partagés ──
function Ring({ pct }: { pct: number }) {
  return (
    <div style={{ width: 54, height: 54, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(#3E5238 ${pct}%,#EFEBE4 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#FBF9F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700, color: '#3E5238', fontVariantNumeric: 'tabular-nums' }}>{pct} %</div>
    </div>
  );
}
function SideRow({ label, note, value }: { label: string; note: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid #F6F3EE' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: '#9C9184' }}>{note}</div>
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{eur0(value)}</span>
    </div>
  );
}
function TotalRow({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1.5px solid #1C2028', marginTop: 2 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>Total</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{eur0(value)}</span>
    </div>
  );
}
