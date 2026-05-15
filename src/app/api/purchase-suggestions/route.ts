import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  // Produits avec suivi de stock
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name_fr, stock, stock_alert, cost_price, track_stock')
    .eq('track_stock', true)
    .eq('is_active', true);

  if (!products?.length) return NextResponse.json({ suggestions: [] });

  // Ventes des 30 derniers jours (commandes paid/shipped/delivered, non test)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('lines')
    .in('status', ['paid', 'shipped', 'delivered'])
    .or('is_test.is.null,is_test.eq.false')
    .gte('created_at', since);

  // Agréger les ventes par product_id
  const salesMap: Record<string, number> = {};
  for (const order of orders || []) {
    const lines = Array.isArray(order.lines) ? order.lines
      : typeof order.lines === 'string' ? (() => { try { return JSON.parse(order.lines); } catch { return []; } })()
      : [];
    for (const line of lines) {
      if (line.product_id) {
        salesMap[line.product_id] = (salesMap[line.product_id] || 0) + (parseInt(line.qty) || 0);
      }
    }
  }

  const suggestions = products
    .map(p => {
      const sold30 = salesMap[p.id] || 0;
      const velocity = sold30 / 30; // unités/jour
      const stock = p.stock ?? 0;
      const alert = p.stock_alert ?? 5;

      // Jours de stock restant (si velocity > 0)
      const daysLeft = velocity > 0 ? Math.floor(stock / velocity) : (stock > 0 ? 999 : 0);

      // Qté suggérée = couvrir 60 jours - stock actuel, min 5 si rupture
      const suggested = Math.max(
        Math.ceil(velocity * 60) - stock,
        stock <= 0 ? 10 : 0,
      );

      const urgency = stock <= 0 ? 'rupture' : stock <= alert ? 'faible' : daysLeft <= 14 ? 'attention' : null;

      return { ...p, sold30, velocity, daysLeft, suggested: Math.ceil(suggested), urgency };
    })
    .filter(p => p.urgency !== null || p.sold30 > 0)
    .sort((a, b) => {
      const order = { rupture: 0, faible: 1, attention: 2 };
      const oa = a.urgency ? order[a.urgency] : 3;
      const ob = b.urgency ? order[b.urgency] : 3;
      if (oa !== ob) return oa - ob;
      return b.sold30 - a.sold30;
    });

  return NextResponse.json({ suggestions });
}
