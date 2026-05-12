'use client';
import { useEffect, useState } from 'react';

type Reception = {
  id: string; number: string; status: string; supplier_name?: string;
  received_at: string; notes?: string; lines: any[];
  purchase_order_id?: string;
  purchase_orders?: { number: string };
  contacts?: { company?: string; first_name?: string; last_name?: string };
};

type LandedCost = {
  id: string; description: string; amount: number;
  allocation_method: string; status: string; lines: any[]; created_at: string;
};

const fmt = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function ReceptionsPage() {
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Reception | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState('');
  const [landedCosts, setLandedCosts] = useState<LandedCost[]>([]);
  const [lcForm, setLcForm] = useState({ description: '', amount: '', allocation_method: 'equal' });
  const [lcSaving, setLcSaving] = useState(false);
  const [lcResult, setLcResult] = useState<any[] | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/receptions');
    const data = await res.json();
    setReceptions(data.receptions || []);
    setLoading(false);
  }

  async function selectReception(r: Reception) {
    setSelected(r);
    setLcResult(null);
    setLcForm({ description: '', amount: '', allocation_method: 'equal' });
    const res = await fetch(`/api/landed-costs?reception_id=${r.id}`);
    const data = await res.json();
    setLandedCosts(data.landed_costs || []);
  }

  async function saveLandedCost() {
    if (!selected || !lcForm.description || !lcForm.amount) return;
    setLcSaving(true);
    const res = await fetch('/api/landed-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reception_id: selected.id,
        description: lcForm.description,
        amount: parseFloat(lcForm.amount),
        allocation_method: lcForm.allocation_method,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast('✅ Coûts logistiques imputés — PMP mis à jour');
      setLcResult(data.lines);
      setLcForm({ description: '', amount: '', allocation_method: 'equal' });
      const res2 = await fetch(`/api/landed-costs?reception_id=${selected.id}`);
      const data2 = await res2.json();
      setLandedCosts(data2.landed_costs || []);
    } else {
      showToast('❌ ' + (data.error || 'Erreur'));
    }
    setLcSaving(false);
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; }
    .r-wrap { font-family: 'Jost', sans-serif; display: flex; gap: 20px; align-items: flex-start; }
    .r-list { flex: 1; min-width: 0; }
    .r-detail { width: 400px; flex-shrink: 0; background: #fff; border: 1px solid #D8CEBC; border-radius: 8px; padding: 20px; max-height: calc(100vh - 80px); overflow-y: auto; }
    .r-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .r-title { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 600; color: #1C2028; }
    .r-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; border: 1px solid #D8CEBC; border-radius: 6px; overflow: hidden; }
    .r-table th { padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #6A7280; background: #FDFAF5; border-bottom: 1px solid #D8CEBC; }
    .r-table td { padding: 11px 14px; border-bottom: 1px solid #F0EBE1; vertical-align: middle; }
    .r-table tr:last-child td { border-bottom: none; }
    .r-table tr:hover td { background: #FDFAF5; cursor: pointer; }
    .r-table tr.selected td { background: #E8EEE5; }
    .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; background: #D1FAE5; color: #065F46; }
    .detail-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
    .detail-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid #F0EBE1; }
    .detail-row:last-child { border-bottom: none; }
    .lines-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    .lines-table th { padding: 5px 6px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6A7280; border-bottom: 1px solid #D8CEBC; }
    .lines-table td { padding: 6px 6px; border-bottom: 1px solid #F0EBE1; }
    .mono { font-family: 'DM Mono', monospace; }
    .empty { padding: 40px; text-align: center; color: #6A7280; font-style: italic; }
    .stock-badge { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #D1FAE5; color: #065F46; }
    .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6A7280; margin: 16px 0 8px; }
    .lc-box { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 6px; padding: 14px; margin-top: 16px; }
    .lc-form-row { display: grid; grid-template-columns: 1fr 90px; gap: 8px; margin-bottom: 8px; }
    .lc-input { width: 100%; padding: 7px 10px; border: 1px solid #BAE6FD; border-radius: 5px; font-family: 'Jost', sans-serif; font-size: 12px; outline: none; background: #fff; }
    .lc-select { width: 100%; padding: 7px 10px; border: 1px solid #BAE6FD; border-radius: 5px; font-family: 'Jost', sans-serif; font-size: 12px; outline: none; background: #fff; }
    .lc-btn { width: 100%; padding: 8px; background: #0369A1; color: #fff; border: none; border-radius: 5px; font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; margin-top: 4px; }
    .lc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .lc-history { margin-top: 10px; }
    .lc-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #E0F2FE; font-size: 12px; }
    .pmp-arrow { color: #0369A1; font-size: 10px; }
    .btn-replay { margin-top: 10px; width: 100%; padding: 8px 12px; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 6px; font-size: 12px; font-weight: 600; color: #92400E; cursor: pointer; }
    .btn-replay:disabled { opacity: 0.5; cursor: not-allowed; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #1C2028; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; z-index: 999; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="r-wrap">
        <div className="r-list">
          <div className="r-header">
            <div>
              <div className="r-title">📬 Réceptions</div>
              <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>{receptions.length} réceptions</div>
            </div>
          </div>
          <table className="r-table">
            <thead><tr><th>N° Réception</th><th>Fournisseur</th><th>Commande achat</th><th>Date réception</th><th>Lignes</th><th>Statut</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}><div className="empty">Chargement…</div></td></tr>
              : receptions.length === 0 ? <tr><td colSpan={6}><div className="empty">Aucune réception</div></td></tr>
              : receptions.map(r => {
                const lines = typeof r.lines === 'string' ? JSON.parse(r.lines) : r.lines || [];
                const name = r.contacts?.company || `${r.contacts?.first_name || ''} ${r.contacts?.last_name || ''}`.trim() || r.supplier_name || '—';
                return (
                  <tr key={r.id} className={selected?.id === r.id ? 'selected' : ''} onClick={() => selectReception(r)}>
                    <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{r.number}</td>
                    <td><strong>{name}</strong></td>
                    <td className="mono" style={{ fontSize: 12, color: '#6A7280' }}>{r.purchase_orders?.number || '—'}</td>
                    <td style={{ fontSize: 12, color: '#6A7280' }}>{fmtDate(r.received_at)}</td>
                    <td>{lines.length} produit(s)</td>
                    <td>
              <span className="badge" style={{ background: r.status === 'cancelled' ? '#FEE2E2' : undefined, color: r.status === 'cancelled' ? '#991B1B' : undefined }}>
                {r.status === 'cancelled' ? '❌ Annulée' : '✅ Reçue'}
              </span>
            </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="r-detail">
            <div className="detail-title">📋 {selected.number}</div>
            <div className="detail-row"><span style={{ color: '#6A7280' }}>Fournisseur</span><span>{selected.supplier_name || '—'}</span></div>
            <div className="detail-row"><span style={{ color: '#6A7280' }}>Date</span><span>{fmtDate(selected.received_at)}</span></div>
            <div className="detail-row"><span style={{ color: '#6A7280' }}>Commande achat</span><span className="mono">{selected.purchase_orders?.number || '—'}</span></div>

            <div className="section-label">Produits réceptionnés</div>
            <table className="lines-table">
              <thead><tr><th>Produit</th><th>Reçu</th><th>PU achat</th></tr></thead>
              <tbody>
                {(typeof selected.lines === 'string' ? JSON.parse(selected.lines) : selected.lines || []).map((l: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{l.name || '—'}</td>
                    <td className="mono"><span className="stock-badge">+{l.received_qty}</span></td>
                    <td className="mono" style={{ color: '#6A7280' }}>{l.unit_cost ? fmt(l.unit_cost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Section coûts logistiques */}
            <div className="lc-box">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#0369A1', marginBottom: 10 }}>
                🚚 Coûts logistiques (Landed Costs)
              </div>

              {/* Historique */}
              {landedCosts.length > 0 && (
                <div className="lc-history">
                  {landedCosts.map(lc => (
                    <div key={lc.id} className="lc-item">
                      <span style={{ fontWeight: 500 }}>{lc.description}</span>
                      <span className="mono" style={{ color: '#0369A1', fontWeight: 600 }}>{fmt(lc.amount)}</span>
                      <span style={{ color: '#6A7280', fontSize: 11 }}>{lc.allocation_method === 'prorata' ? 'Prorata' : 'Égal'}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#0369A1', marginTop: 6, fontWeight: 600 }}>
                    Total logistique : {fmt(landedCosts.reduce((s, lc) => s + lc.amount, 0))}
                  </div>
                </div>
              )}

              {/* Résultat dernier calcul */}
              {lcResult && (
                <div style={{ marginTop: 10, background: '#E0F2FE', borderRadius: 4, padding: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#0369A1', marginBottom: 6 }}>PMP mis à jour</div>
                  {lcResult.map((r: any, i: number) => (
                    <div key={i} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                      <span className="mono pmp-arrow">{fmt(r.pmp_before)} → <strong>{fmt(r.pmp_after)}</strong></span>
                    </div>
                  ))}
                </div>
              )}

              {/* Formulaire nouveau coût */}
              <div style={{ marginTop: landedCosts.length > 0 ? 12 : 0, borderTop: landedCosts.length > 0 ? '1px solid #BAE6FD' : 'none', paddingTop: landedCosts.length > 0 ? 12 : 0 }}>
                <div className="lc-form-row">
                  <input className="lc-input" placeholder="Description (ex: FedEx #INV-2026-045)" value={lcForm.description}
                    onChange={e => setLcForm(f => ({ ...f, description: e.target.value }))} />
                  <input className="lc-input" type="number" placeholder="Montant €" step="0.01" value={lcForm.amount}
                    onChange={e => setLcForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <select className="lc-select" value={lcForm.allocation_method}
                  onChange={e => setLcForm(f => ({ ...f, allocation_method: e.target.value }))}>
                  <option value="equal">Répartition égale (par unité)</option>
                  <option value="prorata">Prorata valeur HT</option>
                </select>
                <button className="lc-btn" disabled={lcSaving || !lcForm.description || !lcForm.amount} onClick={saveLandedCost}>
                  {lcSaving ? '⏳ Calcul en cours…' : '➕ Imputer ce coût logistique'}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: '8px 12px', background: '#D1FAE5', borderRadius: 6, fontSize: 12, color: '#065F46', fontWeight: 500 }}>
              ✅ Stock mis à jour à la validation de cette réception.
            </div>
            <button className="btn-replay" disabled={replaying} onClick={async () => {
              setReplaying(true);
              const token = localStorage.getItem('sd_admin_token') || '';
              const res = await fetch(`/api/receptions/${selected!.id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
              const data = await res.json();
              if (res.ok) showToast(`✅ Stock et PMP recalculés pour ${data.replayed} produit(s)`);
              else showToast('❌ ' + (data.error || 'Erreur'));
              setReplaying(false);
            }}>
              {replaying ? '⏳ Recalcul en cours…' : '🔄 Rejouer le stock + PMP'}
            </button>

            {selected.status !== 'cancelled' && (
              <button
                style={{ marginTop: 8, width: '100%', padding: '8px 12px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#991B1B', cursor: 'pointer' }}
                disabled={cancelling}
                onClick={async () => {
                  if (!confirm(`Annuler la réception ${selected!.number} ? Le stock sera décrémenté.`)) return;
                  setCancelling(true);
                  const token = localStorage.getItem('sd_admin_token') || '';
                  const res = await fetch(`/api/receptions/${selected!.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                  const data = await res.json();
                  if (res.ok) {
                    showToast(`✅ Réception annulée — stock corrigé pour ${data.reversed} produit(s)`);
                    setSelected(null);
                    load();
                  } else {
                    showToast('❌ ' + (data.error || 'Erreur'));
                  }
                  setCancelling(false);
                }}>
                {cancelling ? '⏳ Annulation…' : '🗑️ Annuler cette réception'}
              </button>
            )}
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
