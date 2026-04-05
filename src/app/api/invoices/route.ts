// ─── /api/invoices/route.ts ───────────────────────────────────────
// Coller dans : src/app/api/invoices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

async function requireAuth(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(h.slice(7));
  return user;
}

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  let q = supabaseAdmin.from('invoices').select('*').order('date', { ascending: false });
  if (searchParams.get('status')) q = q.eq('status', searchParams.get('status')!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('invoices').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Incrémenter le compteur de factures
  await supabaseAdmin.from('company_settings')
    .update({ value: String((parseInt((await supabaseAdmin.from('company_settings').select('value').eq('key','invoice_next').single()).data?.value || '1') + 1)) })
    .eq('key', 'invoice_next');
  return NextResponse.json({ invoice: data }, { status: 201 });
}
