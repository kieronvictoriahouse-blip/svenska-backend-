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

  /* Le statut porte le SENS de la pièce : « avoir » est le seul marqueur
     d'un avoir (PDF, Factur-X 381, livres). Un « Marquer payée » sur un
     avoir en faisait une facture payée au montant négatif. Un avoir ou
     une facture remboursée ne change plus de statut, et personne ne
     pose ces deux statuts à la main. */
  if ('status' in payload) {
    const { data: actuelle } = await supabaseAdmin
      .from('invoices').select('status, paid_at').eq('id', params.id).maybeSingle();
    if (!actuelle) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
    if (payload.status !== actuelle.status) {
      if (['avoir', 'refunded'].includes(actuelle.status)) {
        return NextResponse.json({ error: 'Un avoir ou une facture remboursée ne change pas de statut.' }, { status: 422 });
      }
      if (!['draft', 'sent', 'paid', 'late'].includes(String(payload.status))) {
        return NextResponse.json({ error: `Statut « ${payload.status} » non autorisé` }, { status: 400 });
      }
      // Date d'encaissement : la facture affiche « acquittée le … ».
      if (payload.status === 'paid' && !actuelle.paid_at && !('paid_at' in payload)) payload.paid_at = new Date().toISOString();
    }
  }
  const { data, error } = await supabaseAdmin
    .from('invoices').update(payload).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}
