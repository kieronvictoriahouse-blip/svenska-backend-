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

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .insert({ ...body, number })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data }, { status: 201 });
}
