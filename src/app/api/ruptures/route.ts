import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Demandes de remplacement : en attente, puis réponses reçues. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: rows } = await supabaseAdmin
    .from('order_line_choices').select('*').order('created_at', { ascending: false }).limit(200);

  const ids = Array.from(new Set((rows || []).map(r => r.order_id)));
  const { data: orders } = await supabaseAdmin
    .from('orders').select('id, order_number, customer_name, customer_email, status')
    .in('id', ids.length ? ids : ['-']);
  const byId = Object.fromEntries((orders || []).map(o => [o.id, o]));

  return NextResponse.json({
    ruptures: (rows || []).map(r => ({ ...r, order: byId[r.order_id] || null })),
  });
}

/** Clôture une demande une fois traitée (remboursement effectué, colis parti…). */
export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Identifiant manquant' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('order_line_choices').update({ status: 'done' }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
