'use client';
import { useEffect, useState } from 'react';

type Reception = {
  id: string; number: string; status: string; supplier_name?: string;
  received_at: string; notes?: string; lines: any[];
  purchase_orders?: { number: string };
  contacts?: { company?: string; first_name?: string; last_name?: string };
};

const fmt = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function ReceptionsPage() {
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Reception | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/receptions');
    const data = await res.json();
    setReceptions(data.receptions || []);
    setLoading(false);
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; }
    .r-wrap { font-family: 'Jost', sans-serif; display: flex; gap: 20px; }
    .r-list { flex: 1; }
    .r-detail { width: 360px; flex-shrink: 0; background: #fff; border: 1px solid #D8CEBC; border-radius: 8px; padding: 20px; }
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
    .lines-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 14px; }
    .lines-table th { padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6A7280; border-bottom: 1px solid #D8CEBC; }
    .lines-table td { padding: 7px 8px; border-bottom: 1px solid #F0EBE1; }
    .mono { font-family: 'DM Mono', monospace; }
    .empty { padding: 40px; text-align: center; color: #6A7280; font-style: italic; }
    .stock-badge { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #D1FAE5; color: #065F46; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="r-wrap">
        <div className="r-list">
          <div className="r-header">
            <div>
              <div className="r-title">📬 Réceptions</div>
              <div style={{ fontSize: 13, color: '#6A7280', marginTop: 4 }}>{receptions.length} réceptions — stock mis à jour automatiquement</div>
            </div>
          </div>

          <table className="r-table">
            <thead><tr><th>N° Réception</th><th>Fournisseur</th><th>Commande achat</th><th>Date réception</th><th>Lignes</th><th>Statut</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}><div className="empty">Chargement…</div></td></tr>
              : receptions.length === 0 ? <tr><td colSpan={6}><div className="empty">Aucune réception — créez une commande achat et réceptionnez-la</div></td></tr>
              : receptions.map(r => {
                const lines = typeof r.lines === 'string' ? JSON.parse(r.lines) : r.lines || [];
                const name = r.contacts?.company || `${r.contacts?.first_name || ''} ${r.contacts?.last_name || ''}`.trim() || r.supplier_name || '—';
                return (
                  <tr key={r.id} className={selected?.id === r.id ? 'selected' : ''} onClick={() => setSelected(r)}>
                    <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{r.number}</td>
                    <td><strong>{name}</strong></td>
                    <td className="mono" style={{ fontSize: 12, color: '#6A7280' }}>{r.purchase_orders?.number || '—'}</td>
                    <td style={{ fontSize: 12, color: '#6A7280' }}>{fmtDate(r.received_at)}</td>
                    <td>{lines.length} produit(s)</td>
                    <td><span className="badge">✅ Reçue</span></td>
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
            {selected.notes && <div className="detail-row"><span style={{ color: '#6A7280' }}>Notes</span><span style={{ maxWidth: 200, textAlign: 'right', fontSize: 12 }}>{selected.notes}</span></div>}

            <div style={{ marginTop: 16, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: '#6A7280', marginBottom: 8 }}>Produits réceptionnés</div>
            <table className="lines-table">
              <thead><tr><th>Produit</th><th>Commandé</th><th>Reçu</th><th>Stock ↑</th></tr></thead>
              <tbody>
                {(typeof selected.lines === 'string' ? JSON.parse(selected.lines) : selected.lines || []).map((l: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{l.name || '—'}</td>
                    <td className="mono">{l.qty}</td>
                    <td className="mono" style={{ fontWeight: 700, color: '#10B981' }}>{l.received_qty}</td>
                    <td><span className="stock-badge">+{l.received_qty}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 16, padding: '10px 12px', background: '#D1FAE5', borderRadius: 6, fontSize: 12, color: '#065F46', fontWeight: 500 }}>
              ✅ Le stock a été mis à jour automatiquement lors de la validation de cette réception.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
