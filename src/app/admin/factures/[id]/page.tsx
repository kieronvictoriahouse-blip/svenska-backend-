'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type InvoiceLine = { desc: string; qty: number; price: number; tva: number };

type Invoice = {
  id: string;
  number: string;
  date: string;
  status: string;
  client_name: string;
  client_address?: string;
  client_email?: string;
  lines: InvoiceLine[];
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  note?: string;
  order_id?: string;
  legal_mention?: string;
  seller_name?: string;
  seller_siret?: string;
  seller_address?: string;
  seller_email?: string;
  seller_phone?: string;
};

const fmt = (n: number) =>
  (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtDate = (d?: string) =>
  d ? new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

const STATUS_LABELS: Record<string, string> = {
  draft: 'BROUILLON', sent: 'ÉMISE', paid: 'PAYÉE', late: 'EN RETARD',
};

export default function FacturePage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/invoices/${id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.invoice) setInvoice(d.invoice);
        else setError('Facture introuvable');
      })
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, [id]);

  async function markPaid() {
    if (!invoice) return;
    setSaving(true);
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    });
    if (res.ok) setInvoice(inv => inv ? { ...inv, status: 'paid' } : inv);
    setSaving(false);
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'system-ui', color: '#64748b' }}>Chargement…</div>;
  if (error || !invoice) return <div style={{ padding: 40, fontFamily: 'system-ui', color: '#ef4444' }}>❌ {error || 'Introuvable'}</div>;

  const lines: InvoiceLine[] = Array.isArray(invoice.lines) ? invoice.lines : [];
  const subtotal = lines.reduce((s, l) => s + (l.qty * l.price), 0);
  const isMicro = !invoice.total_tva || invoice.total_tva === 0;

  return (
    <>
      {/* Barre d'actions — masquée à l'impression */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#1e293b', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <button
          onClick={() => window.history.back()}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          ← Retour
        </button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Facture {invoice.number}</span>
        <span style={{
          padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
          background: invoice.status === 'paid' ? '#10b981' : invoice.status === 'sent' ? '#3b82f6' : '#94a3b8',
          color: '#fff',
        }}>
          {STATUS_LABELS[invoice.status] || invoice.status.toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
        {invoice.status !== 'paid' && (
          <button
            onClick={markPaid}
            disabled={saving}
            style={{
              background: '#10b981', border: 'none', color: '#fff',
              padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            ✅ Marquer payée
          </button>
        )}
        <button
          onClick={() => window.print()}
          style={{
            background: '#3b82f6', border: 'none', color: '#fff',
            padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}
        >
          🖨️ Imprimer / PDF
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #f1f5f9; font-family: 'Inter', system-ui, sans-serif; }
        .invoice-wrap { background: #fff; max-width: 794px; margin: 32px auto; padding: 56px 60px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .invoice-wrap { margin: 0; padding: 32px 40px; box-shadow: none; max-width: 100%; }
        }
        @page { size: A4; margin: 10mm; }
      `}} />

      <div className="invoice-wrap">

        {/* ── En-tête ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 48 }}>
          {/* Vendeur */}
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {invoice.seller_name || 'Svenska Delikatessen'}
            </div>
            {invoice.seller_address && (
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {invoice.seller_address}
              </div>
            )}
            {invoice.seller_email && (
              <div style={{ fontSize: 13, color: '#64748b' }}>{invoice.seller_email}</div>
            )}
            {invoice.seller_phone && (
              <div style={{ fontSize: 13, color: '#64748b' }}>{invoice.seller_phone}</div>
            )}
            {invoice.seller_siret && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>
                SIRET : {invoice.seller_siret}
              </div>
            )}
          </div>

          {/* Bloc facture */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
              FACTURE
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6', marginTop: 4 }}>
              {invoice.number}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
              <div>Date : <strong style={{ color: '#0f172a' }}>{fmtDate(invoice.date)}</strong></div>
              {invoice.order_id && (
                <div style={{ marginTop: 2 }}>Réf. commande : <strong style={{ color: '#0f172a' }}>N° {invoice.order_id.slice(0, 8).toUpperCase()}</strong></div>
              )}
            </div>
            <div style={{
              marginTop: 10, display: 'inline-block',
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: invoice.status === 'paid' ? '#dcfce7' : invoice.status === 'sent' ? '#dbeafe' : '#f1f5f9',
              color: invoice.status === 'paid' ? '#166534' : invoice.status === 'sent' ? '#1d4ed8' : '#64748b',
            }}>
              {STATUS_LABELS[invoice.status] || invoice.status.toUpperCase()}
            </div>
          </div>
        </div>

        {/* ── Séparateur ── */}
        <div style={{ height: 2, background: 'linear-gradient(to right, #3b82f6, #e2e8f0)', marginBottom: 36, borderRadius: 2 }} />

        {/* ── Client ── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Facturé à
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{invoice.client_name || '—'}</div>
          {invoice.client_address && (
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.6 }}>
              {invoice.client_address}
            </div>
          )}
          {invoice.client_email && (
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{invoice.client_email}</div>
          )}
        </div>

        {/* ── Tableau des lignes ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
          <thead>
            <tr style={{ background: '#0f172a' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', borderRadius: '6px 0 0 6px' }}>
                Description
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'center', color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', width: 70 }}>
                Qté
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', width: 110 }}>
                P.U.
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', width: 110, borderRadius: '0 6px 6px 0' }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '20px 16px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                  Aucun article
                </td>
              </tr>
            ) : (
              lines.map((line, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: '#0f172a', fontWeight: 500 }}>
                    {line.desc}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 14, color: '#475569' }}>
                    {line.qty}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 14, color: '#475569' }}>
                    {fmt(line.price)}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                    {fmt(line.qty * line.price)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Totaux ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
          <div style={{ minWidth: 280 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14, color: '#64748b' }}>
              <span>Sous-total</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {!isMicro && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14, color: '#64748b' }}>
                <span>TVA</span>
                <span>{fmt(invoice.total_tva)}</span>
              </div>
            )}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '14px 16px', marginTop: 8,
              background: '#0f172a', borderRadius: 8,
              fontSize: 16, fontWeight: 800, color: '#fff',
            }}>
              <span>Total TTC</span>
              <span>{fmt(invoice.total_ttc)}</span>
            </div>
          </div>
        </div>

        {/* ── Note ── */}
        {invoice.note && (
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '14px 16px', marginBottom: 32, fontSize: 13, color: '#475569',
          }}>
            <strong>Note :</strong> {invoice.note}
          </div>
        )}

        {/* ── Pied de page légal ── */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 24, marginTop: 8 }}>
          {isMicro && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6,
              padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e', fontWeight: 500,
            }}>
              ⚠️ {invoice.legal_mention || 'TVA non applicable, art. 293 B du CGI'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>Vendeur</div>
              <div>{invoice.seller_name}</div>
              {invoice.seller_siret && <div>SIRET : {invoice.seller_siret}</div>}
              {invoice.seller_address && <div>{invoice.seller_address}</div>}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>Paiement</div>
              <div>Facture émise le {fmtDate(invoice.date)}</div>
              <div>Paiement à réception de facture</div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#cbd5e1' }}>
                Document généré par Swedish Cravings Admin — {new Date().toLocaleDateString('fr-FR')}
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
