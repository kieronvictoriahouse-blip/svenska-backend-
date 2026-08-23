'use client';
import {
  A4Page, Rails, DocHeader, HRule, Parties, MetaBand, LinesTable, Totals, DocFooter,
  Watermark, DesignationCell, D, DocLine, Party, eurDoc, dateLong,
} from './doc-kit';

/* Document 1 — FACTURE (handoff, partie 2, §1).
   Filigrane « PAYÉE » et coordonnées bancaires optionnels. */

export type FactureData = {
  number: string;
  date: string;
  dueLabel?: string;
  orderNumber?: string;
  paymentLabel?: string;
  seller: Party;
  client: Party;
  lines: DocLine[];
  subtotal: number;
  shipping?: number;
  shippingLabel?: string;
  discount?: number;
  discountLabel?: string;
  total: number;
  paid?: boolean;
  bank?: { iban: string; bic: string; holder: string } | null;
  legalLine1: string;
  legalLine2: string;
  contactLine1: string;
  contactLine2: string;
};

export default function Facture({ d }: { d: FactureData }) {
  return (
    <A4Page>
      <Rails tone="green" />
      {d.paid && <Watermark text="PAYÉE" />}

      <DocHeader title="Facture" number={d.number} brand={(d as any).seller?.name || (d as any).seller_name || ''} slogan={(d as any).seller_slogan || ''} />
      <HRule />

      <Parties
        from={d.seller}
        toLabel="Facturé à"
        to={d.client}
        tone="green"
      />

      <MetaBand items={[
        { label: "Date d'émission", value: dateLong(d.date) },
        { label: 'Échéance',       value: d.dueLabel || 'À réception' },
        { label: 'Commande',       value: d.orderNumber ? `N° ${d.orderNumber}` : '—' },
        { label: 'Règlement',      value: d.paymentLabel || 'Carte bancaire' },
      ]} />

      <LinesTable
        tone="green"
        lines={d.lines}
        cols={[
          { label: 'Désignation', cell: DesignationCell },
          { label: 'Réf.',    width: 88, small: true, cell: l => l.ref || '—' },
          { label: 'Qté',     width: 52, align: 'center', cell: l => l.qty },
          { label: 'P.U.',    width: 88, align: 'right',  cell: l => (l.unit != null ? eurDoc(l.unit) : '') },
          { label: 'Montant', width: 96, align: 'right', bold: true,
            cell: l => (l.amountText != null ? l.amountText : l.amount != null ? eurDoc(l.amount) : '') },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 28, marginTop: 22, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, maxWidth: 300 }}>
          {d.bank && (
            <div style={{ border: `1px solid ${D.rule}`, padding: '13px 15px' }}>
              <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.label, fontWeight: 600, marginBottom: 8 }}>
                Coordonnées bancaires
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.75, color: D.body2, fontVariantNumeric: 'tabular-nums' }}>
                IBAN · {d.bank.iban}<br />
                BIC · {d.bank.bic}<br />
                Titulaire · {d.bank.holder}
              </div>
            </div>
          )}
          <div style={{ fontSize: 10.5, color: D.soft2, lineHeight: 1.7, marginTop: d.bank ? 11 : 0 }}>
            Pénalités de retard : 3 fois le taux d&apos;intérêt légal. Indemnité forfaitaire pour frais
            de recouvrement : 40 €. Pas d&apos;escompte pour paiement anticipé.
          </div>
        </div>

        <Totals
          tone="green"
          rows={[
            { label: 'Sous-total', value: eurDoc(d.subtotal) },
            ...(d.discount ? [{ label: d.discountLabel || 'Remise', value: '− ' + eurDoc(d.discount) }] : []),
            ...(d.shipping != null ? [{ label: d.shippingLabel || 'Livraison', value: d.shipping > 0 ? eurDoc(d.shipping) : 'Offerte' }] : []),
            { label: 'TVA', value: 'Non applicable' },
          ]}
          totalLabel="Total à régler"
          totalValue={eurDoc(d.total)}
          note="TVA non applicable, art. 293 B du CGI"
        />
      </div>

      <DocFooter
        closing="Tack så mycket — merci de votre confiance."
        legal={<>{d.legalLine1}<br />{d.legalLine2}</>}
        contact={<>{d.contactLine1}<br />{d.contactLine2}</>}
      />
    </A4Page>
  );
}
