import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applyStockAndPmp } from '@/lib/reception-utils';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: reception, error } = await supabaseAdmin
    .from('receptions').select('*').eq('id', params.id).single();
  if (error || !reception) return NextResponse.json({ error: 'Réception introuvable' }, { status: 404 });

  const lines = typeof reception.lines === 'string' ? JSON.parse(reception.lines) : reception.lines || [];
  const reason = `Rejeu réception ${reception.number} — ${reception.supplier_name || ''}`;

  for (const line of lines) {
    if (!line.product_id || !line.received_qty) continue;
    await applyStockAndPmp(line, reason);
  }

  return NextResponse.json({ success: true, replayed: lines.length });
}
