import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   LOTS (box) — migration 054

   Un lot est un produit vendu comme les autres, mais composé d'autres
   produits du catalogue (`products.bundle_items`). Il n'a PAS de stock
   propre : tout se ramène à ses composants, et c'est ici seulement que
   se fait cette traduction.

   Règles, alignées sur celles du stock (cf. reserve.ts, stock.ts) :
     · une box PAYÉE réserve ses sachets ;
     · une box est DISPONIBLE tant que chacun de ses sachets l'est :
       son disponible est le minimum, sachet par sachet ;
     · à l'EXPÉDITION, ce sont les sachets qui sortent du rayon ;
     · un RETOUR fait rentrer les sachets, pas la box.

   Partout où l'on raisonne sur des lignes de commande pour parler de
   stock (réservé, vendu, vitesse de vente…), on « développe » d'abord
   les lignes de box en lignes de sachets avec `developper()`.
   ═══════════════════════════════════════════════════════════════ */

export type LotItem = { product_id: string; qty: number };
/** Composition par identifiant de box. */
export type Lots = Record<string, LotItem[]>;

/** Lit et nettoie une composition : quantités entières > 0, sachets regroupés. */
export function composition(brut: any): LotItem[] | null {
  let v = brut;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(v)) return null;
  const out: LotItem[] = [];
  for (const it of v) {
    const id = String(it?.product_id || '').trim();
    const qty = Math.trunc(Number(it?.qty) || 0);
    if (!id || qty <= 0) continue;
    const hit = out.find(x => x.product_id === id);
    if (hit) hit.qty += qty; else out.push({ product_id: id, qty });
  }
  return out.length ? out : null;
}

/** Toutes les box du catalogue et leur composition. */
export async function chargerLots(): Promise<Lots> {
  const { data } = await supabaseAdmin
    .from('products').select('id, bundle_items').not('bundle_items', 'is', null);
  const lots: Lots = {};
  for (const p of data || []) {
    const c = composition((p as any).bundle_items);
    if (c) lots[(p as any).id] = c;
  }
  return lots;
}

/**
 * Remplace chaque ligne de box par ses sachets (quantités multipliées).
 * Les lignes ordinaires passent telles quelles. Une box qui contiendrait
 * une box est développée une seule fois : pas de récursion, une
 * composition circulaire ne peut donc pas boucler.
 */
export function developper<T extends { product_id?: string | null; qty?: number | string | null }>(
  lignes: T[],
  lots: Lots,
): Array<{ product_id: string; qty: number }> {
  const out: Record<string, number> = {};
  for (const l of lignes || []) {
    const id = l?.product_id ? String(l.product_id) : '';
    const n = Number(l?.qty) || 0;
    if (!id || n <= 0) continue;
    const c = lots[id];
    if (c) for (const it of c) out[it.product_id] = (out[it.product_id] || 0) + n * it.qty;
    else out[id] = (out[id] || 0) + n;
  }
  return Object.entries(out).map(([product_id, qty]) => ({ product_id, qty }));
}

/** Même chose pour une table « id → quantité » (shipped_qty, colis…). */
export function developperQuantites(q: Record<string, number> | null | undefined, lots: Lots): Record<string, number> {
  const lignes = Object.entries(q || {}).map(([product_id, qty]) => ({ product_id, qty: Number(qty) || 0 }));
  return Object.fromEntries(developper(lignes, lots).map(l => [l.product_id, l.qty]));
}

/**
 * Disponible d'une box à partir du disponible de ses sachets.
 * `dispo(id)` renvoie le disponible d'un sachet, ou null s'il n'est pas
 * suivi en stock (il ne limite alors rien). Si aucun sachet n'est suivi,
 * la box ne l'est pas non plus : null.
 */
export function disponibleLot(items: LotItem[], dispo: (id: string) => number | null): number | null {
  let min: number | null = null;
  for (const it of items) {
    const d = dispo(it.product_id);
    if (d === null) continue;
    const possible = Math.floor(Math.max(0, d) / it.qty);
    min = min === null ? possible : Math.min(min, possible);
  }
  return min;
}

/**
 * Disponible des box demandées, calculé à partir du rayon et du réservé
 * de leurs sachets. Charge lui-même ce dont il a besoin.
 */
export async function disponiblesLots(
  lots: Lots,
  boxIds: string[],
  reserve: Record<string, number>,
): Promise<Record<string, number | null>> {
  const ids = boxIds.filter(id => lots[id]);
  if (!ids.length) return {};
  const composants = Array.from(new Set(ids.flatMap(id => lots[id].map(i => i.product_id))));
  const { data } = await supabaseAdmin
    .from('products').select('id, stock, track_stock').in('id', composants);
  const parId = Object.fromEntries((data || []).map((p: any) => [p.id, p]));
  const dispo = (id: string): number | null => {
    const p = parId[id];
    if (!p || p.track_stock !== true || typeof p.stock !== 'number') return null;
    return p.stock - (reserve[id] || 0);
  };
  return Object.fromEntries(ids.map(id => [id, disponibleLot(lots[id], dispo)]));
}
