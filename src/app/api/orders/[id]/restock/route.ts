import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from('orders').select('lines').eq('id', params.id).single();
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  const lines = Array.isArray(order.lines) ? order.lines
    : typeof order.lines === 'string' ? JSON.parse(order.lines)
    : [];

  let restocked = 0;
  for (const line of lines) {
    if (!line.product_id || !line.qty) continue;
    const qty = parseInt(line.qty) || 0;
    if (!qty) continue;

    const { data: product } = await supabaseAdmin
      .from('products').select('stock, track_stock').eq('id', line.product_id).single();
    if (!product?.track_stock) continue;

    await supabaseAdmin.from('products')
      .update({ stock: (product.stock || 0) + qty })
      .eq('id', line.product_id);

    restocked++;
  }

  return NextResponse.json({ ok: true, restocked });
}
