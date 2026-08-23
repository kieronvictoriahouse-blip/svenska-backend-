import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Une facture porte le nom, l'adresse et les montants du client :
  // elle ne doit jamais etre lisible par simple identifiant.
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
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
  // Une facture porte le nom, l'adresse et les montants du client :
  // elle ne doit jamais etre lisible par simple identifiant.
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();

  /* Le CONTENU d'une facture émise ne se modifie pas — il se corrige
     par avoir (art. 242 nonies A CGI, et le chaînage d'intégrité le
     détecterait de toute façon). Seul le cycle de vie reste mobile :
     statut, encaissement, note interne. `date` a quitté la liste : la
     date d'émission fait partie du contenu scellé. */
  const allowed = ['status', 'note', 'paid_at', 'payment_method'];
  const payload: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) payload[k] = body[k];
  }
  if ('date' in body) {
    return NextResponse.json({
      error: 'La date d’émission d’une facture ne se modifie pas — créez un avoir puis une nouvelle facture.',
    }, { status: 422 });
  }
  const { data, error } = await supabaseAdmin
    .from('invoices').update(payload).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}
