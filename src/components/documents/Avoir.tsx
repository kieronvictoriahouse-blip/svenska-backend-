'use client';
import {
  A4Page, Rails, DocHeader, HRule, Parties, MetaBand, NoteBox, LinesTable, Totals, DocFooter,
  DocLine, Party, eurDoc, dateLong,
} from './doc-kit';

/* Document 2 — AVOIR (handoff, partie 2, §2).
   Filets inversés (or au-dessus du vert), montants en négatif,
   bloc total or, motif encadré, référence à la facture d'origine. */

export type AvoirData = {
  number: string;
  date: string;
  originalInvoice?: string;
  /** Motif court, affiché dans le bandeau méta (ex. « Casse transport »). */
  reason?: string;
  /** Texte détaillé encadré sous le bandeau. Absent → pas d'encart. */
  reasonDetail?: string;
  refundLabel?: string;
  seller: Party;
  client: Party;
  lines: DocLine[];
  /** Total crédité, en valeur absolue. */
  total: number;
  refundedOn?: string;
  legalLine1: string;
  legalLine2: string;
  contactLine1: string;
  contactLine2: string;
};

export default function Avoir({ d }: { d: AvoirData }) {
  // Les montants de ligne s'affichent en négatif, le bloc total en positif.
  const lines: DocLine[] = d.lines.map(l => ({
    ...l,
    amountText: l.amountText ?? (l.amount != null
      ? (l.amount < 0 ? '− ' + eurDoc(Math.abs(l.amount)) : '− ' + eurDoc(l.amount))
      : undefined),
  }));

  return (
    <A4Page>
      <Rails tone="gold" />

      <DocHeader title="Avoir" number={d.number} />
      <HRule />

      <Parties
        from={d.seller}
        toLabel="Bénéficiaire"
        to={d.client}
        tone="gold"
      />

      <MetaBand items={[
        { label: 'Date',              value: dateLong(d.date) },
        { label: "Facture d'origine", value: d.originalInvoice || '—' },
        { label: 'Motif',             value: d.reason || 'Geste commercial' },
        { label: 'Remboursement',     value: d.refundLabel || 'Carte bancaire' },
      ]} />

      {(d.reasonDetail || d.originalInvoice) && (
        <NoteBox>
          {d.reasonDetail}
          {d.reasonDetail && d.originalInvoice ? ' ' : ''}
          {d.originalInvoice ? `Le présent avoir annule partiellement la facture ${d.originalInvoice}.` : ''}
        </NoteBox>
      )}

      <LinesTable
        tone="gold"
        columns={{ ref: true, qty: true, unit: true, amount: true }}
        lines={lines}
        marginTop={22}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <Totals
          tone="gold"
          rows={[
            { label: 'Total des articles', value: '− ' + eurDoc(d.total) },
            { label: 'TVA', value: 'Non applicable' },
          ]}
          totalLabel="Montant remboursé"
          totalValue={eurDoc(d.total)}
          note={d.refundedOn ? `Remboursement effectué le ${dateLong(d.refundedOn)}` : undefined}
        />
      </div>

      <DocFooter
        closing="Désolée pour ce désagrément — nous restons à votre écoute."
        legal={<>{d.legalLine1}<br />{d.legalLine2}</>}
        contact={<>{d.contactLine1}<br />{d.contactLine2}</>}
      />
    </A4Page>
  );
}
