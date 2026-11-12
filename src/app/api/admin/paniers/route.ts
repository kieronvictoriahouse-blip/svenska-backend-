import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   PANIERS EN COURS — lecture pour l'écran /admin/paniers

   GET ?h=24 → paniers actifs depuis h heures (24 par défaut, 168 max),
   le plus récent en tête, avec l'état de la commande quand le client
   est passé au paiement. Purge au passage ce qui a plus de 7 jours.
   ═══════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const h = Math.min(168, Math.max(1, Number(new URL(req.url).searchParams.get('h')) || 24));
  const depuis = new Date(Date.now() - h * 3600_000).toISOString();

  await supabaseAdmin.from('live_carts').delete().lt('updated_at', new Date(Date.now() - 7 * 86400_000).toISOString());

  const { data, error } = await supabaseAdmin.from('live_carts')
    .select('sid, items, nb, total, page, lang, mobile, order_id, created_at, updated_at')
    .gte('updated_at', depuis).gt('nb', 0)
    .order('updated_at', { ascending: false }).limit(200);
  if (error) {
    /* Migration 069 pas encore passée : l'écran le dit au lieu de planter. */
    return NextResponse.json({ paniers: [], migration: !/live_carts/.test(error.message) ? null : '069' });
  }

  const ids = Array.from(new Set((data || []).map(p => p.order_id).filter(Boolean))) as string[];
  const commandes: Record<string, { order_number: string; status: string; total: number }> = {};
  if (ids.length) {
    const { data: o } = await supabaseAdmin.from('orders').select('id, order_number, status, total').in('id', ids);
    for (const c of o || []) commandes[c.id] = { order_number: c.order_number, status: c.status, total: Number(c.total) };
  }

  return NextResponse.json({
    maintenant: new Date().toISOString(),
    paniers: (data || []).map(p => ({ ...p, total: Number(p.total), commande: p.order_id ? commandes[p.order_id] || null : null })),
  });
}
