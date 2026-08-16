'use client';
import React from 'react';

/* ═══════════════════════════════════════════════════════════════
   KIT DES DOCUMENTS IMPRIMABLES A4
   Handoff « Redesign du back office », partie 2. Toutes les valeurs
   (px, em, hex) sont normatives et reprises telles quelles de la
   maquette. Ne pas « arrondir » : le rendu est validé au pixel.
   ═══════════════════════════════════════════════════════════════ */

export const D = {
  paper:   '#FDFBF5',
  cream:   '#F4EEE1',
  green:   '#44573D',
  gold:    '#B49256',
  ink:     '#1F231C',
  body:    '#5F5A4E',
  soft:    '#7A7364',
  soft2:   '#948B79',
  label:   '#A0977F',
  label2:  '#8A8067',
  rule:    '#E3DCCB',
  ruleRow: '#EFE9DC',
  body2:   '#4A4639',
} as const;

export const SERIF = "'Cormorant Garamond', serif";
export const SANS  = "'Jost', system-ui, sans-serif";

/** Couleur dominante d'un document : verte partout, or sur l'avoir. */
export type DocTone = 'green' | 'gold';
export const toneColor = (t: DocTone) => (t === 'gold' ? D.gold : D.green);

export const eurDoc = (n: number) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export const dateLong = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d.length <= 10 ? d + 'T12:00:00' : d) : d;
  if (Number.isNaN(+x)) return '—';
  return x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

export type Party = {
  name: string;
  lines: string[];
};

export type DocLine = {
  label: string;
  /** Deuxième ligne descriptive, 10,5 px */
  desc?: string;
  /** Vignette produit — on reconnaît un paquet en rayon plus vite qu'on
   *  ne lit sa référence. */
  image?: string;
  ref?: string;
  qty?: number | string;
  unit?: number;
  amount?: number;
  /** Rendu littéral du montant (avoir en négatif, BL sans prix…) */
  amountText?: string;
};

/* ── Filets de tête ─────────────────────────────────────────
   7 px de la couleur dominante, puis 2 px de la seconde.
   Sur l'avoir les deux couleurs sont inversées. */
export function Rails({ tone }: { tone: DocTone }) {
  const top = tone === 'gold' ? D.gold : D.green;
  const under = tone === 'gold' ? D.green : D.gold;
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 7, background: top }} />
      <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 2, background: under }} />
    </>
  );
}

/* ── En-tête : monogramme + wordmark / type + numéro ──────── */
export function DocHeader({ title, number }: { title: string; number: string }) {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
        <img src="/documents/sc-monogramme.png" alt="Swedish Cravings"
             style={{ width: 46, height: 69, objectFit: 'contain' }} />
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, letterSpacing: '.2em', color: D.green, textTransform: 'uppercase', lineHeight: 1 }}>
            Swedish Cravings
          </div>
          <div style={{ fontSize: 8, letterSpacing: '.32em', textTransform: 'uppercase', color: D.label, marginTop: 6 }}>
            Bringing Sweden to your table
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 500, lineHeight: 1, color: D.ink }}>{title}</div>
        <div style={{ fontSize: 10.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.gold, marginTop: 7, fontWeight: 600 }}>
          {number}
        </div>
      </div>
    </header>
  );
}

export const HRule = ({ margin = '22px 0 20px' }: { margin?: string }) => (
  <div style={{ height: 1, background: D.rule, margin }} />
);

/* ── Blocs adresse : émetteur à plat / destinataire sur cream ── */
export function Parties({
  fromLabel = 'Émetteur', from, toLabel, to, tone = 'green', creamSide = 'right',
}: {
  fromLabel?: string; from: Party; toLabel: string; to: Party; tone?: DocTone;
  /** Côté du bloc cream : droite (facture, avoir, BL) ou gauche (bon de commande, bon de retour). */
  creamSide?: 'left' | 'right';
}) {
  const plain = (label: string, party: Party) => (
    <div>
      <div style={{ fontSize: 8.5, letterSpacing: '.26em', textTransform: 'uppercase', color: D.label, fontWeight: 600, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: D.ink }}>{party.name}</div>
      <div style={{ fontSize: 12, lineHeight: 1.65, color: D.body, marginTop: 3 }}>
        {party.lines.map((l, i) => <React.Fragment key={i}>{l}<br /></React.Fragment>)}
      </div>
    </div>
  );
  const cream = (label: string, party: Party) => (
    <div style={{ background: D.cream, borderLeft: `2px solid ${toneColor(tone)}`, padding: '13px 16px' }}>
      <div style={{ fontSize: 8.5, letterSpacing: '.26em', textTransform: 'uppercase', color: D.label2, fontWeight: 600, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: D.ink }}>{party.name}</div>
      <div style={{ fontSize: 12, lineHeight: 1.65, color: D.body, marginTop: 3 }}>
        {party.lines.map((l, i) => <React.Fragment key={i}>{l}<br /></React.Fragment>)}
      </div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
      {creamSide === 'left'
        ? <>{cream(fromLabel, from)}{plain(toLabel, to)}</>
        : <>{plain(fromLabel, from)}{cream(toLabel, to)}</>}
    </div>
  );
}

