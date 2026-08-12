'use client';
import {
  A4Page, Rails, DocHeader, HRule, Parties, MetaBand, LinesTable, Totals, DocFooter,
  SideNote, DesignationCell, D, DocLine, Party, eurDoc, dateLong,
} from './doc-kit';

/* Document 3 — BON DE COMMANDE (handoff, partie 2, §3).
   Bloc fournisseur à gauche (cream) / adresse de livraison à droite,
   incoterm et conditions de paiement, autoliquidation de TVA,
   deux cadres de signature, pied sans phrase de clôture. */

export type BonDeCommandeData = {
  number: string;
  date: string;
  incoterm?: string;
  paymentTerms?: string;
  expectedAt?: string;
  supplier: Party;
  deliverTo: Party;
  lines: DocLine[];
  goodsTotal: number;
  freight?: number;
  total: number;
  instructions?: string;
  signature?: boolean;
  signerName?: string;
  legalLine1: string;
  legalLine2: string;
  contactLine1: string;
  contactLine2: string;
};

export default function BonDeCommande({ d }: { d: BonDeCommandeData }) {
  return (
    <A4Page>
      <Rails tone="green" />
      <DocHeader title="Bon de commande" number={d.number} />
      <HRule />

      <Parties
        creamSide="left"
        fromLabel="Fournisseur"
        from={d.supplier}
        toLabel="Adresse de livraison"
        to={d.deliverTo}
        tone="green"
      />

      <MetaBand items={[
        { label: "Date d'émission",  value: dateLong(d.date) },
        { label: 'Livraison prévue', value: d.expectedAt ? dateLong(d.expectedAt) : '—' },
        { label: 'Incoterm',         value: d.incoterm || 'DAP · rendu magasin' },
        { label: 'Paiement',         value: d.paymentTerms || '30 jours net' },
      ]} />

      <LinesTable
        tone="green"
        lines={d.lines}
        cols={[
          { label: 'Article', cell: DesignationCell },
          { label: 'Réf.',     width: 88,  small: true, cell: l => l.ref || '—' },
          { label: 'Qté',      width: 60,  align: 'center', cell: l => l.qty },
          { label: 'P.U. HT',  width: 92,  align: 'right',  cell: l => (l.unit != null ? eurDoc(l.unit) : '') },
          { label: 'Total HT', width: 100, align: 'right', bold: true,
            cell: l => (l.amount != null ? eurDoc(l.amount) : '') },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 28, marginTop: 22, alignItems: 'flex-start' }}>
        <SideNote title="Consignes">
          {d.instructions || "Palettes filmées, DLC minimum 6 mois à réception. Merci de joindre le bordereau et de nous transmettre le numéro de suivi dès l'expédition."}
        </SideNote>

        <Totals
          tone="green"
          rows={[
            { label: 'Total marchandises HT', value: eurDoc(d.goodsTotal) },
            ...(d.freight != null ? [{ label: 'Transport', value: d.freight > 0 ? eurDoc(d.freight) : 'Offert' }] : []),
          ]}
          totalLabel="Total HT"
          totalValue={eurDoc(d.total)}
          note="Autoliquidation de la TVA — achat intracommunautaire"
        />
      </div>

      {d.signature !== false && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 26 }}>
          <div style={{ border: `1px solid ${D.rule}`, padding: '13px 15px', height: 104 }}>
            <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.label, fontWeight: 600 }}>
              Pour Swedish Cravings
            </div>
            <div style={{ fontSize: 11, color: D.soft2, marginTop: 5 }}>{d.signerName || 'Gérance'}</div>
          </div>
          <div style={{ border: `1px solid ${D.rule}`, padding: '13px 15px', height: 104 }}>
            <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.label, fontWeight: 600 }}>
              Bon pour accord · fournisseur
            </div>
            <div style={{ fontSize: 11, color: D.soft2, marginTop: 5 }}>Date, cachet et signature</div>
          </div>
        </div>
      )}

      <DocFooter
        legal={<>{d.legalLine1}<br />{d.legalLine2}</>}
        contact={<>{d.contactLine1}<br />{d.contactLine2}</>}
      />
    </A4Page>
  );
}
