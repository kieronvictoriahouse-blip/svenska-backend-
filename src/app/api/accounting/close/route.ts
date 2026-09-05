import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const round = (n: number) => Math.round(n * 100) / 100;

// GET ?period= — état de clôture d'un mois.
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const period = req.nextUrl.searchParams.get('period') || new Date().toISOString().slice(0, 7);
  const [{ data: p }, { count: unsorted }] = await Promise.all([
    supabaseAdmin.from('accounting_periods').select('*').eq('period', period).maybeSingle(),
    supabaseAdmin.from('bank_transactions').select('id', { count: 'exact', head: true })
      .eq('period', period).eq('reconciled', false).eq('ignored', false),
  ]);
  return NextResponse.json({ period, status: p?.status || 'open', closedAt: p?.closed_at || null, canClose: (unsorted || 0) === 0, left: unsorted || 0 });
}

// POST { period } — clôture le mois : verrouille les écritures, fige le stock.
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { period } = await req.json().catch(() => ({}));
  if (!period) return NextResponse.json({ error: 'period requis' }, { status: 400 });

  const { count: unsorted } = await supabaseAdmin.from('bank_transactions').select('id', { count: 'exact', head: true })
    .eq('period', period).eq('reconciled', false).eq('ignored', false);
  if (unsorted) return NextResponse.json({ error: `${unsorted} opération(s) restent à ranger.` }, { status: 409 });

  // Valorisation du stock au coût d'achat (figée).
  const { data: products } = await supabaseAdmin.from('products').select('*');
  const stockValue = round((products || []).reduce((s, p: any) => {
    const cost = Number(p.cost_price ?? p.cost ?? 0);
    const qty = Number(p.stock ?? p.stock_qty ?? p.quantity ?? p.qty ?? 0);
    return s + cost * qty;
  }, 0));

  const { data: existing } = await supabaseAdmin.from('accounting_periods').select('id').eq('period', period).maybeSingle();
  const payload = { status: 'closed', closed_at: new Date().toISOString(), closed_by: (user as any).email || 'admin', stock_value: stockValue };
  if (existing) await supabaseAdmin.from('accounting_periods').update(payload).eq('id', existing.id);
  else await supabaseAdmin.from('accounting_periods').insert({ period, ...payload });

  return NextResponse.json({ ok: true, stockValue });
}
