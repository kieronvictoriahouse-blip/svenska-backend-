import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

/* Mouvement de stock tracé.
   Toute variation passe par ici : réception, picking, inventaire.
   L'écriture de products.stock seule ne laisse aucune trace — or un
   écart d'inventaire doit être daté et justifiable. */

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const items: any[] = Array.isArray(body.items) ? body.items : [body];
  const reason = body.reason || 'manual';
  const reference = body.reference || null;

  const applied: any[] = [];
  const failed: string[] = [];

  for (const it of items) {
    const productId = it.product_id;
    if (!productId) continue;

    try {
      const { data: prod } = await supabaseAdmin
        .from('products').select('id, name_fr, stock').eq('id', productId).single();
      if (!prod) { failed.push(productId); continue; }

      const before = Number(prod.stock) || 0;
      // Soit un delta, soit une quantité comptée absolue (inventaire).
      const delta = it.counted != null ? (Number(it.counted) - before) : (Number(it.delta) || 0);
      if (!delta) continue;

      const after = Math.max(0, before + delta);

      await supabaseAdmin.from('products').update({ stock: after }).eq('id', productId);
      await supabaseAdmin.from('stock_movements').insert({
        product_id: productId,
        delta, qty_before: before, qty_after: after,
        reason: it.reason || reason,
        reference: it.reference || reference,
        note: it.note || null,
      });

      applied.push({ product_id: productId, name: prod.name_fr, before, after, delta });
    } catch {
      failed.push(productId);
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    applied,
    ...(failed.length ? { failed } : {}),
  });
}
