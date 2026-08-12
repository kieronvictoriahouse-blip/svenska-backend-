'use client';
import {
  A4Page, Rails, DocHeader, HRule, Parties, MetaBand, LinesTable, DocFooter,
  DesignationCell, D, DocLine, Party, dateLong,
} from './doc-kit';

/* Document 4 — BON DE LIVRAISON (handoff, partie 2, §4).
   Aucun prix. Colonnes Commandé / Livré / Lot-DLC, encart colisage,
   avertissement réserves transporteur, cadre de signature de réception. */

export type BLLine = DocLine & { ordered?: number | string; shipped?: number | string; batch?: string };

export type BonDeLivraisonData = {
  number: string;
  shippedAt: string;
  orderNumber?: string;
  carrier?: string;
  tracking?: string;
  sender: Party;
  recipient: Party;
  lines: BLLine[];
  parcels?: string;
  weight?: string;
  format?: string;
  signature?: boolean;
  legalLine1: string;
  legalLine2: string;
  contactLine1: string;
  contactLine2: string;
};

export default function BonDeLivraison({ d }: { d: BonDeLivraisonData }) {
  return (
    <A4Page>
      <Rails tone="green" />
      <DocHeader title="Bon de livraison" number={d.number} />
      <HRule />

      <Parties
        fromLabel="Expéditeur"
        from={d.sender}
        toLabel="Livré à"
        to={d.recipient}
        tone="green"
      />

      <MetaBand items={[
        { label: "Date d'expédition", value: dateLong(d.shippedAt) },
        { label: 'Commande',          value: d.orderNumber ? `N° ${d.orderNumber}` : '—' },
        { label: 'Transporteur',      value: d.carrier || '—' },
        { label: 'Suivi',             value: d.tracking || '—' },
      ]} />

      <LinesTable
        tone="green"
        lines={d.lines}
        cols={[
          { label: 'Article', cell: DesignationCell },
          { label: 'Réf.',      width: 96,  small: true, cell: l => l.ref || '—' },
          { label: 'Commandé',  width: 96,  align: 'center', cell: l => l.ordered ?? l.qty },
          { label: 'Livré',     width: 80,  align: 'center', bold: true, cell: l => l.shipped ?? l.qty },
          { label: 'Lot / DLC', width: 110, small: true, cell: l => l.batch || '—' },
        ]}
      />

      <div style={{ display: 'flex', gap: 22, marginTop: 22, alignItems: 'stretch' }}>
        <div style={{ flex: 1, border: `1px solid ${D.rule}`, padding: '13px 15px' }}>
          <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.label, fontWeight: 600, marginBottom: 8 }}>
            Colisage
          </div>
          <div style={{ display: 'flex', gap: 26 }}>
            <div>
              <div style={{ fontSize: 10.5, color: D.soft2 }}>Colis</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{d.parcels || '1 / 1'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: D.soft2 }}>Poids</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{d.weight || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: D.soft2 }}>Format</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{d.format || '—'}</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, background: D.cream, padding: '13px 15px', fontSize: 11.5, color: D.body, lineHeight: 1.65 }}>
          Document sans valeur commerciale. En cas d&apos;avarie, formulez des réserves précises
          auprès du transporteur et prévenez-nous sous 48 h.
        </div>
      </div>

      {d.signature !== false && (
        <div style={{ border: `1px solid ${D.rule}`, padding: '13px 15px', height: 110, marginTop: 22 }}>
          <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.label, fontWeight: 600 }}>
            Réception · nom, date et signature
          </div>
          <div style={{ fontSize: 11, color: D.soft2, marginTop: 5 }}>Précisez vos réserves éventuelles ci-dessous.</div>
        </div>
      )}

      <DocFooter
        closing="Smaklig måltid — bonne dégustation !"
        legal={<>{d.legalLine1}<br />{d.legalLine2}</>}
        contact={<>{d.contactLine1}<br />{d.contactLine2}</>}
      />
    </A4Page>
  );
}
