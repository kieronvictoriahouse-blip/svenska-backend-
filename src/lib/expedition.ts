import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   EXPÉDITION — ce qui reste dû et sa sortie de stock

   Deux chemins font partir une commande :
   · l'écran de préparation (POST /api/orders/[id]/expedier), colis par
     colis ;
   · le statut posé à la main (« Marquer expédiée », puces de statut,
     étiquette Mondial Relay), qui solde tout ce qui reste dû.

   Le second ne sortait RIEN du stock : la commande quittait les statuts
   « dus », sa réservation tombait (@/lib/reserve), mais `products.stock`
   restait plein. Chaque commande expédiée ainsi laissait sur l'étage
   autant d'unités fantômes que d'articles partis. Les deux chemins
   passent désormais par ici.
   ═══════════════════════════════════════════════════════════════ */

/** Statuts d'une commande dont la marchandise est due et peut partir
 *  (les mêmes que STATUTS_DUS de @/lib/reserve). */
export const STATUTS_EXPEDIABLES = ['paid', 'confirmed', 'preparing', 'partial'];

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

/** Quantité commandée par produit. Une même référence peut figurer sur
 *  deux lignes (un remplacement de rupture en ajoute une) : on cumule. */
export function duParProduit(lines: any): Record<string, number> {
  const du: Record<string, number> = {};
  for (const l of J(lines)) {
    if (!l?.product_id) continue;
    du[l.product_id] = (du[l.product_id] || 0) + (Number(l.qty) || 0);
  }
  return du;
}

/** Ce qui n'est pas encore parti, par produit (commande − shipped_qty). */
export function resteDu(order: { lines: any; shipped_qty?: any }): Record<string, number> {
  const du = duParProduit(order.lines);
  const deja: Record<string, number> = order.shipped_qty || {};
  const reste: Record<string, number> = {};
  for (const [pid, n] of Object.entries(du)) {
    const r = n - (Number(deja[pid]) || 0);
    if (r > 0) reste[pid] = r;
  }
  return reste;
}

/**
 * Sort du stock un colis DÉJÀ réclamé par la commande (shipped_qty écrit
 * avant l'appel : c'est la garde contre le double passage).
 *
 * Une box (migration 054) n'a pas de rayon : ce sont ses sachets qui
 * partent dans le carton, donc eux qui sortent. Les produits non suivis
 * en stock sont comptés comme appliqués sans écriture.
 */
export async function sortirColis(
  order: { id: string; order_number?: string | null },
  colis: Record<string, number>,
): Promise<{
  applied: Array<{ product_id: string; qty: number; box?: string }>;
  echecs: Array<{ product_id: string; erreur: string }>;
}> {
  const applied: Array<{ product_id: string; qty: number; box?: string }> = [];
  const echecs: Array<{ product_id: string; erreur: string }> = [];
  if (!Object.keys(colis).length) return { applied, echecs };

  const { adjustStock } = await import('@/lib/stock');
  const { chargerLots } = await import('@/lib/lots');
  const lots = await chargerLots();
  const sorties: Array<{ product_id: string; qty: number; box?: string }> = [];
  for (const [pid, n] of Object.entries(colis)) {
    if (!(n > 0)) continue;
    if (lots[pid]) for (const it of lots[pid]) sorties.push({ product_id: it.product_id, qty: n * it.qty, box: pid });
    else sorties.push({ product_id: pid, qty: n });
  }
  if (!sorties.length) return { applied, echecs };

  const { data: produits } = await supabaseAdmin
    .from('products').select('id, track_stock')
    .in('id', Array.from(new Set(sorties.map(s => s.product_id))));
  const suivi = new Set((produits || []).filter((p: any) => p.track_stock === true).map((p: any) => p.id));

  const ref = order.order_number || order.id;
  for (const s of sorties) {
    if (!suivi.has(s.product_id)) { applied.push(s); continue; }
    try {
      /* `order_id` rattache la sortie à la commande : c'est ce qui rend
         l'anomalie détectable après coup et la remise en stock exacte. */
      await adjustStock(s.product_id, -s.qty, {
        reason: 'picking',
        reference: ref,
        order_id: order.id,
        note: s.box ? `Expédition ${ref} — dans une box` : `Expédition ${ref}`,
      });
      applied.push(s);
    } catch (e: any) {
      echecs.push({ product_id: s.product_id, erreur: e?.message || 'erreur inconnue' });
    }
  }
  return { applied, echecs };
}
