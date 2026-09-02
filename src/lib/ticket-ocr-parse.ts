/* ═══════════════════════════════════════════════════════════════
   PARSEUR DE TEXTE OCR → LIGNES DE TICKET

   OCR.space (et les moteurs gratuits en général) rendent du texte
   brut, pas des lignes structurées comme Mindee. Ce module reconstruit
   { libellé, quantité, prix unitaire } à partir du texte d'un ticket
   de caisse suédois (ICA, Coop, Willys, Hemköp…).

   La reconnaissance ne sera jamais parfaite : l'écran laisse corriger
   chaque ligne, et les alias appris améliorent les tickets suivants.
   Le parseur vise donc « utile », pas « exact ».
   ═══════════════════════════════════════════════════════════════ */

export type ParsedLine = { label: string; qty: number; unit_price: number };
export type ParsedReceipt = { lines: ParsedLine[]; total_ocr: number | null };

/* Un montant suédois : 1 234,56 · 1234.56 · 89,00 · -5,00, éventuel « kr ». */
const AMOUNT = String.raw`-?\d{1,3}(?:[ . ]\d{3})*[.,]\d{2}`;
const TRAILING_AMOUNT = new RegExp(`(${AMOUNT})(?:\\s*kr)?\\s*(?:[A-Z*]{1,3})?\\s*$`, 'i');
const ONLY_AMOUNT = new RegExp(`^\\s*(${AMOUNT})(?:\\s*kr)?\\s*$`, 'i');

