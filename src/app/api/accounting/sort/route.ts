import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef } from '@/lib/finance/pcg';

export const dynamic = 'force-dynamic';

const TAUX_COTIS = 0.123;
const round = (n: number) => Math.round(n * 100) / 100;
const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};

// GET ?period=YYYY-MM — la pile de tri + le cockpit du mois.
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const period = req.nextUrl.searchParams.get('period') || new Date().toISOString().slice(0, 7);
  const year = period.slice(0, 4);

  const [{ data: txAll }, { data: monthEntries }, { data: yearEntries }] = await Promise.all([
    supabaseAdmin.from('bank_transactions').select('*').eq('period', period).order('booking_date', { ascending: false }),
    supabaseAdmin.from('accounting_entries').select('type, amount, is_personal').eq('period', period),
    supabaseAdmin.from('accounting_entries').select('type, amount, is_personal').gte('date', `${year}-01-01`).lte('date', `${year}-12-31`),
  ]);

  const txs = txAll || [];
  const queue = txs.filter(t => !t.reconciled && !t.ignored);
  const sorted = txs.filter(t => t.reconciled);
  const total = txs.length;
  const done = sorted.length;

  // Cockpit du mois (encaissement, comptabilité de trésorerie).
  const me = (monthEntries || []).filter(e => !e.is_personal);
  const encaisse = round(me.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0));
  const depense = round(me.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0));
  const reste = round(encaisse - depense);
  const aGarder = round(encaisse * TAUX_COTIS);

  const yearIncome = round((yearEntries || []).filter(e => e.type === 'income' && !e.is_personal).reduce((s, e) => s + Number(e.amount), 0));
  const provisionYearTarget = round(yearIncome * TAUX_COTIS);

  const card = (t: any) => {
    const def = categoryDef(t.category);
    return {
      id: t.id,
      direction: t.direction,
      label: t.label,
      sub: t.counterparty || '',
      amount: Number(t.amount),
      date: fmtDate(t.booking_date),
      method: t.provider === 'gocardless' ? 'Compte bancaire' : (t.provider === 'import' ? 'Relevé importé' : 'Stripe'),
      guess: def.key,
      guessLabel: def.label,
      guessIcon: def.icon,
      guessCode: def.account,
      confidence: t.confidence || 45,
      receipt: !!t.receipt_url,
      isSplit: t.match_kind === 'split',
    };
  };

  const recent = sorted.slice(0, 3).map(t => {
    const def = categoryDef(t.category);
    return { id: t.id, label: t.label, cat: def.label, icon: def.icon, code: def.account,
      amount: Number(t.amount), direction: t.direction };
  });

  return NextResponse.json({
    period,
    total, done, left: queue.length,
    cockpit: { encaisse, depense, reste, aGarder },
    provision: { keptThisMonth: aGarder, yearTarget: provisionYearTarget, provisioned: 0 },
    queue: queue.map(card),
    current: queue[0] ? card(queue[0]) : null,
    recent,
  });
}
