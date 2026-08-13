import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { restoreSaleStock } from '@/lib/stock';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from('orders').select('lines').eq('id', params.id).single();
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  const lines = Array.isArray(order.lines) ? order.lines
    : typeof order.lines === 'string' ? JSON.parse(order.lines)
    : [];

  // Passe par restoreSaleStock : la remise se cale sur les mouvements
  // réellement enregistrés pour cette commande, et l'ancienne garde
  // « track_stock = false → on ignore » disparaît (elle perdait la ligne).
  const r = await restoreSaleStock(lines, params.id);
  const restocked = r.applied.length;

  return NextResponse.json({ ok: true, restocked });
}
