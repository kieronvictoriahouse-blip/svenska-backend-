import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   STOCK RÉSERVÉ

   Trois nombres, et il faut les distinguer :

     stock       ce qu'il y a physiquement sur l'étagère
     réservé     ce qui est dû à des commandes payées non expédiées
     disponible  stock − réservé, le seul qu'on puisse encore vendre

   Le modèle précédent déduisait le stock au PAIEMENT. La marchandise
   restait pourtant en rayon jusqu'à l'expédition : compter physiquement
   donnait donc toujours plus que ce qu'annonçait le système, et il
   fallait faire la soustraction de tête. Un inventaire ne devrait
   jamais demander ça.

   Le réservé est CALCULÉ, jamais stocké. Une colonne de plus serait une
   colonne de plus à faire dériver — et la dérive est précisément ce qui
   a coûté le plus cher ici. Il se déduit des commandes, qui font foi.
   ═══════════════════════════════════════════════════════════════ */

/** Statuts d'une commande dont la marchandise est due mais pas partie. */
export const STATUTS_DUS = ['paid', 'confirmed', 'preparing', 'partial'];

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

/**
 * Quantités dues, par produit.
 *
 * Une expédition partielle ne réserve plus que son reliquat : ce qui est
 * déjà parti a quitté l'étagère et n'a plus à être mis de côté.
 */
export async function quantitesReservees(): Promise<Record<string, number>> {
  const { data: commandes } = await supabaseAdmin
    .from('orders')
    .select('lines, shipped_qty, is_test')
    .in('status', STATUTS_DUS);

  const reserve: Record<string, number> = {};
  for (const o of commandes || []) {
    if (o.is_test) continue;                 // une commande de test ne bloque rien
    const deja = (o as any).shipped_qty || {};
    for (const l of J(o.lines)) {
      if (!l.product_id) continue;
      const du = (Number(l.qty) || 0) - (Number(deja[l.product_id]) || 0);
      if (du > 0) reserve[l.product_id] = (reserve[l.product_id] || 0) + du;
    }
  }
  return reserve;
}

/** Réservé pour un seul produit — évite de tout charger au checkout. */
export async function reservePour(productIds: string[]): Promise<Record<string, number>> {
  if (!productIds.length) return {};
  const tout = await quantitesReservees();
  return Object.fromEntries(productIds.map(id => [id, tout[id] || 0]));
}

/** Ce qu'on peut encore vendre. Peut être négatif : c'est un signal. */
export const disponible = (stock: any, reserve: any) =>
  (Number(stock) || 0) - (Number(reserve) || 0);
