import { supabaseAdmin } from './supabase';

export async function applyStockAndPmp(line: any, reason: string) {
  const receivedQty = parseInt(line.received_qty) || 0;
  if (!receivedQty) return;
  const unitCostEur = parseFloat(line.unit_cost) || 0;

  const { data: product } = await supabaseAdmin.from('products')
    .select('stock, cost_price').eq('id', line.product_id).single();
  if (!product) return;

  const currentStock = product.stock || 0;
  const currentPmp = product.cost_price || 0;
  const newStock = currentStock + receivedQty;

  // PMP = (stock_actuel × pmp_actuel + qté_reçue × prix_achat) / nouveau_stock
  const newPmp = newStock > 0
    ? ((currentStock * currentPmp) + (receivedQty * unitCostEur)) / newStock
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
     scripts/audit-stock.js ne pouvait rien voir en amont. */
  const { adjustStock } = await import('./stock');
  await adjustStock(line.product_id, receivedQty, { reason });
}