/** Encart latéral gauche des pieds de table : « Consignes », « Conditions »,
 *  « Comment procéder ». Libellé 8,5 px + texte 11/11,5 px. */
export function SideNote({ title, children, maxWidth = 300, fontSize = 11 }: {
  title: string; children: React.ReactNode; maxWidth?: number; fontSize?: number;
}) {
  return (
    <div style={{ flex: 1, maxWidth, fontSize, color: D.soft, lineHeight: fontSize >= 11.5 ? 1.85 : 1.7 }}>
      <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.label, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

/* ── Bandeau méta : 4 cases, filets obtenus par gap sur fond rule ── */
export function MetaBand({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${items.length},1fr)`, gap: 1,
      background: D.rule, border: `1px solid ${D.rule}`, marginTop: 20,
    }}>
      {items.map((it, i) => (
        <div key={i} style={{ background: D.paper, padding: '10px 13px' }}>
          <div style={{ fontSize: 8, letterSpacing: '.2em', textTransform: 'uppercase', color: D.label, fontWeight: 600 }}>{it.label}</div>
          <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 4 }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Encart cream encadré (motif d'avoir, conditions…). */
export const NoteBox = ({ children, marginTop = 18 }: { children: React.ReactNode; marginTop?: number }) => (
  <div style={{ background: D.cream, border: `1px solid ${D.rule}`, padding: '13px 16px', marginTop, fontSize: 12, color: D.body, lineHeight: 1.65 }}>
    {children}
  </div>
);

/* ── Table des lignes ───────────────────────────────────────
   En-tête coloré + filet 1,5 px de la couleur du document.
   Les colonnes sont déclarées explicitement : chaque document a la
   sienne (facture P.U./Montant, BL Commandé/Livré/Lot-DLC, retour
   Motif/À rembourser…). Première et dernière colonnes collées aux
   marges (padding 11px 0), les autres à 11px 12px. */
export type DocCol = {
  label: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  cell: (l: any) => React.ReactNode;
  /** 11,5 px couleur discrète (réf., lot, motif) */
  small?: boolean;
  /** 600 (montants, quantité livrée) */
  bold?: boolean;
};

export function LinesTable({
  tone = 'green', cols, lines, marginTop = 24,
}: { tone?: DocTone; cols: DocCol[]; lines: any[]; marginTop?: number }) {
  const c = toneColor(tone);
  const last = cols.length - 1;

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', marginTop }}>
      <thead>
        <tr>
          {cols.map((col, i) => (
            <th key={i} style={{
              textAlign: col.align || 'left',
              fontSize: 8.5, letterSpacing: '.22em', textTransform: 'uppercase',
              color: c, fontWeight: 600,
              padding: i === 0 || i === last ? '0 0 9px' : '0 12px 9px',
              borderBottom: `1.5px solid ${c}`,
              width: col.width,
            }}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, ri) => (
          <tr key={ri}>
            {cols.map((col, i) => (
              <td key={i} style={{
                padding: i === 0 || i === last ? '11px 0' : '11px 12px',
                borderBottom: `1px solid ${D.ruleRow}`,
                fontSize: col.small ? 11.5 : 13,
                color: col.small ? D.soft : undefined,
                textAlign: col.align || 'left',
                fontWeight: col.bold ? 600 : undefined,
                fontVariantNumeric: 'tabular-nums',
              }}>{col.cell(l)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Cellule « désignation » : vignette optionnelle, nom en 500,
 *  description 10,5 px optionnelle. */
export const DesignationCell = (l: DocLine) => (
  <span style={{ fontVariantNumeric: 'normal', display: 'flex', alignItems: 'center', gap: 9 }}>
    {l.image && (
      <img src={l.image} alt="" width={34} height={34}
           style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
    )}
    <span>
      <span style={{ fontWeight: 500 }}>{l.label}</span>
      {l.desc && <><br /><span style={{ fontSize: 10.5, color: D.soft2 }}>{l.desc}</span></>}
    </span>
  </span>
);

/* ── Colonne des totaux (290 px) + bloc total plein ────────── */
export function Totals({
  tone = 'green', rows, totalLabel, totalValue, note,
}: {
  tone?: DocTone;
  rows: Array<{ label: string; value: string }>;
  totalLabel: string;
  totalValue: string;
  note?: string;
}) {
  const filled = tone === 'gold' ? D.gold : D.green;
  const onFilled = tone === 'gold' ? D.paper : D.cream;
  return (
    <div style={{ width: 290 }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: D.body,
          padding: '7px 0', borderTop: i === 0 ? undefined : `1px solid ${D.ruleRow}`,
        }}>
          <span>{r.label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
        </div>
      ))}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: filled, color: onFilled, padding: '13px 16px', marginTop: 9,
      }}>
        <span style={{ fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', fontWeight: 600 }}>{totalLabel}</span>
        <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{totalValue}</span>
      </div>
      {note && <div style={{ textAlign: 'right', fontSize: 10.5, color: D.soft2, marginTop: 7 }}>{note}</div>}
    </div>
  );
}

/** Cadre de signature (bon de commande, BL, devis). */
export function SignatureBox({ title, hint, height = 74 }: { title: string; hint?: string; height?: number }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${D.rule}`, padding: '11px 14px' }}>
      <div style={{ fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: D.label, fontWeight: 600 }}>{title}</div>
      {hint && <div style={{ fontSize: 10.5, color: D.soft2, marginTop: 4 }}>{hint}</div>}
      <div style={{ height }} />
    </div>
  );
}

