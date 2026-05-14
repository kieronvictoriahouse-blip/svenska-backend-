import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;

  // Chercher par id ou par order_id
  let invoice: any = null;

  const byId = await supabaseAdmin.from('invoices').select('*').eq('id', id).maybeSingle();
  if (byId.data) {
    invoice = byId.data;
  } else {
    // Plusieurs factures possibles (facture + avoir) → prendre la facture originale
    const byOrder = await supabaseAdmin
      .from('invoices').select('*').eq('order_id', id).neq('status', 'avoir')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (byOrder.data) invoice = byOrder.data;
  }

  if (!invoice) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });

  // Parser les lignes si besoin
  if (typeof invoice.lines === 'string') {
    try { invoice.lines = JSON.parse(invoice.lines); } catch { invoice.lines = []; }
  }

  return NextResponse.json({ invoice });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const allowed = ['status', 'note', 'date'];
  const payload: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) payload[k] = body[k];
  }
  const { data, error } = await supabaseAdmin
    .from('invoices').update(payload).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}
