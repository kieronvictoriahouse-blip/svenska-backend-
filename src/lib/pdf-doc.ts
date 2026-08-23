import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/* ═══════════════════════════════════════════════════════════════
   PRIMITIVES DES DOCUMENTS PDF

   Tokens, polices et blocs communs aux documents A4 (facture, avoir,
   bon de commande). Extraits pour qu'un changement de charte se fasse
   à un seul endroit — la duplication de la palette entre générateurs
   était exactement le genre d'écart qui finit par se voir.

   Conversion : la maquette est en px CSS sur une page A4 à 96 dpi, le
   PDF est en points. 1 px = 0,75 pt, d'où PX() partout, ce qui permet
   de recopier les valeurs du handoff telles quelles.
   ═══════════════════════════════════════════════════════════════ */

export const PX = (px: number) => px * 0.75;

/** Palette de components/documents/doc-kit.tsx — à modifier des deux côtés. */
export const D = {
  paper: '#FDFBF5', cream: '#F4EEE1', green: '#44573D', gold: '#B49256',
  ink: '#1F231C', body: '#5F5A4E', soft: '#7A7364', soft2: '#948B79',
  label: '#A0977F', label2: '#8A8067', rule: '#E3DCCB', ruleRow: '#EFE9DC',
  body2: '#4A4639',
} as const;

export const SANS = 'sans';
export const SANS_M = 'sans-medium';
export const SANS_B = 'sans-semibold';
export const SERIF = 'serif';
export const SERIF_B = 'serif-semibold';
export const SERIF_I = 'serif-italic';

const FONT_FILES: Record<string, [string, string]> = {
  [SANS]:    ['Jost-Regular.ttf', 'Helvetica'],
  [SANS_M]:  ['Jost-Medium.ttf', 'Helvetica'],
  [SANS_B]:  ['Jost-SemiBold.ttf', 'Helvetica-Bold'],
  [SERIF]:   ['CormorantGaramond-Regular.ttf', 'Times-Roman'],
  [SERIF_B]: ['CormorantGaramond-SemiBold.ttf', 'Times-Bold'],
  [SERIF_I]: ['CormorantGaramond-Italic.ttf', 'Times-Italic'],
};

/**
 * Enregistre les polices de la charte et retourne la table des noms
 * réellement disponibles. Un document doit sortir même si les fichiers
 * manquent — on retombe alors sur les polices de base de pdfkit.
 */
export function registerFonts(doc: PDFKit.PDFDocument): Record<string, string> {
  const dir = path.join(process.cwd(), 'src', 'assets', 'fonts');
  const resolved: Record<string, string> = {};
  for (const [nom, [fichier, repli]] of Object.entries(FONT_FILES)) {
    try {
      const p = path.join(dir, fichier);
      if (fs.existsSync(p)) { doc.registerFont(nom, p); resolved[nom] = nom; continue; }
    } catch { /* police illisible */ }
    resolved[nom] = repli;
  }
  return resolved;
}

export type Ecrire = (
  s: string, x: number, y: number,
  o?: { size?: number; font?: string; color?: string; width?: number; align?: any; spacing?: number; lineGap?: number },
) => number;

/** Fabrique la fonction d'écriture liée à un document et à ses polices. */
export function ecrivain(doc: PDFKit.PDFDocument, F: Record<string, string>): Ecrire {
  return (s, x, y, o = {}) => {
    doc.font(F[o.font || SANS] || F[SANS]).fontSize(o.size ?? PX(12)).fillColor(o.color || D.ink);
    doc.text(s, x, y, {
      width: o.width, align: o.align, characterSpacing: o.spacing || 0,
      lineGap: o.lineGap ?? 0, lineBreak: o.width != null,
    });
    return doc.y;
  };
}

/** Filets de tête + fond papier. `tone` porte la couleur du document. */
export function fondEtFilets(doc: PDFKit.PDFDocument, tone: string, sousTon: string) {
  const W = doc.page.width, H = doc.page.height;
  doc.rect(0, 0, W, H).fill(D.paper);
  doc.rect(0, 0, W, PX(7)).fill(tone);
  doc.rect(0, PX(7), W, PX(2)).fill(sousTon);
}

