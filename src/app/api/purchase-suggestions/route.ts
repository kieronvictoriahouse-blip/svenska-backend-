import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  // Produits avec suivi de stock
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name_fr, stock, stock_alert, cost_price, track_stock, reorder_qty')
    .eq('track_stock', true)
    .eq('is_active', true);

  if (!products?.length) return NextResponse.json({ suggestions: [] });

  // Fenêtre de vélocité : 90 j (30 j trop court pour une boutique jeune / ventes
  // sporadiques, et masque les produits en rupture depuis > 30 j).
  const WINDOW_DAYS = 90;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('lines')
    .in('status', ['paid', 'confirmed', 'shipped', 'delivered'])
    .or('is_test.is.null,is_test.eq.false')
    .gte('created_at', since);

  const parseLines = (raw: any): any[] =>
    Array.isArray(raw) ? raw
    : typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })()
    : [];

  // Agréger les ventes par product_id
  const salesMap: Record<string, number> = {};
  for (const order of orders || []) {
    for (const line of parseLines(order.lines)) {
      if (line.product_id) {
        salesMap[line.product_id] = (salesMap[line.product_id] || 0) + (parseFloat(line.qty) || 0);
      }
    }
  }

  // Quantités déjà commandées mais pas encore reçues (POs en cours) → à déduire
  // pour ne pas suggérer de recommander ce qui est déjà en route.
  const { data: pos } = await supabaseAdmin
    .from('purchase_orders')
    .select('lines, status')
    .in('status', ['sent', 'confirmed', 'partial']);
  const onOrderMap: Record<string, number> = {};
  for (const po of pos || []) {
    for (const line of parseLines(po.lines)) {
      if (line.product_id) {
        const remaining = (parseFloat(line.qty) || 0) - (parseFloat(line.received_qty) || 0);
        if (remaining > 0) onOrderMap[line.product_id] = (onOrderMap[line.product_id] || 0) + remaining;
      }
    }
  }

  const suggestions = products
    .map(p => {
      const sold = salesMap[p.id] || 0;
      const velocity = sold / WINDOW_DAYS; // unités/jour sur la fenêtre
      const stock = p.stock ?? 0;
      const onOrder = onOrderMap[p.id] || 0;
      const effectiveStock = stock + onOrder; // ce qu'on aura une fois les POs reçues
      const alert = p.stock_alert ?? 5;
      // Quantité de réappro minimum par produit (ex. carton de 50), défaut 10
      const minReorder = p.reorder_qty && p.reorder_qty > 0 ? p.reorder_qty : 10;

      // Jours de stock restant (compte le stock déjà commandé)
      const daysLeft = velocity > 0 ? Math.floor(effectiveStock / velocity) : (effectiveStock > 0 ? 999 : 0);

      // Besoin = couvrir 60 jours − (stock + déjà commandé). Si on réapprovisionne,
      // on ne descend jamais sous la quantité mini du produit (MOQ/carton).
      const need = Math.ceil(velocity * 60) - effectiveStock;
      const suggested = (need > 0 || effectiveStock <= 0) ? Math.max(need, minReorder) : 0;

      const urgency = effectiveStock <= 0 ? 'rupture' : effectiveStock <= alert ? 'faible' : daysLeft <= 14 ? 'attention' : null;

      return { ...p, sold, sold30: sold, velocity, onOrder, daysLeft, suggested: Math.ceil(suggested), urgency, minReorder, windowDays: WINDOW_DAYS };
    })
    .filter(p => p.urgency !== null || p.sold > 0)
    .sort((a, b) => {
      const order: Record<string, number> = { rupture: 0, faible: 1, attention: 2 };
      const oa = a.urgency ? (order[a.urgency] ?? 3) : 3;
      const ob = b.urgency ? (order[b.urgency] ?? 3) : 3;
      if (oa !== ob) return oa - ob;
      return b.sold30 - a.sold30;
    });

  return NextResponse.json({ suggestions });
}
