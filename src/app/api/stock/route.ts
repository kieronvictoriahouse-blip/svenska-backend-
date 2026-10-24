import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);

  if (searchParams.get('history') === '1') {
    const { data, error } = await supabaseAdmin
      .from('stock_movements')
      .select('id, product_id, quantity, type, delta, qty_before, qty_after, reason, reference, note, order_id, created_at, products(name_fr)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ movements: data || [] });
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name_fr, stock, stock_alert, track_stock, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data || [] }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { id, stock, stock_alert, track_stock, reason } = body;
  if (!id) return NextResponse.json({ error: 'Identifiant manquant' }, { status: 400 });

  // Les seuils et le suivi ne touchent pas aux quantités : mise à jour directe.
  const meta: Record<string, unknown> = {};
  if (stock_alert !== undefined) meta.stock_alert = stock_alert;
  if (track_stock !== undefined) meta.track_stock = track_stock;
  if (Object.keys(meta).length) {
    const { error: metaErr } = await supabaseAdmin.from('products').update(meta).eq('id', id);
    if (metaErr) return NextResponse.json({ error: metaErr.message, details: (metaErr as any).details }, { status: 500 });
  }

  /* La quantité, elle, passe par lib/stock : c'est le seul point du
     code autorisé à bouger products.stock, et il journalise le delta
     avec la photo avant/après. Une saisie manuelle laisse donc la même
     trace qu'une vente ou une réception.
     · Absente du corps, elle ne bouge pas : `Number(undefined) || 0`
       remettait à ZÉRO le stock de qui ne changeait qu'un seuil.
     · Présente, c'est une valeur absolue : poserStock la pose sur l'état
       réel. Le delta calculé ici sur une lecture préalable s'appliquait
       à un état déjà périmé si une expédition passait entre-temps. */
  if (stock !== undefined && stock !== null && stock !== '') {
    const cible = Math.round(Number(stock));
    if (!Number.isFinite(cible) || cible < 0) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 });
    }
    try {
      const { poserStock } = await import('@/lib/stock');
      await poserStock(id, cible, { reason: reason || 'manual', note: reason || 'Ajustement manuel' });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Ajustement impossible' }, { status: 500 });
    }
  }

  // Relecture — détecte un trigger qui resetterait la valeur.
  const { data: verify } = await supabaseAdmin.from('products')
    .select('id, stock, stock_alert, track_stock')
    .eq('id', id)
    .single();

  return NextResponse.json({ success: true, updated: verify, verify });
}
