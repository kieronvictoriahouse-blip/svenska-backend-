import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { adjustStock } from '@/lib/stock';

/* ═══════════════════════════════════════════════════════════════
   REMISE EN STOCK D'UNE COMMANDE ANNULÉE OU REMBOURSÉE

   On ne fait rentrer que ce qui est SORTI et pas encore RENTRÉ.

   L'ancienne version recréditait tout ce qui était sorti, à chaque
   appel : un double toucher sur « Oui, réincrémenter », ou une remise en
   stock demandée après un remboursement qui avait déjà fait rentrer les
   articles, et la marchandise rentrait deux fois.

   Le solde se lit au journal : sorties rattachées à la commande (par
   order_id ou par sa référence) moins les retours déjà faits. Sans
   sortie journalisée, shipped_qty dit ce qui est parti — et, pour une
   commande expédiée avant shipped_qty, tout est parti.
   ═══════════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from('orders').select('id, lines, shipped_qty, order_number, status, is_test').eq('id', params.id).single();
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  /* Remettre en rayon la marchandise d'une commande toujours vivante,
     c'est inventer du stock qu'elle va de nouveau consommer. */
  if (!['cancelled', 'refunded'].includes((order as any).status)) {
    return NextResponse.json({ error: 'Seule une commande annulée ou remboursée se remet en stock.' }, { status: 409 });
  }

  const lines: any[] = Array.isArray(order.lines) ? order.lines
    : typeof order.lines === 'string' ? JSON.parse(order.lines)
    : [];
  const ref = (order as any).order_number || params.id;

  const { data: mouvements } = await supabaseAdmin
    .from('stock_movements').select('id, product_id, delta, quantity, type, reason')
    .or(`order_id.eq.${params.id},reference.eq.${ref}`);

  const sortis: Record<string, number> = {};
  const rentres: Record<string, number> = {};
  const vus = new Set<string>();
  for (const m of mouvements || []) {
    if (!m.product_id || vus.has(m.id)) continue;
    vus.add(m.id);
    const d = Number(m.delta ?? (m.type === 'out' ? -(m.quantity || 0) : (m.quantity || 0))) || 0;
    if (d < 0) sortis[m.product_id] = (sortis[m.product_id] || 0) - d;
    else if (d > 0 && m.reason === 'order_restock') rentres[m.product_id] = (rentres[m.product_id] || 0) + d;
  }

  /* Aucune sortie au journal : shipped_qty fait foi (au niveau des box,
     développé en sachets). Commande partie avant shipped_qty : tout. */
  if (!Object.keys(sortis).length) {
    const expedie: Record<string, number> = { ...((order as any).shipped_qty || {}) };
    if (!Object.keys(expedie).length && ['shipped', 'delivered'].includes((order as any).status)) {
      for (const l of lines) {
        if (l?.product_id) expedie[l.product_id] = (expedie[l.product_id] || 0) + (Number(l.qty) || 0);
      }
    }
    const { chargerLots, developperQuantites } = await import('@/lib/lots');
    Object.assign(sortis, developperQuantites(expedie, await chargerLots()));
  }

  const { data: produits } = await supabaseAdmin
    .from('products').select('id, track_stock').in('id', Object.keys(sortis).length ? Object.keys(sortis) : ['-']);
  const suivi = new Set((produits || []).filter((p: any) => p.track_stock === true).map((p: any) => p.id));

  let restocked = 0, ignores = 0;
  const echecs: Array<{ product_id: string; erreur: string }> = [];
  for (const [pid, n] of Object.entries(sortis)) {
    const aRendre = Math.trunc(n - (rentres[pid] || 0));
    if (aRendre <= 0 || !suivi.has(pid)) { ignores++; continue; }
    try {
      await adjustStock(pid, aRendre, {
        reason: 'order_restock',
        reference: ref,
        order_id: params.id,
        note: `Retour en stock — commande ${ref}`,
      });
      restocked++;
    } catch (e: any) {
      echecs.push({ product_id: pid, erreur: e?.message || 'erreur inconnue' });
    }
  }

  return NextResponse.json({
    ok: true,
    restocked,
    // Ce qui n'est jamais sorti, ou déjà rentré, n'a pas à rentrer : on le dit.
    ignores,
    ...(echecs.length ? { echecs } : {}),
  });
}
