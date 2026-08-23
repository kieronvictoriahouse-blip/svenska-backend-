'use client';
import {
  A4Page, Rails, DocHeader, HRule, Parties, MetaBand, LinesTable, Totals, DocFooter,
  DesignationCell, D, DocLine, Party, eurDoc, dateLong,
} from './doc-kit';

/* Document 6 — BON DE RETOUR (handoff, partie 2, §6).
   Bloc client à gauche (cream) / service retours à droite, motif par
   ligne, marche à suivre numérotée, remboursement prévu, mention du
   droit de rétractation dans le pied. */

export type RetourLine = DocLine & { reason?: string };

export type BonDeRetourData = {
  number: string;
  requestedAt: string;
  orderNumber?: string;
  returnBefore?: string;
  treatment?: string;
  client: Party;
  returnTo: Party;
  lines: RetourLine[];
  itemsTotal: number;
  returnFeeLabel?: string;
  refundTotal: number;
  refundNote?: string;
  steps?: string[];
  legalLine1: string;
  legalLine2: string;
  contactLine1: string;
  contactLine2: string;
};

const DEFAULT_STEPS = [
  "Replacez les articles dans leur emballage d'origine.",
  'Glissez ce bon dans le colis.',
  "Collez l'étiquette prépayée jointe à l'email.",
  'Déposez le colis dans un point relais sous 14 jours.',
];

export default function BonDeRetour({ d }: { d: BonDeRetourData }) {
  const steps = d.steps && d.steps.length ? d.steps : DEFAULT_STEPS;

  return (
    <A4Page>
      <Rails tone="green" />
      <DocHeader title="Bon de retour" number={d.number} brand={(d as any).seller?.name || (d as any).seller_name || ''} slogan={(d as any).seller_slogan || ''} />
      <HRule />

      <Parties
        creamSide="left"
        fromLabel="Client"
        from={d.client}
        toLabel="Retour à"
        to={d.returnTo}
        tone="green"
      />

      <MetaBand items={[
        { label: 'Demandé le',       value: dateLong(d.requestedAt) },
        { label: 'Commande',         value: d.orderNumber ? `N° ${d.orderNumber}` : '—' },
        { label: 'À renvoyer avant', value: d.returnBefore ? dateLong(d.returnBefore) : '—' },
        { label: 'Traitement',       value: d.treatment || 'Remboursement' },
      ]} />

      <LinesTable
        tone="green"
        lines={d.lines}
        cols={[
          { label: 'Article retourné', cell: DesignationCell },
          { label: 'Réf.',  width: 90,  small: true, cell: l => l.ref || '—' },
          { label: 'Qté',   width: 52,  align: 'center', cell: l => l.qty },
          { label: 'Motif', width: 150, cell: l => <span style={{ fontSize: 12, color: D.body }}>{l.reason || '—'}</span> },
          { label: 'À rembourser', width: 96, align: 'right', bold: true,
            cell: l => (l.amount != null ? eurDoc(l.amount) : '') },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 28, marginTop: 22, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, maxWidth: 320 }}>
          <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.label, fontWeight: 600, marginBottom: 8 }}>
            Comment procéder
          </div>
          <div style={{ fontSize: 11.5, color: D.body, lineHeight: 1.85 }}>
            {steps.map((s, i) => <span key={i}>{i + 1} · {s}<br /></span>)}
          </div>
        </div>

        <Totals
          tone="green"
          rows={[
            { label: 'Articles retournés', value: eurDoc(d.itemsTotal) },
            { label: 'Frais de retour',    value: d.returnFeeLabel || 'Offerts' },
          ]}
          totalLabel="Remboursement prévu"
          totalValue={eurDoc(d.refundTotal)}
          note={d.refundNote || 'Sous 5 jours après réception du colis'}
        />
      </div>

      <DocFooter
        closing="Merci de nous avoir signalé ce souci — nous nous en occupons."
        legal={<>{d.legalLine1}<br />{d.legalLine2}</>}
        contact={<>{d.contactLine1}<br />{d.contactLine2}</>}
      />
    </A4Page>
  );
}
