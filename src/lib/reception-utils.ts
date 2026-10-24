import { supabaseAdmin } from './supabase';

/** Lignes JSON d'une réception ou d'une commande d'achat. */
export const lignesDe = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

/** Quantité reçue d'une ligne de réception. Deux nommages coexistent :
 *  `received_qty` (réception depuis une commande) et `qty_received`
 *  (réceptions créées par un ticket de caisse avant correction). */
export const recuDe = (l: any): number =>
  parseInt(l?.received_qty ?? l?.qty_received) || 0;

export async function applyStockAndPmp(line: any, reason: string, reference?: string) {
  const receivedQty = recuDe(line);
  /* Une quantité négative n'est pas une réception : ce serait une sortie
     de stock déguisée, avec un PMP recalculé à l'envers. */
  if (receivedQty <= 0) return;
  /* `unit_cost_eur` d'abord : les anciennes lignes de ticket portaient
     dans `unit_cost` le prix en couronnes. */
  const unitCostEur = parseFloat(line.unit_cost_eur ?? line.unit_cost) || 0;

  const { data: product } = await supabaseAdmin.from('products')
    .select('stock, cost_price, bundle_items').eq('id', line.product_id).single();
  if (!product) return;
  /* Une box n'a pas de rayon (migration 054) et son coût suit une règle
     fixe — somme des sachets + emballage. Recevoir « une box » lui posait
     un stock fantôme, passait track_stock à vrai et écrasait ce coût par
     un PMP. On refuse : ce sont ses sachets qu'on réceptionne. */
  const { composition } = await import('./lots');
  if (composition((product as any).bundle_items)) {
    throw new Error('box : réceptionner ses sachets, pas la box');
  }

  const currentStock = Number(product.stock) || 0;
  const currentPmp = Number(product.cost_price) || 0;

  /* PMP = (stock × pmp + qté reçue × prix d'achat) / (stock + qté reçue)
     Deux cas faussaient la moyenne :
     · un stock négatif (vendu à découvert) ne porte aucun coût — ces
       unités seront servies par ce qui arrive. −3 en rayon à 1,50 € et
       10 reçus à 2,00 € donnaient 2,21 € au lieu de 2,00 € ;
     · sans PMP connu (stock saisi à la main), le « coût 0 » des unités
       en rayon divisait le prix réel : 20 en rayon, 10 reçus à 3 € →
       1 €. On repart alors du prix d'achat. */
  const base = Math.max(0, currentStock);
  const newPmp = base > 0 && currentPmp > 0
    ? ((base * currentPmp) + (receivedQty * unitCostEur)) / (base + receivedQty)
    : unitCostEur;

  /* Le PMP et le suivi se posent d'abord — ils ne touchent pas à la
     quantité, adjustStock s'en charge juste après. */
  await supabaseAdmin.from('products').update({
    track_stock: true,
    cost_price: Math.round(newPmp * 10000) / 10000,
  }).eq('id', line.product_id);

  /* La quantité passe par adjustStock, comme tout le reste.
     Avant, ce fichier écrivait le stock à la main et posait un mouvement
     sans delta ni photo avant/après : la chaîne du journal se coupait à
     chaque réception, et c'est précisément par les réceptions que la
     marchandise entre. Le contrôle « la chaîne tient-elle ? » de
     scripts/audit-stock.js ne pouvait rien voir en amont.
     La référence (numéro de réception) rattache le mouvement à sa
     réception : c'est elle qui empêche un rejeu de compter deux fois. */
  const { adjustStock } = await import('./stock');
  await adjustStock(line.product_id, receivedQty, { reason, reference });
}

/**
 * Recalcule ce qui a été reçu sur une commande d'achat, et son statut.
 *
 * Avant, toute réception passait la commande en « reçue », même
 * partielle : le reliquat disparaissait du réappro (plus « en route »),
 * et la garde contre la double réception interdisait de le recevoir.
 * Désormais : tout reçu → `received`, une partie → `partial`, plus
 * aucune réception valide → retour à `confirmed`.
 *
 * Le cumul reçu est écrit dans `received_qty` de chaque ligne de la
 * commande : c'est ce que lisent le réappro et les suggestions pour ne
 * pas recommander ce qui est déjà arrivé.
 */
export async function majCommandeAchat(poId: string): Promise<string | null> {
  const [{ data: po }, { data: recs }] = await Promise.all([
    supabaseAdmin.from('purchase_orders').select('id, status, lines').eq('id', poId).maybeSingle(),
    supabaseAdmin.from('receptions').select('lines, status')
      .eq('purchase_order_id', poId).neq('status', 'cancelled'),
  ]);
  if (!po) return null;

  const recu: Record<string, number> = {};
  for (const r of recs || []) {
    for (const l of lignesDe(r.lines)) {
      if (l.product_id) recu[l.product_id] = (recu[l.product_id] || 0) + recuDe(l);
    }
  }

  /* Une même référence peut figurer sur deux lignes : le reçu se verse
     ligne après ligne, dans l'ordre de la commande. */
  const reste = { ...recu };
  let complet = true;
  const lignes = lignesDe(po.lines).map((l: any) => {
    if (!l.product_id) return l;
    const qte = Number(l.qty) || 0;
    const pris = Math.max(0, Math.min(qte, reste[l.product_id] || 0));
    reste[l.product_id] = (reste[l.product_id] || 0) - pris;
    if (pris < qte) complet = false;
    return { ...l, received_qty: pris };
  });

  const statut = !(recs || []).length
    ? (['received', 'partial'].includes(po.status) ? 'confirmed' : po.status)
    : (complet ? 'received' : 'partial');

  await supabaseAdmin.from('purchase_orders').update({
    lines: JSON.stringify(lignes),
    status: statut,
    updated_at: new Date().toISOString(),
  }).eq('id', poId);

  return statut;
}
