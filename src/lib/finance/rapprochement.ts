// ─────────────────────────────────────────────────────────────────────
//  Rapprochement banque ↔ écritures existantes — fonctions pures
//  (sans base : testables seules). Utilisées par la pile de tri.
// ─────────────────────────────────────────────────────────────────────

import { categoryDef } from './pcg';

/** Famille de catégorie pour reconnaître la MÊME opération sous deux
 *  libellés : une vente en ligne (webhook, « vente_en_ligne ») et la
 *  même vente vue depuis la banque (« vente » ou « pro ») sont des
 *  ventes. L'apport et le « pas pour la boutique » ne se rattachent
 *  jamais à une écriture existante. */
export function groupeRapprochement(category: string | null | undefined): string {
  const key = categoryDef(category).key;
  if (key === 'vente' || key === 'pro' || key === 'port') return 'ventes';
  if (key === 'apport' || key === 'perso') return `perso:${key}`;
  return key;
}

/** L'écriture dont la date est la plus proche (puis la plus ancienne). */
export function plusProche<T extends { date: string; id?: string }>(cands: T[], dateIso: string): T | null {
  if (!cands.length) return null;
  const ref = new Date(dateIso + 'T12:00:00Z').getTime();
  const ecart = (d: string) => Math.abs(new Date(String(d).slice(0, 10) + 'T12:00:00Z').getTime() - ref);
  return [...cands].sort((a, b) => ecart(a.date) - ecart(b.date) || String(a.date).localeCompare(String(b.date)) || String(a.id || '').localeCompare(String(b.id || '')))[0];
}
