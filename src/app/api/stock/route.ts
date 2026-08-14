import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { adjustStock } from '@/lib/stock';

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
  
  // Les seuils et le suivi ne touchent pas aux quantités : mise à jour directe.
  const { error: metaErr } = await supabaseAdmin.from('products')
    .update({ stock_alert, track_stock })
    .eq('id', id);
  if (metaErr) return NextResponse.json({ error: metaErr.message, details: (metaErr as any).details }, { status: 500 });

  /* La quantité, elle, passe par adjustStock : c'est le seul point du
     code autorisé à bouger products.stock, et il journalise le delta
     avec la photo avant/après. Une saisie manuelle laisse donc la même
     trace qu'une vente ou une réception. */
  const { data: current } = await supabaseAdmin.from('products').select('stock').eq('id', id).single();
  const diff = (Number(stock) || 0) - (Number(current?.stock) || 0);
  if (diff !== 0) {
    try {
      await adjustStock(id, diff, { reason: reason || 'manual', note: reason || 'Ajustement manuel' });
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
