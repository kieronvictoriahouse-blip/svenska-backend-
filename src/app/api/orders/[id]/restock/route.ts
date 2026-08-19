import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { restoreSaleStock } from '@/lib/stock';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from('orders').select('lines, shipped_qty, order_number, status').eq('id', params.id).single();
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  const lines = Array.isArray(order.lines) ? order.lines
    : typeof order.lines === 'string' ? JSON.parse(order.lines)
    : [];

  /* On passe shipped_qty : c'est lui qui dit ce qui a réellement quitté
     l'étagère. Sans ça, une commande jamais expédiée se verrait
     recréditer intégralement — de la marchandise qui n'est jamais
     sortie, donc du stock inventé. */
  const expedie: Record<string, number> = (order as any).shipped_qty || {};
  /* Commande expédiée avant l'existence de shipped_qty : tout est parti. */
  if (!Object.keys(expedie).length && ['shipped', 'delivered'].includes((order as any).status)) {
    for (const l of lines) {
      if (l?.product_id) expedie[l.product_id] = (expedie[l.product_id] || 0) + (Number(l.qty) || 0);
    }
  }

  const r = await restoreSaleStock(lines, params.id, (order as any).order_number, expedie);

  return NextResponse.json({
    ok: true,
    restocked: r.applied.length,
    // Ce qui n'est jamais sorti n'a pas à rentrer : on le dit plutôt que
    // de laisser croire à une remise en stock silencieusement ignorée.
    ignores: r.skipped.length,
  });
}
