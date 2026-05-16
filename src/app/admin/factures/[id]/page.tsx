'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type InvoiceLine = { desc: string; qty: number; price: number; tva: number; image_url?: string };

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
  paid_at?: string;
  payment_method?: string;
};

// ── Mentions légales (conformité art. 242 nonies A CGI) ──────────────────
const SIREN_RAW  = '105003537';
const EI_NAME    = 'EI Victoria Vallet';
const RCS_CITY   = 'Romans-sur-Isère'; // à confirmer sur Infogreffe
const SIEGE      = '165 chemin du Vercors, 26800 Étoile-sur-Rhône';
const MEDIATEUR  = '[médiateur à compléter]'; // ex: CM2C — cm2c.net
const MEDIATEUR_URL = '[url à compléter]';

function fmtSiren(s: string) {
  const n = (s || '').replace(/\s/g, '');
  if (n.length === 9)  return `${n.slice(0,3)} ${n.slice(3,6)} ${n.slice(6)}`;
  if (n.length === 14) return `${n.slice(0,3)} ${n.slice(3,6)} ${n.slice(6,9)} ${n.slice(9,13)} ${n.slice(13)}`;
  return s;
}

const PAYMENT_LABELS: Record<string, string> = {
  card: 'carte bancaire', stripe: 'carte bancaire',
  transfer: 'virement bancaire', paypal: 'PayPal', other: 'autre moyen',
};

const fmt = (n: number) =>
  (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtDate = (d?: string) =>
  d ? new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

const STATUS_LABELS: Record<string, string> = {
  draft: 'BROUILLON', sent: 'ÉMISE', paid: 'PAYÉE', late: 'EN RETARD',
  avoir: 'AVOIR', refunded: 'REMBOURSÉE',
};

export default function FacturePage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [avoirId, setAvoirId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    if (!invoice) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`);
      if (!res.ok) { alert('Erreur génération PDF'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facture-${invoice.number || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert('Erreur téléchargement PDF'); }
    finally { setDownloading(false); }
  }

  useEffect(() => {
    fetch(`/api/invoices/${id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.invoice) {
          setInvoice(d.invoice);
          if (d.invoice.status === 'refunded' && d.invoice.order_id) {
            const token = typeof window !== 'undefined' ? localStorage.getItem('sd_admin_token') || '' : '';
            fetch(`/api/invoices?order_id=${d.invoice.order_id}&status=avoir`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
              .then(r => r.json())
              .then(av => setAvoirId(av.invoices?.[0]?.id || null))
              .catch(() => {});
          }
        } else setError('Facture introuvable');
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
        {avoirId && (
          <a
            href={`/admin/factures/${avoirId}`}
            style={{
              background: '#EDE9FE', border: '1px solid #DDD6FE', color: '#5B21B6',
              padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ↩️ Voir l'avoir
          </a>
        )}
        <button
          onClick={downloadPdf}
          disabled={downloading}
          style={{
            background: '#10b981', border: 'none', color: '#fff',
            padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}
        >
          {downloading ? '⏳…' : '⬇️ Télécharger PDF'}
        </button>
        <button
          onClick={() => window.print()}
          style={{
            background: '#3b82f6', border: 'none', color: '#fff',
            padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}
        >
          🖨️ Imprimer
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
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
              {invoice.seller_name || 'Svenska Delikatessen'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{EI_NAME}</div>
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
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.7 }}>
              <span style={{ fontWeight: 600 }}>SIREN : {fmtSiren(SIREN_RAW)}</span>
              <br />RCS {RCS_CITY} {fmtSiren(SIREN_RAW)}
            </div>
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
                  <td style={{ padding: '10px 16px', fontSize: 14, color: '#0f172a', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {line.image_url && (
                        <img
                          src={line.image_url}
                          alt={line.desc}
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0', flexShrink: 0 }}
                        />
                      )}
                      <span>{line.desc}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: 14, color: '#475569' }}>
                    {line.qty}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, color: '#475569' }}>
                    {fmt(line.price)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
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

        {/* ── Paiement ── */}
        {invoice.status === 'paid' && invoice.paid_at ? (
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
            padding: '10px 16px', marginBottom: 24, fontSize: 13, color: '#166534', fontWeight: 600,
          }}>
            ✅ Facture acquittée le {fmtDate(invoice.paid_at)}
            {invoice.payment_method ? ` par ${PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method}` : ''}
          </div>
        ) : invoice.status === 'paid' ? (
          <div style={{ marginBottom: 24, fontSize: 13, color: '#64748b' }}>
            ✅ Facture acquittée.
          </div>
        ) : (
          <div style={{ marginBottom: 24, fontSize: 13, color: '#64748b' }}>
            Payable à réception de facture.
          </div>
        )}

        {/* ── Note ── */}
        {invoice.note && (
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '14px 16px', marginBottom: 24, fontSize: 13, color: '#475569',
          }}>
            <strong>Note :</strong> {invoice.note}
          </div>
        )}

        {/* ── Pied de facture légal (art. 242 nonies A CGI, art. L441-9 C.com., art. L616-1 C.conso) ── */}
        <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 20, marginTop: 8 }}>
          {isMicro && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6,
              padding: '8px 14px', marginBottom: 14, fontSize: 11, color: '#92400e', fontWeight: 500,
            }}>
              TVA non applicable, art. 293 B du CGI
            </div>
          )}
          <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 2 }}>
            <strong style={{ color: '#64748b' }}>
              {invoice.seller_name || 'Svenska Delikatessen'} — {EI_NAME}
            </strong><br />
            Siège social : {invoice.seller_address || SIEGE}<br />
            SIREN : {fmtSiren(SIREN_RAW)} — RCS {RCS_CITY}<br />
            TVA non applicable, art. 293 B du CGI
          </div>
        </div>

      </div>
    </>
  );
}
