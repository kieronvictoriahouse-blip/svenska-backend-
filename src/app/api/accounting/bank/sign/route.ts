import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const round = (n: number) => Math.round(n * 100) / 100;

// POST { period } — fige et signe le rapprochement du mois (horodaté).
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { period } = await req.json().catch(() => ({}));
  if (!period) return NextResponse.json({ error: 'period requis' }, { status: 400 });

  const [{ data: txs }, { data: accounts }] = await Promise.all([
    supabaseAdmin.from('bank_transactions').select('amount, direction, reconciled, ignored').eq('period', period),
    supabaseAdmin.from('bank_accounts').select('balance'),
  ]);
  const left = (txs || []).filter(t => !t.reconciled && !t.ignored);
  if (left.length) return NextResponse.json({ error: `${left.length} ligne(s) restent à rapprocher.` }, { status: 409 });

  const statement = round((accounts || []).reduce((s, a) => s + (Number(a.balance) || 0), 0));
  const signedAt = new Date().toISOString();
  const payload = {
    statement_balance: statement, book_balance: statement, gap: 0,
    status: 'signed', signed_at: signedAt, signed_by: (user as any).email || 'admin',
  };
  const { data: existing } = await supabaseAdmin.from('reconciliations')
    .select('id').eq('period', period).is('account_id', null).maybeSingle();
  if (existing) await supabaseAdmin.from('reconciliations').update(payload).eq('id', existing.id);
  else await supabaseAdmin.from('reconciliations').insert({ period, account_id: null, ...payload });

  return NextResponse.json({ ok: true, signedAt });
}
