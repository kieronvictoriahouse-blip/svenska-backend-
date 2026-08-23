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

  /* Tout passe par lib/stock — le SEUL point d'écriture. Cette route
     dupliquait sa logique (lecture, écriture, journal) : deux copies
     d'un même geste finissent toujours par diverger, et celle-ci avait
     déjà divergé une fois (le plancher à zéro qui faisait mentir le
     journal).

     Deux gestes distincts, et la distinction compte :
     · `counted` — l'inventaire pose une valeur ABSOLUE : « j'ai compté
       7 » finit à 7 même si une vente passe pendant la saisie ;
     · `delta` — la variation s'additionne atomiquement à l'état réel. */
  const { adjustStock, poserStock } = await import('@/lib/stock');
  for (const it of items) {
    const productId = it.product_id;
    if (!productId) continue;
    try {
      const options = {
        reason: it.reason || reason,
        reference: it.reference || reference || undefined,
        note: it.note || undefined,
      };
      const r = it.counted != null
        ? await poserStock(productId, Number(it.counted), options)
        : await adjustStock(productId, Number(it.delta) || 0, options);
      if (r) applied.push(r);
      else if (it.counted == null && !(Number(it.delta) || 0)) { /* delta nul : rien à faire */ }
      else if (!r) failed.push(productId);
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
