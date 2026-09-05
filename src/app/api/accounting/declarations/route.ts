import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TAUX_COTIS = 0.123;      // BIC vente de marchandises
const SEUIL_MICRO = 188700;
const SEUIL_TVA = 91900;
const OBJECTIF = 30000;
const round = (n: number) => Math.round(n * 100) / 100;

const QUARTERS = [
  { q: 1, months: [0, 1, 2], label: '1ᵉʳ trimestre', deadline: (y: number) => new Date(y, 3, 30) },
  { q: 2, months: [3, 4, 5], label: '2ᵉ trimestre', deadline: (y: number) => new Date(y, 6, 31) },
  { q: 3, months: [6, 7, 8], label: '3ᵉ trimestre', deadline: (y: number) => new Date(y, 9, 31) },
  { q: 4, months: [9, 10, 11], label: '4ᵉ trimestre', deadline: (y: number) => new Date(y + 1, 0, 31) },
];

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();
  const now = new Date();

  // Trimestre par défaut : le plus récent dont on approche l'échéance.
  let qParam = Number(req.nextUrl.searchParams.get('quarter'));
  if (!qParam) qParam = Math.floor(now.getMonth() / 3) + 1;
  const quarter = QUARTERS.find(x => x.q === qParam) || QUARTERS[2];

  const from = `${year}-${String(quarter.months[0] + 1).padStart(2, '0')}-01`;
  const toMonth = quarter.months[2] + 1;
  const lastDay = new Date(year, toMonth, 0).getDate();
  const to = `${year}-${String(toMonth).padStart(2, '0')}-${lastDay}`;

  const [{ data: qEntries }, { data: yEntries }, { data: missing }] = await Promise.all([
    supabaseAdmin.from('accounting_entries').select('type, amount, is_personal').gte('date', from).lte('date', to),
    supabaseAdmin.from('accounting_entries').select('type, amount, is_personal, date').gte('date', `${year}-01-01`).lte('date', `${year}-12-31`),
    supabaseAdmin.from('accounting_entries').select('id', { count: 'exact', head: true })
      .eq('type', 'expense').is('receipt_url', null).gte('date', from).lte('date', to),
  ]);

  const amount = round((qEntries || []).filter(e => e.type === 'income' && !e.is_personal).reduce((s, e) => s + Number(e.amount), 0));
  const cotis = round(amount * TAUX_COTIS);
  const yearIncome = round((yEntries || []).filter(e => e.type === 'income' && !e.is_personal).reduce((s, e) => s + Number(e.amount), 0));

  // Projection fin d'année (extrapolation linéaire sur le temps écoulé).
  const dayOfYear = Math.floor((now.getTime() - new Date(year, 0, 0).getTime()) / 86400000);
  const projection = year === now.getFullYear() && dayOfYear > 0
    ? round(yearIncome / dayOfYear * 365) : yearIncome;

  const deadline = quarter.deadline(year);
  const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);

  // Pile de tri vidée ? (aucune ligne bancaire non rangée sur le trimestre)
  const { count: unsorted } = await supabaseAdmin.from('bank_transactions').select('id', { count: 'exact', head: true })
    .eq('reconciled', false).eq('ignored', false).gte('booking_date', from).lte('booking_date', to);

  const gauge = (label: string, value: number, max: number, note: string) => ({
    label, value, max, pct: Math.min(100, Math.round(value / max * 100)), note,
  });

  return NextResponse.json({
    year, quarter: quarter.q, quarterLabel: `${quarter.label} ${year}`,
    amount, cotis, tauxCotis: TAUX_COTIS,
    deadline: deadline.toISOString().slice(0, 10),
    deadlineLabel: deadline.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
    daysUntil,
    coverageLabel: `${new Date(year, quarter.months[0]).toLocaleDateString('fr-FR', { month: 'short' })} → ${new Date(year, quarter.months[2]).toLocaleDateString('fr-FR', { month: 'short' })}`,
    allSorted: (unsorted || 0) === 0,
    missingReceipts: missing == null ? 0 : (missing as any),
    gauges: [
      gauge('Plafond micro-entreprise', yearIncome, SEUIL_MICRO, yearIncome < SEUIL_MICRO * 0.7 ? 'Très loin du plafond — rien à craindre cette année.' : "Attention, tu approches du plafond micro."),
      gauge('Passage à la TVA', yearIncome, SEUIL_TVA, `Au rythme actuel, fin d'année vers ${projection.toLocaleString('fr-FR')} € : ${projection < SEUIL_TVA ? 'la franchise de TVA est conservée.' : 'la TVA deviendrait applicable.'}`),
      gauge('Objectif ' + year, yearIncome, OBJECTIF, yearIncome >= OBJECTIF ? 'Objectif atteint.' : `Il manque ${round(OBJECTIF - yearIncome).toLocaleString('fr-FR')} € pour atteindre l'objectif.`),
    ],
    deadlines: nextDeadlines(year, now),
  });
}

function nextDeadlines(year: number, now: Date) {
  const items = [
    { when: `31 octobre ${year}`, label: 'Déclaration URSSAF · 3ᵉ trimestre', date: new Date(year, 9, 31) },
    { when: `31 décembre ${year}`, label: "Clôture de l'exercice", date: new Date(year, 11, 31), note: 'inventaire du stock à réaliser' },
    { when: `31 janvier ${year + 1}`, label: 'Déclaration URSSAF · 4ᵉ trimestre', date: new Date(year + 1, 0, 31) },
    { when: `Mai ${year + 1}`, label: 'Déclaration de revenus ' + year, date: new Date(year + 1, 4, 15), note: 'formulaire 2042-C-PRO' },
  ];
  return items.map((d, i) => {
    const days = Math.ceil((d.date.getTime() - now.getTime()) / 86400000);
    return { when: d.when, label: d.label, note: d.note || (days > 0 ? `dans ${days} jours` : 'échéance passée'), highlight: i === 0 && days > 0 };
  });
}
