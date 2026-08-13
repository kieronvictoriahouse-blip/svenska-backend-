/* ═══════════════════════════════════════════════════════════════
   RAPPROCHEMENT D'UNE LIGNE DE TICKET AVEC LE CATALOGUE
   Handoff : score ≥ 0,8 → « Rapproché » · 0,4–0,8 → « À vérifier »
   avec candidats · < 0,4 → « Nouveau produit ».

   La similarité est calculée ici plutôt que via pg_trgm : le catalogue
   fait quelques dizaines de produits, une requête suffit et on évite
   d'exiger une extension Postgres.
   ═══════════════════════════════════════════════════════════════ */

export type MatchStatus = 'matched' | 'review' | 'new' | 'ignored';

export type MatchResult = {
  status: MatchStatus;
  score: number;
  product_id: string | null;
  product_name: string | null;
  candidates: Array<{ id: string; name: string; score: number }>;
};

/** Lignes à ignorer : consignes, remises, arrondis. */
const IGNORE_PATTERNS = [
  /^pant\b/i, /\bpant\s*burk\b/i, /\bpant\s*flask/i,
  /\brabatt\b/i, /\bremise\b/i, /\bavrundning\b/i, /\barrondi\b/i,
  /^öresavrundning/i, /^summa\b/i, /^total\b/i, /^moms\b/i,
];

export const shouldIgnore = (label: string) =>
  IGNORE_PATTERNS.some(rx => rx.test((label || '').trim()));

/** Normalisation : majuscules suédoises, accents, abréviations de poids. */
export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o')
    .replace(/(\d+)\s*(g|kg|ml|cl|l|st|pack)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Bigrammes d'une chaîne, pour un Dice coefficient. */
function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

/** Similarité de Dice, 0 → 1. Tolère les abréviations de ticket. */
export function similarity(a: string, b: string): number {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  // Un libellé de ticket est souvent un préfixe tronqué du nom réel
  // (« V-BOTTENSOST » / « Västerbottensost 300 g ») : on le récompense.
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  if (long.startsWith(short) && short.length >= 4) return 0.92;

  const ba = bigrams(x), bb = bigrams(y);
  let inter = 0;
  ba.forEach((n, g) => {
    const o = bb.get(g);
    if (o) inter += Math.min(n, o);
  });
  let total = 0;
  ba.forEach(n => { total += n; });
  bb.forEach(n => { total += n; });
  if (!total) return 0;

  let score = (2 * inter) / total;

  // Bonus si tous les mots significatifs du libellé court sont présents.
  const words = short.split(' ').filter(w => w.length >= 3);
  if (words.length && words.every(w => long.includes(w))) score = Math.max(score, 0.85);

  return Math.min(1, score);
}

export type CatalogItem = { id: string; name_fr?: string; name_sv?: string; ean?: string };

/**
 * Rapproche un libellé brut.
 * @param aliases correspondances déjà apprises : libellé normalisé → product_id
 */
export function matchLine(
  rawLabel: string,
  catalog: CatalogItem[],
  aliases: Record<string, string> = {},
  ean?: string,
): MatchResult {
  const empty: MatchResult = { status: 'new', score: 0, product_id: null, product_name: null, candidates: [] };
  if (!rawLabel?.trim()) return empty;

  if (shouldIgnore(rawLabel)) {
    return { ...empty, status: 'ignored' };
  }

  // 1. EAN présent sur le ticket : correspondance certaine.
  if (ean) {
    const hit = catalog.find(p => p.ean && p.ean === ean);
    if (hit) return { status: 'matched', score: 1, product_id: hit.id, product_name: hit.name_fr || hit.name_sv || '', candidates: [] };
  }

  // 2. Alias appris : l'utilisateur a déjà tranché, on ne rediscute pas.
  const aliasId = aliases[normalize(rawLabel)];
  if (aliasId) {
    const hit = catalog.find(p => p.id === aliasId);
    if (hit) return { status: 'matched', score: 1, product_id: hit.id, product_name: hit.name_fr || hit.name_sv || '', candidates: [] };
  }

  // 3. Similarité textuelle sur les noms FR et SV.
  const scored = catalog.map(p => {
    const s = Math.max(
      similarity(rawLabel, p.name_fr || ''),
      similarity(rawLabel, p.name_sv || ''),
    );
    return { id: p.id, name: p.name_fr || p.name_sv || '', score: Math.round(s * 100) / 100 };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.4) return { ...empty, candidates: scored.slice(0, 3).filter(c => c.score > 0.15) };

  return {
    status: best.score >= 0.8 ? 'matched' : 'review',
    score: best.score,
    product_id: best.id,
    product_name: best.name,
    candidates: scored.slice(0, 4).filter(c => c.score > 0.2),
  };
}

/* ── Conversion couronnes → euros HT ───────────────────────────
   Les prix du ticket sont TTC en SEK : on déduit la moms puis on
   convertit. Formules imposées par le handoff. */

export const lineEurHt = (sek: number, vatRate: number, rate: number) =>
  Math.round((sek / (1 + vatRate / 100)) * rate * 100) / 100;

export const unitEurHt = (unitSek: number, vatRate: number, rate: number) =>
  Math.round((unitSek / (1 + vatRate / 100)) * rate * 10000) / 10000;
