import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef } from '@/lib/finance/pcg';
import { toutLire } from '@/lib/finance/tout-lire';

export const dynamic = 'force-dynamic';

const TAUX_COTIS = 0.123;
const round = (n: number) => Math.round(n * 100) / 100;
// Une vente (base des cotisations) : pas un remboursement reçu d'un tiers (758).
const estVente = (e: any) => e.type === 'income' && categoryDef(e.category).key !== 'remb';
const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};

// GET ?period=YYYY-MM — la pile de tri + le cockpit du mois.
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  // Mois courant à Paris (le serveur est en UTC).
  const period = req.nextUrl.searchParams.get('period') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: 'period invalide (AAAA-MM)' }, { status: 400 });
  const year = period.slice(0, 4);
  const from = `${period}-01`;
  const to = `${period}-${String(new Date(Number(year), Number(period.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;

  /* Écritures du mois PAR DATE : la colonne `period` n'est posée que par
     la pile de tri. Les ventes enregistrées par le webhook Stripe et la
     synchro (period NULL) manquaient au cockpit — « Encaissé ce mois »
     restait à 0 tant que la banque n'était pas rapprochée. */
  let txs: any[], yearEntries: any[];
  try {
    [txs, yearEntries] = await Promise.all([
      toutLire(() => supabaseAdmin.from('bank_transactions').select('*').eq('period', period)
        .order('booking_date', { ascending: false }).order('id', { ascending: true })),
      toutLire(() => supabaseAdmin.from('accounting_entries').select('id, date, type, amount, is_personal, category')
        .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`).order('id', { ascending: true })),
    ]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  const monthEntries = yearEntries.filter(e => e.date >= from && e.date <= to);

  const queue = txs.filter(t => !t.reconciled && !t.ignored);
  const sorted = txs.filter(t => t.reconciled);
  const total = txs.length;
  const done = sorted.length;

  // Cockpit du mois (encaissement, comptabilité de trésorerie).
  const me = monthEntries.filter(e => !e.is_personal);
  const encaisse = round(me.filter(estVente).reduce((s, e) => s + Number(e.amount), 0));
  const depense = round(me.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0));
  const reste = round(encaisse - depense);
  const aGarder = round(encaisse * TAUX_COTIS);

  const yearIncome = round(yearEntries.filter(e => !e.is_personal && estVente(e)).reduce((s, e) => s + Number(e.amount), 0));
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
      // Bridge est un agrégateur bancaire : ses lignes sortaient « Stripe ».
      method: t.provider === 'gocardless' || t.provider === 'bridge' ? 'Compte bancaire' : (t.provider === 'import' ? 'Relevé importé' : 'Stripe'),
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
