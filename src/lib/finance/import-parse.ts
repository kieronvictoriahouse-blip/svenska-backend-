// ─────────────────────────────────────────────────────────────────────
//  Import de relevé bancaire — OFX (.ofx/.qfx) et CSV
//  Fonctionne sans agrégateur : n'importe quelle banque exporte l'un ou
//  l'autre. Les lignes sont normalisées puis dédupliquées par external_id.
// ─────────────────────────────────────────────────────────────────────

export interface ParsedTx {
  external_id: string;
  booking_date: string;   // YYYY-MM-DD
  value_date?: string;
  amount: number;         // signé : + entrée, − sortie
  currency: string;
  label: string;
  counterparty?: string;
}

// ── OFX ───────────────────────────────────────────────────────────────
export function parseOfx(text: string): ParsedTx[] {
  const out: ParsedTx[] = [];
  const cur = (text.match(/<CURDEF>([A-Z]{3})/) || [])[1] || 'EUR';
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const tag = (name: string) => {
      const m = b.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const amt = parseFloat((tag('TRNAMT') || '0').replace(',', '.'));
    if (!isFinite(amt)) continue;
    const dt = tag('DTPOSTED').slice(0, 8);
    if (dt.length < 8) continue;
    const iso = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
    const name = tag('NAME');
    const memo = tag('MEMO');
    const fitid = tag('FITID') || `${iso}_${amt}_${(name || memo).slice(0, 12)}`;
    out.push({
      external_id: `ofx:${fitid}`,
      booking_date: iso,
      amount: Math.round(amt * 100) / 100,
      currency: cur,
      label: [name, memo].filter(Boolean).join(' · ') || 'Opération',
      counterparty: name || undefined,
    });
  }
  return out;
}

// ── CSV ───────────────────────────────────────────────────────────────
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === delim && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseFrDate(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);           // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);                // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{2})$/);               // DD/MM/YY
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseAmount(s: string): number {
  if (!s) return NaN;
  // « 1 234,56 » / « 1,234.56 » / « -12.90 »
  let t = s.replace(/\s| | |€/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  return parseFloat(t);
}

export function parseCsv(text: string): ParsedTx[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const delim = [';', '\t', ','].map(d => ({ d, n: (lines[0].match(new RegExp(`\\${d}`, 'g')) || []).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const header = splitCsvLine(lines[0], delim).map(h => h.toLowerCase());
  /* Les noms sont essayés DANS L'ORDRE (le premier trouvé gagne), et une
     colonne de date n'est jamais un montant : avant, « valeur » attrapait
     « Date de valeur » (Banque Populaire, Caisse d'Épargne…) et chaque
     montant était lu dans une date — 23/10/2026 devenait 23 €. */
  const find = (...names: string[]) => {
    for (const n of names) { const i = header.findIndex(h => h.includes(n)); if (i >= 0) return i; }
    return -1;
  };
  const findMontant = (...names: string[]) => {
    for (const n of names) { const i = header.findIndex(h => h.includes(n) && !h.includes('date')); if (i >= 0) return i; }
    return -1;
  };
  const iDate = find('date');
  const iLabel = find('libell', 'label', 'nature', 'description', 'motif', 'communication');
  const iAmount = findMontant('montant', 'amount', 'valeur');
  const iDebit = findMontant('débit', 'debit');
  const iCredit = findMontant('crédit', 'credit');
  const hasHeader = iDate >= 0 && (iAmount >= 0 || iDebit >= 0 || iCredit >= 0);

  const out: ParsedTx[] = [];
  const vus: Record<string, number> = {};
  const rows = hasHeader ? lines.slice(1) : lines;
  for (const line of rows) {
    const c = splitCsvLine(line, delim);
    const dateRaw = hasHeader ? c[iDate] : c.find(v => parseFrDate(v)) || '';
    const iso = parseFrDate(dateRaw);
    if (!iso) continue;
    let amount = NaN;
    if (hasHeader && iAmount >= 0) amount = parseAmount(c[iAmount]);
    else if (hasHeader && (iDebit >= 0 || iCredit >= 0)) {
      const deb = iDebit >= 0 ? parseAmount(c[iDebit]) : NaN;
      const cred = iCredit >= 0 ? parseAmount(c[iCredit]) : NaN;
      amount = isFinite(cred) && cred !== 0 ? Math.abs(cred) : (isFinite(deb) && deb !== 0 ? -Math.abs(deb) : NaN);
    } else {
      // Sans en-tête : dernière colonne numérique = montant.
      for (let i = c.length - 1; i >= 0; i--) { const v = parseAmount(c[i]); if (isFinite(v) && /\d/.test(c[i])) { amount = v; break; } }
    }
    if (!isFinite(amount) || amount === 0) continue;
    const label = (hasHeader && iLabel >= 0 ? c[iLabel] : c.filter(v => v && !parseFrDate(v) && !isFinite(parseAmount(v))).join(' ')) || 'Opération';
    /* Deux opérations identiques le même jour (deux étiquettes Mondial
       Relay à 4,90 €) avaient la même clé : la seconde était écartée
       comme doublon. Le rang d'occurrence dans le fichier les distingue,
       et reste stable si l'on réimporte le même relevé. */
    const cle = `csv:${iso}_${amount}_${label.slice(0, 20).replace(/\s+/g, '')}`;
    vus[cle] = (vus[cle] || 0) + 1;
    out.push({
      external_id: vus[cle] > 1 ? `${cle}#${vus[cle]}` : cle,
      booking_date: iso,
      amount: Math.round(amount * 100) / 100,
      currency: 'EUR',
      label,
    });
  }
  return out;
}

export function parseStatement(filename: string, text: string): ParsedTx[] {
  const isOfx = /\.(ofx|qfx)$/i.test(filename) || /<OFX>|<STMTTRN>/i.test(text);
  return isOfx ? parseOfx(text) : parseCsv(text);
}
