'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { DOC_PRINT_CSS, DocLine, Party } from '@/components/documents/doc-kit';
import Facture, { FactureData } from '@/components/documents/Facture';
import Avoir, { AvoirData } from '@/components/documents/Avoir';

/* Route d'impression : /admin/documents/<type>/<id>
   Rend le document A4 pixel-perfect à partir des données réelles.
   Ctrl+P → « Enregistrer en PDF » donne exactement ce qui est à l'écran
   (@page margin 0 + print-color-adjust: exact). */

const SHIPPING_LABELS = ['frais de livraison', 'frais de port', 'livraison'];

export default function DocumentPrintPage() {
  const params = useParams<{ type: string; id: string }>();
  const type = String(params?.type || '');
  const id = String(params?.id || '');

  const [data, setData] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [inv, wl] = await Promise.all([
          adminFetch(`/api/invoices/${id}`).then(r => r.json()),
          fetch('/api/white-label').then(r => r.json()).catch(() => ({})),
        ]);
        if (inv?.error) { setError(inv.error); return; }
        setData(inv.invoice);
        setCfg(wl?.config || {});
      } catch (e: any) {
        setError(e.message || 'Chargement impossible');
      }
    })();
  }, [id]);

  if (error) return <div style={{ padding: 40, fontFamily: 'Jost, sans-serif' }}>⚠️ {error}</div>;
  if (!data) return <div style={{ padding: 40, fontFamily: 'Jost, sans-serif' }}>Chargement…</div>;

  /* ── Émetteur / destinataire ─────────────────────────── */
  const seller: Party = {
    name: data.seller_name || cfg?.site_name || 'Swedish Cravings',
    lines: [
      ...(data.seller_address || cfg?.address || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      data.seller_siret || cfg?.siret ? `SIRET ${data.seller_siret || cfg?.siret}` : '',
    ].filter(Boolean),
  };
  const client: Party = {
    name: data.client_name || '—',
    lines: [
      ...(data.client_address || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      data.client_email || '',
    ].filter(Boolean),
  };

  /* ── Lignes : la livraison sort du tableau pour aller dans les
        totaux, comme sur la maquette. ── */
  const rawLines: any[] = Array.isArray(data.lines) ? data.lines : [];
  const isShipping = (l: any) => SHIPPING_LABELS.some(s => String(l.desc || l.name || '').toLowerCase().includes(s));
  const productLines = rawLines.filter(l => !isShipping(l));
  const shippingLine = rawLines.find(isShipping);

  const lines: DocLine[] = productLines.map(l => {
    const qty = Number(l.qty) || 1;
    const unit = Number(l.price) || 0;
    return { label: l.desc || l.name || 'Article', ref: l.ref || undefined, qty, unit, amount: qty * unit };
  });

  const subtotal = productLines.reduce((s, l) => s + (Number(l.qty) || 1) * (Number(l.price) || 0), 0);
  const shipping = shippingLine ? (Number(shippingLine.qty) || 1) * (Number(shippingLine.price) || 0) : undefined;

  const legalLine1 = `${seller.name} · ${data.seller_address || cfg?.address || ''}`;
  const legalLine2 = `${data.seller_siret || cfg?.siret ? 'SIRET ' + (data.seller_siret || cfg?.siret) + ' · ' : ''}${data.legal_mention || 'TVA non applicable, art. 293 B du CGI'}`;
  const contactLine1 = [data.seller_email || cfg?.email, data.seller_phone || cfg?.phone].filter(Boolean).join(' · ');
  const contactLine2 = (cfg?.front_url || 'https://www.swedishcravings.fr').replace(/^https?:\/\//, '');

  const isAvoir = type === 'avoir' || data.status === 'avoir';

  const toolbar = (
    <div className="doc-toolbar">
      <button onClick={() => window.print()}>Imprimer / PDF</button>
      <a href="/admin/gestion">← Retour à la facturation</a>
      <span style={{ flex: 1 }} />
      <span style={{ opacity: .6 }}>{isAvoir ? 'Avoir' : 'Facture'} {data.number}</span>
    </div>
  );

  if (isAvoir) {
    const d: AvoirData = {
      number: data.number,
      date: data.date,
      originalInvoice: (data.note || '').match(/(FAC-\d{4}-\d+)/)?.[1],
      reason: (data.note || '').replace(/^Avoir(?: partiel)? sur [^—]+—?\s*/, '').trim() || 'Geste commercial',
      reasonDetail: (data.note || '').replace(/^Avoir(?: partiel)? sur [^—]+—?\s*/, '').trim() || undefined,
      refundLabel: 'Carte bancaire',
      seller, client,
      lines,
      total: Math.abs(Number(data.total_ttc) || 0),
      refundedOn: data.date,
      legalLine1, legalLine2, contactLine1, contactLine2,
    };
    return <><style dangerouslySetInnerHTML={{ __html: DOC_PRINT_CSS }} />{toolbar}<Avoir d={d} /></>;
  }

  const d: FactureData = {
    number: data.number,
    date: data.date,
    dueLabel: 'À réception',
    orderNumber: data.order_number || undefined,
    paymentLabel: 'Carte bancaire',
    seller, client,
    lines,
    subtotal,
    shipping,
    shippingLabel: shippingLine ? (shippingLine.desc || 'Livraison') : undefined,
    total: Number(data.total_ttc) || 0,
    paid: ['paid'].includes(data.status),
    bank: null,
    legalLine1, legalLine2, contactLine1, contactLine2,
  };
  return <><style dangerouslySetInnerHTML={{ __html: DOC_PRINT_CSS }} />{toolbar}<Facture d={d} /></>;
}