/* ── Pied : séparateur décoratif + phrase + mentions ───────── */
export function DocFooter({
  closing, legal, contact,
}: { closing?: string; legal: React.ReactNode; contact: React.ReactNode }) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 22 }}>
      {closing && <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 14 }}>
        <div style={{ width: 56, height: 1, background: D.rule }} />
        <div style={{ width: 5, height: 5, background: D.gold, transform: 'rotate(45deg)' }} />
        <div style={{ width: 56, height: 1, background: D.rule }} />
      </div>
      <div style={{ textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: D.green, marginBottom: 16 }}>
        {closing}
      </div>
      </>}
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 20, paddingTop: 13,
        borderTop: `1px solid ${D.rule}`, fontSize: 9.5, color: D.soft2, lineHeight: 1.65,
      }}>
        <div>{legal}</div>
        <div style={{ textAlign: 'right' }}>{contact}</div>
      </div>
    </div>
  );
}

/** Filigrane diagonal (facture payée). */
export const Watermark = ({ text }: { text: string }) => (
  <div style={{
    position: 'absolute', top: '46%', left: 0, right: 0, textAlign: 'center',
    transform: 'rotate(-16deg)', fontFamily: SERIF, fontSize: 130, letterSpacing: '.14em',
    color: D.green, opacity: .06, pointerEvents: 'none', fontWeight: 600,
  }}>{text}</div>
);

/* ── Page A4 ────────────────────────────────────────────────
   210 × 297 mm, padding 54/56/34, fond papier, pied poussé par
   margin-top:auto. `@page { margin: 0 }` + printBackground côté
   navigateur pour un rendu identique à l'écran. */
export function A4Page({ children }: { children: React.ReactNode }) {
  return (
    <section className="doc-page" style={{
      display: 'flex', flexDirection: 'column', padding: '54px 56px 34px',
      background: D.paper, fontFamily: SANS, position: 'relative', overflow: 'hidden',
      color: D.ink,
    }}>
      {children}
    </section>
  );
}

export const DOC_PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${SANS}; color: ${D.ink}; -webkit-font-smoothing: antialiased; background: #E8E4DC; }
  table { border-collapse: collapse; width: 100%; }

  .doc-page {
    width: 210mm; min-height: 297mm;
    margin: 18px auto;
    box-shadow: 0 6px 26px rgba(31,35,28,.16);
  }

  .doc-toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; align-items: center;
    padding: 10px 14px; background: #1F231C; color: #F4EEE1; font-size: 12.5px; }
  .doc-toolbar button, .doc-toolbar a { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px;
    border-radius: 7px; padding: 7px 13px; border: 1px solid rgba(244,238,225,.25); background: none;
    color: #F4EEE1; cursor: pointer; text-decoration: none; }
  .doc-toolbar button:hover, .doc-toolbar a:hover { background: rgba(244,238,225,.12); }

  @page { size: A4; margin: 0; }
  @media print {
    body { background: #fff; }
    .doc-toolbar { display: none !important; }
    .doc-page { margin: 0; box-shadow: none; width: 210mm; min-height: 297mm; page-break-after: always; }
    .doc-page:last-child { page-break-after: auto; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;