/** Convertit « 1 234,56 » / « 1234.56 » en nombre. */
function toNum(s: string): number {
  const cleaned = s.replace(/[  ]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/* Lignes qui ne sont pas des produits : totaux, moyens de paiement,
   TVA, en-têtes, arrondis, horodatage… Bilingue suédois + français,
   car des achats peuvent aussi se faire en France. */
const NOISE = [
  // ── Totaux (SV + FR) ──
  /\b(?:att\s*betala|totalt?|summa|delsumma|subtotal)\b/i,
  /\b(?:total|montant|net\s*(?:à|a)\s*payer|(?:à|a)\s*payer|sous[- ]?total|total\s*ttc)\b/i,
  // ── TVA (SV + FR) ── PAS un « % » nu, sinon on jette « Mjölk 1,5 % », « Crème 40 % ».
  /\bmoms\b/i, /\bvat\b/i, /\bmvh\b/i, /\btva\b/i, /\bh\.?t\.?\b/i, /\bt\.?t\.?c\.?\b/i,
  // ── Moyens de paiement (SV + FR) ──
  /\b(?:kontokort|bankkort|kreditkort|kort|kontant|swish|betalkort|mottaget|växel|tillbaka|retur)\b/i,
  /\b(?:carte|cb|bancaire|esp(?:è|e)ces?|ch(?:è|e)que|rendu|monnaie|sans\s*contact|paiement|paye|re(?:ç|c)u\s*client|d(?:û|u)\b)\b/i,
  // ── Arrondis (SV + FR) ──
  /\böres?\s*avr/i, /\bavrundning\b/i, /\böresutj/i, /\barrondi/i,
  // ── En-têtes / pieds (SV + FR) ──
  /\b(?:kvitto|kassa|kassör|butik|org\.?\s*nr|orgnr|terminal|ref\.?nr|referens|kortköp|köp)\b/i,
  /\b(?:caisse|vendeur|magasin|siret|siren|ticket|merci|facture|n°|hotline|service\s*client)\b/i,
  /\b(?:datum|tid|telefon|tel\.?|www\.|http|\.se\b|\.com\b|\.fr\b|date|heure)\b/i,
  /\b(?:antal\s*artiklar|antal\s*varor|totalt\s*antal|nombre\s*d.articles?|nb\s*articles?)\b/i,
  // ── Fidélité / promo (SV + FR) ──
  /\bspara\b/i, /\bmedlem\b/i, /\bbonus\b/i, /\bpoäng\b/i,
  /\b(?:carte\s*fid|fid(?:é|e)lit(?:é|e)|cagnotte|points?|avantage|remise\s*fid)\b/i,
];

const isNoise = (s: string) => NOISE.some(rx => rx.test(s));

/* Quantité en tête de ligne : « 2 st », « 2x », « 2 * », « 3 ST ». */
const LEADING_QTY = /^\s*(\d{1,3})\s*(?:st|x|\*)\s+/i;
/* Quantité × prix unitaire dans la ligne : « 2 x 12,50 », « 2st 12,50 ». */
const QTY_TIMES_UNIT = new RegExp(`(\\d{1,3})\\s*(?:st|x|\\*)\\s*(${AMOUNT})`, 'i');
/* Ligne au poids : « 0,530 kg x 89,00 kr/kg ». */
const WEIGHT = new RegExp(`(${AMOUNT}|\\d+)\\s*kg`, 'i');

/**
 * Fusionne une ligne « prix seul » avec la ligne précédente sans prix :
 * l'OCR met parfois le libellé et le montant sur deux lignes séparées.
 */
function joinOrphanPrices(rows: string[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const line = row.trim();
    if (!line) continue;
    if (ONLY_AMOUNT.test(line) && out.length) {
      const prev = out[out.length - 1];
      if (!TRAILING_AMOUNT.test(prev) && !isNoise(prev)) {
        out[out.length - 1] = `${prev}  ${line}`;
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

/** Cherche le total du ticket (« Att betala » d'abord, puis « Totalt »). */
function findTotal(rows: string[]): number | null {
  const pick = (rx: RegExp): number | null => {
    for (const line of rows) {
      if (!rx.test(line)) continue;
      const m = line.match(new RegExp(`(${AMOUNT})(?:\\s*kr)?\\s*$`, 'i'));
      if (m) return toNum(m[1]);
    }
    return null;
  };
  return pick(/\batt\s*betala\b/i)               // SV : « Att betala »
      ?? pick(/\bnet\s*(?:à|a)\s*payer\b/i)       // FR : « Net à payer »
      ?? pick(/\btotal\s*(?:à|a)\s*payer\b/i)     // FR : « Total à payer »
      ?? pick(/\btotalt?\b/i)                     // SV/FR : « Totalt » / « Total »
      ?? pick(/\bsumma\b/i);
}

export function parseReceiptText(text: string): ParsedReceipt {
  if (!text || !text.trim()) return { lines: [], total_ocr: null };

  const rawRows = text.split(/\r?\n/);
  const rows = joinOrphanPrices(rawRows);
  const total_ocr = findTotal(rows);

  const lines: ParsedLine[] = [];

  for (const line of rows) {
    if (isNoise(line)) continue;

    const m = line.match(TRAILING_AMOUNT);
    if (!m) continue;

    const amount = toNum(m[1]);
    if (amount <= 0) continue; // remises négatives et lignes à 0 : écartées

    // Libellé = tout ce qui précède le montant final.
    let label = line.slice(0, line.length - m[0].length).replace(/[.\-–—:]+$/, '').trim();

    let qty = 1;
    let unit = amount;

    // Cas « 2 x 12,50 » : quantité et prix unitaire explicites.
    const qtu = label.match(QTY_TIMES_UNIT) || line.match(QTY_TIMES_UNIT);
    const lead = label.match(LEADING_QTY);

    if (qtu) {
      qty = parseInt(qtu[1], 10) || 1;
      unit = toNum(qtu[2]);
      label = label.replace(QTY_TIMES_UNIT, ' ').trim();
    } else if (lead) {
      qty = parseInt(lead[1], 10) || 1;
      unit = qty > 0 ? amount / qty : amount; // le montant final est le total ligne
      label = label.replace(LEADING_QTY, '').trim();
    } else if (WEIGHT.test(line)) {
      qty = 1; // article au poids : une ligne, prix = total pesé
      unit = amount;
      // « Bananer 0,780 kg x 24,90 kr/kg » → on ne garde que le libellé
      // en tête, avant le premier chiffre (le reste est le détail de pesée).
      const head = label.match(/^[^\d]+/);
      label = (head ? head[0] : label).trim();
    }

    label = label.replace(/\s{2,}/g, ' ').trim();

    // Rejette les restes non exploitables : trop court, ou purement numérique.
    if (label.replace(/[^a-zà-öø-ÿ]/gi, '').length < 2) continue;
    if (unit <= 0) continue;

    lines.push({
      label,
      qty,
      unit_price: Math.round(unit * 100) / 100,
    });
  }

  return { lines, total_ocr };
}
