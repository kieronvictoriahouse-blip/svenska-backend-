// ─── /api/invoices/route.ts ───────────────────────────────────────
// Coller dans : src/app/api/invoices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { nextSequentialNumber } from '@/lib/invoice-utils';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  let q = supabaseAdmin.from('invoices').select('*').order('date', { ascending: false });
  if (searchParams.get('status')) q = q.eq('status', searchParams.get('status')!);
  if (searchParams.get('order_id')) q = q.eq('order_id', searchParams.get('order_id')!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();

  // Numéro séquentiel généré côté serveur — jamais celui fourni par le client
  // (Art. 242 nonies A CGI : séquence continue, unique, non falsifiable).
  const year = new Date((body.date as string) || Date.now()).getFullYear();
  const number = await nextSequentialNumber(`FAC-${year}-`);

  /* Le chaînage n'accepte pas qu'on lui impose ces colonnes. */
  delete (body as any).chain_hash; delete (body as any).chain_prev; delete (body as any).finalized_at;

  let data: any = null, error: any = null;
  for (let essai = 0; essai < 3 && !data; essai++) {
    const numero = essai === 0 ? number : await nextSequentialNumber(`FAC-${year}-`);
    const res = await supabaseAdmin.from('invoices').insert({ ...body, number: numero }).select().single();
    if (res.data) { data = res.data; break; }
    error = res.error;
    if (!/duplicate|unique/i.test(String(res.error?.message))) break;
  }
  if (!data) return NextResponse.json({ error: error?.message || 'Création impossible' }, { status: 500 });

  const { scellerFacture } = await import('@/lib/facture-integrite');
  await scellerFacture(data.id).catch(() => {});
  return NextResponse.json({ invoice: data }, { status: 201 });
}
