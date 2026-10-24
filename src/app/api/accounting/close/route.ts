import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const round = (n: number) => Math.round(n * 100) / 100;
const moisParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 7);

// GET ?period= — état de clôture d'un mois.
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const period = req.nextUrl.searchParams.get('period') || moisParis();
  const [{ data: p }, { count: unsorted }] = await Promise.all([
    supabaseAdmin.from('accounting_periods').select('*').eq('period', period).maybeSingle(),
    supabaseAdmin.from('bank_transactions').select('id', { count: 'exact', head: true })
      .eq('period', period).eq('reconciled', false).eq('ignored', false),
  ]);
  const termine = period < moisParis();
  return NextResponse.json({ period, status: p?.status || 'open', closedAt: p?.closed_at || null, ended: termine, canClose: termine && (unsorted || 0) === 0, left: unsorted || 0 });
}

// POST { period } — clôture le mois : verrouille les écritures, fige le stock.
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { period } = await req.json().catch(() => ({}));
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: 'period requis (AAAA-MM)' }, { status: 400 });
  /* Un mois ne se clôture qu'une fois terminé : clôturer le mois en
     cours verrouillait la pile pour les opérations encore à venir (423
     sur chaque ligne arrivée après). */
  if (period >= moisParis()) return NextResponse.json({ error: `Le mois ${period} n’est pas terminé.` }, { status: 409 });

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

  const { data: existing } = await supabaseAdmin.from('accounting_periods').select('id, status').eq('period', period).maybeSingle();
  // Déjà clôturé : re-clôturer écraserait le stock figé par le stock du jour.
  if (existing?.status === 'closed') return NextResponse.json({ error: `Le mois ${period} est déjà clôturé.` }, { status: 409 });
  const payload = { status: 'closed', closed_at: new Date().toISOString(), closed_by: (user as any).email || 'admin', stock_value: stockValue };
  if (existing) await supabaseAdmin.from('accounting_periods').update(payload).eq('id', existing.id);
  else await supabaseAdmin.from('accounting_periods').insert({ period, ...payload });

  return NextResponse.json({ ok: true, stockValue });
}
