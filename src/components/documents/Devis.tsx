'use client';
import {
  A4Page, Rails, DocHeader, HRule, Parties, MetaBand, LinesTable, Totals, DocFooter,
  SideNote, DesignationCell, D, DocLine, Party, eurDoc, dateLong,
} from './doc-kit';

/* Document 5 — DEVIS (handoff, partie 2, §5).
   Validité, acompte, remise professionnelle, cadre « Bon pour accord »
   encadré en vert, pied sans phrase de clôture. */

export type DevisData = {
  number: string;
  date: string;
  validUntil?: string;
  deposit?: string;
  deliveryLabel?: string;
  seller: Party;
  client: Party;
  lines: DocLine[];
  subtotal: number;
  discount?: number;
  discountLabel?: string;
  shipping?: number;
  total: number;
  conditions?: string;
  signature?: boolean;
  replyTo?: string;
  legalLine1: string;
  legalLine2: string;
  contactLine1: string;
  contactLine2: string;
};

export default function Devis({ d }: { d: DevisData }) {
  return (
    <A4Page>
      <Rails tone="green" />
      <DocHeader title="Devis" number={d.number} />
      <HRule />

      <Parties
        from={d.seller}
        toLabel="Établi pour"
        to={d.client}
        tone="green"
      />

      <MetaBand items={[
        { label: "Date d'émission", value: dateLong(d.date) },
        { label: 'Validité',        value: d.validUntil ? `Jusqu'au ${dateLong(d.validUntil)}` : '30 jours' },
        { label: 'Acompte',         value: d.deposit || '30 % à la commande' },
        { label: 'Livraison',       value: d.deliveryLabel || 'À convenir' },
      ]} />

      <LinesTable
        tone="green"
        lines={d.lines}
        cols={[
          { label: 'Prestation / produit', cell: DesignationCell },
          { label: 'Qté',     width: 60,  align: 'center', cell: l => l.qty },
          { label: 'P.U.',    width: 92,  align: 'right',  cell: l => (l.unit != null ? eurDoc(l.unit) : '') },
          { label: 'Montant', width: 100, align: 'right', bold: true,
            cell: l => (l.amount != null ? eurDoc(l.amount) : '') },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 28, marginTop: 22, alignItems: 'flex-start' }}>
        <SideNote title="Conditions">
          {d.conditions || 'Tarif professionnel réservé aux revendeurs et restaurateurs. Livraison en camion réfrigéré pour les produits frais. Devis gratuit, sans engagement.'}
        </SideNote>

        <Totals
          tone="green"
          rows={[
            { label: 'Sous-total', value: eurDoc(d.subtotal) },
            ...(d.discount ? [{ label: d.discountLabel || 'Remise professionnelle', value: '− ' + eurDoc(d.discount) }] : []),
            ...(d.shipping != null ? [{ label: 'Livraison', value: d.shipping > 0 ? eurDoc(d.shipping) : 'Offerte' }] : []),
          ]}
          totalLabel="Total net"
          totalValue={eurDoc(d.total)}
          note="TVA non applicable, art. 293 B du CGI"
        />
      </div>

      {d.signature !== false && (
        <div style={{ border: `1px solid ${D.green}`, padding: '14px 16px', marginTop: 24, height: 118 }}>
          <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.green, fontWeight: 600 }}>
            Bon pour accord
          </div>
          <div style={{ fontSize: 11.5, color: D.soft, marginTop: 5, lineHeight: 1.6 }}>
            Faire précéder la signature de la mention « Bon pour accord », dater et retourner
            par email à {d.replyTo || 'contact@swedishcravings.fr'}.
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
