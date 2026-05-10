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

  await supabaseAdmin.from('products').update({
    stock: newStock,
    track_stock: true,
    cost_price: Math.round(newPmp * 10000) / 10000,
  }).eq('id', line.product_id);

  await supabaseAdmin.from('stock_movements').insert({
    product_id: line.product_id,
    quantity: receivedQty,
    type: 'in',
    reason,
  });
}