/** En-tête : monogramme, wordmark, titre et numéro. Retourne le bas du bloc. */
export function enTete(
  doc: PDFKit.PDFDocument, ecrire: Ecrire,
  o: { titre: string; numero: string; M: number; CW: number; y: number; baseline: string; marque?: string },
): number {
  let logoW = 0;
  try {
    // Le monogramme n'est pas garanti dans le bundle serverless : son
    // absence ne doit pas faire échouer le document.
    const p = path.join(process.cwd(), 'public', 'documents', 'sc-monogramme.png');
    if (fs.existsSync(p)) { doc.image(p, o.M, o.y, { width: PX(46), height: PX(69) }); logoW = PX(46) + PX(15); }
  } catch { /* sans logo */ }

  ecrire((o.marque || '').toUpperCase(), o.M + logoW, o.y + PX(14),
    { font: SERIF_B, size: PX(24), color: D.green, spacing: PX(24) * 0.2 });
  ecrire(o.baseline, o.M + logoW, o.y + PX(46),
    { size: PX(8), color: D.label, spacing: PX(8) * 0.32 });

  ecrire(o.titre.toUpperCase(), o.M, o.y, { font: SERIF, size: PX(38), color: D.ink, width: o.CW, align: 'right' });
  ecrire(o.numero.toUpperCase(), o.M, o.y + PX(40),
    { font: SANS_B, size: PX(10.5), color: D.gold, width: o.CW, align: 'right', spacing: PX(10.5) * 0.24 });

  const bas = o.y + PX(69) + PX(20);
  doc.rect(o.M, bas, o.CW, 0.75).fill(D.rule);
  return bas + PX(22);
}

/** Bandeau d'informations : cellules égales séparées par un filet. */
export function bandeau(
  doc: PDFKit.PDFDocument, ecrire: Ecrire,
  items: Array<{ label: string; value: string }>,
  o: { M: number; CW: number; y: number },
): number {
  const h = PX(46);
  doc.rect(o.M, o.y, o.CW, h).lineWidth(0.75).stroke(D.rule);
  const cw = o.CW / items.length;
  items.forEach((it, i) => {
    const cx = o.M + i * cw;
    if (i > 0) doc.rect(cx, o.y, 0.75, h).fill(D.rule);
    ecrire(it.label, cx + PX(13), o.y + PX(10),
      { size: PX(8), color: D.label, font: SANS_B, spacing: PX(8) * 0.2 });
    ecrire(it.value, cx + PX(13), o.y + PX(23),
      { font: SANS_M, size: PX(12.5), color: D.ink, width: cw - PX(20) });
  });
  return o.y + h + PX(24);
}

/** Pied de page : mentions légales à gauche, contact à droite. */
export function pied(
  doc: PDFKit.PDFDocument, ecrire: Ecrire,
  o: { M: number; CW: number; legal: string; contact: string; cloture?: string },
) {
  const H = doc.page.height;
  const hauteur = PX(40) + PX(13) + 2 * PX(9.5 * 1.65) + PX(6);
  const haut = H - PX(34) - hauteur;
  const cx = doc.page.width / 2;

  if (o.cloture) {
    doc.rect(cx - PX(72), haut, PX(56), 0.75).fill(D.rule);
    doc.rect(cx + PX(16), haut, PX(56), 0.75).fill(D.rule);
    doc.save().translate(cx, haut).rotate(45).rect(-PX(2.5), -PX(2.5), PX(5), PX(5)).fill(D.gold).restore();
    ecrire(o.cloture, o.M, haut + PX(14),
      { font: SERIF_I, size: PX(14), color: D.green, width: o.CW, align: 'center' });
  }

  const ruleY = haut + PX(40);
  doc.rect(o.M, ruleY, o.CW, 0.75).fill(D.rule);
  ecrire(o.legal, o.M, ruleY + PX(13),
    { size: PX(9.5), color: D.soft2, width: o.CW * 0.64, lineGap: PX(9.5) * 0.65 });
  ecrire(o.contact, o.M + o.CW * 0.64, ruleY + PX(13),
    { size: PX(9.5), color: D.soft2, width: o.CW * 0.36, align: 'right', lineGap: PX(9.5) * 0.65 });
}

/** Crée un document A4 prêt à peindre, avec ses polices enregistrées. */
export function nouveauDocument() {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const fini = new Promise<void>(resolve => doc.on('end', resolve));
  const F = registerFonts(doc);
  return { doc, F, ecrire: ecrivain(doc, F), chunks, fini };
}
